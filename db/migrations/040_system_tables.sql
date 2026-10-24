-- migrate:up
-- 040 · System tables: the partitioned audit trail and the transactional outbox that feeds Neo4j.
SET ROLE ra_owner;

CREATE TABLE audit_log (
  audit_id      BIGINT GENERATED ALWAYS AS IDENTITY,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  table_name    NAME    NOT NULL,
  operation     CHAR(1) NOT NULL,
  row_pk        JSONB   NOT NULL,
  old_row       JSONB,
  new_row       JSONB,
  actor_user_id BIGINT,                      -- no FK on purpose: the audit trail outlives deleted users
  db_role       NAME    NOT NULL DEFAULT current_user,
  CONSTRAINT pk_audit_log PRIMARY KEY (audit_id, occurred_at),
  CONSTRAINT chk_audit_log_operation CHECK (operation IN ('I', 'U', 'D'))
) PARTITION BY RANGE (occurred_at);

-- Creates the monthly partition that holds p_at, if it does not exist yet. Returns its name.
CREATE FUNCTION fn_ensure_audit_partition(p_at TIMESTAMPTZ DEFAULT now())
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_start DATE := date_trunc('month', p_at)::DATE;
  v_end   DATE := (date_trunc('month', p_at) + INTERVAL '1 month')::DATE;
  v_name  TEXT := format('audit_log_y%sm%s', to_char(v_start, 'YYYY'), to_char(v_start, 'MM'));
BEGIN
  IF to_regclass('public.' || v_name) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)',
      v_name, v_start, v_end);
  END IF;
  RETURN v_name;
END
$$;

-- Monthly partitions for the project's lifetime, plus a default partition as a safety net.
SELECT fn_ensure_audit_partition(m)
FROM generate_series(TIMESTAMPTZ '2026-01-01', TIMESTAMPTZ '2027-12-01', INTERVAL '1 month') AS m;
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;

CREATE TABLE graph_outbox (
  outbox_id     BIGINT GENERATED ALWAYS AS IDENTITY,
  aggregate     VARCHAR(30) NOT NULL,        -- 'paper', 'citation', 'authorship', 'topic_link', ...
  aggregate_key JSONB       NOT NULL,
  operation     VARCHAR(10) NOT NULL,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ,
  attempts      SMALLINT NOT NULL DEFAULT 0,
  last_error    TEXT,
  CONSTRAINT pk_graph_outbox PRIMARY KEY (outbox_id),
  CONSTRAINT chk_graph_outbox_operation CHECK (operation IN ('UPSERT', 'DELETE')),
  CONSTRAINT chk_graph_outbox_attempts_non_negative CHECK (attempts >= 0)
);
CREATE INDEX ix_outbox_pending ON graph_outbox (outbox_id) WHERE processed_at IS NULL;

RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DROP TABLE IF EXISTS graph_outbox;
DROP TABLE IF EXISTS audit_log;
DROP FUNCTION IF EXISTS fn_ensure_audit_partition(TIMESTAMPTZ);
RESET ROLE;
