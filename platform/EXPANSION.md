# Phase 7 expansion plan

Part 15 requires core product stability before expansion. Phase 6 has delivered readiness controls. See [beta readiness](BETA.md) for open evidence. Implementation starts when the sponsor records the gate decision.

| Workstream | Owner role | Dependency | Estimate | Risk and acceptance |
|---|---|---|---|---|
| Ecommerce automation | Integrations | Approved store connector, event ingestion, consent | 4–7 weeks | Replay and out-of-order events; prove signed ingestion, dedupe and suppression |
| Advanced CRM | Product engineering | Contact model and identity rules | 4–7 weeks | Bad merges; prove audit, undo and workspace isolation |
| Agency workspaces | Platform | Org hierarchy and delegated roles | 4–6 weeks | Client data exposure; exercise cross-client denial and scoped reporting |
| White-labeling | Platform | Agency roles, verified domains and TLS | 3–5 weeks | Domain ownership and isolation; prove binding, renewal and revocation |
| Newsletter publishing | Product engineering | Template rendering and consent | 4–6 weeks | Accidental publication; verify draft, publish, unpublish and opt-out |
| AI assistant | Product and privacy | Approved model, data boundaries and evaluations | 3–6 weeks | Private data exposure or unsafe output; require review before actions and evaluate tenant isolation |
| SMS | Messaging operations | Approved provider, sender registration and consent | 4–7 weeks | Abuse and carrier rejection; verify opt-out, approved sender, feedback and caps |
| WhatsApp | Messaging operations | Approved business account, templates and consent | 4–7 weeks | Template rejection and policy drift; verify approval, opt-out and feedback handling |
| Advanced analytics | Data engineering | Trustworthy delivery and engagement events | 4–7 weeks | Attribution ambiguity; reconcile metrics, document denominators and verify isolation |
| Enterprise features | Platform and security | Confirmed customer requirements and identity provider | 6–10 weeks | Privilege escalation and integration mismatch; verify SSO, provisioning, revocation and audited controls |

Estimates are planning ranges per workstream. Begin with requirements and provider selection after stability review. Release workstreams independently with tenant isolation, accessibility, rollback, documentation and GitHub CI evidence.

## Gate evidence

Record the staging deployment and database restore result, sustained load and agreed SLOs, live DNS and delivery validation for both email streams, security review disposition, abuse pause drill and pilot sign-off. Add links to evidence in STATUS.md and obtain the sponsor's core-stability decision. Local tests establish regression coverage. Staging and pilot evidence require a provisioned environment and approved participants.

