import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { script } from "../src/admin-ui.js";

test("operator approval, billing and account suspension are scoped and audited", async (t) => {
  const db = await openDatabase(process.env.TEST_DATABASE_URL);
  if (!process.env.TEST_DATABASE_URL) await db.migrate();
  const adminKey = "test-only-dashboard-key-over-32-characters";
  const app = buildApp(db);
  const gateway = "test-only-gateway-key-over-32-characters";
  const host = "admin.example.test";
  const owner = buildApp(db, {
    adminKey,
    adminName: "operator-test",
    adminHost: host,
    adminGatewayKey: gateway,
  });
  t.after(async () => {
    await app.close();
    await owner.close();
    await db.close();
  });
  const proxy = { host, "x-owner-gateway-key": gateway };
  const headers = { ...proxy, authorization: "Bearer " + adminKey };
  const root = "/internal/admin/v1";
  assert.doesNotThrow(() => new Function(script));
  assert.equal((await app.inject({ url: "/admin", headers })).statusCode, 404);
  assert.equal(
    (await owner.inject({ url: "/admin", headers: proxy })).statusCode,
    200,
  );
  assert.equal(
    (
      await owner.inject({
        url: "/admin",
        headers: { host: "customer.example.test", "x-forwarded-host": host },
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (await owner.inject({ url: "/api/v1/workspaces", headers })).statusCode,
    404,
  );
  assert.equal(
    (await owner.inject({ url: root + "/users", headers: proxy })).statusCode,
    401,
  );
  assert.equal(
    (await owner.inject({ url: "/admin", headers: { host } })).statusCode,
    404,
  );
  const credentials = {
    email: "admin-dashboard@example.test",
    password: "a long integration test password",
  };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/signup",
        payload: credentials,
      })
    ).statusCode,
    201,
  );
  const login = () =>
    app.inject({ method: "POST", url: "/api/v1/login", payload: credentials });
  const session = await login();
  const customer = {
    cookie: String(session.headers["set-cookie"]).split(";")[0],
  };
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/workspaces",
    headers: customer,
    payload: { name: "Admin test workspace" },
  });
  const w = created.json().id;
  const users = (await owner.inject({ url: root + "/users", headers })).json();
  const user = users.find(
    (x: { email: string }) => x.email === credentials.email,
  );
  assert.ok(user);
  const workspace = root + "/workspaces/" + w;
  assert.equal(
    (await owner.inject({ url: workspace, headers: { ...customer, ...proxy } }))
      .statusCode,
    401,
  );
  const update = (url: string, payload: object) =>
    owner.inject({
      method: "PUT",
      url,
      headers,
      payload: { ...payload, reason: "Integration test" },
    });
  const approval = await update(workspace + "/sending", { paused: false });
  assert.equal(approval.statusCode, 200, approval.body);
  assert.equal(
    (await owner.inject({ url: workspace, headers })).json().activation.paused,
    false,
  );
  const bill = await update(workspace + "/billing", {
    month: "2026-11",
    unitCents: 3,
  });
  assert.equal(bill.statusCode, 200, bill.body);
  assert.equal(
    (
      await app.inject({
        url: "/api/v1/workspaces/" + w + "/billing/2026-11",
        headers: customer,
      })
    ).json().unitCents,
    3,
  );
  assert.equal(
    (await update(root + "/users/" + user.id, { disabled: true })).statusCode,
    200,
  );
  assert.equal((await login()).statusCode, 401);
  assert.equal(
    (await app.inject({ url: "/api/v1/workspaces", headers: customer }))
      .statusCode,
    401,
  );
  const audit = (await owner.inject({ url: root + "/audit", headers })).json();
  assert.ok(
    audit.some(
      (row: { action: string; target: string }) =>
        row.action === "user.disabled" && row.target === user.id,
    ),
  );
  assert.deepEqual(
    await db.run((sql) => sql("SELECT id FROM operator_audit")),
    [],
  );
});
