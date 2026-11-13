# Product definition

## Positioning and personas

For small SaaS teams that need to send both product notifications and customer announcements, EmailMarket brings audience, consent, sender setup and delivery history into one workspace. Test whether this reduces setup time and helps teams diagnose incidents. The following personas are hypotheses informed by desk research.

| Persona | Functional and operational job | Confidence sought | Trigger and adoption barrier |
|---|---|---|---|
| SMB owner | Import permitted contacts, schedule announcements and track outcomes | Send confidently without specialist help | Outgrows manual email; DNS and learning time |
| Ecommerce owner | Recover orders and link lifecycle messages to purchases | Understand what drives sales | Revenue pressure; store data and journey migration |
| B2B marketer | Segment leads, coordinate approvals and run nurture campaigns | Avoid audience mistakes | Manual handoffs; CRM integration |
| SaaS developer | Integrate receipts or notifications and debug failures | Trust stable API behavior | Existing provider pain; API and event migration |
| Agency owner | Operate isolated client workspaces and report outcomes | Avoid cross-client mistakes | Client growth; approval and account complexity |
| Operations lead | Manage roles, caps, audits and incidents | Know who acted and what happened | Unexpected bill or outage; incomplete audit history |

## MVP and prioritization

| Priority | Scope | Acceptance |
|---|---|---|
| P0 | Workspace, auth, roles and audit | Two-tenant suite denies cross-tenant access and proves privileged changes are auditable |
| P0 | Contacts, import, consent, unsubscribe and suppression | Import preserves opt-outs; both unsubscribe encodings work; eligibility is checked at dispatch |
| P0 | Domain setup and transactional REST/SMTP | Verified sender, scoped credentials, durable acceptance, observable test send and feedback |
| P0 | Templates, draft, audience, schedule, cancellation and delivery analytics | Preview identifies invalid inputs; immutable scheduled content; only unclaimed sends cancel |
| P0 | Abuse controls, billing foundation and operations | Approval, caps, pause, immutable usage reconciliation, feedback monitoring and restore drill |
| P1 | Forms, simple journeys, richer segments, outbound webhooks and onboarding | Define per-feature usability and reliability gates before committing |
| P2/P3 | Commerce journeys, agency, creator, CRM, multichannel and enterprise | Require validated segment demand and operating capacity |

## Journeys and design direction

- Owner sets up workspace → copies DNS records → sees verified state → sends a test. Show record purpose, expected/observed value, check time and repair instructions.
- Marketer imports → reviews invalid, duplicate and suppressed rows → selects an audience → previews → schedules. Show eligible count, local timezone and effects of cancellation.
- Developer creates a scoped credential → copies a tested request → reads the durable intake ID → inspects events. Label queued, accepted, delivered, failed and uncertain distinctly.
- Operator reviews a complaint or spike → investigates scoped metadata → pauses the stream → records recovery approval. Keep operator access and credentials separate.

Navigation should expose Overview, Contacts, Campaigns, Templates, Transactional, Domains and Settings. The dashboard prioritizes setup blockers, stream health and delivery incidents. Use Inter with system fallback, teal for primary actions, dark text on pale surfaces and status colors paired with text. Build form fields, badges, stepper, DNS table, import preview, event timeline and confirmations from shared tokens. Check keyboard navigation, focus return, accessible announcements, 200% zoom and mobile layout.

## Measures and commercial test

Track verified workspaces / started workspaces, first completed campaign / activated workspace, first transactional intake / activated workspace, and time to first verified downstream event. Report accepted, downstream accepted, hard bounce and complaint counts separately with stream, provider and cohort denominators. Track queue age and ambiguous dispatches. For pricing, test a base plan with included sends and visible hard caps, and compare with contact-based quotes. Use interviews and pilot invoices to establish willingness to pay and margin. Segment, price and metric targets remain hypotheses.

