import { registerGrowth } from "./growth.js";
import { registerMarketing } from "./marketing.js";
import { registerDelivery } from "./delivery.js";
import { registerContacts } from "./contacts.js";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { Database, Sql } from "./db.js";
import { digest, equal, hashPassword, newToken } from "./auth.js";
import { page, assets } from "./ui.js";

const roles = ["admin", "marketer", "developer", "viewer"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });
type Input = Record<string, unknown>;

function field(input: unknown, name: string, min: number, max: number) {
  const value = (input as Input | null)?.[name];
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw fail(400, "Invalid " + name);
  }
  return value;
}

function email(input: unknown) {
  const value = field(input, "email", 3, 254).trim().toLowerCase();
  if (!emailPattern.test(value)) throw fail(400, "Invalid email");
  return value;
}

export function buildApp(
  db: Database,
  options: {
    secure?: boolean;
    logger?: boolean;
    operatorKey?: string;
    feedbackKey?: string;
    publicOrigin?: string;
  } = {},
) {
  const app = Fastify({
    logger: options.logger,
    bodyLimit: 8192,
    logController: new Fastify.LogController({ disableRequestLogging: true }),
  });
  const responses = new Map<number, number>();
  const attempts = new Map<string, { count: number; until: number }>();
  const cookie = (token: string, age: number) =>
    "em_session=" +
    token +
    "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
    age +
    (options.secure ? "; Secure" : "");

  function throttle(req: FastifyRequest) {
    const now = Date.now();
    for (const [key, item] of attempts)
      if (item.until <= now) attempts.delete(key);
    if (attempts.size >= 10000 && !attempts.has(req.ip))
      throw fail(429, "Try again later");
    const item = attempts.get(req.ip) ?? { count: 0, until: now + 60000 };
    item.count++;
    attempts.set(req.ip, item);
    if (item.count > 12) throw fail(429, "Try again later");
  }

  function token(req: FastifyRequest) {
    return /(?:^|;\s*)em_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(
      req.headers.cookie ?? "",
    )?.[1];
  }

  async function session(req: FastifyRequest) {
    const value = token(req);
    if (!value) throw fail(401, "Sign in required");
    const [row] = await db.run((sql) =>
      sql<{ account_id: string }>(
        "SELECT account_id FROM sessions WHERE token_hash=$1 AND expires_at>now()",
        [digest(value)],
      ),
    );
    if (!row) throw fail(401, "Sign in required");
    return row.account_id;
  }

  function audit(
    sql: Sql,
    workspace: string,
    account: string,
    action: string,
    target?: string,
  ) {
    return sql(
      "INSERT INTO audit(workspace_id, actor_id, action, target_id) VALUES ($1,$2,$3,$4)",
      [workspace, account, action, target ?? null],
    );
  }

  async function scope<T>(
    req: FastifyRequest,
    allowed: string[] | undefined,
    operation: (sql: Sql, id: string, actor: string) => Promise<T>,
  ) {
    const actor = await session(req);
    const id = (req.params as { id: string }).id;
    if (!uuid.test(id)) throw fail(404, "Workspace unavailable");
    return db.run(
      async (sql) => {
        const [membership] = await sql<{ role: string }>(
          "SELECT role FROM memberships WHERE workspace_id=$1 AND account_id=$2 FOR UPDATE",
          [id, actor],
        );
        if (!membership) throw fail(404, "Workspace unavailable");
        if (allowed && !allowed.includes(membership.role))
          throw fail(403, "Permission required");
        return operation(sql, id, actor);
      },
      actor,
      id,
    );
  }

  app.addHook("onRequest", async (req, reply) => {
    reply.headers({
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      "referrer-policy": "no-referrer",
    });
    if (
      req.routeOptions.url !== "/unsubscribe/:workspace/:token" &&
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      (req.headers["sec-fetch-site"] === "cross-site" ||
        req.headers.origin === "null")
    ) {
      throw fail(403, "Cross-site request denied");
    }
  });
  app.addHook("onResponse", async (req, reply) => {
    req.log.info(
      {
        method: req.method,
        route: req.routeOptions.url,
        statusCode: reply.statusCode,
      },
      "request completed",
    );
    if (req.url !== "/metrics")
      responses.set(
        reply.statusCode,
        (responses.get(reply.statusCode) ?? 0) + 1,
      );
  });
  app.setErrorHandler((error, req, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500)
      req.log.error(
        { code: (error as { code?: string }).code },
        "request failed",
      );
    return reply.code(status).send({
      error: status < 500 ? (error as Error).message : "Unexpected error",
      requestId: req.id,
    });
  });

  app.get("/", async (_, reply) => reply.type("text/html").send(page));
  app.get("/app.css", async (_, reply) =>
    reply.type("text/css").send(assets.css),
  );
  app.get("/app.js", async (_, reply) =>
    reply.type("text/javascript").send(assets.js),
  );
  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_, reply) => {
    try {
      await db.run((sql) => sql("SELECT 1 FROM contact_preferences LIMIT 1"));
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
    return { status: "ready" };
  });

  function operator(req: FastifyRequest) {
    if (
      !options.operatorKey ||
      !equal(req.headers.authorization ?? "", "Bearer " + options.operatorKey)
    ) {
      throw fail(404, "Resource unavailable");
    }
  }
  app.get("/metrics", async (req, reply) => {
    operator(req);
    return reply
      .type("text/plain")
      .send(
        [...responses.entries()]
          .map(
            ([code, count]) =>
              'emailmarket_http_responses_total{status="' +
              code +
              '"} ' +
              count,
          )
          .join("\n") + "\n",
      );
  });
  app.get("/internal/v1/status", async (req) => {
    operator(req);
    req.log.info({ operation: "operator_status" }, "operator access");
    await db.run((sql) => sql("SELECT 1 FROM contact_preferences LIMIT 1"));
    return { database: "ready", uptimeSeconds: Math.floor(process.uptime()) };
  });

  app.post("/api/v1/signup", async (req, reply) => {
    throttle(req);
    const address = email(req.body);
    const password = field(req.body, "password", 12, 128);
    const passwordHash = await hashPassword(password);
    const created = await db.run((sql) =>
      sql(
        "INSERT INTO accounts VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING RETURNING id",
        [randomUUID(), address, passwordHash],
      ),
    );
    if (!created.length) throw fail(409, "Account unavailable");
    return reply.code(201).send({ created: true });
  });
  app.post("/api/v1/login", async (req, reply) => {
    throttle(req);
    const address = email(req.body);
    const password = field(req.body, "password", 12, 128);
    const [account] = await db.run((sql) =>
      sql<{ id: string; password_hash: string }>(
        "SELECT id,password_hash FROM accounts WHERE email=$1",
        [address],
      ),
    );
    const hash = await hashPassword(
      password,
      account?.password_hash.split(":")[0] ?? "unknown-account",
    );
    if (!equal(hash, account?.password_hash ?? "") || !account)
      throw fail(401, "Invalid credentials");
    const value = newToken();
    await db.run(async (sql) => {
      await sql("DELETE FROM sessions WHERE expires_at <= now()");
      await sql(
        "INSERT INTO sessions VALUES ($1,$2,now()+interval '8 hours')",
        [digest(value), account.id],
      );
    });
    return reply
      .header("set-cookie", cookie(value, 28800))
      .send({ signedIn: true });
  });
  app.post("/api/v1/logout", async (req, reply) => {
    const value = token(req);
    if (value)
      await db.run((sql) =>
        sql("DELETE FROM sessions WHERE token_hash=$1", [digest(value)]),
      );
    return reply.header("set-cookie", cookie("", 0)).code(204).send();
  });

  app.get("/api/v1/workspaces", async (req) => {
    const actor = await session(req);
    const ids = await db.run(
      (sql) =>
        sql<{ workspace_id: string; role: string }>(
          "SELECT workspace_id,role FROM memberships WHERE account_id=$1 ORDER BY workspace_id",
          [actor],
        ),
      actor,
    );
    const workspaces = [];
    for (const row of ids) {
      const workspace = await db.run(
        async (sql) => {
          const [item] = await sql(
            "SELECT w.id,w.name,m.role FROM workspaces w JOIN memberships m ON m.workspace_id=w.id WHERE w.id=$1 AND m.account_id=$2",
            [row.workspace_id, actor],
          );
          return item;
        },
        actor,
        row.workspace_id,
      );
      if (workspace) workspaces.push(workspace);
    }
    return workspaces;
  });
  app.post("/api/v1/workspaces", async (req, reply) => {
    const actor = await session(req);
    const name = field(req.body, "name", 1, 100).trim();
    if (!name) throw fail(400, "Invalid name");
    const id = randomUUID();
    await db.run(
      async (sql) => {
        await sql("INSERT INTO workspaces VALUES ($1,$2)", [id, name]);
        await sql("INSERT INTO memberships VALUES ($1,$2,'owner')", [
          id,
          actor,
        ]);
        await audit(sql, id, actor, "workspace.created");
      },
      actor,
      id,
    );
    return reply.code(201).send({ id, name, role: "owner" });
  });
  app.get("/api/v1/workspaces/:id/members", (req) =>
    scope(req, ["owner", "admin"], (sql, id) =>
      sql(
        "SELECT a.id,a.email,m.role FROM memberships m JOIN accounts a ON a.id=m.account_id WHERE m.workspace_id=$1 ORDER BY a.email",
        [id],
      ),
    ),
  );
  app.put("/api/v1/workspaces/:id/members", (req) =>
    scope(req, ["owner"], async (sql, id, actor) => {
      const address = email(req.body);
      const role = field(req.body, "role", 1, 16);
      if (!roles.includes(role)) throw fail(400, "Invalid role");
      const [account] = await sql<{ id: string }>(
        "SELECT id FROM accounts WHERE email=$1",
        [address],
      );
      if (!account) throw fail(404, "Account unavailable");
      if (account.id === actor) throw fail(409, "Owner role is fixed");
      await sql(
        "INSERT INTO memberships VALUES ($1,$2,$3) ON CONFLICT (workspace_id,account_id) DO UPDATE SET role=excluded.role",
        [id, account.id, role],
      );
      await audit(sql, id, actor, "membership.assigned." + role, account.id);
      return { id: account.id, role };
    }),
  );
  app.delete("/api/v1/workspaces/:id/members/:member", (req, reply) =>
    scope(req, ["owner"], async (sql, id, actor) => {
      const member = (req.params as { member: string }).member;
      if (!uuid.test(member)) throw fail(404, "Member unavailable");
      if (member === actor) throw fail(409, "Owner role is fixed");
      const removed = await sql(
        "DELETE FROM memberships WHERE workspace_id=$1 AND account_id=$2 RETURNING account_id",
        [id, member],
      );
      if (removed.length)
        await audit(sql, id, actor, "membership.removed", member);
      return reply.code(204).send();
    }),
  );
  app.get("/api/v1/workspaces/:id/audit", (req) =>
    scope(req, ["owner", "admin"], (sql, id) =>
      sql(
        "SELECT actor_id,action,target_id,occurred_at FROM audit WHERE workspace_id=$1 ORDER BY audit.id DESC LIMIT 100",
        [id],
      ),
    ),
  );
  registerContacts(app, db, scope);
  registerDelivery(app, db, scope, options.feedbackKey);
  registerMarketing(app, scope, options.publicOrigin);
  const unitCents = Number(process.env.BILLING_UNIT_CENTS ?? 0);
  if (!Number.isSafeInteger(unitCents) || unitCents < 0 || unitCents > 10000)
    throw new Error("Invalid BILLING_UNIT_CENTS");
  registerGrowth(app, db, scope, unitCents);
  return app;
}
