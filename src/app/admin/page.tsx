import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Section } from "@/components/page-header";
import { AccessDenied, BlockSkeleton, SignInPrompt } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { formatNumber, relativeTime } from "@/lib/format";
import { dbContext, getCurrentUser } from "@/server/auth/dal";
import { auditLog, listUsers, outboxHealth, slowQueries } from "@/server/services/admin";
import { ActionButton, ActiveToggle, RoleSelect } from "./admin-controls";

export const metadata: Metadata = { title: "Admin" };

type UserRow = {
  user_id: number;
  name: string;
  email: string;
  role_code: string;
  is_active: boolean;
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  collections: number;
  notes: number;
};
type AuditRow = {
  audit_id: number;
  occurred_at: Date;
  table_name: string;
  operation: string;
  row_pk: Record<string, unknown>;
  actor_name: string | null;
  db_role: string;
  new_row: Record<string, unknown> | null;
};

async function Admin() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt next="/admin" what="the admin console" />;
  if (user.role !== "ADMIN") return <AccessDenied need="administrator" />;
  const ctx = dbContext(user);
  const [users, audit, outbox, slow] = (await Promise.all([
    listUsers(ctx),
    auditLog(ctx, undefined, 30),
    outboxHealth(ctx),
    slowQueries(ctx),
  ])) as unknown as [
    UserRow[],
    AuditRow[],
    {
      pending: number;
      failing: number;
      processed_24h: number;
      last_processed_at: Date | null;
      recent_errors: { outbox_id: number; aggregate: string; last_error: string }[];
      by_aggregate: { aggregate: string; rows: number }[];
    },
    { query: string; calls: number; mean_ms: number; total_ms: number }[],
  ];
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Run the atlas"
        description="Users and roles, the audit trail, the graph outbox and query performance. Everything here is read as the ra_admin database role."
      />
      <div className="mx-auto max-w-7xl space-y-12 px-4 py-8">
        <Section
          title="Users and roles"
          description="Role changes go through sp_set_user_role; the database refuses to remove the last administrator."
        >
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    User
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Active
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Last sign-in
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Collections · notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.user_id}>
                    <td className="px-4 py-2">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.email}
                        {u.locked_until && new Date(u.locked_until) > new Date() ? (
                          <Badge variant="destructive" className="ml-2">
                            locked
                          </Badge>
                        ) : null}
                      </p>
                    </td>
                    <td className="px-4 py-2">
                      <RoleSelect userId={u.user_id} role={u.role_code} name={u.name} />
                    </td>
                    <td className="px-4 py-2">
                      <ActiveToggle userId={u.user_id} active={u.is_active} name={u.name} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {u.last_login_at ? relativeTime(u.last_login_at) : "never"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {u.collections} · {u.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <div className="grid gap-8 lg:grid-cols-2">
          <Section
            title="Graph outbox"
            description="Changes waiting to reach Neo4j. Triggers write them; graph:sync drains them."
          >
            <dl className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border p-3">
                <dt className="text-xs text-muted-foreground">Pending</dt>
                <dd className="font-mono text-2xl" data-testid="outbox-pending">
                  {formatNumber(outbox.pending)}
                </dd>
              </div>
              <div className="rounded-xl border p-3">
                <dt className="text-xs text-muted-foreground">Failing</dt>
                <dd className="font-mono text-2xl">{formatNumber(outbox.failing)}</dd>
              </div>
              <div className="rounded-xl border p-3">
                <dt className="text-xs text-muted-foreground">Synced (24 h)</dt>
                <dd className="font-mono text-2xl">{formatNumber(outbox.processed_24h)}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <ActionButton path="/admin/graph-sync" label="Sync graph now" done="Graph synced" />
              <ActionButton
                path="/admin/analytics/refresh"
                label="Refresh analytics"
                done="Materialized views refreshed"
              />
            </div>
            {outbox.recent_errors.length ? (
              <ul className="space-y-1 text-xs text-destructive">
                {outbox.recent_errors.map((e) => (
                  <li key={e.outbox_id}>
                    #{e.outbox_id} {e.aggregate}: {e.last_error}
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
          <Section title="Slowest queries" description="Mean execution time from pg_stat_statements.">
            <ol className="space-y-2">
              {slow.slice(0, 8).map((q, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: ranked list
                <li key={i} className="rounded-lg border p-2">
                  <p className="font-mono text-xs text-muted-foreground">
                    {q.mean_ms} ms mean · {formatNumber(q.calls)} calls
                  </p>
                  <code className="line-clamp-2 block font-mono text-[11px]">{q.query}</code>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <Section
          title="Audit trail"
          description="Written by trg_audit on papers, retractions, accounts, role grants and collections. Password hashes are never recorded."
        >
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    When
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Table
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Op
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Row
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {audit.map((a) => (
                  <tr key={`${a.audit_id}`}>
                    <td className="px-4 py-2 font-mono text-xs">{relativeTime(a.occurred_at)}</td>
                    <td className="px-4 py-2">{a.table_name}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          a.operation === "D" ? "destructive" : a.operation === "I" ? "secondary" : "outline"
                        }
                      >
                        {a.operation}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {a.table_name === "paper" && a.row_pk.paper_id ? (
                        <Link href={`/papers/${a.row_pk.paper_id}`} className="underline">
                          {JSON.stringify(a.row_pk)}
                        </Link>
                      ) : (
                        JSON.stringify(a.row_pk)
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {a.actor_name ?? "system"}{" "}
                      <span className="font-mono text-muted-foreground">({a.db_role})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-8">
          <BlockSkeleton className="h-96" />
        </div>
      }
    >
      <Admin />
    </Suspense>
  );
}
