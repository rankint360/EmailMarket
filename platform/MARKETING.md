# Phase 4 marketing campaigns

Open Campaigns from a workspace. Owners, admins and marketers can create and edit plain-text templates, preview message content, select a contact list or tag and save campaign drafts. Viewers can inspect campaign analytics. Use Check audience to see eligibility before scheduling. Send time is entered in the browser's local time and stored as UTC.

Set PUBLIC_ORIGIN to the public HTTPS origin with no trailing slash. Apply migration 004 before starting the service. Scheduling requires a verified sender, a saved template, an audience of at most 500 contacts and at least one eligible recipient. The schedule transaction snapshots the template and eligible recipients, creates an opaque unsubscribe link per message and enqueues jobs for the scheduled time. The worker checks consent and suppressions again before submission. Cancellation removes jobs that the worker has yet to claim.

Campaign analytics reports counts by current delivery status. Accepted means the configured transport accepted the submission. Delivered requires downstream evidence. The first editor is plain text and analytics covers delivery outcomes. Opens, clicks, visual HTML editing and conversion attribution are outside this implementation.

Configure transport, authorization and feedback using [the delivery guide](DELIVERY.md). The delivery host must sign both unsubscribe headers with DKIM and operators must verify the public endpoint and sending identity before real sends.

## Verification

Run npm run lint and npm test. The campaign integration test covers audience eligibility, content snapshotting, schedule timing, duplicate scheduling, dispatch-time consent, cancellation and analytics. GitHub Actions also runs against standalone PostgreSQL and builds the container.

