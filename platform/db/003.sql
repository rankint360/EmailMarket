CREATE TABLE sending_domains (
 workspace_id uuid REFERENCES workspaces(id), domain text, challenge text NOT NULL,
 verified_at timestamptz, PRIMARY KEY(workspace_id,domain)
);
CREATE TABLE sending_credentials (
 workspace_id uuid REFERENCES workspaces(id), id uuid, secret_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,id)
);
CREATE TABLE messages (
 workspace_id uuid REFERENCES workspaces(id), id uuid, idem text NOT NULL, fingerprint text NOT NULL,
 stream text NOT NULL CHECK(stream IN ('transactional','marketing')),
 sender text NOT NULL, recipient text NOT NULL, subject text NOT NULL, content text NOT NULL,
 headers jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'queued',
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,idem)
);
CREATE TABLE delivery_outbox (
 workspace_id uuid, message_id uuid, available_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz, PRIMARY KEY(workspace_id,message_id),
 FOREIGN KEY(workspace_id,message_id) REFERENCES messages(workspace_id,id)
);
CREATE INDEX delivery_pending ON delivery_outbox(workspace_id,available_at) WHERE claimed_at IS NULL;
CREATE TABLE delivery_events (
 workspace_id uuid, message_id uuid, event_key text, kind text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,message_id,event_key),
 FOREIGN KEY(workspace_id,message_id) REFERENCES messages(workspace_id,id)
);
DO $$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['sending_domains','sending_credentials','messages','delivery_outbox','delivery_events']
 LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO emailmarket_app USING (workspace_id=workspace_context())',tab);
  EXECUTE format('GRANT SELECT, INSERT ON %I TO emailmarket_app',tab);
 END LOOP;
END $$;
GRANT UPDATE ON sending_domains,messages,delivery_outbox TO emailmarket_app;
GRANT DELETE ON sending_credentials,delivery_outbox TO emailmarket_app;
