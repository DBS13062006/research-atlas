import "server-only";

import { type DbContext, withDb } from "@/server/db/client";
import { graphDriver } from "@/server/graph/driver";
import { drainOutbox } from "@/server/graph/projection";

// The graph sync worker's identity inside the web app: ra_admin with no application user. Used to
// drain the outbox right after a curator's write, so the UI never shows stale graph data.
const SYSTEM: DbContext = { role: "ra_admin", userId: null };

export async function syncGraphNow() {
  return drainOutbox((fn) => withDb(SYSTEM, fn), graphDriver(), { batchSize: 500 });
}

export async function listUsers(ctx: DbContext) {
  return withDb(
    ctx,
    (tx) => tx`
      SELECT u.user_id::INT, u.name, u.email::TEXT, r.role_code, u.is_active, u.failed_login_count, u.locked_until,
             u.last_login_at, u.created_at,
             (SELECT count(*) FROM collection c WHERE c.user_id = u.user_id)::INT AS collections,
             (SELECT count(*) FROM note n WHERE n.user_id = u.user_id)::INT AS notes
      FROM user_account u JOIN role r USING (role_id)
      ORDER BY r.rank DESC, u.created_at`,
  );
}

export async function updateUser(
  ctx: DbContext,
  userId: number,
  input: { role?: string; is_active?: boolean },
) {
  return withDb(ctx, async (tx) => {
    if (input.role) await tx`CALL sp_set_user_role(${userId}, ${input.role})`;
    if (input.is_active !== undefined) {
      const res = await tx`UPDATE user_account SET is_active = ${input.is_active} WHERE user_id = ${userId}`;
      if (res.count === 0) return null;
    }
    const [row] = await tx`
      SELECT u.user_id::INT, u.name, r.role_code, u.is_active FROM user_account u JOIN role r USING (role_id)
      WHERE u.user_id = ${userId}`;
    return row ?? null;
  });
}

export async function auditLog(ctx: DbContext, table: string | undefined, limit: number) {
  return withDb(
    ctx,
    (tx) => tx`
      SELECT a.audit_id::INT, a.occurred_at, a.table_name, a.operation, a.row_pk, a.old_row, a.new_row,
             a.actor_user_id::INT, u.name AS actor_name, a.db_role
      FROM audit_log a LEFT JOIN user_account u ON u.user_id = a.actor_user_id
      WHERE ${table ? tx`a.table_name = ${table}` : tx`TRUE`}
      ORDER BY a.occurred_at DESC, a.audit_id DESC LIMIT ${limit}`,
  );
}

export async function outboxHealth(ctx: DbContext) {
  return withDb(ctx, async (tx) => {
    const [summary] = await tx`
      SELECT count(*) FILTER (WHERE processed_at IS NULL)::INT AS pending,
             count(*) FILTER (WHERE processed_at IS NULL AND attempts > 0)::INT AS failing,
             count(*) FILTER (WHERE processed_at > now() - INTERVAL '1 day')::INT AS processed_24h,
             max(processed_at) AS last_processed_at
      FROM graph_outbox`;
    const recentErrors = await tx`
      SELECT outbox_id::INT, aggregate, operation, attempts, last_error, created_at
      FROM graph_outbox WHERE last_error IS NOT NULL ORDER BY outbox_id DESC LIMIT 10`;
    const byAggregate = await tx`
      SELECT aggregate, count(*)::INT AS rows FROM graph_outbox
      WHERE created_at > now() - INTERVAL '7 days' GROUP BY aggregate ORDER BY rows DESC`;
    return { ...summary, recent_errors: recentErrors, by_aggregate: byAggregate };
  });
}

export async function refreshAnalytics(ctx: DbContext) {
  return withDb(ctx, async (tx) => {
    const started = performance.now();
    await tx`CALL sp_refresh_analytics()`;
    return { took_ms: Math.round(performance.now() - started) };
  });
}

export async function slowQueries(ctx: DbContext) {
  return withDb(
    ctx,
    (tx) => tx`
      SELECT left(regexp_replace(query, '\\s+', ' ', 'g'), 220) AS query, calls::INT,
             round(mean_exec_time::NUMERIC, 2)::FLOAT AS mean_ms, round(total_exec_time::NUMERIC, 1)::FLOAT AS total_ms,
             rows::INT
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND query NOT ILIKE '%pg_stat_statements%'
      ORDER BY mean_exec_time DESC LIMIT 12`,
  );
}
