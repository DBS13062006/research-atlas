-- migrate:up
-- 330 · Query Lab side effects. After a lab run (always inside a transaction), the lab shows the
-- audit_log and graph_outbox rows that the run's triggers wrote. Only administrators may read those
-- tables, so this SECURITY DEFINER function returns exactly the rows created by the caller's own
-- current transaction (xmin = its transaction id) and nothing older or anyone else's.
SET ROLE ra_owner;

CREATE FUNCTION fn_lab_side_effects()
RETURNS TABLE (source TEXT, row_id BIGINT, target TEXT, operation TEXT, detail JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH me AS (SELECT xid(pg_current_xact_id_if_assigned()) AS xid)
  SELECT 'audit_log', a.audit_id, a.table_name::TEXT, a.operation::TEXT,
         jsonb_build_object(
           'row', a.row_pk,
           'db_role', a.db_role,
           -- for updates only the columns that changed; inserts and deletes show the whole row
           'changed', (SELECT jsonb_object_agg(k, jsonb_build_array(a.old_row -> k, a.new_row -> k))
                       FROM jsonb_object_keys(coalesce(a.new_row, a.old_row)) AS k
                       WHERE a.old_row -> k IS DISTINCT FROM a.new_row -> k))
  FROM audit_log a, me
  WHERE a.xmin = me.xid
  UNION ALL
  SELECT 'graph_outbox', o.outbox_id, o.aggregate::TEXT, o.operation::TEXT,
         jsonb_build_object('key', o.aggregate_key, 'payload', o.payload)
  FROM graph_outbox o, me
  WHERE o.xmin = me.xid
  ORDER BY 1, 2
$$;

REVOKE EXECUTE ON FUNCTION fn_lab_side_effects() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_lab_side_effects() TO ra_researcher;
RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DROP FUNCTION IF EXISTS fn_lab_side_effects();
RESET ROLE;
