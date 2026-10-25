-- migrate:up
-- 310 · Administrators may read query statistics (pg_stat_statements) for every role, which the
-- admin page uses to list the slowest queries. pg_read_all_stats is a predefined read-only role.
GRANT pg_read_all_stats TO ra_admin;

-- migrate:down
REVOKE pg_read_all_stats FROM ra_admin;
