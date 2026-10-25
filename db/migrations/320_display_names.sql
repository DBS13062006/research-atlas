-- migrate:up
-- 320 · Public display names. Trails and curated relations live in Neo4j and record only the
-- author's user_id. user_account is behind forced RLS, so this narrow SECURITY DEFINER function
-- returns the one column that is safe to show next to public content: the name. No email, no role.
SET ROLE ra_owner;

CREATE FUNCTION fn_user_display_names(p_user_ids BIGINT[])
RETURNS TABLE (user_id BIGINT, name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.user_id, u.name::TEXT
  FROM user_account u
  WHERE u.user_id = ANY (p_user_ids)
$$;

REVOKE EXECUTE ON FUNCTION fn_user_display_names(BIGINT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_user_display_names(BIGINT[]) TO ra_anon;
RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DROP FUNCTION IF EXISTS fn_user_display_names(BIGINT[]);
RESET ROLE;
