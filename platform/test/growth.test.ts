import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { deliverGrowthEvents } from "../src/growth-webhooks.js";
test("forms automate group membership and emit signed integration events", async (t) => {
  const db = await openDatabase(process.env.TEST_DATABASE_URL);
  if (!process.env.TEST_DATABASE_URL) await db.migrate();
  const app = buildApp(db);
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const account = {
    email: "growth@example.test",
    password: "growth integration password",
  };
  await app.inject({ method: "POST", url: "/api/v1/signup", payload: account });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/login",
    payload: account,
  });
  const headers = { cookie: String(login.headers["set-cookie"]).split(";")[0] };
  const w = (
    await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers,
      payload: { name: "Growth" },
    })
  ).json().id;
  const root = "/api/v1/workspaces/" + w;
  const create = async (path: string, payload?: object) =>
    (
      await app.inject({
        method: "POST",
        url: root + "/" + path,
        headers,
        payload,
      })
    ).json();
  const form = await create("forms", { name: "Signup" });
  const group = await create("groups", { kind: "list", name: "Leads" });
  assert.ok(
    (await create("automations", { form: form.id, group: group.id })).id,
  );
  assert.equal((await app.inject(form.path)).statusCode, 200);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: form.path,
          payload: { email: "lead@example.test" },
        })
      ).statusCode,
      200,
    );
  assert.equal(
    (
      await app.inject({
        url: root + "/groups/" + group.id + "/contacts",
        headers,
      })
    ).json().length,
    1,
  );
  const segment = await create("segments", {
    name: "Needs consent",
    subscribed: false,
  });
  assert.equal(
    (
      await app.inject({
        url: root + "/segments/" + segment.id + "/contacts",
        headers,
      })
    ).json().length,
    1,
  );
  const hook = await create("integrations");
  const events = await app.inject({
    url: "/api/v1/integration/events",
    headers: { authorization: "Bearer " + hook.credential },
  });
  assert.equal(events.json().length, 1);
  await assert.rejects(
    deliverGrowthEvents(
      db,
      w,
      "https://example.test",
      "test",
      async () => new Response(null, { status: 503 }),
    ),
  );
  assert.equal(
    await deliverGrowthEvents(
      db,
      w,
      "https://example.test",
      "test",
      async (_, options) => {
        assert.match(
          new Headers(options?.headers).get("x-webhook-signature") ?? "",
          /^[a-f0-9]{64}$/,
        );
        return new Response(null, { status: 204 });
      },
    ),
    1,
  );
  assert.equal(
    await deliverGrowthEvents(db, w, "https://example.test", "test", async () =>
      assert.fail(),
    ),
    0,
  );
  assert.equal(
    (await app.inject({ url: root + "/billing/2026-11", headers })).json()
      .accepted,
    0,
  );
});
