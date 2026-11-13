CREATE TABLE growth_forms(workspace_id uuid REFERENCES workspaces(id), id uuid, name text NOT NULL, PRIMARY KEY(workspace_id,id));
CREATE TABLE growth_segments(workspace_id uuid REFERENCES workspaces(id), id uuid, name text NOT NULL, subscribed boolean NOT NULL, PRIMARY KEY(workspace_id,id));
CREATE TABLE growth_rules(workspace_id uuid, id uuid, form_id uuid NOT NULL, group_id uuid NOT NULL, PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,form_id,group_id), FOREIGN KEY(workspace_id,form_id) REFERENCES growth_forms(workspace_id,id), FOREIGN KEY(workspace_id,group_id) REFERENCES contact_groups(workspace_id,id) ON DELETE CASCADE);
CREATE TABLE growth_hooks(workspace_id uuid REFERENCES workspaces(id), id uuid, secret_hash text NOT NULL, PRIMARY KEY(workspace_id,id));
CREATE TABLE growth_events(workspace_id uuid REFERENCES workspaces(id), id uuid, form_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,id));
CREATE TABLE billing_periods(workspace_id uuid REFERENCES workspaces(id), period date, currency text NOT NULL DEFAULT 'USD', unit_cents integer NOT NULL CHECK(unit_cents>=0), PRIMARY KEY(workspace_id,period));
DO $$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['growth_forms','growth_segments','growth_rules','growth_hooks','growth_events','billing_periods'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO emailmarket_app USING (workspace_id=workspace_context())',tab);
  EXECUTE format('GRANT SELECT, INSERT ON %I TO emailmarket_app',tab);
 END LOOP;
END $$;
GRANT DELETE ON growth_hooks,growth_rules TO emailmarket_app;
ALTER TABLE growth_events ADD COLUMN delivered_at timestamptz;
GRANT UPDATE(delivered_at) ON growth_events TO emailmarket_app;
CREATE TABLE growth_submissions(workspace_id uuid, form_id uuid, contact_id uuid, PRIMARY KEY(workspace_id,form_id,contact_id), FOREIGN KEY(workspace_id,form_id) REFERENCES growth_forms(workspace_id,id), FOREIGN KEY(workspace_id,contact_id) REFERENCES contacts(workspace_id,id) ON DELETE CASCADE);
ALTER TABLE growth_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_submissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON growth_submissions TO emailmarket_app USING(workspace_id=workspace_context());
GRANT SELECT,INSERT ON growth_submissions TO emailmarket_app;
