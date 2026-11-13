import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { dispatchOne } from "../src/delivery.js";
import { assets } from "../src/ui.js";

test("campaign scheduling snapshots content and rechecks consent before sending", async (t) => {
  const db = await openDatabase(process.env.TEST_DATABASE_URL);
  if (!process.env.TEST_DATABASE_URL) await db.migrate();
  const app = buildApp(db, { publicOrigin: "https://example.test" });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const payload = {
    email: "marketing@example.test",
    password: "marketing integration password",
  };
  await app.inject({ method: "POST", url: "/api/v1/signup", payload });
  const auth = await app.inject({
    method: "POST",
    url: "/api/v1/login",
    payload,
  });
  const headers = { cookie: String(auth.headers["set-cookie"]).split(";")[0] };
  const workspace = await app.inject({
    method: "POST",
    url: "/api/v1/workspaces",
    headers,
    payload: { name: "Marketing" },
  });
  const w = workspace.json().id;
  async function request(
    method: "GET" | "POST" | "PATCH" | "PUT",
    path: string,
    payload?: object,
    status = 200,
  ) {
    const r = await app.inject({
      method,
      url: "/api/v1/workspaces/" + w + "/" + path,
      headers,
      payload,
    });
    assert.equal(r.statusCode, status, r.body);
    return status === 204 ? undefined : r.json();
  }
  await request("POST", "sending-domains", { domain: "example.test" });
  await db.run(
    (sql) =>
      sql(
        "UPDATE sending_domains SET verified_at=now() WHERE workspace_id=$1",
        [w],
      ),
    "",
    w,
  );
  const contact = await request(
    "POST",
    "contacts",
    { email: "allowed@example.test" },
    201,
  );
  const excluded = await request(
    "POST",
    "contacts",
    { email: "excluded@example.test" },
    201,
  );
  const group = await request(
    "POST",
    "groups",
    { kind: "list", name: "Newsletter" },
    201,
  );
  for (const item of [contact, excluded])
    await request(
      "PUT",
      "groups/" + group.id + "/contacts/" + item.id,
      undefined,
      204,
    );
  await request("PUT", "contacts/" + contact.id + "/preferences", {
    subscribed: true,
    evidence: "Signup receipt",
  });
  const template = await request("POST", "marketing-templates", {
    name: "Newsletter",
    subject: "News",
    content: "Original body",
  });
  const input = {
    name: "Launch",
    template: template.id,
    group: group.id,
    sender: "news@example.test",
  };
  const draft = await request("POST", "campaigns", input);
  const path = "campaigns/" + draft.id;
  assert.deepEqual(await request("GET", path + "/validate"), {
    total: 2,
    eligible: 1,
    skipped: 1,
  });
  const scheduledAt = new Date(Date.now() + 120000).toISOString();
  assert.deepEqual(await request("POST", path + "/schedule", { scheduledAt }), {
    queued: 1,
    skipped: 1,
  });
  await request("POST", path + "/schedule", { scheduledAt }, 409);
  assert.equal(
    await dispatchOne(db, w, async () => assert.fail("Dispatched early")),
    false,
  );
  await request("PATCH", "marketing-templates/" + template.id, {
    name: "Newsletter",
    subject: "Updated",
    content: "Updated body",
  });
  const [message] = await db.run(
    (sql) =>
      sql(
        "SELECT content,headers FROM messages WHERE workspace_id=$1 AND stream='marketing'",
        [w],
      ),
    "",
    w,
  );
  assert.match(String(message.content), /^Original body/);
  assert.match(JSON.stringify(message.headers), /List-Unsubscribe-Post/);
  await request("PUT", "contacts/" + contact.id + "/preferences", {
    subscribed: false,
    evidence: "Withdrawal",
  });
  await db.run(
    (sql) =>
      sql(
        "UPDATE delivery_outbox SET available_at=now() WHERE workspace_id=$1",
        [w],
      ),
    "",
    w,
  );
  assert.equal(
    await dispatchOne(db, w, async () =>
      assert.fail("Dispatched after opt-out"),
    ),
    false,
  );
  assert.deepEqual(await request("GET", path + "/analytics"), [
    { status: "suppressed", count: 1 },
  ]);
  await request("PUT", "contacts/" + contact.id + "/preferences", {
    subscribed: true,
    evidence: "New consent",
  });
  const next = await request("POST", "campaigns", input);
  await request("POST", "campaigns/" + next.id + "/schedule", { scheduledAt });
  assert.deepEqual(await request("POST", "campaigns/" + next.id + "/cancel"), {
    cancelled: 1,
  });
  assert.deepEqual(
    await request("GET", "campaigns/" + next.id + "/analytics"),
    [{ status: "cancelled", count: 1 }],
  );
  assert.doesNotThrow(() => new Function(assets.js));
});
