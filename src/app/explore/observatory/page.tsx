import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { BlockSkeleton, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { cachedObservatory } from "@/server/cached";

export const metadata: Metadata = { title: "Method × dataset observatory" };

async function Heatmap() {
  await connection();
  const { cells, unpaired } = await cachedObservatory();
  if (cells.length === 0)
    return <EmptyState title="No method and dataset links yet">Run pnpm ingest:methods.</EmptyState>;
  const methods = [...new Map(cells.map((c) => [c.method_id, c.method_name])).entries()];
  const datasets = [...new Map(cells.map((c) => [c.dataset_id, c.dataset_name])).entries()];
  const value = new Map(cells.map((c) => [`${c.method_id}:${c.dataset_id}`, c.papers]));
  const max = Math.max(1, ...cells.map((c) => c.papers));
  return (
    <div className="space-y-8">
      <div className="overflow-x-auto rounded-xl border">
        <table className="text-xs">
          <caption className="sr-only">Number of papers that use each method on each dataset</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-card px-3 py-2 text-left font-medium">
                Method \ dataset
              </th>
              {datasets.map(([id, name]) => (
                <th key={id} scope="col" className="h-36 px-1 align-bottom font-normal">
                  <span className="inline-block w-5 -rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">
                    {name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {methods.map(([mid, mname]) => (
              <tr key={mid}>
                <th
                  scope="row"
                  className="sticky left-0 whitespace-nowrap bg-card px-3 py-1 text-left font-normal"
                >
                  {mname}
                </th>
                {datasets.map(([did, dname]) => {
                  const n = value.get(`${mid}:${did}`) ?? 0;
                  return (
                    <td key={did} className="p-0.5">
                      <div
                        className="flex size-7 items-center justify-center rounded font-mono text-[10px]"
                        style={{
                          background: n
                            ? `color-mix(in oklch, var(--heat) ${Math.round(20 + (80 * n) / max)}%, var(--card))`
                            : "var(--muted)",
                        }}
                        title={`${mname} on ${dname}: ${n} papers`}
                      >
                        {n || ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unpaired.length ? (
        <div>
          <h2 className="text-xl">Methods seen without any linked dataset</h2>
          <p className="text-sm text-muted-foreground">The left side of the FULL OUTER JOIN in query Q03.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {unpaired.map((u) => (
              <Badge key={u.name} variant="secondary">
                {u.name} · {u.papers}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ObservatoryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Explore · Observatory"
        title="Which methods are tested on which datasets"
        description="Co-usage of methods and datasets on the same paper, from the Papers with Code archive and a curated alias dictionary."
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <Suspense fallback={<BlockSkeleton className="h-96" />}>
          <Heatmap />
        </Suspense>
      </div>
    </>
  );
}
