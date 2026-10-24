-- migrate:up
-- 005 · Database roles.
-- ra_owner owns every schema object; later migrations switch to it with SET ROLE so ownership
-- never sits with the superuser. BYPASSRLS lets SECURITY DEFINER functions owned by it read
-- tables whose row-level security is FORCED.
-- The four group roles form the application privilege ladder; their grants live in 300_rbac.
-- Roles are cluster-wide, so creation is idempotent (the test database shares the cluster).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ra_owner') THEN
    CREATE ROLE ra_owner NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ra_anon') THEN
    CREATE ROLE ra_anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ra_researcher') THEN
    CREATE ROLE ra_researcher NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ra_curator') THEN
    CREATE ROLE ra_curator NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ra_admin') THEN
    CREATE ROLE ra_admin NOLOGIN;
  END IF;
END
$$;

ALTER SCHEMA public OWNER TO ra_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- migrate:down
ALTER SCHEMA public OWNER TO pg_database_owner;
GRANT USAGE ON SCHEMA public TO PUBLIC;

-- Drop a role only when no other database in the cluster still depends on it.
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['ra_admin', 'ra_curator', 'ra_researcher', 'ra_anon', 'ra_owner'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
       AND NOT EXISTS (
         SELECT 1
         FROM pg_shdepend d
         JOIN pg_roles ro ON ro.oid = d.refobjid
         WHERE ro.rolname = r
           AND d.dbid <> (SELECT oid FROM pg_database WHERE datname = current_database()))
    THEN
      EXECUTE format('DROP OWNED BY %I', r);
      EXECUTE format('DROP ROLE %I', r);
    END IF;
  END LOOP;
END
$$;
