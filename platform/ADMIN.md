# Internal administration

Apply migration 007. Configure ADMIN_NAME to identify the operator and ADMIN_KEY to a unique random secret of at least 32 characters. Open /admin and enter the key. The dashboard retains it only in page memory. Restrict /admin, /admin.js and /internal to a private TLS gateway with MFA and individual access logs. Rotate the dashboard key through deployment secrets.

The dashboard lists users and workspaces, suspends or restores user access, and revokes active sessions on suspension. Approve or pause workspace sending and revoke sending or integration credentials by ID. Workspace details show domain verification, message-state counts, support metadata and credential IDs. Set an override for a workspace's estimated billing rate by UTC month. Mutations require a reason and write an operator audit record in the same transaction.

Sending approval controls worker claims. It does not recall a message already claimed. The worker allowlist remains a deployment setting. Suspending a user's login does not pause a workspace or revoke its independently issued service credentials. Customer roles do not grant dashboard access.

Provider endpoints, Postfix paths, deployment secrets, provider keys and named identity lifecycle remain deployment-managed. Dashboard authentication currently uses a dedicated bearer credential, with individual operator identity and MFA supplied by the private gateway.
