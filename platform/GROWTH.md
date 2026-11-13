# Phase 5 growth features

Apply migration 005. Workspace owners, admins and marketers can manage forms, consent-based segments and form-to-group automations through /api/v1/workspaces/:id. POST /forms with name, /segments with name and subscribed, and /automations with form and group IDs. GET each collection and /segments/:segment/contacts. DELETE /automations/:rule disables a rule.

Publish the returned form path. Submissions create or reuse a contact, apply matching group rules and emit a deduplicated form event. Submissions do not grant marketing consent. A hosted form works without client JavaScript.

Owners and admins can issue or revoke /integrations credentials. The bearer credential authorizes GET /api/v1/integration/events. To push events, configure an operator-approved HTTPS destination and schedule node dist/src/growth-webhooks.js with DATABASE_URL, WEBHOOK_WORKSPACE, WEBHOOK_URL and WEBHOOK_SECRET. One worker per workspace is recommended. Receivers verify HMAC-SHA256 over timestamp, a dot and raw body, enforce timestamp freshness and deduplicate x-event-id. Failed events remain pending for retry.

GET /billing/:month reports UTC-month transport acceptance and an estimated USD amount. Set BILLING_UNIT_CENTS for the default rate. This phase provides API-based metering and billing estimates. Checkout, collection, taxes, provider reconciliation and finalized invoices require a commercial billing integration. Integrations use a generic event API and webhook rather than named third-party connectors.

