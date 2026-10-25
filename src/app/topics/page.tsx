import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ListSkeleton } from "@/components/states";
import { formatNumber } from "@/lib/format";
import { cachedTopicTree } from "@/server/cached";
import type { TopicNode } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Topics" };

function Branch({ node, byParent }: { node: TopicNode; byParent: Map<number | null, TopicNode[]> }) {
  const children = (byParent.get(node.topic_id) ?? []).filter((c) => c.papers > 0);
  return (
    <li>
      <details open={node.topic_level === 0} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted [&::-webkit-details-marker]:hidden">
          {children.length ? (
            <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
          ) : (
            <span className="size-4" />
          )}
          <Link href={`/topics/${node.topic_id}`} className="flex-1 hover:underline">
            {node.topic_name}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">{formatNumber(node.papers)}</span>
        </summary>
        {children.length ? (
          <ul className="ml-4 border-l pl-2">
            {children.map((c) => (
              <Branch key={c.topic_id} node={c} byParent={byParent} />
            ))}
          </ul>
        ) : null}
      </details>
    </li>
  );
}

async function Tree() {
  await connection();
  const nodes = await cachedTopicTree();
  const byParent = new Map<number | null, TopicNode[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parent_topic_id) ?? [];
    list.push(n);
    byParent.set(n.parent_topic_id, list);
  }
  const roots = (byParent.get(null) ?? []).filter((r) => r.papers > 0);
  return (
    <ul className="space-y-1" aria-label="Topic tree">
      {roots.map((r) => (
        <Branch key={r.topic_id} node={r} byParent={byParent} />
      ))}
    </ul>
  );
}

export default function TopicsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Topics"
        title="Domain → field → subfield → topic"
        description="OpenAlex's four-level hierarchy, stored as a self-referencing table. Counts include every topic below a node (recursive CTE)."
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <Suspense fallback={<ListSkeleton rows={8} />}>
          <Tree />
        </Suspense>
      </div>
    </>
  );
}
