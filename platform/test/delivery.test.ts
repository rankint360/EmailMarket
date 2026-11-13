import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { dispatchOne, recordEvent } from "../src/delivery.js";

test("transactional intake, idempotency, dispatch and complaint suppression", async (t) => {
  const db = await openDatabase(process.env.TEST_DATABASE_URL);
  if (!process.env.TEST_DATABASE_URL) await db.migrate();
  const app = buildApp(db);
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const payload = {
    email: "delivery@example.test",
    password: "transactional test password",
  };
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/v1/signup", payload }))
      .statusCode,
    201,
  );
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/login",
    payload,
  });
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  const workspace = await app.inject({
    method: "POST",
    url: "/api/v1/workspaces",
    headers: { cookie },
    payload: { name: "Delivery" },
  });
  const w = workspace.json().id;
  const root = "/api/v1/workspaces/" + w;
  const domain = await app.inject({
    method: "POST",
    url: root + "/sending-domains",
    headers: { cookie },
    payload: { domain: "example.test" },
  });
  assert.equal(domain.statusCode, 200, domain.body);
  const credential = (
    await app.inject({
      method: "POST",
      url: root + "/sending-credentials",
      headers: { cookie },
    })
  ).json().credential;
  const send = (key: string, subject = "Receipt") =>
    app.inject({
      method: "POST",
      url: "/api/v1/messages",
      headers: {
        authorization: "Bearer " + credential,
        "idempotency-key": key,
      },
      payload: {
        sender: "sender@example.test",
        recipient: "buyer@example.test",
        subject,
        content: "Thank you.",
      },
    });
  assert.equal((await send("first")).statusCode, 409);
  await db.run(
    (sql) =>
      sql(
        "UPDATE sending_domains SET verified_at=now() WHERE workspace_id=$1",
        [w],
      ),
    "",
    w,
  );
  const accepted = await send("first");
  assert.equal(accepted.statusCode, 202, accepted.body);
  assert.equal((await send("first")).json().id, accepted.json().id);
  assert.equal((await send("first", "Different")).statusCode, 409);
  const revoked = await send("revoked");
  assert.equal(revoked.statusCode, 202);
  await db.run(
    (sql) =>
      sql("UPDATE sending_domains SET verified_at=NULL WHERE workspace_id=$1", [
        w,
      ]),
    "",
    w,
  );
  await db.run(
    (sql) =>
      sql(
        "UPDATE delivery_outbox SET available_at=now()+interval '1 day' WHERE workspace_id=$1 AND message_id=$2",
        [w, accepted.json().id],
      ),
    "",
    w,
  );
  assert.equal(
    await dispatchOne(db, w, async () =>
      assert.fail("Unverified sender submitted"),
    ),
    false,
  );
  await assert.rejects(
    db.run(
      (sql) =>
        recordEvent(sql, w, revoked.json().id, "false-event", "delivered"),
      "",
      w,
    ),
    /has not been submitted/,
  );
  await db.run(
    (sql) =>
      sql(
        "UPDATE sending_domains SET verified_at=now() WHERE workspace_id=$1",
        [w],
      ),
    "",
    w,
  );
  await db.run(
    (sql) =>
      sql(
        "UPDATE delivery_outbox SET available_at=now() WHERE workspace_id=$1",
        [w],
      ),
    "",
    w,
  );
  let calls = 0;
  assert.equal(
    await dispatchOne(db, w, async () => {
      calls++;
      return "accepted";
    }),
    true,
  );
  assert.equal(
    await dispatchOne(db, w, async () => {
      calls++;
      return "accepted";
    }),
    false,
  );
  assert.equal(calls, 1);
  await db.run(
    (sql) => recordEvent(sql, w, accepted.json().id, "event1", "complaint"),
    "",
    w,
  );
  await db.run(
    (sql) => recordEvent(sql, w, accepted.json().id, "event1", "complaint"),
    "",
    w,
  );
  assert.equal((await send("second")).statusCode, 409);
  assert.equal(
    (await app.inject({ url: root + "/messages", headers: { cookie } }))
      .json()
      .find((row: { id: string }) => row.id === accepted.json().id).status,
    "complaint",
  );
});
