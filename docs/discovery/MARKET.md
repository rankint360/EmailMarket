# Market and competitor evidence
Public-source review, 2026-11-13. USD where shown. Starting prices are observations, subject to tier, locale, billing term and checkout. No market-size estimate is used.

## Market structure

Campaign tools compete on time to first campaign and ease of maintaining an audience. Commerce platforms compete on store data and revenue workflows. Publishing platforms bundle audience growth and monetization. Infrastructure vendors compete on API ergonomics, event visibility and unit costs. Lifecycle vendors compete on event data and branching workflows. International SMB needs vary by language, timezone, local consent rules, payment access, support hours and processing location. Target US-first SaaS teams with both product email and announcements as an initial hypothesis. Service SMBs are a second segment. Commerce, creator monetization and agency controls require different integrations or operating models.

## Capability and pricing comparison

Y = documented. P = narrower supported workflow. T = higher tier or approval. A = add-on or separate product. ? = unverified. Developer surface means documented API, webhook or cloud event integration and does not imply equivalence. Verify tier and account conditions before choosing a vendor.

| Vendor | Segment | Campaigns | Automation | Transactional | Developer surface | Public pricing observation |
|---|---|---|---|---|---|---|
| [Mailchimp](https://mailchimp.com/pricing/marketing/) | SMB | Y | Y | A | Y | Contact tiers; transactional add-on from $20 per 25k sends, eligible marketing plan required |
| [Brevo](https://www.brevo.com/pricing/) | SMB | Y | Y | Y | Y | Volume and contact limits; use official plan guide for tier details |
| [MailerLite](https://www.mailerlite.com/pricing) | SMB | Y | Y | A | Y | Free 250 subscribers, 2,500 monthly sends and 2 seats; transactional product separate |
| [Constant Contact](https://www.constantcontact.com/pricing) | SMB | Y | T | ? | ? | Lite $10.20/month billed annually, starting tier; contact and volume conditions |
| [GetResponse](https://www.getresponse.com/pricing) | SMB | Y | T | ? | Y | Starter displayed at $15.58/month billed annually; verify selected contact tier |
| [Zoho Campaigns](https://www.zoho.com/campaigns/pricing.html) | SMB | Y | T | ? | Y | Free 2,000 contacts, 2,000 sends/month and 5 users; paid pricing by contact tier |
| [HubSpot](https://www.hubspot.com/pricing/marketing) | CRM | Y | T | T | Y | Free 2,000 branded sends/month; Starter uses seat and marketing-contact limits |
| [ActiveCampaign](https://www.activecampaign.com/pricing) | Lifecycle | Y | Y | A | Y | Contact and plan tiers; transactional product offered separately |
| [Klaviyo](https://www.klaviyo.com/pricing) | Commerce | Y | Y | P | Y | Profile and sending limits; verify transactional eligibility and commerce workflow |
| [Omnisend](https://www.omnisend.com/pricing/) | Commerce | Y | Y | P | ? | Free 250 billable contacts and 500 monthly sends; paid volume and channels vary |
| [beehiiv](https://www.beehiiv.com/pricing) | Publishing | Y | T | ? | Y | Free display at 1,000 subscribers with unlimited sends; Lite $49/month billed yearly |
| [Kit](https://kit.com/pricing) | Publishing | Y | T | ? | Y | Subscriber tiers; confirm free-plan and automation limits for selected cohort |
| [Resend](https://resend.com/pricing) | Developer | Y | ? | Y | Y | Transactional Pro $20/month for 50k plus $0.90/1k extra; marketing priced separately |
| [Postmark](https://postmarkapp.com/pricing) | Developer | P | ? | Y | Y | Basic $15/month for 10k plus $1.80/1k extra; free test allowance 100/month |
| [SendGrid](https://sendgrid.com/en-us/pricing) | Developer | Y | ? | Y | Y | Email API and Marketing Campaigns are separately priced products |
| [Mailgun](https://www.mailgun.com/pricing/) | Developer | ? | ? | Y | Y | Basic $15/month for 10k; Scale $90/month for 100k after trial |
| [Amazon SES](https://aws.amazon.com/ses/pricing/) | Infrastructure | ? | ? | Y | Y | À la carte $0.10 per 1k outbound, with separate attachment and optional feature charges |
| [Customer.io](https://customer.io/pricing/) | Lifecycle | Y | Y | Y | Y | Essentials starts $100 billed monthly, 5k profiles and 1M emails/month |

Supplementary evidence for [Brevo plan rules](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans), [Mailchimp transactional](https://mailchimp.com/features/transactional-email/), [HubSpot transactional](https://knowledge.hubspot.com/marketing-email/how-to-use-transactional-email-in-hubspot), [Customer.io transactional](https://docs.customer.io/journeys/transactional-api/), and [Klaviyo transactional flows](https://help.klaviyo.com/hc/en-us/articles/115005251108).

## Workload comparison

For 5k profiles and 25k campaign sends, Customer.io Essentials' advertised allowances fit at $100/month, before any extra usage. For 20k profiles and 100k sends the same advertised base profile allowance is insufficient. Obtain a configured tier quote. Test alternate tools with the same contacts, users, volume and branding requirements. Do not apply a free or entry price to workloads that exceed its limits.

For 100k transactional sends per month, SES à la carte base delivery is $10, Mailgun Scale advertises $90, and Resend Pro arithmetic is $65 if published overage applies to the full extra 50k. These figures exclude add-ons, data transfer, taxes, separate marketing plans and in-house operations. Confirm sending limits and the cheapest eligible plan. A raw relay price is not the cost of running a marketing workspace.

## Workflow and competitive position

- MailerLite, Constant Contact and Zoho set the SMB benchmark for editor and audience setup. Test task success, keyboard access, authentication guidance and error recovery directly.
- Brevo, Mailchimp, ActiveCampaign and SendGrid cover both streams in various product configurations. Shared setup and transparent cross-stream incident diagnosis are testable opportunities.
- Postmark documents separate broadcast and transactional streams. SES provides metered transport and optional deliverability services. Compare retries, feedback authentication, event retention, sandbox limits and regional support using fixtures. Inbox placement comparisons require controlled sends.
- Klaviyo and Omnisend emphasize commerce workflows; Kit and beehiiv emphasize publishing. Their switching costs include automations, store integrations and subscriber monetization.
- Customer.io and ActiveCampaign offer deeper automation. Prioritize safe first send and event visibility before branching automation depth.

## Customer evidence

A convenience sample of six public review pages and discussion threads provided directional signals. These sources can overlap, include vendor or reviewer selection bias, and do not measure market prevalence. No interviews, account-based UX trials or controlled deliverability tests were conducted.

| Signal | Observation and counterexample | Design implication |
|---|---|---|
| Pricing scales unexpectedly | Reviewers discuss contact thresholds, while others value the capabilities bundled at their tier. [G2 analysis](https://learn.g2.com/email-marketing-pricing) · [Capterra](https://www.capterra.com/p/132996/brevo/pricing/) | Prototype caps and a pre-send invoice estimate |
| Migration work varies | One thread describes rebuilding automations while another reviewer reports easy contact migration. [Migration discussion](https://www.reddit.com/r/Emailmarketing/comments/1qttg5w/migrating_off_mailchimp/) · [Capterra reviews](https://www.capterra.com/p/132996/brevo/reviews/?page=3) | Test dry runs, suppression replay and export parity |
| Setup and integrations | One discussion describes hiring help for site integration. Some reviewers report fast onboarding. [SMB discussion](https://www.reddit.com/r/Emailmarketing/comments/1u2zai9/need_affordable_email_marketing_service/) · [Brevo reviews](https://www.capterra.com/p/132996/brevo/reviews/) | Observe DNS, CSV and test-send tasks with representative customers |

Next validation uses 12 interviews and five observed workflows. Record consent, segment, tool history, failed steps and counterexamples. Test whether participants can authenticate a test domain, preserve an opt-out during import and diagnose three message states. Recruit at least three design partners willing to test both streams before treating segment demand as validated.

