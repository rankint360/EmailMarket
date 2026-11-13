import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { Database } from "./db.js";
import { digest, equal, newToken } from "./auth.js";
import { fail, line, mailbox, object, validId } from "./delivery.js";
import type { Scope } from "./delivery.js";

const root = "/api/v1/workspaces/:id";
const admins = ["owner", "admin"];
const editors = [...admins, "marketer"];
function uuid(value: unknown) {
  if (typeof value !== "string" || !validId.test(value))
    throw fail(404, "Resource unavailable");
  return value;
}
export function registerGrowth(
  app: FastifyInstance,
  db: Database,
  scope: Scope,
  unitCents: number,
) {
  for (const [route, table] of [
    ["forms", "growth_forms"],
    ["segments", "growth_segments"],
    ["automations", "growth_rules"],
  ] as const) {
    app.get(root + "/" + route, (req) =>
      scope(req, editors, (sql, w) =>
        sql(
          "SELECT * FROM " +
            table +
            " WHERE workspace_id=$1 ORDER BY id LIMIT 100",
          [w],
        ),
      ),
    );
  }
  app.post(root + "/forms", (req) =>
    scope(req, editors, async (sql, w) => {
      const id = randomUUID();
      await sql("INSERT INTO growth_forms VALUES($1,$2,$3)", [
        w,
        id,
        line(object(req.body).name, 100),
      ]);
      return { id, path: "/forms/" + w + "/" + id };
    }),
  );
  app.post(root + "/segments", (req) =>
    scope(req, editors, async (sql, w) => {
      const { name, subscribed } = object(req.body);
      if (typeof subscribed !== "boolean")
        throw fail(400, "Specify subscribed");
      const id = randomUUID();
      await sql("INSERT INTO growth_segments VALUES($1,$2,$3,$4)", [
        w,
        id,
        line(name, 100),
        subscribed,
      ]);
      return { id };
    }),
  );
  app.get(root + "/segments/:segment/contacts", (req) =>
    scope(req, editors, async (sql, w) => {
      const id = uuid((req.params as { segment: string }).segment);
      const [segment] = await sql<{ subscribed: boolean }>(
        "SELECT subscribed FROM growth_segments WHERE workspace_id=$1 AND id=$2",
        [w, id],
      );
      if (!segment) throw fail(404, "Segment unavailable");
      const after = (req.query as { after?: string }).after;
      return sql(
        "SELECT id,email,name FROM contact_preferences WHERE workspace_id=$1 AND (subscribed AND NOT suppressed)=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 100",
        [w, segment.subscribed, after ? uuid(after) : null],
      );
    }),
  );
  app.post(root + "/automations", (req) =>
    scope(req, editors, async (sql, w) => {
      const data = object(req.body),
        id = randomUUID();
      const rows = await sql(
        "INSERT INTO growth_rules SELECT $1,$2,f.id,g.id FROM growth_forms f CROSS JOIN contact_groups g WHERE f.workspace_id=$1 AND g.workspace_id=$1 AND f.id=$3 AND g.id=$4 ON CONFLICT DO NOTHING RETURNING id",
        [w, id, uuid(data.form), uuid(data.group)],
      );
      if (!rows.length) throw fail(409, "Form, group or rule unavailable");
      return { id };
    }),
  );
  app.delete(root + "/automations/:rule", (req) =>
    scope(req, editors, async (sql, w) => {
      await sql("DELETE FROM growth_rules WHERE workspace_id=$1 AND id=$2", [
        w,
        uuid((req.params as { rule: string }).rule),
      ]);
      return { deleted: true };
    }),
  );
  const formPath = "/forms/:workspace/:form";
  function params(req: { params: unknown }) {
    const { workspace, form } = req.params as {
      workspace: string;
      form: string;
    };
    return [uuid(workspace), uuid(form)] as const;
  }
  app.get(formPath, async (req, reply) => {
    const [w, f] = params(req);
    const [form] = await db.run(
      (sql) =>
        sql<{ name: string }>(
          "SELECT name FROM growth_forms WHERE workspace_id=$1 AND id=$2",
          [w, f],
        ),
      "",
      w,
    );
    if (!form) throw fail(404, "Form unavailable");
    const title = form.name
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    return reply
      .type("text/html")
      .send(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' +
          title +
          "</title><h1>" +
          title +
          '</h1><form method="post"><label>Email <input type="email" name="email" required maxlength="254"></label><label>Name <input name="name" maxlength="160"></label><button>Submit</button></form></html>',
      );
  });
  app.post(formPath, async (req, reply) => {
    const [w, f] = params(req);
    const data =
      typeof req.body === "string"
        ? Object.fromEntries(new URLSearchParams(req.body))
        : object(req.body);
    const email = mailbox(data.email);
    const name = data.name ? line(data.name, 160) : "";
    await db.run(
      async (sql) => {
        if (
          !(
            await sql(
              "SELECT id FROM growth_forms WHERE workspace_id=$1 AND id=$2",
              [w, f],
            )
          ).length
        )
          throw fail(404, "Form unavailable");
        await sql(
          "INSERT INTO contacts VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,email) DO NOTHING",
          [w, randomUUID(), email, name],
        );
        await sql(
          "INSERT INTO contact_group_members SELECT $1,r.group_id,c.id FROM growth_rules r JOIN contacts c ON c.workspace_id=r.workspace_id WHERE r.workspace_id=$1 AND r.form_id=$2 AND c.email=$3 ON CONFLICT DO NOTHING RETURNING contact_id",
          [w, f, email],
        );
        const submitted = await sql(
          "INSERT INTO growth_submissions SELECT $1,$2,id FROM contacts WHERE workspace_id=$1 AND email=$3 ON CONFLICT DO NOTHING RETURNING contact_id",
          [w, f, email],
        );
        if (submitted.length)
          await sql(
            "INSERT INTO growth_events(workspace_id,id,form_id) VALUES($1,$2,$3)",
            [w, randomUUID(), f],
          );
      },
      "",
      w,
    );
    return reply.type("text/plain").send("Submission received.");
  });
  app.post(root + "/integrations", (req) =>
    scope(req, admins, async (sql, w) => {
      const id = randomUUID(),
        key = newToken();
      await sql("INSERT INTO growth_hooks VALUES($1,$2,$3)", [
        w,
        id,
        digest(key),
      ]);
      return { id, credential: w + "." + id + "." + key };
    }),
  );
  app.get(root + "/integrations", (req) =>
    scope(req, admins, (sql, w) =>
      sql("SELECT id FROM growth_hooks WHERE workspace_id=$1 ORDER BY id", [w]),
    ),
  );
  app.delete(root + "/integrations/:hook", (req) =>
    scope(req, admins, async (sql, w) => {
      await sql("DELETE FROM growth_hooks WHERE workspace_id=$1 AND id=$2", [
        w,
        uuid((req.params as { hook: string }).hook),
      ]);
      return { revoked: true };
    }),
  );
  app.get("/api/v1/integration/events", async (req) => {
    const match =
      /^Bearer ([a-f0-9-]{36})\.([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/i.exec(
        req.headers.authorization ?? "",
      );
    if (!match || !validId.test(match[1]) || !validId.test(match[2]))
      throw fail(401, "Invalid integration credential");
    const [, w, id, key] = match;
    return db.run(
      async (sql) => {
        const [hook] = await sql<{ secret_hash: string }>(
          "SELECT secret_hash FROM growth_hooks WHERE workspace_id=$1 AND id=$2",
          [w, id],
        );
        if (!hook || !equal(hook.secret_hash, digest(key)))
          throw fail(401, "Invalid integration credential");
        return sql(
          "SELECT id,form_id,created_at FROM growth_events WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
          [w],
        );
      },
      "",
      w,
    );
  });
  app.get(root + "/billing/:month", (req) =>
    scope(req, admins, async (sql, w) => {
      const month = (req.params as { month: string }).month;
      if (!/^[2-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month))
        throw fail(400, "Expected YYYY-MM");
      const date = month + "-01";
      const [bill] = await sql<{ unit_cents: number }>(
        "SELECT unit_cents FROM billing_periods WHERE workspace_id=$1 AND period=$2",
        [w, date],
      );
      const rate = bill?.unit_cents ?? unitCents;
      const [usage] = await sql<{ accepted: number }>(
        "SELECT count(*)::int AS accepted FROM delivery_events WHERE workspace_id=$1 AND event_key='dispatch' AND kind='accepted' AND occurred_at>=($2::date::timestamp AT TIME ZONE 'UTC') AND occurred_at<(($2::date+interval '1 month') AT TIME ZONE 'UTC')",
        [w, date],
      );
      return {
        month,
        currency: "USD",
        unitCents: rate,
        accepted: usage.accepted,
        totalCents: rate * usage.accepted,
      };
    }),
  );
}
