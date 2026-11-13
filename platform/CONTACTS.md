# Phase 2 contacts and compliance

Open a workspace's **Contacts** view to manage contacts, lists and tags. Workspace owners, admins and marketers can edit. Viewers can read contacts and consent history. Owners and admins manage suppressions and download exports.

## Import and export

- Contacts CSV accepts an email column and optional name. Suppression CSV accepts email and optional reason. Reasons are manual (default), unsubscribe, hard_bounce and complaint.
- Each import supports up to 500 records and 450 KB of CSV text. Preview reports invalid and duplicate records. A commit containing an invalid record writes nothing. Existing contacts retain their names, consent and suppression records. Re-importing an existing suppression leaves its original record intact.
- Download the workspace JSON export for contacts, groups, memberships, consent and suppressions. The export includes addresses and consent evidence. Restrict access and handle the file as personal data. Large exports are buffered in memory.

## Consent and recipient controls

Record consent evidence as a short source reference, such as an opt-in receipt ID. A contact starts unsubscribed. Consent history is append-only and keyed to the normalized address within the workspace. Contact deletion removes the contact and its group memberships and records an opt-out if the contact had active consent. Historical consent and suppressions are retained so a reimport cannot silently restore eligibility. This workflow does not perform legal erasure.

Suppressions override consent. Owners and admins can remove manual or unsubscribe suppressions with evidence. This leaves the address opted out until a separate consent event is recorded. Complaint and hard-bounce removal requires a separate reviewed operational procedure. A future marketing dispatch must require affirmative consent and absence of suppression at send time. Transactional dispatch policy belongs to Phase 3.

Unsubscribe URLs contain a random recipient token stored as a hash. GET displays a confirmation. POST accepts the URL-encoded and multipart forms described by RFC 8058 and records an idempotent workspace-wide marketing opt-out. Serve the endpoint over HTTPS, redact its path in proxy logs and include the two DKIM-signed unsubscribe headers when connecting the sending pipeline. [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html)

## API

Prefix authenticated routes with /api/v1/workspaces/:id.

| Routes | Methods |
|---|---|
| /contacts | GET (after cursor), POST |
| /contacts/:contact | PATCH name, DELETE |
| /contacts/:contact/consent | GET latest 100 events |
| /contacts/:contact/preferences | PUT subscribed and evidence |
| /contacts/:contact/unsubscribe-link | POST |
| /imports, /suppression-imports | POST csv and boolean commit |
| /groups | GET, POST kind and name |
| /groups/:group | PATCH name, DELETE |
| /groups/:group/contacts | GET (after cursor) |
| /groups/:group/contacts/:contact | PUT, DELETE |
| /suppressions | GET (after email cursor), PUT email and reason, DELETE email, reason and evidence |
| /contacts-export | GET JSON attachment |

## Migration and checks

Run npm run migrate before deploying Phase 2 against an existing database. Migration 002 adds tenant-scoped tables, composite membership foreign keys and the security-invoker preferences view. Migration failures roll back. Back up before rollout and restore from the backup if schema rollback is required.

Run npm run lint and npm test from platform/. The suite covers the foundation plus role boundaries, contacts and groups, consent history, side-effect-free GET, both unsubscribe POST encodings, import atomicity, retained suppression, export and database isolation. CI repeats integration tests with a limited PostgreSQL login and builds the release container.

