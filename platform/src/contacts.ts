import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { Database, Sql } from "./db.js";
import { digest, newToken } from "./auth.js";
import { parseContacts } from "./csv.js";

type Scope = <T>(
  req: FastifyRequest,
  roles: string[] | undefined,
  callback: (sql: Sql, workspace: string, actor: string) => Promise<T>,
) => Promise<T>;
const readers = ["owner", "admin", "marketer", "viewer"];
const editors = ["owner", "admin", "marketer"];
const owners = ["owner", "admin"];
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const error = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });

function body(req: FastifyRequest) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    throw error(400, "Expected a JSON object");
  return req.body as Record<string, unknown>;
}
function str(value: unknown, max: number, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim()) ||
    value.includes("\0")
  )
    throw error(400, "Invalid field");
  return value.trim();
}
function address(value: unknown) {
  const normalized = str(value, 254).toLowerCase();
  if (!emailPattern.test(normalized)) throw error(400, "Invalid email");
  return normalized;
}
function param(req: FastifyRequest, key: string) {
  const value = (req.params as Record<string, string>)[key];
  if (!uuid.test(value)) throw error(404, "Resource unavailable");
  return value;
}
async function contact(sql: Sql, workspace: string, id: string) {
  const [row] = await sql<{ email: string }>(
    "SELECT email FROM contacts WHERE workspace_id=$1 AND id=$2 FOR UPDATE",
    [workspace, id],
  );
  if (!row) throw error(404, "Contact unavailable");
  return row.email;
}
async function lockAddress(sql: Sql, workspace: string, email: string) {
  await sql("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    workspace + ":" + email,
  ]);
}

