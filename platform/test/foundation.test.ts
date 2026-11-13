import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";

test("foundation HTTP flow and tenant boundaries", async (t) => {
  const db = await openDatabase(process.env.TEST_DATABASE_URL);
  if (!process.env.TEST_DATABASE_URL) await db.migrate();
  if (!process.env.TEST_DATABASE_URL) await db.migrate();
  const key = "test-operator-key-with-more-than-32-characters";
  const app = buildApp(db, { secure: true, operatorKey: key });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const credentials = { password: "correct horse battery staple" };
  async function register(email: string) {
    const payload = { ...credentials, email };
    const registered = await app.inject({
      method: "POST",
      url: "/api/v1/signup",
      payload,
    });
    assert.equal(registered.statusCode, 201, registered.body);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/login",
      payload,
    });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = String(login.headers["set-cookie"]);
    assert.match(cookie, /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
    return { cookie: cookie.split(";")[0] };
  }

  assert.equal((await app.inject("/")).statusCode, 200);
  assert.equal((await app.inject("/health/live")).statusCode, 200);
  assert.equal((await app.inject("/health/ready")).statusCode, 200);
  assert.equal((await app.inject("/api/v1/workspaces")).statusCode, 401);
  assert.equal((await app.inject("/internal/v1/status")).statusCode, 404);
  const operator = { authorization: "Bearer " + key };
  assert.equal(
    (await app.inject({ url: "/internal/v1/status", headers: operator }))
      .statusCode,
    200,
  );
  assert.match(
    (await app.inject({ url: "/metrics", headers: operator })).body,
    /emailmarket_http_responses_total/,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/signup",
        headers: { "sec-fetch-site": "cross-site" },
      })
    ).statusCode,
    403,
  );

  const owner = await register("owner@example.test");
  const viewer = await register("viewer@example.test");
  const outsider = await register("outsider@example.test");
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/workspaces",
    headers: owner,
    payload: { name: "First Workspace" },
  });
  assert.equal(created.statusCode, 201, created.body);
  const { id } = created.json();
  const path = "/api/v1/workspaces/" + id;
  const memberList = (headers: typeof owner) =>
    app.inject({ url: path + "/members", headers });
  const assign = (headers: typeof owner, role: string) =>
    app.inject({
      method: "PUT",
      url: path + "/members",
      headers,
      payload: { email: "viewer@example.test", role },
    });

  assert.deepEqual(
    (await app.inject({ url: "/api/v1/workspaces", headers: outsider })).json(),
    [],
  );
  assert.equal((await memberList(outsider)).statusCode, 404);
  assert.equal((await assign(outsider, "admin")).statusCode, 404);
  assert.equal((await assign(owner, "owner")).statusCode, 400);
  assert.equal((await assign(owner, "viewer")).statusCode, 200);
  assert.equal((await memberList(viewer)).statusCode, 403);
  assert.equal((await assign(viewer, "admin")).statusCode, 403);
  const updated = await assign(owner, "admin");
  assert.equal(updated.statusCode, 200);
  assert.equal((await memberList(viewer)).json().length, 2);
  const removed = await app.inject({
    method: "DELETE",
    url: path + "/members/" + updated.json().id,
    headers: owner,
  });
  assert.equal(removed.statusCode, 204);
  assert.equal((await memberList(viewer)).statusCode, 404);
  const audit = (
    await app.inject({ url: path + "/audit", headers: owner })
  ).json();
  assert.deepEqual(
    audit.map((entry: { action: string }) => entry.action),
    [
      "membership.removed",
      "membership.assigned.admin",
      "membership.assigned.viewer",
      "workspace.created",
    ],
  );
  assert.deepEqual(await db.run((sql) => sql("SELECT * FROM workspaces")), []);
  assert.deepEqual(await db.run((sql) => sql("SELECT * FROM audit")), []);
  await assert.rejects(db.run((sql) => sql("DELETE FROM audit"), "", id));

  const logout = await app.inject({
    method: "POST",
    url: "/api/v1/logout",
    headers: owner,
  });
  assert.equal(logout.statusCode, 204);
  assert.equal((await memberList(owner)).statusCode, 401);
});

test("file-backed migration survives reopen", async () => {
  const root = await mkdtemp(join(tmpdir(), "emailmarket-"));
  try {
    const first = await openDatabase(undefined, join(root, "data"));
    try {
      await first.migrate();
      await first.run((sql) =>
        sql(
          "INSERT INTO accounts VALUES (gen_random_uuid(),'persist@example.test','test-fixture')",
        ),
      );
    } finally {
      await first.close();
    }
    const second = await openDatabase(undefined, join(root, "data"));
    try {
      await second.migrate();
      assert.equal(
        (await second.run((sql) => sql("SELECT email FROM accounts")))[0].email,
        "persist@example.test",
      );
    } finally {
      await second.close();
    }
  } finally {
    await rm(root, { recursive: true });
  }
});
