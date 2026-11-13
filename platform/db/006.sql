CREATE TABLE beta_controls(workspace_id uuid PRIMARY KEY REFERENCES workspaces(id), paused boolean NOT NULL DEFAULT true, changed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE support_cases(workspace_id uuid REFERENCES workspaces(id), id uuid, actor_id uuid NOT NULL REFERENCES accounts(id), subject text NOT NULL, details text NOT NULL, state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','closed')), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,id));
DO $$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['beta_controls','support_cases'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO emailmarket_app USING (workspace_id=workspace_context())',tab);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO emailmarket_app',tab);
 END LOOP;
END $$;
