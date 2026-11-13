import { createHmac } from "node:crypto";
import { openDatabase } from "./db.js";
import type { Database } from "./db.js";
import { validId } from "./delivery.js";

export async function deliverGrowthEvents(
  db: Database,
  workspace: string,
  endpoint: string,
  secret: string,
  transport = fetch,
) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Configure a trusted HTTPS webhook endpoint");
  const events = await db.run(
    (sql) =>
      sql<{ id: string; form_id: string; created_at: string }>(
        "SELECT id,form_id,created_at FROM growth_events WHERE workspace_id=$1 AND delivered_at IS NULL ORDER BY created_at,id LIMIT 20",
        [workspace],
      ),
    "",
    workspace,
  );
  for (const event of events) {
    const body = JSON.stringify({ type: "form.submitted", ...event });
    const time = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secret)
      .update(time + "." + body)
      .digest("hex");
    const response = await transport(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        "content-type": "application/json",
        "x-event-id": event.id,
        "x-webhook-timestamp": time,
        "x-webhook-signature": signature,
      },
      body,
    });
    if (!response.ok)
      throw new Error("Webhook returned HTTP " + response.status);
    await db.run(
      (sql) =>
        sql(
          "UPDATE growth_events SET delivered_at=now() WHERE workspace_id=$1 AND id=$2 AND delivered_at IS NULL",
          [workspace, event.id],
        ),
      "",
      workspace,
    );
  }
  return events.length;
}
if (process.argv[1]?.endsWith("growth-webhooks.js")) {
  const { DATABASE_URL, WEBHOOK_WORKSPACE, WEBHOOK_URL, WEBHOOK_SECRET } =
    process.env;
  if (
    !DATABASE_URL ||
    !WEBHOOK_WORKSPACE ||
    !validId.test(WEBHOOK_WORKSPACE) ||
    !WEBHOOK_URL ||
    !WEBHOOK_SECRET ||
    WEBHOOK_SECRET.length < 32
  )
    throw new Error("Webhook worker configuration missing");
  const db = await openDatabase(DATABASE_URL);
  try {
    await deliverGrowthEvents(
      db,
      WEBHOOK_WORKSPACE,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
  } finally {
    await db.close();
  }
}
