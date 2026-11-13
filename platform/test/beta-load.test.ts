import assert from "node:assert/strict";
import { test } from "node:test";
import { performance } from "node:perf_hooks";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
test("beta support boundaries and 200 concurrent-batch requests", async (t) => {
  const db = await openDatabase(process.env.TEST_DATABASE_URL);
  if (!process.env.TEST_DATABASE_URL) await db.migrate();
  const operatorKey = "beta-integration-key-example-only";
  const app = buildApp(db, { operatorKey });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const account = {
    email: "beta@example.test",
    password: "beta integration password",
  };
  await app.inject({ method: "POST", url: "/api/v1/signup", payload: account });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/login",
    payload: account,
  });
  const headers = { cookie: String(login.headers["set-cookie"]).split(";")[0] };
  const workspace = (
    await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers,
      payload: { name: "Beta" },
    })
  ).json().id;
  const root = "/api/v1/workspaces/" + workspace + "/support";
  assert.equal((await app.inject(root)).statusCode, 401);
  const c = await app.inject({
    method: "POST",
    url: root,
    headers,
    payload: { subject: "DNS", details: "Record needs review" },
  });
  assert.equal(c.statusCode, 200, c.body);
  const internal = "/internal/v1/beta/" + workspace;
  assert.equal((await app.inject(internal + "/support")).statusCode, 404);
  const operator = { authorization: "Bearer " + operatorKey };
  const cases = await app.inject({
    url: internal + "/support",
    headers: operator,
  });
  assert.equal(cases.json()[0].id, c.json().id);
  assert.equal(cases.json()[0].details, undefined);
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: internal,
        headers: operator,
        payload: { paused: true, reason: "Smoke test" },
      })
    ).statusCode,
    200,
  );
  assert.equal((await app.inject("/health/ready")).statusCode, 200);
  const samples: number[] = [];
  for (let batch = 0; batch < 10; batch++)
    await Promise.all(
      Array.from({ length: 20 }, async () => {
        const start = performance.now();
        const response = await app.inject({ url: root, headers });
        samples.push(performance.now() - start);
        assert.equal(response.statusCode, 200);
      }),
    );
  samples.sort((a, b) => a - b);
  t.diagnostic(
    "200 requests at concurrency 20; p95=" + samples[189].toFixed(1) + " ms",
  );
});
