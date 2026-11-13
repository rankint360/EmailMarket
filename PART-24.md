# Part 24 — Email Marketing Platform discovery
Dated 2026-11-13. Proposal for review. Product name pending.

## 1. Executive assessment
Start with small SaaS businesses that send product notifications and customer announcements. The buyer is a founder or operations lead; the daily users are a developer and a marketer. A unified workspace could reduce duplicate setup and give both users a common view of delivery problems. Brevo, Mailchimp, Postmark and Resend already cover parts of this proposition. Test guided authentication, safe migration and understandable delivery status as reasons to switch. Start with a controlled, English-language beta in one approved market and hosting region, with US as the working assumption. Global market coverage remains the product direction. Shared reputation, tenant isolation, uncertain send outcomes, acquisition cost and legal eligibility drive the investment decision.

## 2. Research plan
Evaluate Mailchimp, Brevo, MailerLite, Constant Contact, GetResponse, Zoho Campaigns, HubSpot, ActiveCampaign, Klaviyo, Omnisend, beehiiv, Kit, Resend, Postmark, SendGrid, Mailgun, Amazon SES and Customer.io. Group by SMB marketing, commerce, publishing, developer email and lifecycle engagement. Capture dated official pricing and documentation for contacts, sends, users, overages, restrictions, APIs, events, retention, security and support. Compare three fixed workload profiles (5k contacts/25k sends, 20k/100k, and 100k transactional-only sends per month) in USD monthly and report prerequisites and promotional terms. Time the same signup, DNS, import, first campaign and API debugging tasks in vendor trials. Record what was observed and the tested tier.

Sample recent G2, Capterra, Trustpilot, Reddit, Product Hunt, vendor forums and public issue trackers. Record sample size, date range, customer segment, counterexamples and source links. Conduct 12 interviews across SaaS, service SMB and agencies and five observed workflow sessions. Recruit both switchers and customers who stayed. Treat public review frequency as a property of the sample. Record evidence and decisions in the register.

