-- Test helpers, installed into the test database only (never into a migration).
-- Every accepts()/rejects() call runs its statement inside a sub-transaction that is always rolled
-- back, so tests are independent of each other and leave the seed untouched.
CREATE EXTENSION IF NOT EXISTS pgtap;
CREATE SCHEMA IF NOT EXISTS ra_test;
GRANT USAGE ON SCHEMA ra_test TO PUBLIC;

-- Which constraints the current transaction has exercised, for the coverage meta-test.
CREATE TABLE IF NOT EXISTS ra_test.covered (
  constraint_name NAME NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('accept', 'reject')),
  PRIMARY KEY (constraint_name, kind)
);
GRANT ALL ON ra_test.covered TO PUBLIC;

-- The statement must fail with p_state, reporting p_constraint (or a name matching p_reported_like,
-- for constraints that PostgreSQL reports under a partition-specific name).
CREATE OR REPLACE FUNCTION ra_test.rejects(
  p_desc TEXT, p_sql TEXT, p_state TEXT, p_constraint TEXT, p_reported_like TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_state TEXT;
  v_con   TEXT;
  v_msg   TEXT;
  v_ok    BOOLEAN;
BEGIN
  INSERT INTO ra_test.covered VALUES (p_constraint, 'reject') ON CONFLICT DO NOTHING;
  BEGIN
    EXECUTE p_sql;
    RAISE SQLSTATE 'ZZ000';
  EXCEPTION
    WHEN SQLSTATE 'ZZ000' THEN
      RETURN ok(FALSE, p_desc) || E'\n' || diag('statement succeeded but should have been rejected');
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_con = CONSTRAINT_NAME, v_msg = MESSAGE_TEXT;
  END;
  v_ok := v_state = p_state
          AND (coalesce(v_con, '') = p_constraint OR (p_reported_like IS NOT NULL AND v_con LIKE p_reported_like));
  IF v_ok THEN
    RETURN ok(TRUE, p_desc);
  END IF;
  RETURN ok(FALSE, p_desc) || E'\n' || diag(format('expected %s %s, got %s %s: %s', p_state, p_constraint, v_state, v_con, v_msg));
END
$$;

-- The statement must succeed; it is recorded as an accept test for every named constraint given.
CREATE OR REPLACE FUNCTION ra_test.accepts(p_desc TEXT, p_sql TEXT, VARIADIC p_constraints TEXT[])
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_state TEXT;
  v_msg   TEXT;
BEGIN
  INSERT INTO ra_test.covered SELECT unnest(p_constraints), 'accept' ON CONFLICT DO NOTHING;
  BEGIN
    EXECUTE p_sql;
    RAISE SQLSTATE 'ZZ000';
  EXCEPTION
    WHEN SQLSTATE 'ZZ000' THEN
      RETURN ok(TRUE, p_desc);
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  RETURN ok(FALSE, p_desc) || E'\n' || diag(format('unexpected %s: %s', v_state, v_msg));
END
$$;

-- Runs a statement as a given application user under a given database role, the way the web app
-- does, and returns the error SQLSTATE (or NULL on success). Always rolled back.
CREATE OR REPLACE FUNCTION ra_test.state_as(p_role NAME, p_user_id BIGINT, p_sql TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_state TEXT;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    PERFORM set_config('app.user_id', coalesce(p_user_id::TEXT, ''), TRUE);
    EXECUTE p_sql;
    RAISE SQLSTATE 'ZZ000';
  EXCEPTION
    WHEN SQLSTATE 'ZZ000' THEN
      v_state := NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('app.user_id', '', TRUE);
  RETURN v_state;
END
$$;
