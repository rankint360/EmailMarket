# Risk register
Open as of 2026-11-13. Owner roles are proposed. Severity reflects potential impact.

| ID | Severity | Risk | Owner | Mitigation and closure evidence |
|---|---|---|---|---|
| R01 | High | Buyers see little reason to switch | Product | Interview and prototype tests; recruit pilot teams willing to migrate real workflows |
| R02 | High | Migration loses consent or suppressions | Product/QA | Dry run, provenance and suppression replay; fixture and pilot export reconciliation |
| R03 | Critical | Cross-tenant disclosure | Security | RLS, composite keys and tenant-scoped jobs; CI negative cases and independent review |
| R04 | Critical | Spam or phishing damages pooled reputation | Trust & Safety | Verified senders, manual activation, rate caps, complaint intake and freeze drill |
| R05 | High | Port 25, PTR or provider approval unavailable | Delivery | Obtain written acceptable-use and region approvals, verify IP/PTR and quota; retain approved relay route |
| R06 | Critical | Ambiguous submission produces duplicate or delayed mail | Delivery | Durable attempts, provider-specific reconciliation and hold policy; fault injection |
| R07 | High | Marketing incidents degrade transactional service | Delivery | Separate queues, limits and routes; saturation and tenant suspension drills |
| R08 | High | Provider events are forged, incomplete or duplicated | Security/Delivery | Validate signature/auth and account mapping; dedupe and normalize; compare event fixtures and feedback coverage |
| R09 | High | Regional privacy, marketing and retention obligations unmet | Legal | Market matrix, data map, residency and transfer review, DPA and verified rights workflows |
| R10 | High | Sending economics or support cost erodes margin | Finance | Model fixed cost per million at multiple volumes plus variable delivery, bytes, IPs, storage, events and labor; replace estimates with quotes and pilot invoices |
| R11 | High | Entity cannot collect payments or meet tax obligations | Finance/Legal | Confirm entity country, processor eligibility, currencies, tax and invoicing before paid launch |
| R12 | High | Global coverage exceeds operator capacity | Operations | Define supported hours, incident severity and escalation; run restore and provider outage drills |
| R13 | Medium | Product name conflicts or domain is taken | Product/Legal | Check live registrar and registry results and relevant trademarks before adoption |
| R14 | High | DNS or deliverability expectations create false assurances | Delivery/Product | Distinguish policy readiness, provider acceptance and inbox placement; verify Gmail/Yahoo workflows and monitor complaints |
