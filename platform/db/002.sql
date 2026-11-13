CREATE TABLE contacts (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  id uuid NOT NULL,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,email)
);
CREATE TABLE contact_groups (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('list','tag')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,kind,name)
);
CREATE TABLE contact_group_members (
  workspace_id uuid NOT NULL,
  group_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  PRIMARY KEY (workspace_id,group_id,contact_id),
  FOREIGN KEY (workspace_id,group_id) REFERENCES contact_groups(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,contact_id) REFERENCES contacts(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE consent_events (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  id bigint GENERATED ALWAYS AS IDENTITY,
  email text NOT NULL,
  subscribed boolean NOT NULL,
  source text NOT NULL,
  actor_id uuid REFERENCES accounts(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id,id)
);
CREATE INDEX consent_history ON consent_events(workspace_id,email,id DESC);
CREATE TABLE suppressions (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  email text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('unsubscribe','manual','hard_bounce','complaint')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id,email,reason)
);
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['contacts','contact_groups','contact_group_members','consent_events','suppressions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tab);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO emailmarket_app USING (workspace_id = workspace_context())', tab);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO emailmarket_app', tab);
  END LOOP;
END $$;
GRANT UPDATE, DELETE ON contacts, contact_groups TO emailmarket_app;
GRANT DELETE ON contact_group_members, suppressions TO emailmarket_app;

CREATE VIEW contact_preferences WITH (security_invoker = true) AS
SELECT c.*, COALESCE(e.subscribed,false) AS subscribed,
  EXISTS (SELECT 1 FROM suppressions s WHERE s.workspace_id=c.workspace_id AND s.email=c.email) AS suppressed
FROM contacts c LEFT JOIN LATERAL (
  SELECT subscribed FROM consent_events
  WHERE workspace_id=c.workspace_id AND email=c.email ORDER BY id DESC LIMIT 1
) e ON true;
GRANT SELECT ON contact_preferences TO emailmarket_app;
CREATE TABLE unsubscribe_tokens (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  token_hash text NOT NULL,
  email text NOT NULL,
  PRIMARY KEY (workspace_id,token_hash)
);
ALTER TABLE unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE unsubscribe_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON unsubscribe_tokens TO emailmarket_app USING (workspace_id=workspace_context());
GRANT SELECT, INSERT ON unsubscribe_tokens TO emailmarket_app;