Check SMTP RFC 5321/6409, SPF 7208, DKIM 6376, current DMARC specifications and one-click unsubscribe RFC 8058 through the [RFC Editor](https://www.rfc-editor.org/). Review mailbox rules and the launch jurisdiction matrix. Sources include [Gmail sender guidelines](https://support.google.com/mail/answer/81126), [Yahoo Sender Hub](https://senders.yahooinc.com/best-practices/), [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business), [European Commission guidance](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/can-data-received-third-party-be-used-marketing_en) and [CRTC CASL guidance](https://web.crtc.gc.ca/eng/internet/anti/reg.htm). Add UK ICO, Australian ACMA and market-specific regulators before expansion. Open gaps include willingness to pay, observed UX, workload distribution, regional processing and provider approval.

Brand shortlist: SendVellum.com, DispatchWoven.com and LetterSpanHQ.com. Availability and trademark clearance are unresolved. Check authoritative registry and registrar availability at decision time and search trademarks in intended markets before naming.

## 3. Customer pain points
These are hypotheses pending interviews and observed sessions.

| Problem | Proposed workflow | Validation |
|---|---|---|
| DNS setup blocks the first send | Show each DNS record, live check, last observation and next action | At least four of five users finish a sandbox walkthrough unaided |
| Teams cannot explain missing mail | Show API acceptance, provider acceptance, deferral, downstream acceptance and failure with timestamps and correlation IDs | Participants diagnose four scripted incidents correctly |
| Migration risks mailing opt-outs | Dry-run contact and suppression import with provenance and row errors | Every fixture opt-out remains suppressed after reimport |
| Two tools make cost hard to predict | Show send counts by stream, caps and plan limits | Pilot users can estimate next invoice from sample workloads |

## 4. Competitive findings
Verified here means public vendor documentation describes the feature. Observed workflow quality, coverage at specific tiers and relative deliverability remain open.

| Vendor | Campaign capability | Transactional capability | Pricing signal |
|---|---|---|---|
| Mailchimp | Marketing and automation plans | Transactional add-on with eligible plan | Vendor advertises starting USD 20 per 25k-send block, plus eligible plan |
| Brevo | Marketing plans tied to volume and contact limits | Documents transactional API and SDKs | Verify common workload and applicable contact/seat limits |
| Postmark | Broadcast sending stream, campaign authoring unverified | Separate transactional sending stream | Volume plans, unused allowance expires each billing period |
| Resend | Documents Marketing API | Documents one-off send and idempotency keys | Verify marketing and transactional allowances together |
| Amazon SES | SMB campaign workflow unverified | Metered delivery infrastructure | Metering and optional deliverability features documented |

[Mailchimp marketing pricing](https://mailchimp.com/pricing/marketing/) · [Mailchimp transactional](https://mailchimp.com/features/transactional-email/) · [Brevo plans](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans) · [Brevo transactional](https://www.brevo.com/products/transactional-email/) · [Postmark pricing and streams](https://www.postmarkapp.com/pricing) · [Resend migration and send patterns](https://resend.com/migrate/mailchimp) · [SES pricing](https://aws.amazon.com/ses/pricing/)

Next pass adds the remaining vendors, tier-by-tier coverage, UX and developer task observations, operational evidence and pricing normalization. Competitor feature overlap is established. Customer preference for the proposed workflow remains a hypothesis.

## 5. Commercial MVP requirements
- Workspace signup, managed authentication, invitations, owner/admin/marketer/developer/viewer roles, tenant-scoped audit and scoped revocable API/SMTP credentials.
- Domain verification and SPF/DKIM/DMARC alignment diagnostics with sending blocked until required checks pass.
- CSV contacts and suppressions import, lists/tags, consent provenance, export/deletion, duplicate preview and row errors. Enforce eligibility when scheduling and at dispatch.
- Versioned templates with accessible HTML/text preview and test sends. Campaign draft, audience snapshot, approval by authorized role, scheduled UTC instant with displayed timezone, cancel unsent recipients, and reporting by outcome.
- Transactional REST and authenticated SMTP submission, versioned templates, searchable message history, separate queues and quotas. Stable API idempotency keys and actionable errors.
- Provider and proprietary delivery routes with production activation gated independently. Normalize bounces, complaints, deferrals and downstream acceptance. Marketing unsubscribe, complaint handling, pause controls and internal operator audit.
- Billing foundation with immutable usage ledger, caps, plan entitlements and reconciliation. Pilot invoicing can be manual. Paid self-serve and tax automation require commercial review.
- P1 includes forms, outbound customer webhooks, richer segmentation and simple automation. P2/P3 include ecommerce journeys, agency workflows, advanced CRM, multichannel and enterprise controls.

MVP release gate: both workflows complete end to end with verified domain, tested suppression, observable event outcomes, reconciled usage and documented support. Any delay to proprietary delivery activation requires explicit review at the beta gate.

## 6. Architecture
Proposed strict TypeScript monorepo with customer web UI, API modular monolith, independently deployed workers, separate internal admin UI and Postfix SMTP edge. Prefer managed PostgreSQL and object storage with regional backups. Begin with a Postgres outbox and durable dispatch rows using row leases and fair tenant scheduling. Add managed queue infrastructure when load tests justify it. Separate staging and production credentials, domains, routes and storage. Choose framework/runtime versions during foundation after repository and dependency checks.

    Customer UI / API client / authenticated SMTP edge
                  -> API policy modules -> PostgreSQL transaction and outbox
                  -> stream workers -> provider adapter or managed Postfix route
                  -> verified event intake -> normalized events -> dashboard / usage

API transaction stores accepted message, policy snapshot and outbox together. A worker claims work with a lease, rechecks tenant/domain/suppression/quota, records an attempt, then invokes the route. Inbound events are authenticated, deduplicated and retained according to policy. Provider acceptance and recipient server acceptance have separate timestamps. Recipient server acceptance cannot establish inbox placement. Metrics include oldest queued age, dispatch latency, ambiguities, bounce and complaint ratios by stream/tenant/provider, and usage reconciliation drift. Set SLO targets after baseline and load results.

## 7. Database plan
Workspace owns membership, domain, API credential, SMTP credential, contact, list, consent event, suppression, template, campaign, message, route configuration, outbox, delivery event, usage ledger and audit records. Campaign owns a recipient snapshot and references a fixed template revision. Message references sender domain and optional campaign/template revision and has many dispatch attempts and events. Contacts and lists join through tenant-scoped membership rows. Immutable consent events feed a current preference projection. Suppressions carry reason, scope and timestamp. Hard bounce and complaint policy applies across relevant streams; marketing opt-out controls marketing only.

Use composite tenant foreign keys and unique constraints (workspace plus normalized contact address, campaign plus recipient, workspace plus endpoint plus idempotency key, provider account plus event ID). Store idempotency payload fingerprint; reject key reuse with a different request. Use PostgreSQL RLS for tenant tables with request-scoped transaction context, forced policies where appropriate and application roles without bypass. Separate migration roles, explicit worker tenant context and audited narrow operator access. Exercise cross-tenant reads/writes, joins, imports and queues in CI. Encrypt sensitive content, redact logs, and validate export, deletion, backup expiry and suppression preservation before beta.

## 8. UX/UI plan
Use accessible, responsive work surfaces with visible focus, plain-language errors, keyboard support and text labels for message statuses. Navigation: Overview, Contacts, Campaigns, Templates, Transactional, Domains and Settings. Overview shows setup progress, both streams and actionable incidents. Key paths are workspace → domain → test send, import → dry run → campaign preview → schedule, and scoped credential → API test → event inspection. Components include navigation, setup stepper, DNS record table, import error table, editor/preview, timeline, confirmation dialog and accessible status badge. Test zoom, narrow viewport, screen reader, keyboard-only, loading, empty, error and retry states.

## 9. Delivery infrastructure
Accept SMTP submission with TLS and scoped credentials through Postfix and an ingress bridge that acknowledges only after durable intake. Document ambiguous SMTP acknowledgement and bounded retry semantics, including an optional client-generated dedupe identifier. Outbound adapters declare event support and idempotency behavior. Pin routing for attempts with uncertain outcomes. Reconcile through provider evidence or operator review; route to a second provider only after confirmed non-acceptance or before the first submission. SMTP ambiguity remains possible and must be surfaced. Test lost responses, out-of-order events, expired leases and retries.

Isolate marketing and transactional subdomains, pools, queues, quotas and reputation dashboards. Require verified ownership, DKIM signing, aligned SPF or DKIM, DMARC checks, feedback ingestion, provider-specific quotas and one-click marketing unsubscribe. Permit verified recipients in sandbox, require manual activation, ramp quotas, prohibit purchased lists and provide immediate workspace/domain/stream pauses with audit. Monitor credentials, unusual volumes and complaints. Direct-to-MX route requires approved port 25, static IP/PTR, warmup, feedback and on-call rollback evidence. AWS blocks outbound port 25 by default; Azure eligibility depends on subscription. Compare SES and Postmark as external candidates based on terms, regional processing, events, quotas and support. Obtain actual account approval before relying on either. [AWS port 25](https://www.repost.aws/knowledge-center/ec2-port-25-throttle) · [Azure SMTP policy](https://learn.microsoft.com/en-us/azure/virtual-network/troubleshoot-outbound-smtp-connectivity)

## 10. Roadmap
Planning ranges are elapsed weeks for a small cross-functional team. Staffing and provider lead times are unconfirmed.

| Phase | Owner role | Depends on | Range | Exit evidence and primary risk |
|---|---|---|---|---|
| 1 Discovery | Product + architecture | Sponsor input | 1–3 | Approved scope, design and risk responses; weak demand evidence |
| 2 Foundation | Engineering lead | Phase 1 approval | 2–4 | Reproducible build, isolation tests, CI and setup docs; identity integration |
| 3 Delivery core | Delivery lead | Phase 2, provider sandbox | 4–7 | REST/SMTP test, authenticated events, failure and duplicate checks; provider limits |
| 4 Marketing | Product engineering | Phase 3 | 4–7 | Consent-safe import-to-send and unsubscribe tests; suppression races |
| 5 Growth and billing | Product engineering | Phase 4 | 3–6 | Ledger reconciliation, entitlement tests and approved P1 workflows; scope growth |
| 6 Commercial beta | Operations + QA | Phases 3–5, legal/provider approval | 3–6 | Restore drill, load and deliverability results, incident runbook and pilot sign-off; reputation |
| 7 Expansion | Product | Stable beta metrics | Re-estimate | Quarterly scope based on retention and demand; operational load |

At each phase start, document objective, tickets, dependencies and measurable acceptance. At exit, record test commands/results, documentation, known defects, security/performance observations and commit link. Push the milestone to GitHub and obtain approval before beginning the next phase.

## 11. Risk register
See [RISK-REGISTER.md](RISK-REGISTER.md). Sponsor review is required for market, provider, rollout and budget assumptions.

## 12. Phase 2 engineering tickets
1. Repository and CI (1–2 days, engineering). Establish monorepo, locked dependencies, lint/typecheck/test/build and local setup. Verify clean checkout and CI.
2. Runtime and database (2–4 days, platform, after 1). Add environment validation, local DB, baseline migrations and health endpoints. Test migration, rollback/recovery and invalid config.
3. Identity and tenant context (3–5 days, backend, after 2). Create workspace, membership, role checks and session handling. Run cross-tenant, revoked-user and pooled-connection tests. Record auth ADR.
4. Audit and operator boundary (2–4 days, security/backend, after 3). Scope operator privileges and redact audit payloads. Test actor attribution and denied access. Document emergency access.
5. Workspace shell (2–4 days, frontend, after 3). Connect real workspace data and membership views. Test role visibility, keyboard navigation and responsive layout. Document UI conventions.
6. Foundation acceptance (1–3 days, QA, after 4–5). Run clean-install, integration, E2E and backup/restore smoke checks. Publish results, limitations and release notes, then push the milestone and await Phase 3 approval.
