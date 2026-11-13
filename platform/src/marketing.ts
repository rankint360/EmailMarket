import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { digest, newToken } from "./auth.js";
import type { Sql } from "./db.js";
import {
  enqueue,
  verifiedSender,
  envelope,
  fail,
  line,
  mailbox,
  object,
  validId,
} from "./delivery.js";
import type { Scope } from "./delivery.js";

const edit = ["owner", "admin", "marketer"];
const read = [...edit, "viewer"];
const root = "/api/v1/workspaces/:id";
function id(value: unknown) {
  if (typeof value !== "string" || !validId.test(value))
    throw fail(400, "Invalid identifier");
  return value;
}
function param(req: FastifyRequest, key: string) {
  return id((req.params as Record<string, string>)[key]);
}
function template(data: Record<string, unknown>) {
  const { subject, content } = envelope({
    sender: "template@example.test",
    recipient: "template@example.test",
    subject: data.subject,
    content: data.content,
  });
  if (content.length > 48000)
    throw fail(400, "Template exceeds 48,000 characters");
  return [line(data.name, 100), subject, content];
}
async function campaignInput(
  sql: Sql,
  w: string,
  data: Record<string, unknown>,
) {
  const template = id(data.template);
  const group = id(data.group);
  if (
    !(
      await sql(
        "SELECT id FROM marketing_templates WHERE workspace_id=$1 AND id=$2",
        [w, template],
      )
    ).length
  )
    throw fail(404, "Template unavailable");
  if (
    !(
      await sql(
        "SELECT id FROM contact_groups WHERE workspace_id=$1 AND id=$2",
        [w, group],
      )
    ).length
  )
    throw fail(404, "Audience unavailable");
  return [line(data.name, 100), template, group, mailbox(data.sender)];
}
type Campaign = {
  id: string;
  template_id: string;
  group_id: string;
  sender: string;
  scheduled_at: string | null;
};
async function loadCampaign(sql: Sql, w: string, c: string) {
  const [row] = await sql<Campaign>(
    "SELECT id,template_id,group_id,sender,scheduled_at FROM campaigns WHERE workspace_id=$1 AND id=$2 FOR UPDATE",
    [w, c],
  );
  if (!row) throw fail(404, "Campaign unavailable");
  return row;
}
async function validation(sql: Sql, w: string, row: Campaign) {
  await verifiedSender(sql, w, row.sender);
  const [template] = await sql<{ subject: string; content: string }>(
    "SELECT subject,content FROM marketing_templates WHERE workspace_id=$1 AND id=$2",
    [w, row.template_id],
  );
  if (!template) throw fail(409, "Template unavailable");
  if (
    !(
      await sql(
        "SELECT id FROM contact_groups WHERE workspace_id=$1 AND id=$2",
        [w, row.group_id],
      )
    ).length
  )
    throw fail(409, "Audience unavailable");
  const audience = await sql<{
    email: string;
    subscribed: boolean;
    suppressed: boolean;
  }>(
    "SELECT p.email,p.subscribed,p.suppressed FROM contact_group_members m JOIN contact_preferences p ON p.workspace_id=m.workspace_id AND p.id=m.contact_id WHERE m.workspace_id=$1 AND m.group_id=$2 ORDER BY p.email LIMIT 501",
    [w, row.group_id],
  );
  if (audience.length > 500)
    throw fail(409, "Maximum 500 contacts per campaign");
  const recipients = audience.filter((c) => c.subscribed && !c.suppressed);
  return { template, recipients, total: audience.length };
}
function audit(sql: Sql, w: string, a: string, c: string, action: string) {
  return sql(
    "INSERT INTO audit(workspace_id,actor_id,target_id,action) VALUES($1,$2,$3,$4)",
    [w, a, c, action],
  );
}
export function registerMarketing(
  app: FastifyInstance,
  scope: Scope,
  publicOrigin?: string,
) {
  app.get(root + "/marketing-templates", (req) =>
    scope(req, read, (sql, w) =>
      sql(
        "SELECT id,name,subject,content FROM marketing_templates WHERE workspace_id=$1 ORDER BY name,id",
        [w],
      ),
    ),
  );
  app.post(root + "/marketing-templates", { bodyLimit: 60000 }, (req) =>
    scope(req, edit, async (sql, w, a) => {
      const key = randomUUID();
      const [row] = await sql(
        "INSERT INTO marketing_templates VALUES($1,$2,$3,$4,$5) RETURNING id,name,subject,content",
        [w, key, ...template(object(req.body))],
      );
      await audit(sql, w, a, key, "template.created");
      return row;
    }),
  );
  app.patch(
    root + "/marketing-templates/:template",
    { bodyLimit: 60000 },
    (req) =>
      scope(req, edit, async (sql, w, a) => {
        const key = param(req, "template");
        const [row] = await sql(
          "UPDATE marketing_templates SET name=$3,subject=$4,content=$5 WHERE workspace_id=$1 AND id=$2 RETURNING id,name,subject,content",
          [w, key, ...template(object(req.body))],
        );
        if (!row) throw fail(404, "Template unavailable");
        await audit(sql, w, a, key, "template.updated");
        return row;
      }),
  );
  app.delete(root + "/marketing-templates/:template", (req) =>
    scope(req, edit, async (sql, w, a) => {
      const key = param(req, "template");
      if (
        (
          await sql(
            "SELECT id FROM campaigns WHERE workspace_id=$1 AND template_id=$2 AND scheduled_at IS NULL",
            [w, key],
          )
        ).length
      )
        throw fail(409, "Template is used by a draft");
      await sql(
        "DELETE FROM marketing_templates WHERE workspace_id=$1 AND id=$2",
        [w, key],
      );
      await audit(sql, w, a, key, "template.deleted");
      return { deleted: true };
    }),
  );
  app.get(root + "/campaigns", (req) =>
    scope(req, read, (sql, w) =>
      sql(
        "SELECT id,name,template_id,group_id,sender,scheduled_at,queued_count,skipped_count FROM campaigns WHERE workspace_id=$1 ORDER BY name,id",
        [w],
      ),
    ),
  );
  app.post(root + "/campaigns", (req) =>
    scope(req, edit, async (sql, w, a) => {
      const key = randomUUID();
      const [row] = await sql(
        "INSERT INTO campaigns(workspace_id,id,name,template_id,group_id,sender) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name",
        [w, key, ...(await campaignInput(sql, w, object(req.body)))],
      );
      await audit(sql, w, a, key, "campaign.created");
      return row;
    }),
  );
  app.patch(root + "/campaigns/:campaign", (req) =>
    scope(req, edit, async (sql, w, a) => {
      const c = param(req, "campaign");
      if ((await loadCampaign(sql, w, c)).scheduled_at)
        throw fail(409, "Campaign is already scheduled");
      await sql(
        "UPDATE campaigns SET name=$3,template_id=$4,group_id=$5,sender=$6 WHERE workspace_id=$1 AND id=$2",
        [w, c, ...(await campaignInput(sql, w, object(req.body)))],
      );
      await audit(sql, w, a, c, "campaign.updated");
      return { updated: true };
    }),
  );
  app.delete(root + "/campaigns/:campaign", (req) =>
    scope(req, edit, async (sql, w, a) => {
      const c = param(req, "campaign");
      if ((await loadCampaign(sql, w, c)).scheduled_at)
        throw fail(409, "Campaign is already scheduled");
      await sql("DELETE FROM campaigns WHERE workspace_id=$1 AND id=$2", [
        w,
        c,
      ]);
      await audit(sql, w, a, c, "campaign.deleted");
      return { deleted: true };
    }),
  );
  app.get(root + "/campaigns/:campaign/validate", (req) =>
    scope(req, read, async (sql, w) => {
      const row = await loadCampaign(sql, w, param(req, "campaign"));
      const result = await validation(sql, w, row);
      return {
        total: result.total,
        eligible: result.recipients.length,
        skipped: result.total - result.recipients.length,
      };
    }),
  );
  app.post(root + "/campaigns/:campaign/schedule", (req) =>
    scope(req, edit, async (sql, w, a) => {
      if (!publicOrigin)
        throw fail(503, "Public HTTPS unsubscribe origin is not configured");
      const c = param(req, "campaign");
      const row = await loadCampaign(sql, w, c);
      if (row.scheduled_at) throw fail(409, "Campaign is already scheduled");
      const requested = line(object(req.body).scheduledAt, 40);
      const when = new Date(requested);
      if (
        !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(requested) ||
        !Number.isFinite(+when) ||
        +when > Date.now() + 366 * 86400000 ||
        +when < Date.now() - 60000
      )
        throw fail(400, "Schedule must be a UTC time within the next year");
      const { template, recipients, total } = await validation(sql, w, row);
      if (!recipients.length) throw fail(409, "No eligible recipients");
      for (const { email } of recipients) {
        const token = newToken();
        await sql("INSERT INTO unsubscribe_tokens VALUES($1,$2,$3)", [
          w,
          digest(token),
          email,
        ]);
        const link = new URL("/unsubscribe/" + w + "/" + token, publicOrigin)
          .href;
        const message = await enqueue(
          sql,
          w,
          "campaign:" + c + ":" + email,
          {
            sender: row.sender,
            recipient: email,
            subject: template.subject,
            content: template.content + "\n\nUnsubscribe: " + link,
            headers: {
              "List-Unsubscribe": "<" + link + ">",
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          },
          "marketing",
          when.toISOString(),
        );
        await sql("INSERT INTO campaign_messages VALUES($1,$2,$3)", [
          w,
          c,
          message.id,
        ]);
      }
      const skipped = total - recipients.length;
      await sql(
        "UPDATE campaigns SET scheduled_at=$3,queued_count=$4,skipped_count=$5 WHERE workspace_id=$1 AND id=$2",
        [w, c, when.toISOString(), recipients.length, skipped],
      );
      await audit(sql, w, a, c, "campaign.scheduled");
      return { queued: recipients.length, skipped };
    }),
  );
  app.post(root + "/campaigns/:campaign/cancel", (req) =>
    scope(req, edit, async (sql, w, a) => {
      const c = param(req, "campaign");
      if (!(await loadCampaign(sql, w, c)).scheduled_at)
        throw fail(409, "Campaign is not scheduled");
      const [result] = await sql(
        "WITH removed AS (DELETE FROM delivery_outbox o USING campaign_messages cm WHERE o.workspace_id=$1 AND cm.workspace_id=o.workspace_id AND cm.message_id=o.message_id AND cm.campaign_id=$2 AND o.claimed_at IS NULL RETURNING o.message_id), changed AS (UPDATE messages SET status='cancelled' WHERE workspace_id=$1 AND id IN (SELECT message_id FROM removed) RETURNING id) SELECT count(*)::int AS cancelled FROM changed",
        [w, c],
      );
      await audit(sql, w, a, c, "campaign.cancelled");
      return result;
    }),
  );
  app.get(root + "/campaigns/:campaign/analytics", (req) =>
    scope(req, read, async (sql, w) => {
      const c = param(req, "campaign");
      await loadCampaign(sql, w, c);
      return sql(
        "SELECT m.status,count(*)::int AS count FROM campaign_messages cm JOIN messages m ON m.workspace_id=cm.workspace_id AND m.id=cm.message_id WHERE cm.workspace_id=$1 AND cm.campaign_id=$2 GROUP BY m.status ORDER BY m.status",
        [w, c],
      );
    }),
  );
}
