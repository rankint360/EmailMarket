# Owner administration

Deploy a second instance of the app for the owner dashboard, using the same migrated database. Set ADMIN_HOST to the chosen owner subdomain, such as admin.example.com. Leave ADMIN_HOST and all owner secrets unset on the public customer instance. The owner instance only serves dashboard routes and health checks.

Route the owner hostname through a private HTTPS gateway. Enforce MFA and an explicit allowlist containing only the platform owner's identity. Preserve the exact upstream Host and overwrite any client-supplied X-Owner-Gateway-Key with the ADMIN_GATEWAY_KEY secret. Keep the origin on a private network. Protect dashboard assets and API routes with the same gateway policy. The app rejects an incorrect host or a missing gateway key.

Set ADMIN_NAME to the owner identity and ADMIN_KEY to a separate random secret. Both keys must be at least 32 characters. Open https://<owner-host>/admin and enter ADMIN_KEY after gateway sign-in. The browser holds the API key in page memory. Customer sessions and workspace roles do not grant owner access.

The dashboard lists users and workspaces, suspends or restores user access, and revokes active sessions on suspension. Approve or pause workspace sending and revoke sending or integration credentials by ID. Workspace details show domain verification, message-state counts, support metadata and credential IDs. Set an override for a workspace's estimated billing rate by UTC month. Mutations require a reason and write an operator audit record in the same transaction.

Sending approval controls worker claims. It does not recall a message already claimed. The worker allowlist remains a deployment setting. Suspending a user's login does not pause a workspace or revoke its independently issued service credentials. Customer roles do not grant dashboard access.

Provider endpoints, Postfix paths, deployment secrets, provider keys and named identity lifecycle remain deployment-managed. Dashboard authentication currently uses a dedicated bearer credential, with individual operator identity and MFA supplied by the private gateway.

