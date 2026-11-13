# EmailMarket platform foundation

Part 15 Phase 1 implements workspace identity and role management, a Fastify API, a responsive workspace UI, PostgreSQL migrations, tenant-scoped auditing, and operator health endpoints.

## Run locally

Use Node.js 26 and run these commands from platform/.

```sh
npm ci
npm run lint
npm test
npm start
```

Open http://127.0.0.1:3000. Create an account, then create a workspace. To exercise membership changes, register a second account, sign back in as the owner, and assign the second account a role in Manage. Owners alone change memberships. Owners and admins can read members and audit history. The local database is PostgreSQL via PGlite, persisted to local-data unless LOCAL_DB overrides it.

## PostgreSQL and deployment

Set MIGRATION_DATABASE_URL to a separate database administrator connection and run npm run migrate. The first migration creates the NOLOGIN emailmarket_app group and uses database-wide advisory locking. Create a limited login named emailmarket_runtime through your hosting control plane, then apply db/provision-runtime.sql. The runtime login must inherit the app grants and lack ownership, superuser and BYPASSRLS privileges. Set DATABASE_URL to the limited runtime URL, remove migration credentials from the runtime environment, and run with NODE_ENV=production behind TLS. Keep the service private until the identity and operator controls below are complete.

The container listens on port 3000 as the node user. Build from platform/ with docker build -t emailmarket-foundation . and run migrations as a one-shot job using npm run migrate (or node dist/src/index.js --migrate). Health routes are /health/live and /health/ready. Route /internal and /metrics only through a private monitoring network. Set a random OPERATOR_KEY of at least 32 characters, store it in a secret manager, and use bearer authentication. Provision TLS and MFA at the operator gateway. Rotate the key by replacing it and restarting the service.

Use structured Fastify logs for request IDs and status codes, and scrape /metrics for response totals. Alert on repeated readiness failures, sustained 5xx increases and deployment restarts. Metrics reset on process restart. Before applying a schema change, take a database backup and verify restore in a disposable environment. Migration failures roll back the migration transaction. Restore into a replacement instance to recover from a bad committed migration.

## API

| Method | Route under /api/v1 | Access |
|---|---|---|
| POST | /signup, /login | Public, rate-limited |
| POST | /logout | Current session cookie |
| GET, POST | /workspaces | Signed-in account |
| GET | /workspaces/:id/members, /workspaces/:id/audit | Workspace owner or admin |
| PUT | /workspaces/:id/members | Workspace owner |
| DELETE | /workspaces/:id/members/:member | Workspace owner |

Signup and login accept JSON email and password. Create workspace accepts name. Membership assignment accepts existing account email and role. Successful login issues an eight-hour HTTP-only session cookie. Cross-workspace lookups return 404. Audit history is scoped and returns up to 100 recent events.

## Release limitations

Foundation uses local password authentication and direct assignment of existing accounts. Verified identity, recovery, invitations, customer-facing MFA and managed identity integration are release follow-ups. The operator endpoint is a read-only status surface with a separate credential. A named operator identity, MFA gateway and administrative UI require deployment work. The built-in rate limiter is single-process; use upstream controls for deployments. Provision infrastructure and an approved deployment target before turning the container build into a release deployment. Sending and billing are later phases.



See [Phase 2 contacts and compliance](CONTACTS.md) for the audience workspace, imports, consent, unsubscribe, suppressions and export.

