DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls))
     OR current_user = (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'workspaces')
     OR NOT pg_has_role(current_user, 'emailmarket_app', 'USAGE') THEN
    RAISE EXCEPTION 'Unsafe EmailMarket runtime database role';
  END IF;
END $$;
