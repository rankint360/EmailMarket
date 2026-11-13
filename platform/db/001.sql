CREATE ROLE emailmarket_app NOLOGIN NOBYPASSRLS;
CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  expires_at timestamptz NOT NULL
);
CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100)
);
CREATE TABLE memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  role text NOT NULL CHECK (role IN ('owner','admin','marketer','developer','viewer')),
  PRIMARY KEY (workspace_id, account_id)
);
CREATE UNIQUE INDEX one_owner ON memberships(workspace_id) WHERE role = 'owner';
CREATE TABLE audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_id uuid NOT NULL REFERENCES accounts(id),
  action text NOT NULL,
  target_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION workspace_context() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('emailmarket.workspace', true), '')::uuid $$;
CREATE FUNCTION account_context() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('emailmarket.account', true), '')::uuid $$;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_scope ON workspaces TO emailmarket_app USING (id = workspace_context());
CREATE POLICY membership_scope ON memberships TO emailmarket_app USING (workspace_id = workspace_context());
CREATE POLICY own_memberships ON memberships FOR SELECT TO emailmarket_app USING (account_id = account_context());
CREATE POLICY audit_scope ON audit TO emailmarket_app USING (workspace_id = workspace_context());
GRANT SELECT, INSERT ON accounts, workspaces, audit TO emailmarket_app;
GRANT SELECT, INSERT, DELETE ON sessions TO emailmarket_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO emailmarket_app;
