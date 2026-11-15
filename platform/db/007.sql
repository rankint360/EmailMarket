ALTER TABLE accounts ADD COLUMN disabled boolean NOT NULL DEFAULT false;
GRANT UPDATE(disabled) ON accounts TO emailmarket_app;
CREATE POLICY operator_directory ON workspaces FOR SELECT TO emailmarket_app USING (current_setting('emailmarket.operator',true)='yes');
CREATE TABLE operator_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target text NOT NULL, reason text NOT NULL, occurred_at timestamptz DEFAULT now());
ALTER TABLE operator_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY operator_only ON operator_audit TO emailmarket_app USING(current_setting('emailmarket.operator',true)='yes');
GRANT SELECT,INSERT ON operator_audit TO emailmarket_app;
GRANT UPDATE(unit_cents) ON billing_periods TO emailmarket_app;
