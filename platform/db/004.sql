CREATE TABLE marketing_templates (
 workspace_id uuid REFERENCES workspaces(id), id uuid, name text NOT NULL,
 subject text NOT NULL, content text NOT NULL, PRIMARY KEY(workspace_id,id)
);
CREATE TABLE campaigns (
 workspace_id uuid REFERENCES workspaces(id), id uuid, name text NOT NULL,
 template_id uuid NOT NULL, group_id uuid NOT NULL, sender text NOT NULL,
 scheduled_at timestamptz, queued_count integer, skipped_count integer,
 PRIMARY KEY(workspace_id,id)
);
CREATE TABLE campaign_messages (
 workspace_id uuid, campaign_id uuid, message_id uuid,
 PRIMARY KEY(workspace_id,campaign_id,message_id),
 FOREIGN KEY(workspace_id,campaign_id) REFERENCES campaigns(workspace_id,id),
 FOREIGN KEY(workspace_id,message_id) REFERENCES messages(workspace_id,id)
);
DO $$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['marketing_templates','campaigns','campaign_messages']
 LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO emailmarket_app USING (workspace_id=workspace_context())',tab);
  EXECUTE format('GRANT SELECT, INSERT ON %I TO emailmarket_app',tab);
 END LOOP;
END $$;
GRANT UPDATE, DELETE ON marketing_templates,campaigns TO emailmarket_app;
