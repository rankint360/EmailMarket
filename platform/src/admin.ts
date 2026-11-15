import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database, Sql } from "./db.js";
import { equal } from "./auth.js";
import { fail, line, object, validId } from "./delivery.js";
import { html, script } from "./admin-ui.js";

export function registerAdmin(
  app: FastifyInstance,
  db: Database,
  name?: string,
  key?: string,
) {
  if (!name || !key || key.length < 32) return;
  const root = "/internal/admin/v1";
  const run = <T>(
    req: FastifyRequest,
    work: (sql: Sql) => Promise<T>,
    w = "",
  ) => {
    if (!equal(req.headers.authorization ?? "", "Bearer " + key))
      throw fail(401, "Operator credential required");
    return db.run(
      async (sql) => {
        await sql("SELECT set_config('emailmarket.operator','yes',true)");
        return work(sql);
      },
      "",
      w,
    );
  };
  function id(req: FastifyRequest) {
    const value = (req.params as { id: string }).id;
    if (!validId.test(value)) throw fail(404, "Resource unavailable");
    return value;
  }
  function after(req: FastifyRequest) {
    const value = (req.query as { after?: string }).after;
    if (value !== undefined && !validId.test(value))
      throw fail(400, "Invalid cursor");
    return value ?? null;
  }
  async function audit(
    sql: Sql,
    action: string,
    target: string,
    reason: string,
  ) {
    await sql(
      "INSERT INTO operator_audit(actor,action,target,reason) VALUES($1,$2,$3,$4)",
      [name, action, target, reason],
    );
  }
  app.get("/admin", async (_, r) => r.type("text/html").send(html));
  app.get("/admin.js", async (_, r) => r.type("text/javascript").send(script));
  app.get(root + "/users", (req) =>
    run(req, (sql) =>
      sql(
        "SELECT id,email,disabled FROM accounts WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 50",
        [after(req)],
      ),
    ),
  );
  app.get(root + "/workspaces", (req) =>
    run(req, (sql) =>
      sql(
        "SELECT id,name FROM workspaces WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 50",
        [after(req)],
      ),
    ),
  );
  app.get(root + "/audit", (req) =>
    run(req, (sql) =>
      sql(
        "SELECT actor,action,target,reason,occurred_at FROM operator_audit ORDER BY id DESC LIMIT 100",
      ),
    ),
  );
  app.put(root + "/users/:id", (req) =>
    run(req, async (sql) => {
      const user = id(req),
        { disabled, reason } = object(req.body);
      if (typeof disabled !== "boolean")
        throw fail(400, "Expected disabled boolean");
      const note = line(reason, 160);
      const [row] = await sql(
        "UPDATE accounts SET disabled=$2 WHERE id=$1 RETURNING id,disabled",
        [user, disabled],
      );
      if (!row) throw fail(404, "User unavailable");
      if (disabled)
        await sql("DELETE FROM sessions WHERE account_id=$1", [user]);
      await audit(sql, disabled ? "user.disabled" : "user.enabled", user, note);
      return row;
    }),
  );
  app.get(root + "/workspaces/:id", (req) => {
    const w = id(req);
    return run(
      req,
      async (sql) => {
        const [workspace] = await sql(
          "SELECT id,name FROM workspaces WHERE id=$1",
          [w],
        );
        if (!workspace) throw fail(404, "Workspace unavailable");
        const [activation] = await sql(
          "SELECT paused,changed_at FROM beta_controls WHERE workspace_id=$1",
          [w],
        );
        return {
          workspace,
          activation: activation ?? null,
          domains: await sql(
            "SELECT domain,verified_at FROM sending_domains WHERE workspace_id=$1 ORDER BY domain LIMIT 100",
            [w],
          ),
          sending: await sql(
            "SELECT id,created_at FROM sending_credentials WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",
            [w],
          ),
          integrations: await sql(
            "SELECT id FROM growth_hooks WHERE workspace_id=$1 ORDER BY id LIMIT 100",
            [w],
          ),
          queue: await sql(
            "SELECT status,count(*)::int AS count FROM messages WHERE workspace_id=$1 GROUP BY status",
            [w],
          ),
          support: await sql(
            "SELECT id,subject,state FROM support_cases WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50",
            [w],
          ),
        };
      },
      w,
    );
  });
  app.put(root + "/workspaces/:id/sending", (req) => {
    const w = id(req);
    return run(
      req,
      async (sql) => {
        const { paused, reason } = object(req.body);
        if (typeof paused !== "boolean")
          throw fail(400, "Expected paused boolean");
        const note = line(reason, 160);
        await sql("SELECT pg_advisory_xact_lock(hashtextextended($1,1))", [w]);
        const [row] = await sql(
          "INSERT INTO beta_controls(workspace_id,paused) SELECT id,$2 FROM workspaces WHERE id=$1 ON CONFLICT(workspace_id) DO UPDATE SET paused=excluded.paused,changed_at=now() RETURNING paused",
          [w, paused],
        );
        if (!row) throw fail(404, "Workspace unavailable");
        await audit(
          sql,
          paused ? "sending.paused" : "sending.approved",
          w,
          note,
        );
        return row;
      },
      w,
    );
  });
  app.put(root + "/workspaces/:id/billing", (req) => {
    const w = id(req);
    return run(
      req,
      async (sql) => {
        const { month, unitCents, reason } = object(req.body);
        if (
          typeof month !== "string" ||
          !/^[2-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month) ||
          typeof unitCents !== "number" ||
          !Number.isInteger(unitCents) ||
          unitCents < 0 ||
          unitCents > 10000
        )
          throw fail(400, "Invalid billing month or unit rate");
        const note = line(reason, 160);
        if (!(await sql("SELECT id FROM workspaces WHERE id=$1", [w])).length)
          throw fail(404, "Workspace unavailable");
        const [rate] = await sql(
          "INSERT INTO billing_periods(workspace_id,period,unit_cents) VALUES($1,$2,$3) ON CONFLICT(workspace_id,period) DO UPDATE SET unit_cents=excluded.unit_cents RETURNING period,unit_cents",
          [w, month + "-01", unitCents],
        );
        await audit(sql, "billing.rate_updated", w + "/" + month, note);
        return rate;
      },
      w,
    );
  });
  app.delete(root + "/workspaces/:id/:kind/:credential", (req) => {
    const w = id(req);
    return run(
      req,
      async (sql) => {
        const { kind, credential } = req.params as {
          kind: string;
          credential: string;
        };
        const note = line(object(req.body).reason, 160);
        const statement =
          kind === "sending"
            ? "DELETE FROM sending_credentials WHERE workspace_id=$1 AND id=$2 RETURNING id"
            : kind === "integrations"
              ? "DELETE FROM growth_hooks WHERE workspace_id=$1 AND id=$2 RETURNING id"
              : null;
        if (
          !statement ||
          !validId.test(credential) ||
          !(await sql(statement, [w, credential])).length
        )
          throw fail(404, "Credential unavailable");
        await audit(sql, kind + ".revoked", w + "/" + credential, note);
        return { revoked: true };
      },
      w,
    );
  });
}
