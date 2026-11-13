# Phase 6 commercial beta readiness

## Operator and support workflows

Apply migration 006 before deploying the app and workers. In production, dispatch requires an explicitly enabled workspace. Onboard an approved design partner by creating a workspace, confirming identity and consent provenance, verifying DNS, establishing sender caps at the approved delivery gateway and enabling only the pilot workspace on the worker allowlist. The operator can PUT /internal/v1/beta/:workspace with paused and a reason using the separate operator key. Pause prevents new claims. Jobs already handed off can still complete. If the transport itself must stop, also pause the gateway or Postfix queue.

Owners and admins can create and list cases at /api/v1/workspaces/:id/support. Submit subject and details without credentials or message bodies. The private operator route GET /internal/v1/beta/:workspace/support exposes queue metadata. Use request IDs and message status to investigate. Record support ownership, response hours, case resolution and pause decisions in the pilot incident tracker.

## Review evidence and launch gates

| Gate | Evidence available | Required before commercial beta |
|---|---|---|
| Security | Internal review of tenant scopes, RLS, roles, token boundaries, queue claims and case visibility, with integration tests | Independent review, operator MFA and identity attribution, per-tenant quotas and external perimeter verification |
| Load | In-process support endpoint smoke test, 200 requests in batches of 20 | Staging network, queue saturation, PostgreSQL pool contention, noisy tenant and sustained load tests with agreed SLOs |
| Deliverability | Automated intake, dispatch, complaint and unsubscribe tests using fixtures | Production DNS, signed headers, actual provider feedback, seed mailbox delivery and reputation baselines for both streams |
| Abuse | Explicit workspace enable, worker allowlist, pause and suppressions | Verified pilot recipients, cap and abuse-response drills, feedback monitoring, dedicated operational owner |
| Support | Case intake and scoped queue visibility | Named ownership, closure workflow, escalation coverage and access review |
| Onboarding | Provisioning and smoke checklist | Approved pilot cohort, consent records, test domain, tenant runbook and sign-off |
| Pricing | Metering and monthly estimate | Design-partner quote feedback, entity and tax review, actual cost invoices and billing reconciliation |
| Production | Migrations, container and CI | Hosting and secrets, restore and rollback drills, private operator gateway and explicit go-live decision |

## Validation procedure

Run npm run lint and npm test. For staging, deploy the same image as CI, provision a disposable database and apply migrations. Verify role boundaries, backup restore, readiness, pause, recovery, message state and feedback. Run a network load test with synthetic records and a stub transport before testing mail delivery. For a controlled live send, use opted-in seed mailboxes, check SPF/DKIM/DMARC, exercise both streams, unsubscribe and verify subsequent suppression. Record transport acceptance and recipient-side evidence independently. No live beta, production load result or independent security sign-off is claimed by this package.

