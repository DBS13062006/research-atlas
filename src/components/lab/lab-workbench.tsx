"use client";

import { CheckCircle2, FlaskConical, Gauge, Play, Search, TriangleAlert } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/components/paper/api";
import { EmptyState } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { LabRun } from "@/server/services/lab";
import { PlanTree } from "./plan-tree";
import { ResultGrid } from "./result-grid";

export type LabItem = {
  id: string;
  title: string;
  category: string;
  concepts: string;
  role: string;
  group: string;
  writes: boolean;
  expect?: string;
  language: "sql" | "cypher";
  file: string;
  params: { name: string; type: string; defaultSql: string }[];
  html: string;
};

const ROLE_NAMES: Record<string, string> = {
  ra_anon: "anyone",
  ra_researcher: "researcher",
  ra_curator: "curator",
  ra_admin: "administrator",
};

function SideEffects({ run }: { run: LabRun }) {
  if (run.sideEffects.length === 0) return null;
  return (
    <section aria-labelledby="side-effects" className="space-y-2">
      <h3 id="side-effects" className="text-sm font-medium">
        Rows the triggers wrote in this transaction
      </h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted">
            <tr>
              <th scope="col" className="px-2.5 py-1.5 font-medium">
                Table
              </th>
              <th scope="col" className="px-2.5 py-1.5 font-medium">
                Row
              </th>
              <th scope="col" className="px-2.5 py-1.5 font-medium">
                About
              </th>
              <th scope="col" className="px-2.5 py-1.5 font-medium">
                Op
              </th>
              <th scope="col" className="px-2.5 py-1.5 font-medium">
                Detail
              </th>
            </tr>
          </thead>
          <tbody className="divide-y font-mono">
            {run.sideEffects.map((s) => (
              <tr key={`${s.source}-${s.row_id}`} className="align-top">
                <td className="px-2.5 py-1">{s.source}</td>
                <td className="px-2.5 py-1">#{s.row_id}</td>
                <td className="px-2.5 py-1">{s.target}</td>
                <td className="px-2.5 py-1">{s.operation}</td>
                <td className="max-w-[28rem] px-2.5 py-1">
                  <span className="line-clamp-4 break-all">{JSON.stringify(s.detail)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Outcome({ run, item }: { run: LabRun; item: LabItem }) {
  const e = run.error;
  return (
    <div className="space-y-5" data-testid="lab-outcome">
      <p className="font-mono text-xs text-muted-foreground">
        ran as {run.runAs} · {run.ms} ms ·{" "}
        {run.committed ? <span className="font-semibold text-destructive">committed</span> : "rolled back"}
        {run.params.length ? ` · ${run.params.map((p) => `${p.name} = ${String(p.value)}`).join(", ")}` : ""}
      </p>
      {e?.expected ? (
        <Alert data-testid="lab-proof">
          <CheckCircle2 aria-hidden />
          <AlertTitle>Refused by {e.constraint ?? `SQLSTATE ${e.code}`}, as the proof expects</AlertTitle>
          <AlertDescription>
            <p>{e.message}</p>
            {e.detail ? <p className="text-xs">{e.detail}</p> : null}
          </AlertDescription>
        </Alert>
      ) : e ? (
        <Alert variant="destructive" data-testid="lab-error">
          <TriangleAlert aria-hidden />
          <AlertTitle>
            {e.code === "42501" ? "PostgreSQL refused this for your role" : "The database returned an error"}
            {e.code ? ` (SQLSTATE ${e.code})` : ""}
          </AlertTitle>
          <AlertDescription>
            <p>{e.message}</p>
            {e.constraint ? <p className="font-mono text-xs">constraint: {e.constraint}</p> : null}
            {e.detail ? <p className="text-xs">{e.detail}</p> : null}
            {e.hint ? <p className="text-xs">Hint: {e.hint}</p> : null}
            {item.expect ? (
              <p className="text-xs">This proof expected {item.expect}; see the error above.</p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {run.notices.length ? (
        <ul className="space-y-1 rounded-lg border border-dashed p-3 font-mono text-xs" aria-label="Notices">
          {run.notices.map((n) => (
            <li key={n}>NOTICE: {n}</li>
          ))}
        </ul>
      ) : null}
      {run.counters ? (
        <p className="font-mono text-xs">
          graph changes (rolled back):{" "}
          {Object.entries(run.counters)
            .map(([k, v]) => `${k} ${v}`)
            .join(", ")}
        </p>
      ) : null}
      {run.results.map((r) => (
        <ResultGrid key={r.statement} result={r} />
      ))}
      <SideEffects run={run} />
      {run.plan ? (
        <section aria-labelledby="plan-heading" className="space-y-2">
          <h3 id="plan-heading" className="text-sm font-medium">
            {run.language === "sql" ? "EXPLAIN (ANALYZE, BUFFERS)" : "PROFILE"}
          </h3>
          <PlanTree plan={run.plan} timing={run.planTiming} raw={run.rawPlan} />
        </section>
      ) : null}
    </div>
  );
}

function Runner({ item, isAdmin }: { item: LabItem; isAdmin: boolean }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [run, setRun] = useState<LabRun | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commit, setCommit] = useState(false);

  async function go(mode: "run" | "explain" | "profile") {
    setBusy(mode);
    setError(null);
    try {
      const params = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""));
      const result =
        item.language === "sql"
          ? await api<LabRun>("/lab/run", {
              method: "POST",
              body: { id: item.id, params, mode, commit: commit && mode === "run" },
            })
          : await api<LabRun>("/lab/cypher", { method: "POST", body: { id: item.id, params, mode } });
      setRun(result);
    } catch (err) {
      setRun(null);
      setError(err instanceof Error ? err.message : "The run failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {item.params.length ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Parameters</legend>
          {item.params.map((p) => (
            <div key={p.name} className="space-y-1">
              <Label htmlFor={`param-${p.name}`}>
                {p.name} <span className="font-mono text-xs text-muted-foreground">{p.type}</span>
              </Label>
              <Input
                id={`param-${p.name}`}
                value={values[p.name] ?? ""}
                placeholder="computed from the data"
                inputMode={["bigint", "int", "float"].includes(p.type) ? "numeric" : undefined}
                onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
              />
            </div>
          ))}
        </fieldset>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => go("run")} disabled={busy !== null} data-testid="lab-run">
          <Play aria-hidden />
          {busy === "run" ? "Running…" : "Run"}
        </Button>
        <Button
          variant="outline"
          onClick={() => go(item.language === "sql" ? "explain" : "profile")}
          disabled={busy !== null}
          data-testid="lab-plan"
        >
          <Gauge aria-hidden />
          {busy && busy !== "run" ? "Analysing…" : item.language === "sql" ? "Explain analyze" : "Profile"}
        </Button>
        {isAdmin && item.language === "sql" && item.writes ? (
          <div className="ml-auto flex items-center gap-2">
            <Switch id="commit" checked={commit} onCheckedChange={setCommit} />
            <Label htmlFor="commit" className={cn(commit && "text-destructive")}>
              Commit for real
            </Label>
          </div>
        ) : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {run ? <Outcome run={run} item={item} /> : null}
    </div>
  );
}

export function LabWorkbench({
  items,
  groups,
  isAdmin,
  role,
}: {
  items: LabItem[];
  groups: { key: string; label: string }[];
  isAdmin: boolean;
  role: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState("");
  const selectedId = params.get("q") ?? items[0]?.id;
  const item = items.find((i) => i.id === selectedId) ?? items[0];

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return items;
    return items.filter((i) => `${i.id} ${i.title} ${i.concepts}`.toLowerCase().includes(f));
  }, [items, filter]);

  return (
    <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
      <nav
        aria-label="Catalog"
        className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
      >
        <div className="relative mb-4">
          <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <label htmlFor="lab-filter" className="sr-only">
            Filter the catalog
          </label>
          <Input
            id="lab-filter"
            className="pl-8"
            placeholder="Filter: recursive, MERGE, Q15…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {groups.map((g) => {
          const list = visible.filter((i) => i.group === g.key);
          if (list.length === 0) return null;
          return (
            <div key={g.key} className="mb-5">
              <h2 className="mb-1.5 font-sans text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {g.label}
              </h2>
              <ul className="space-y-0.5">
                {list.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => router.replace(`${pathname}?q=${i.id}`, { scroll: false })}
                      aria-current={i.id === item?.id ? "page" : undefined}
                      className={cn(
                        "flex w-full gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted",
                        i.id === item?.id && "bg-muted font-medium",
                      )}
                    >
                      <span className="w-8 shrink-0 font-mono text-xs leading-5 text-muted-foreground">
                        {i.id}
                      </span>
                      <span>{i.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {visible.length === 0 ? <p className="text-sm text-muted-foreground">Nothing matches.</p> : null}
      </nav>

      {item ? (
        <article className="min-w-0 space-y-6" aria-labelledby="lab-title">
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {item.id}
              </Badge>
              <Badge variant="secondary">{item.category}</Badge>
              {item.expect ? <Badge>expects {item.expect}</Badge> : null}
              <span className="text-xs text-muted-foreground">
                written for: {ROLE_NAMES[item.role] ?? item.role} · runs as you ({role})
              </span>
            </div>
            <h2 id="lab-title" className="text-3xl">
              {item.title}
            </h2>
            {item.concepts ? <p className="text-sm text-muted-foreground">{item.concepts}</p> : null}
          </header>
          <div className="code-block overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-1.5">
              <span className="font-mono text-xs text-muted-foreground">{item.file}</span>
              <FlaskConical className="size-3.5 text-muted-foreground" aria-hidden />
            </div>
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output of our own catalog files, rendered on the server */}
            <div dangerouslySetInnerHTML={{ __html: item.html }} />
          </div>
          <Runner key={item.id} item={item} isAdmin={isAdmin} />
        </article>
      ) : (
        <EmptyState title="The catalog is empty" />
      )}
    </div>
  );
}
