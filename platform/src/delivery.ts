import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database, Sql } from "./db.js";
import { randomUUID } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { digest, equal, newToken } from "./auth.js";

export type Scope = <T>(
  req: FastifyRequest,
  roles: string[] | undefined,
  work: (sql: Sql, w: string, a: string) => Promise<T>,
) => Promise<T>;
export const fail = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });
export const validId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function object(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw fail(400, "Expected JSON object");
  return value as Record<string, unknown>;
}
export function line(value: unknown, max: number) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\r\n\0]/.test(value)
  )
    throw fail(400, "Invalid text field");
  return value.trim();
}
export function mailbox(value: unknown) {
  const address = line(value, 254).toLowerCase();
  if (!/^[^\s@<>(),;:"\\]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(address))
    throw fail(400, "Invalid address");
  return address;
}
export type Envelope = {
  sender: string;
  recipient: string;
  subject: string;
  content: string;
  headers?: Record<string, string>;
};
export function envelope(value: unknown): Envelope {
  const data = object(value);
  if (
    typeof data.content !== "string" ||
    !data.content.trim() ||
    data.content.length > 50000 ||
    data.content.includes("\0")
  )
    throw fail(400, "Invalid message content");
  return {
    sender: mailbox(data.sender),
    recipient: mailbox(data.recipient),
    subject: line(data.subject, 250),
    content: data.content,
  };
}
export async function eligible(
  sql: Sql,
  w: string,
  recipient: string,
  stream: string,
) {
  const [row] = await sql<{ blocked: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM suppressions WHERE workspace_id=$1 AND email=$2 AND ($3='marketing' OR reason IN ('hard_bounce','complaint'))) OR ($3='marketing' AND NOT COALESCE((SELECT subscribed FROM consent_events WHERE workspace_id=$1 AND email=$2 ORDER BY id DESC LIMIT 1),false)) AS blocked",
    [w, recipient, stream],
  );
  return !row.blocked;
}
export async function verifiedSender(sql: Sql, w: string, sender: string) {
  const domain = sender.split("@")[1];
  if (
    !(
      await sql(
        "SELECT domain FROM sending_domains WHERE workspace_id=$1 AND domain=$2 AND verified_at IS NOT NULL",
        [w, domain],
      )
    ).length
  )
    throw fail(409, "Sending domain is unverified");
}
export async function enqueue(
  sql: Sql,
  w: string,
  key: string,
  m: Envelope,
  stream = "transactional",
  when?: string,
) {
  const fingerprint = digest(JSON.stringify(m));
  const id = randomUUID();
  const [created] = await sql<{ id: string; status: string }>(
    "INSERT INTO messages(workspace_id,id,idem,fingerprint,stream,sender,recipient,subject,content,headers) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(workspace_id,idem) DO NOTHING RETURNING id,status",
    [
      w,
      id,
      key,
      fingerprint,
      stream,
      m.sender,
      m.recipient,
      m.subject,
      m.content,
      JSON.stringify(m.headers ?? {}),
    ],
  );
  if (!created) {
    const [prior] = await sql<{
      id: string;
      status: string;
      fingerprint: string;
    }>(
      "SELECT id,status,fingerprint FROM messages WHERE workspace_id=$1 AND idem=$2",
      [w, key],
    );
    if (prior.fingerprint !== fingerprint)
      throw fail(409, "Idempotency key already used for different content");
    return { id: prior.id, status: prior.status };
  }
  await verifiedSender(sql, w, m.sender);
  if (!(await eligible(sql, w, m.recipient, stream)))
    throw fail(409, "Recipient is ineligible");
  await sql(
    "INSERT INTO delivery_outbox(workspace_id,message_id,available_at) VALUES($1,$2,COALESCE($3::timestamptz,now()))",
    [w, id, when ?? null],
  );
  return created;
}
type Job = Envelope & { id: string; stream: string };
export type Adapter = (
  job: Job,
) => Promise<"accepted" | "failed" | "uncertain">;
export function externalAdapter(endpoint: string, secret: string): Adapter {
  const url = new URL(endpoint);
  if (url.protocol !== "https:")
    throw new Error("Provider endpoint must use HTTPS");
  return async (job) => {
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        headers: {
          authorization: "Bearer " + secret,
          "content-type": "application/json",
          "idempotency-key": job.id,
        },
        body: JSON.stringify(job),
        signal: AbortSignal.timeout(10000),
      });
      return response.ok
        ? "accepted"
        : [400, 401, 403, 422].includes(response.status)
          ? "failed"
          : "uncertain";
    } catch {
      return "uncertain";
    }
  };
}
export async function recordEvent(
  sql: Sql,
  w: string,
  id: string,
  key: string,
  kind: string,
) {
  const [message] = await sql<{ recipient: string; status: string }>(
    "SELECT recipient,status FROM messages WHERE workspace_id=$1 AND id=$2 FOR UPDATE",
    [w, id],
  );
  if (!message) throw fail(404, "Message unavailable");
  if (
    ["queued", "suppressed", "cancelled", "sender_unverified"].includes(
      message.status,
    )
  )
    throw fail(409, "Message has not been submitted");
  const added = await sql(
    "INSERT INTO delivery_events(workspace_id,message_id,event_key,kind) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_key",
    [w, id, key, kind],
  );
  if (!added.length) return;
  if (kind === "hard_bounce" || kind === "complaint") {
    await sql("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      w + ":" + message.recipient,
    ]);
    await sql(
      "INSERT INTO suppressions(workspace_id,email,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [w, message.recipient, kind],
    );
    await sql(
      "INSERT INTO consent_events(workspace_id,email,subscribed,source) VALUES($1,$2,false,$3)",
      [w, message.recipient, kind],
    );
  }
  await sql(
    "UPDATE messages SET status=$3 WHERE workspace_id=$1 AND id=$2 AND (status NOT IN ('delivered','hard_bounce','complaint') OR $3='complaint' OR ($3='hard_bounce' AND status<>'complaint'))",
    [w, id, kind],
  );
}
export async function dispatchOne(db: Database, w: string, adapter: Adapter) {
  const job = await db.run(
    async (sql) => {
      await sql("SELECT pg_advisory_xact_lock(hashtextextended($1,1))", [w]);
      const [control] = await sql<{ paused: boolean }>(
        "SELECT paused FROM beta_controls WHERE workspace_id=$1",
        [w],
      );
      if (
        control?.paused ||
        (process.env.NODE_ENV === "production" && !control)
      )
        return;
      await sql(
        "UPDATE messages SET status='uncertain' FROM delivery_outbox o WHERE messages.workspace_id=$1 AND messages.id=o.message_id AND o.workspace_id=$1 AND messages.status='submitting' AND o.claimed_at<now()-interval '2 minutes'",
        [w],
      );
      const [row] = await sql<Job>(
        "SELECT m.id,m.stream,m.sender,m.recipient,m.subject,m.content,m.headers FROM delivery_outbox o JOIN messages m ON m.workspace_id=o.workspace_id AND m.id=o.message_id WHERE o.workspace_id=$1 AND o.claimed_at IS NULL AND o.available_at<=now() ORDER BY o.available_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED",
        [w],
      );
      if (!row) return;
      const domain = row.sender.split("@")[1];
      const senderVerified =
        (
          await sql(
            "SELECT domain FROM sending_domains WHERE workspace_id=$1 AND domain=$2 AND verified_at IS NOT NULL FOR SHARE",
            [w, domain],
          )
        ).length > 0;
      await sql("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        w + ":" + row.recipient,
      ]);
      if (
        !senderVerified ||
        !(await eligible(sql, w, row.recipient, row.stream))
      ) {
        await sql(
          "UPDATE messages SET status=$3 WHERE workspace_id=$1 AND id=$2",
          [w, row.id, senderVerified ? "suppressed" : "sender_unverified"],
        );
        await sql(
          "DELETE FROM delivery_outbox WHERE workspace_id=$1 AND message_id=$2",
          [w, row.id],
        );
        return;
      }
      await sql(
        "UPDATE delivery_outbox SET claimed_at=now() WHERE workspace_id=$1 AND message_id=$2",
        [w, row.id],
      );
      await sql(
        "UPDATE messages SET status='submitting' WHERE workspace_id=$1 AND id=$2",
        [w, row.id],
      );
      return row;
    },
    "",
    w,
  );
  if (!job) return false;
  let outcome: "accepted" | "failed" | "uncertain" = "uncertain";
  try {
    outcome = await adapter(job);
  } catch {
    /* Preserve ambiguity. */
  }
  await db.run(
    async (sql) => {
      await sql(
        "UPDATE messages SET status=$3 WHERE workspace_id=$1 AND id=$2 AND status='submitting'",
        [w, job.id, outcome],
      );
      await sql(
        "INSERT INTO delivery_events(workspace_id,message_id,event_key,kind) VALUES($1,$2,'dispatch',$3) ON CONFLICT DO NOTHING",
        [w, job.id, outcome],
      );
      await sql(
        "DELETE FROM delivery_outbox WHERE workspace_id=$1 AND message_id=$2",
        [w, job.id],
      );
    },
    "",
    w,
  );
  return true;
}
export function registerDelivery(
  app: FastifyInstance,
  db: Database,
  scope: Scope,
  feedbackKey?: string,
) {
  const root = "/api/v1/workspaces/:id";
  const admins = ["owner", "admin"];
  const technical = [...admins, "developer"];
  app.get(root + "/sending-domains", (req) =>
    scope(req, technical, (sql, w) =>
      sql(
        "SELECT domain,challenge,verified_at FROM sending_domains WHERE workspace_id=$1 ORDER BY domain",
        [w],
      ),
    ),
  );
  app.post(root + "/sending-domains", (req) =>
    scope(req, admins, async (sql, w) => {
      const domain = mailbox(
        "sender@" + line(object(req.body).domain, 253),
      ).split("@")[1];
      const [row] = await sql(
        "INSERT INTO sending_domains VALUES($1,$2,$3,NULL) ON CONFLICT(workspace_id,domain) DO UPDATE SET domain=excluded.domain RETURNING domain,challenge,verified_at",
        [w, domain, newToken()],
      );
      return row;
    }),
  );
  app.post(root + "/sending-domains/verify", (req) =>
    scope(req, admins, async (sql, w) => {
      const domain = mailbox(
        "sender@" + line(object(req.body).domain, 253),
      ).split("@")[1];
      const [row] = await sql<{ challenge: string }>(
        "SELECT challenge FROM sending_domains WHERE workspace_id=$1 AND domain=$2",
        [w, domain],
      );
      if (!row) throw fail(404, "Domain unavailable");
      let records: string[][] = [];
      try {
        records = await resolveTxt("_emailmarket." + domain);
      } catch {
        /* DNS may still be propagating. */
      }
      const verified = records.some(
        (record) => record.join("") === row.challenge,
      );
      await sql(
        "UPDATE sending_domains SET verified_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE workspace_id=$1 AND domain=$2",
        [w, domain, verified],
      );
      return { verified };
    }),
  );
  app.get(root + "/sending-credentials", (req) =>
    scope(req, technical, (sql, w) =>
      sql(
        "SELECT id,created_at FROM sending_credentials WHERE workspace_id=$1 ORDER BY created_at DESC",
        [w],
      ),
    ),
  );
  app.post(root + "/sending-credentials", (req) =>
    scope(req, admins, async (sql, w) => {
      const id = randomUUID(),
        secret = newToken();
      await sql(
        "INSERT INTO sending_credentials(workspace_id,id,secret_hash) VALUES($1,$2,$3)",
        [w, id, digest(secret)],
      );
      return { id, credential: w + "." + id + "." + secret };
    }),
  );
  app.delete(root + "/sending-credentials/:credential", (req) =>
    scope(req, admins, async (sql, w) => {
      const id = (req.params as { credential: string }).credential;
      if (!validId.test(id)) throw fail(404, "Credential unavailable");
      await sql(
        "DELETE FROM sending_credentials WHERE workspace_id=$1 AND id=$2",
        [w, id],
      );
      return { revoked: true };
    }),
  );
  app.post("/api/v1/messages", { bodyLimit: 65536 }, async (req, reply) => {
    const [w, id, secret, ...rest] = (req.headers.authorization ?? "")
      .replace(/^Bearer /, "")
      .split(".");
    if (
      !validId.test(w) ||
      !validId.test(id) ||
      !/^[A-Za-z0-9_-]{43}$/.test(secret) ||
      rest.length
    )
      throw fail(401, "Invalid credential");
    const result = await db.run(
      async (sql) => {
        const [credential] = await sql<{ secret_hash: string }>(
          "SELECT secret_hash FROM sending_credentials WHERE workspace_id=$1 AND id=$2",
          [w, id],
        );
        if (!credential || !equal(digest(secret), credential.secret_hash))
          throw fail(401, "Invalid credential");
        return enqueue(
          sql,
          w,
          "tx:" + line(req.headers["idempotency-key"], 120),
          envelope(req.body),
        );
      },
      "",
      w,
    );
    return reply.code(202).send(result);
  });
  app.get(root + "/messages", (req) =>
    scope(req, technical, (sql, w) =>
      sql(
        "SELECT id,stream,sender,recipient,subject,status,created_at FROM messages WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",
        [w],
      ),
    ),
  );
  app.get(root + "/messages/:message/events", (req) =>
    scope(req, technical, (sql, w) => {
      const id = (req.params as { message: string }).message;
      if (!validId.test(id)) throw fail(404, "Message unavailable");
      return sql(
        "SELECT kind,occurred_at FROM delivery_events WHERE workspace_id=$1 AND message_id=$2 ORDER BY occurred_at",
        [w, id],
      );
    }),
  );
  app.post("/internal/v1/delivery-events", async (req) => {
    if (
      !feedbackKey ||
      !equal(req.headers.authorization ?? "", "Bearer " + feedbackKey)
    )
      throw fail(404, "Resource unavailable");
    const data = object(req.body);
    const w = line(data.workspace, 36),
      id = line(data.message, 36),
      key = line(data.event, 200),
      kind = line(data.kind, 30);
    if (
      !validId.test(w) ||
      !validId.test(id) ||
      !["delivered", "hard_bounce", "complaint", "deferred", "failed"].includes(
        kind,
      )
    )
      throw fail(400, "Invalid event");
    await db.run(
      (sql) => recordEvent(sql, w, id, "provider:" + key, kind),
      "",
      w,
    );
    return { recorded: true };
  });
}
