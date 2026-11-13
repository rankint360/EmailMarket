# Project status

**Milestone** — Phase 0–6 audit and fixes.
**Date** — 2026-11-13.

1. Published the Part 24 discovery package and risk register in Phase 0.
2. Corrected roadmap numbering and took the direction to build Phase 1 as authorization for foundation implementation.
3. Implemented identity, workspaces, membership roles, tenant-scoped database access and auditable changes.
4. Connected the workspace UI to the API and added private operator health and metrics.
5. Added versioned SQL, a deployment image, GitHub verification workflow and setup and operations documentation.
6. Verified formatting, strict TypeScript compilation and both integration tests locally. Repeated the suite against standalone PostgreSQL 18 with a limited runtime role.
7. Prepared the Phase 1 commit for publication. Review workflow results on GitHub.

Production deployment requires a deployment target and operator gateway. Identity and operator rollout limitations are in [the foundation guide](platform/README.md). Phase 4 marketing product follows this milestone. Research and launch risks remain in [the risk register](RISK-REGISTER.md).

## Phase 2 milestone

1. Confirmed the eight Part 15 contacts and compliance deliverables and reused the Phase 1 workspace role boundary.
2. Added migration 002, contact CRUD, lists, tags, membership and contact and suppression CSV imports with preview.
3. Added consent history, marketing preferences, public unsubscribe, suppression management and workspace JSON export.
4. Connected the workspace UI, added request-path redaction and documented roles, endpoints, migration and operating limits.
5. Ran formatting, strict TypeScript compilation and the local integration suite. GitHub CI is configured to repeat verification against standalone PostgreSQL and build the container.
6. Published the Phase 2 milestone to main. Sending infrastructure remains the next phase.

See the [Phase 2 guide](platform/CONTACTS.md).

## Phase 3 delivery milestone

Implemented tenant-scoped transactional intake, DNS ownership challenges, revocable credentials, durable outbox, adapter worker, Postfix integration and normalized feedback. Local integration tests exercised idempotency, dispatch and complaint suppression. Live services require provisioned SMTP, DNS and gateway configuration. See [delivery setup](platform/DELIVERY.md).



## Phase 4 marketing milestone

Implemented plain-text templates and preview, campaign drafts, list/tag audiences, eligibility validation, scheduling, cancellation and delivery analytics. Scheduled messages use the delivery outbox and retain a snapshot of content and recipients. Dispatch checks eligibility again. See [marketing setup and tests](platform/MARKETING.md). Phase 5 followed this milestone.

## Phase 0 discovery closeout

Reviewed the original Part 24 brief and expanded discovery with the full named competitor roster, public review evidence, personas, MVP acceptance criteria, architecture decisions, design direction, operating gates and a registry-checked brand shortlist. The [Phase 0 index](docs/discovery/README.md) links the package and records evidence that requires external participation or launch access. Existing implementation milestones remain recorded above.

## Phase 5 growth milestone

Implemented hosted forms, form-to-group automation, consent segments, signed outbound event delivery, integration credentials and monthly usage and billing estimates. See [growth API and operations](platform/GROWTH.md).

## Phase 6 beta readiness milestone

Added explicit workspace activation and pause, scoped support intake and operator queue visibility, and concurrent-request smoke coverage. The [beta readiness guide](platform/BETA.md) records open production gates. Live deliverability, independent security audit, staging load, beta cohort and pricing validation remain pending.

## Phase 7 expansion

Status: blocked on evidence of core product stability. See [the expansion plan](platform/EXPANSION.md) for the ten workstreams, dependencies, estimates and acceptance checks. Staging, live deliverability and pilot evidence remain open under Phase 6.


## Phase 0–6 repository audit

Fixed dispatch verification, feedback state checks, SMTP retry handling and schema readiness. Formatting, strict TypeScript compilation and all seven local integration tests passed. See [audit findings](platform/AUDIT.md).
