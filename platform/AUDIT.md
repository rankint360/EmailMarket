# Phase 0–6 repository audit

Internal code and documentation review, 2026-11-13. Production infrastructure and live account evidence are tracked in BETA.md.

| Phase | Review and findings |
|---|---|
| 0 | Checked discovery scope, evidence assumptions and architecture against implementation. Interviews, account-based comparisons and provider approvals remain open. |
| 1 | Checked membership authorization, scoped transactions, database roles and readiness. Fixed readiness to query relations from every implemented migration. Shared operator credentials still require replacement or gateway attribution and MFA before launch. |
| 2 | Checked import, unsubscribe, suppression, tenant policy and export. Exports aggregate in memory. Apply volume limits or streaming before large tenants. |
| 3 | Fixed queued sends after sender verification is removed, provider feedback for never-submitted messages, and temporary SMTP failure handling. DNS alignment, provider feedback authenticity and Postfix delivery still need staging evidence. |
| 4 | Reviewed draft snapshots, cancellation and analytics. Delivery feedback now rejects cancelled messages. Analytics is delivery-status only. |
| 5 | Reviewed forms, event delivery and billing. Webhook retries are at-least-once and receivers must deduplicate. Usage charges are estimates and require reconciliation before invoicing. |
| 6 | Reviewed allowlist, pause and support boundaries. Local smoke coverage is in-process. Staging, independent security review and pilot readiness remain open. |

Dispatch now serializes its eligibility read with address-level consent and suppression updates through the claim transaction. An already-claimed message may still be submitted. An unverified sender is recorded as sender_unverified. The worker removes that job and does not resubmit it automatically.

Verification: npm run lint, npm test, and targeted delivery regression coverage for verification loss and invalid provider feedback.

