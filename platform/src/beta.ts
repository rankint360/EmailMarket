import type { FastifyInstance } from "fastify";
import type { Database } from "./db.js";
import { randomUUID } from "node:crypto";
import { equal } from "./auth.js";
import { fail, line, object, validId } from "./delivery.js";
import type { Scope } from "./delivery.js";

export function registerBeta(
  app: FastifyInstance,
  db: Database,
  scope: Scope,
  operatorKey?: string,
) {
  const root = "/api/v1/workspaces/:id/support";
  const roles = ["owner", "admin"];
  app.get(root, (req) =>
    scope(req, roles, (sql, w) =>
      sql(
        "SELECT id,subject,details,state,created_at FROM support_cases WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",
        [w],
      ),
    ),
  );
  app.post(root, (req) =>
    scope(req, roles, async (sql, w, a) => {
      const { subject, details } = object(req.body);
      if (
        typeof details !== "string" ||
        !details.trim() ||
        details.length > 3000 ||
        details.includes("\0")
      )
        throw fail(400, "Invalid case details");
      const [created] = await sql(
        "INSERT INTO support_cases(workspace_id,id,actor_id,subject,details) VALUES($1,$2,$3,$4,$5) RETURNING id,state",
        [w, randomUUID(), a, line(subject, 150), details],
      );
      return created;
    }),
  );
  app.put("/internal/v1/beta/:workspace", async (req) => {
    if (
      !operatorKey ||
      !equal(req.headers.authorization ?? "", "Bearer " + operatorKey)
    )
      throw fail(404, "Resource unavailable");
    const w = (req.params as { workspace: string }).workspace;
    const { paused, reason } = object(req.body);
    if (!validId.test(w) || typeof paused !== "boolean")
      throw fail(400, "Invalid workspace or pause state");
    const note = line(reason, 160);
    const result = await db.run(
      async (sql) => {
        await sql("SELECT pg_advisory_xact_lock(hashtextextended($1,1))", [w]);
        const [state] = await sql(
          "INSERT INTO beta_controls(workspace_id,paused) SELECT id,$2 FROM workspaces WHERE id=$1 ON CONFLICT(workspace_id) DO UPDATE SET paused=excluded.paused,changed_at=now() RETURNING paused",
          [w, paused],
        );
        if (!state) throw fail(404, "Workspace unavailable");
        return state;
      },
      "",
      w,
    );
    req.log.info(
      { workspace: w, paused, reason: note },
      "operator changed sending state",
    );
    return result;
  });
  app.get("/internal/v1/beta/:workspace/support", async (req) => {
    if (
      !operatorKey ||
      !equal(req.headers.authorization ?? "", "Bearer " + operatorKey)
    )
      throw fail(404, "Resource unavailable");
    const w = (req.params as { workspace: string }).workspace;
    if (!validId.test(w)) throw fail(404, "Resource unavailable");
    req.log.info({ workspace: w }, "operator viewed support queue");
    return db.run(
      (sql) =>
        sql(
          "SELECT id,subject,state,created_at FROM support_cases WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",
          [w],
        ),
      "",
      w,
    );
  });
}