export function registerContacts(
  app: FastifyInstance,
  db: Database,
  scope: Scope,
) {
  const root = "/api/v1/workspaces/:id";
  const audit = (
    sql: Sql,
    w: string,
    actor: string,
    action: string,
    target: string | null = null,
  ) =>
    sql(
      "INSERT INTO audit(workspace_id,actor_id,action,target_id) VALUES ($1,$2,$3,$4)",
      [w, actor, action, target],
    );

  app.get(root + "/contacts", (req) =>
    scope(req, readers, (sql, w) => {
      const query = req.query as { after?: string };
      if (query.after && !uuid.test(query.after))
        throw error(400, "Invalid cursor");
      return sql(
        "SELECT id,email,name,subscribed,suppressed FROM contact_preferences WHERE workspace_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 100",
        [w, query.after ?? null],
      );
    }),
  );
  app.post(root + "/contacts", (req, reply) =>
    scope(req, editors, async (sql, w, a) => {
      const data = body(req);
      const id = randomUUID();
      const rows = await sql(
        "INSERT INTO contacts VALUES ($1,$2,$3,$4) ON CONFLICT (workspace_id,email) DO NOTHING RETURNING id,email,name",
        [w, id, address(data.email), str(data.name ?? "", 160, false)],
      );
      if (!rows.length) throw error(409, "Contact already exists");
      await audit(sql, w, a, "contact.created", id);
      reply.code(201);
      return rows[0];
    }),
  );
  app.patch(root + "/contacts/:contact", (req) =>
    scope(req, editors, async (sql, w, a) => {
      const id = param(req, "contact");
      await contact(sql, w, id);
      const [row] = await sql(
        "UPDATE contacts SET name=$3 WHERE workspace_id=$1 AND id=$2 RETURNING id,email,name",
        [w, id, str(body(req).name, 160, false)],
      );
      await audit(sql, w, a, "contact.updated", id);
      return row;
    }),
  );
  app.delete(root + "/contacts/:contact", (req, reply) =>
    scope(req, editors, async (sql, w, a) => {
      const id = param(req, "contact");
      const email = await contact(sql, w, id);
      await lockAddress(sql, w, email);
      await sql(
        "INSERT INTO consent_events(workspace_id,email,subscribed,source,actor_id) SELECT $1,$2,false,'contact deleted',$3 WHERE (SELECT subscribed FROM consent_events WHERE workspace_id=$1 AND email=$2 ORDER BY id DESC LIMIT 1)",
        [w, email, a],
      );
      await sql("DELETE FROM contacts WHERE workspace_id=$1 AND id=$2", [
        w,
        id,
      ]);
      await audit(sql, w, a, "contact.deleted", id);
      reply.code(204);
      return null;
    }),
  );
  app.post(root + "/imports", { bodyLimit: 512000 }, (req) =>
    scope(req, editors, async (sql, w, a) => {
      const data = body(req);
      if (typeof data.commit !== "boolean")
        throw error(400, "Specify commit true or false");
      let rows;
      try {
        rows = parseContacts(str(data.csv, 450000));
      } catch (cause) {
        throw error(400, (cause as Error).message);
      }
      const seen = new Set<string>();
      const errors: { row: number; error: string }[] = [];
      const valid = rows.filter((row) => {
        const problem =
          row.invalidColumns ||
          row.email.length > 254 ||
          !emailPattern.test(row.email) ||
          row.name.length > 160
            ? "Invalid columns, email or name"
            : seen.has(row.email)
              ? "Duplicate in file"
              : "";
        if (problem) errors.push({ row: row.row, error: problem });
        else seen.add(row.email);
        return !problem;
      });
      const emails = valid.map((row) => row.email);
      const existing = await sql<{ email: string }>(
        "SELECT email FROM contacts WHERE workspace_id=$1 AND email=ANY($2::text[])",
        [w, emails],
      );
      let inserted = 0;
      if (data.commit && !errors.length) {
        const written = await sql(
          "INSERT INTO contacts(workspace_id,id,email,name) SELECT $1,gen_random_uuid(),r.email,r.name FROM unnest($2::text[],$3::text[]) r(email,name) ON CONFLICT (workspace_id,email) DO NOTHING RETURNING id",
          [w, emails, valid.map((row) => row.name)],
        );
        inserted = written.length;
        await audit(sql, w, a, "contacts.imported");
      }
      return {
        valid: valid.length,
        existing: existing.length,
        inserted,
        committed: data.commit && !errors.length,
        errors,
      };
    }),
  );

  app.get(root + "/groups", (req) =>
    scope(req, readers, (sql, w) =>
      sql(
        "SELECT g.id,g.kind,g.name,count(m.contact_id)::int AS members FROM contact_groups g LEFT JOIN contact_group_members m ON m.workspace_id=g.workspace_id AND m.group_id=g.id WHERE g.workspace_id=$1 GROUP BY g.id,g.workspace_id ORDER BY g.kind,g.name",
        [w],
      ),
    ),
  );
  app.post(root + "/groups", (req, reply) =>
    scope(req, editors, async (sql, w, a) => {
      const data = body(req);
      if (data.kind !== "list" && data.kind !== "tag")
        throw error(400, "Expected list or tag");
      const id = randomUUID();
      const [group] = await sql(
        "INSERT INTO contact_groups VALUES ($1,$2,$3,$4) ON CONFLICT (workspace_id,kind,name) DO NOTHING RETURNING id,kind,name",
        [w, id, data.kind, str(data.name, 100)],
      );
      if (!group) throw error(409, "Group already exists");
      await audit(sql, w, a, "group.created", id);
      reply.code(201);
      return group;
    }),
  );
  app.patch(root + "/groups/:group", (req) =>
    scope(req, editors, async (sql, w, a) => {
      const group = param(req, "group");
      let rows;
      try {
        rows = await sql(
          "UPDATE contact_groups SET name=$3 WHERE workspace_id=$1 AND id=$2 RETURNING id,kind,name",
          [w, group, str(body(req).name, 100)],
        );
      } catch (cause) {
        if ((cause as { code?: string }).code === "23505")
          throw error(409, "Group already exists");
        throw cause;
      }
      if (!rows.length) throw error(404, "Group unavailable");
      await audit(sql, w, a, "group.renamed", group);
      return rows[0];
    }),
  );
  app.delete(root + "/groups/:group", (req, reply) =>
    scope(req, editors, async (sql, w, a) => {
      const group = param(req, "group");
      const rows = await sql(
        "DELETE FROM contact_groups WHERE workspace_id=$1 AND id=$2 RETURNING id",
        [w, group],
      );
      if (!rows.length) throw error(404, "Group unavailable");
      await audit(sql, w, a, "group.deleted", group);
      reply.code(204);
      return null;
    }),
  );
  app.get(root + "/groups/:group/contacts", (req) =>
    scope(req, readers, async (sql, w) => {
      const group = param(req, "group");
      if (
        !(
          await sql(
            "SELECT id FROM contact_groups WHERE workspace_id=$1 AND id=$2",
            [w, group],
          )
        ).length
      )
        throw error(404, "Group unavailable");
      const after = (req.query as { after?: string }).after;
      if (after && !uuid.test(after)) throw error(400, "Invalid cursor");
      return sql(
        "SELECT c.id,c.name,c.email FROM contact_group_members m JOIN contacts c ON c.workspace_id=m.workspace_id AND c.id=m.contact_id WHERE m.workspace_id=$1 AND m.group_id=$2 AND ($3::uuid IS NULL OR c.id>$3) ORDER BY c.id LIMIT 100",
        [w, group, after ?? null],
      );
    }),
  );
  for (const method of ["PUT", "DELETE"] as const)
    app.route({
      method,
      url: root + "/groups/:group/contacts/:contact",
      handler: (req, reply) =>
        scope(req, editors, async (sql, w, a) => {
          const id = param(req, "contact");
          const group = param(req, "group");
          await contact(sql, w, id);
          if (
            !(
              await sql(
                "SELECT id FROM contact_groups WHERE workspace_id=$1 AND id=$2 FOR KEY SHARE",
                [w, group],
              )
            ).length
          )
            throw error(404, "Group unavailable");
          const rows =
            method === "PUT"
              ? await sql(
                  "INSERT INTO contact_group_members VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING contact_id",
                  [w, group, id],
                )
              : await sql(
                  "DELETE FROM contact_group_members WHERE workspace_id=$1 AND group_id=$2 AND contact_id=$3 RETURNING contact_id",
                  [w, group, id],
                );
          if (rows.length)
            await audit(
              sql,
              w,
              a,
              method === "PUT"
                ? "group.contact_added"
                : "group.contact_removed",
              id,
            );
          reply.code(204);
          return null;
        }),
    });

  app.get(root + "/contacts/:contact/consent", (req) =>
    scope(req, readers, async (sql, w) => {
      const email = await contact(sql, w, param(req, "contact"));
      return sql(
        "SELECT subscribed,source,actor_id,occurred_at FROM consent_events WHERE workspace_id=$1 AND email=$2 ORDER BY id DESC LIMIT 100",
        [w, email],
      );
    }),
  );
  app.put(root + "/contacts/:contact/preferences", (req) =>
    scope(req, editors, async (sql, w, a) => {
      const id = param(req, "contact");
      const email = await contact(sql, w, id);
      const { subscribed, evidence } = body(req);
      if (typeof subscribed !== "boolean")
        throw error(400, "Expected subscribed boolean");
      const source = str(evidence, 250);
      await lockAddress(sql, w, email);
      const reasons = await sql(
        "SELECT reason FROM suppressions WHERE workspace_id=$1 AND email=$2",
        [w, email],
      );
      if (subscribed && reasons.length)
        throw error(409, "Address is suppressed");
      await sql(
        "INSERT INTO consent_events(workspace_id,email,subscribed,source,actor_id) VALUES ($1,$2,$3,$4,$5)",
        [w, email, subscribed, source, a],
      );
      await audit(sql, w, a, "contact.preferences_recorded", id);
      return { subscribed };
    }),
  );
  app.get(root + "/suppressions", (req) =>
    scope(req, owners, (sql, w) => {
      const after = (req.query as { after?: string }).after;
      return sql(
        "SELECT email,reason,created_at FROM suppressions WHERE workspace_id=$1 AND ($2::text IS NULL OR email>$2) AND email IN (SELECT DISTINCT email FROM suppressions WHERE workspace_id=$1 AND ($2::text IS NULL OR email>$2) ORDER BY email LIMIT 100) ORDER BY email,reason",
        [w, after ? address(after) : null],
      );
    }),
  );
  app.put(root + "/suppressions", (req) =>
    scope(req, owners, async (sql, w, a) => {
      const data = body(req);
      const email = address(data.email);
      if (
        !["manual", "hard_bounce", "complaint"].includes(str(data.reason, 20))
      )
        throw error(400, "Invalid suppression reason");
      await lockAddress(sql, w, email);
      const rows = await sql(
        "INSERT INTO suppressions(workspace_id,email,reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING email",
        [w, email, data.reason],
      );
      if (rows.length) {
        await sql(
          "INSERT INTO consent_events(workspace_id,email,subscribed,source,actor_id) VALUES ($1,$2,false,$3,$4)",
          [w, email, "suppression:" + data.reason, a],
        );
        await audit(sql, w, a, "suppression.added");
      }
      return { suppressed: true };
    }),
  );
  app.post(root + "/suppression-imports", { bodyLimit: 512000 }, (req) =>
    scope(req, owners, async (sql, w, a) => {
      const { csv, commit } = body(req);
      if (typeof commit !== "boolean")
        throw error(400, "Specify commit true or false");
      let rows;
      try {
        rows = parseContacts(str(csv, 450000), "reason");
      } catch (cause) {
        throw error(400, (cause as Error).message);
      }
      const seen = new Set<string>();
      const reasons = ["manual", "unsubscribe", "hard_bounce", "complaint"];
      const errors: { row: number; error: string }[] = [];
      const valid = rows
        .filter((row) => {
          const reason = row.name || "manual";
          const key = row.email + ":" + reason;
          if (
            row.invalidColumns ||
            row.email.length > 254 ||
            !emailPattern.test(row.email) ||
            !reasons.includes(reason)
          )
            errors.push({
              row: row.row,
              error: "Invalid email or suppression reason",
            });
          else if (seen.has(key))
            errors.push({ row: row.row, error: "Duplicate in file" });
          else {
            seen.add(key);
            return true;
          }
          return false;
        })
        .sort((left, right) => left.email.localeCompare(right.email));
      let inserted = 0;
      if (commit && !errors.length) {
        for (const email of new Set(valid.map((row) => row.email)))
          await lockAddress(sql, w, email);
        const written = await sql(
          "WITH added AS (INSERT INTO suppressions(workspace_id,email,reason) SELECT $1,r.email,r.reason FROM unnest($2::text[],$3::text[]) r(email,reason) ON CONFLICT DO NOTHING RETURNING email,reason) INSERT INTO consent_events(workspace_id,email,subscribed,source,actor_id) SELECT $1,email,false,'suppression import:' || reason,$4 FROM added RETURNING id",
          [
            w,
            valid.map((row) => row.email),
            valid.map((row) => row.name || "manual"),
            a,
          ],
        );
        inserted = written.length;
        await audit(sql, w, a, "suppressions.imported");
      }
      return {
        valid: valid.length,
        inserted,
        committed: commit && !errors.length,
        errors,
      };
    }),
  );
  app.delete(root + "/suppressions", (req, reply) =>
    scope(req, owners, async (sql, w, a) => {
      const data = body(req);
      const email = address(data.email);
      if (!["manual", "unsubscribe"].includes(str(data.reason, 20)))
        throw error(
          400,
          "Only manual or unsubscribe suppression can be removed here",
        );
      str(data.evidence, 250);
      await lockAddress(sql, w, email);
      const rows = await sql(
        "DELETE FROM suppressions WHERE workspace_id=$1 AND email=$2 AND reason=$3 RETURNING email",
        [w, email, data.reason],
      );
      if (rows.length) {
        await sql(
          "INSERT INTO consent_events(workspace_id,email,subscribed,source,actor_id) VALUES ($1,$2,false,$3,$4)",
          [w, email, "suppression removed: " + data.evidence, a],
        );
        await audit(sql, w, a, "suppression.removed");
      }
      reply.code(204);
      return null;
    }),
  );

  app.post(root + "/contacts/:contact/unsubscribe-link", (req) =>
    scope(req, editors, async (sql, w, a) => {
      const id = param(req, "contact");
      const email = await contact(sql, w, id);
      const token = newToken();
      await sql("INSERT INTO unsubscribe_tokens VALUES ($1,$2,$3)", [
        w,
        digest(token),
        email,
      ]);
      await audit(sql, w, a, "unsubscribe.link_created", id);
      return { path: "/unsubscribe/" + w + "/" + token };
    }),
  );
  app.addContentTypeParser(
    ["application/x-www-form-urlencoded", "multipart/form-data"],
    { parseAs: "string" },
    (_, value, done) => done(null, value),
  );
  const publicPath = "/unsubscribe/:workspace/:token";
  async function unsubscribe(req: FastifyRequest, commit: boolean) {
    const w = param(req, "workspace");
    const { token } = req.params as { token: string };
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw error(404, "Link unavailable");
    return db.run(
      async (sql) => {
        const [row] = await sql<{ email: string }>(
          "SELECT email FROM unsubscribe_tokens WHERE workspace_id=$1 AND token_hash=$2",
          [w, digest(token)],
        );
        if (!row) throw error(404, "Link unavailable");
        if (!commit) return;
        await lockAddress(sql, w, row.email);
        const inserted = await sql(
          "INSERT INTO suppressions(workspace_id,email,reason) VALUES ($1,$2,'unsubscribe') ON CONFLICT DO NOTHING RETURNING email",
          [w, row.email],
        );
        if (inserted.length)
          await sql(
            "INSERT INTO consent_events(workspace_id,email,subscribed,source) VALUES ($1,$2,false,'unsubscribe link')",
            [w, row.email],
          );
      },
      "",
      w,
    );
  }
  app.get(publicPath, async (req, reply) => {
    await unsubscribe(req, false);
    return reply
      .type("text/html")
      .send(
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribe</title><h1>Unsubscribe from marketing email</h1><form method="post"><button name="List-Unsubscribe" value="One-Click">Confirm unsubscribe</button></form></html>',
      );
  });
  app.post(publicPath, async (req, reply) => {
    let data: FormData;
    try {
      if (typeof req.body !== "string") throw new Error();
      data = await new Response(req.body, {
        headers: { "content-type": req.headers["content-type"] ?? "" },
      }).formData();
    } catch {
      throw error(400, "Invalid unsubscribe request");
    }
    if (
      data.getAll("List-Unsubscribe").length !== 1 ||
      data.get("List-Unsubscribe") !== "One-Click"
    )
      throw error(400, "Invalid unsubscribe request");
    await unsubscribe(req, true);
    return reply.type("text/plain").send("Unsubscribed from marketing email.");
  });
  app.get(root + "/contacts-export", (req, reply) =>
    scope(req, owners, async (sql, w, a) => {
      const [data] = await sql(
        "SELECT (SELECT coalesce(json_agg(c ORDER BY id),'[]') FROM contact_preferences c WHERE workspace_id=$1) AS contacts, (SELECT coalesce(json_agg(g ORDER BY id),'[]') FROM contact_groups g WHERE workspace_id=$1) AS groups, (SELECT coalesce(json_agg(m ORDER BY group_id,contact_id),'[]') FROM contact_group_members m WHERE workspace_id=$1) AS memberships, (SELECT coalesce(json_agg(e ORDER BY id),'[]') FROM consent_events e WHERE workspace_id=$1) AS consent, (SELECT coalesce(json_agg(s ORDER BY email,reason),'[]') FROM suppressions s WHERE workspace_id=$1) AS suppressions",
        [w],
      );
      await audit(sql, w, a, "contacts.exported");
      reply.header(
        "content-disposition",
        'attachment; filename="contacts.json"',
      );
      return data;
    }),
  );
}
