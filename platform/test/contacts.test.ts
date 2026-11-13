import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";

test("contacts, consent, groups, import, unsubscribe and export", async (t) => {
  const db = await openDatabase(process.env.TEST_DATABASE_URL);
  if (!process.env.TEST_DATABASE_URL) await db.migrate();
  const app = buildApp(db);
  t.after(async () => {
    await app.close();
    await db.close();
  });
  async function account(email: string) {
    const payload = { email, password: "phase two integration password" };
    assert.equal(
      (await app.inject({ method: "POST", url: "/api/v1/signup", payload }))
        .statusCode,
      201,
    );
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/login",
      payload,
    });
    return { cookie: String(result.headers["set-cookie"]).split(";")[0] };
  }
  const owner = await account("contacts-owner@example.test");
  const viewer = await account("contacts-viewer@example.test");
  const outsider = await account("contacts-outsider@example.test");
  const workspace = await app.inject({
    method: "POST",
    url: "/api/v1/workspaces",
    headers: owner,
    payload: { name: "Audience" },
  });
  const root = "/api/v1/workspaces/" + workspace.json().id;
  async function call(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    status: number,
    payload?: object,
    headers = owner,
  ) {
    const result = await app.inject({
      method,
      url: root + "/" + path,
      payload,
      headers,
    });
    assert.equal(result.statusCode, status, result.body);
    return result;
  }
  const email = "person@example.test";
  const id = (
    await call("POST", "contacts", 201, { email, name: "Person" })
  ).json().id;
  await call("PATCH", "contacts/" + id, 200, { name: "Updated" });
  await call("GET", "contacts", 404, undefined, outsider);
  await call("PUT", "members", 200, {
    email: "contacts-viewer@example.test",
    role: "viewer",
  });
  await call("GET", "contacts", 200, undefined, viewer);
  await call("POST", "contacts", 403, { email }, viewer);
  await call("GET", "contacts-export", 403, undefined, viewer);
  for (const kind of ["list", "tag"]) {
    const group = (
      await call("POST", "groups", 201, { kind, name: "Customers" })
    ).json().id;
    await call("PATCH", "groups/" + group, 200, { name: "Current" });
    const path = "groups/" + group + "/contacts";
    await call("PUT", path + "/" + id, 204);
    await call("PUT", path + "/" + id, 204);
    assert.equal((await call("GET", path, 200)).json().length, 1);
    await call("DELETE", path + "/" + id, 204);
    await call("DELETE", "groups/" + group, 204);
  }
  await call("PUT", "contacts/" + id + "/preferences", 200, {
    subscribed: true,
    evidence: "Opt-in receipt 1",
  });
  const link = (
    await call("POST", "contacts/" + id + "/unsubscribe-link", 200)
  ).json().path;
  assert.equal((await app.inject(link)).statusCode, 200);
  assert.equal((await call("GET", "contacts", 200)).json()[0].subscribed, true);
  const multipart = new FormData();
  multipart.set("List-Unsubscribe", "One-Click");
  const request = new Response(multipart);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: link,
        headers: {
          "content-type": request.headers.get("content-type")!,
          "sec-fetch-site": "cross-site",
        },
        payload: await request.text(),
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: link,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: "List-Unsubscribe=One-Click",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await call("GET", "contacts/" + id + "/consent", 200)).json().length,
    2,
  );
  await call("PUT", "contacts/" + id + "/preferences", 409, {
    subscribed: true,
    evidence: "Blocked",
  });
  await call("DELETE", "contacts/" + id, 204);
  const invalid = (
    await call("POST", "imports", 200, {
      commit: true,
      csv: "email,name\nother@example.test,Other\ninvalid,Bad",
    })
  ).json();
  assert.equal(invalid.committed, false);
  assert.equal((await call("GET", "contacts", 200)).json().length, 0);
  const csv = "email,name\r\n" + email + ',"Surname, First"';
  assert.equal(
    (await call("POST", "imports", 200, { csv, commit: false })).json()
      .inserted,
    0,
  );
  assert.equal(
    (await call("POST", "imports", 200, { csv, commit: true })).json().inserted,
    1,
  );
  assert.equal(
    (await call("POST", "imports", 200, { csv, commit: true })).json().existing,
    1,
  );
  const restored = (await call("GET", "contacts", 200)).json()[0];
  assert.equal(restored.suppressed, true);
  assert.equal(restored.subscribed, false);
  assert.equal(restored.name, "Surname, First");
  await call("PUT", "suppressions", 200, { email, reason: "manual" });
  await call("DELETE", "suppressions", 204, {
    email,
    reason: "manual",
    evidence: "Reviewed",
  });
  assert.deepEqual(
    (await call("GET", "suppressions", 200))
      .json()
      .map((x: { reason: string }) => x.reason),
    ["unsubscribe"],
  );
  const suppressionCsv = "email,reason\nnew@example.test,complaint";
  assert.equal(
    (
      await call("POST", "suppression-imports", 200, {
        csv: suppressionCsv,
        commit: false,
      })
    ).json().inserted,
    0,
  );
  assert.equal(
    (
      await call("POST", "suppression-imports", 200, {
        csv: suppressionCsv,
        commit: true,
      })
    ).json().inserted,
    1,
  );
  assert.equal(
    (
      await call("POST", "suppression-imports", 200, {
        csv: suppressionCsv,
        commit: true,
      })
    ).json().inserted,
    0,
  );
  const exported = await call("GET", "contacts-export", 200);
  assert.match(String(exported.headers["content-disposition"]), /attachment/);
  assert.equal(exported.json().contacts.length, 1);
  assert.equal(exported.json().consent.length, 5);
  assert.deepEqual(await db.run((sql) => sql("SELECT * FROM contacts")), []);
  const { assets } = await import("../src/ui.js");
  assert.doesNotThrow(() => new Function(assets.js));
  assert.match((await app.inject("/")).body, /id="import-contacts"/);
});
