# Architecture decisions and technical specification

| Decision | Rationale and revisit trigger |
|---|---|
| Modular monolith plus background workers | Keep workspace, audience, billing and delivery policy consistent. Split when queue or availability requirements justify an independent service. |
| PostgreSQL plus transactional outbox | Commit message and job together. Revisit after load tests show contention or isolation limits. |
| Forced tenant RLS and composite foreign keys | Enforce isolation at database and API layers. Keep migration and runtime credentials separate. Verify missing and cross-workspace context in integration tests. |
| Independent marketing and transactional policies | Separate consent requirements, concurrency and reputation. Use an approved relay first and activate direct-to-MX only with written provider and operational approval. |
| Hold uncertain submissions | Pin provider attempt and avoid duplicate retries. Retry or fail over only when non-acceptance is proven. |
| Append-only consent and normalized feedback | Keep evidence, record actor/source, deduplicate provider events, and preserve opt-outs when importing or deleting contacts. |

## Boundaries and contracts

Workspace owns roles, contacts, lists, consent, suppressions, templates, campaigns, messages, credentials and audits. A campaign snapshots template and recipients; each message can have multiple attempt and event records. Version schemas and API contracts. REST intake requires a scoped credential and stable idempotency key, returns durable acceptance with a message ID, and rejects reused keys with a different payload. Authenticated SMTP submission must acknowledge after durable intake. Internal feedback validates sender, event identity and message mapping before updating state. Expose API intake, transport acceptance, recipient server acceptance, bounce, complaint and ambiguity as distinct outcomes. Keep browser, operator and service credentials separate.

Queue consumers lease due jobs, verify the workspace, domain, quota and recipient policy, then record the attempt before transport. Hold timeout/unknown outcomes for reconciliation. Authenticate feedback, handle duplicate and out-of-order events and observe oldest queued age, complaint rate by stream and unresolved attempts. Use a controlled test mailbox and synthetic tenants in staging. Configure retention per data class and verify backup expiry and restore.

## Deployment gates and economics

| Gate | Required evidence | Owner |
|---|---|---|
| Cloud and outbound network | Written acceptable-use approval, port 25 eligibility, static addresses and PTR, region, egress and recovery terms | Delivery |
| Provider rollout | Production quota, sending terms, regional processing, complaint feedback, event signing and known ambiguous failure behavior | Delivery/Security |
| Reputation and abuse | Separate streams and caps, documented approval and warmup, pause and rollback drill | Operations |
| Market eligibility | Review marketing and privacy rules, DPA, transfer/storage map, rights workflow and retention per launch market | Legal |
| Commercial readiness | Entity and processor eligibility, tax and invoicing treatment, support coverage, invoices confirming unit economics | Finance/Operations |

SES à la carte illustrates a $100 base per million outbound messages. Two standard dedicated IPs add $49.90/month where approved. At 0.1M, 1M and 10M monthly sends, base plus two IPs normalizes to $599, $149.90 and $104.99 per million respectively. These scenarios omit compute, bandwidth, attachment charges, database, storage, monitoring, support and tax. Add measured fixed costs divided by monthly volume plus variable costs before making a provider decision. [SES pricing](https://aws.amazon.com/ses/pricing/) · [AWS port 25 policy](https://repost.aws/knowledge-center/ec2-port-25-throttle) · [Azure SMTP policy](https://learn.microsoft.com/en-us/azure/virtual-network/troubleshoot-outbound-smtp-connectivity)

## Current implementation and launch gaps

Phases 1–4 implement foundation, contacts and compliance, a delivery worker with adapters, and a plain-text campaign workflow. Production still needs an approved live gateway, verified DNS and feedback, deployment credentials, operator access, stream isolation and safety controls proven under load. Commercial billing, production rollout and usability validation remain gated. Existing code and setup are documented in [platform](../../platform/README.md), [contacts](../../platform/CONTACTS.md), [delivery](../../platform/DELIVERY.md) and [marketing](../../platform/MARKETING.md).

