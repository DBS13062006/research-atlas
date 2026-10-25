import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton } from "@/components/common/states";
import { type TopicBranch, TopicTree } from "@/components/topics/topic-tree";
import { cachedTopicTree } from "@/server/cached";
import type { TopicNode } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Topics" };

async function Tree() {
  await connection();
  const nodes = await cachedTopicTree();
  const byParent = new Map<number | null, TopicNode[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parent_topic_id) ?? [];
    list.push(n);
    byParent.set(n.parent_topic_id, list);
  }
  const build = (n: TopicNode): TopicBranch => ({
    id: n.topic_id,
    name: n.topic_name,
    level: n.topic_level,
    papers: n.papers,
    children: (byParent.get(n.topic_id) ?? []).filter((c) => c.papers > 0).map(build),
  });
  return <TopicTree roots={(byParent.get(null) ?? []).filter((r) => r.papers > 0).map(build)} />;
}

export default function TopicsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Topics"
        title="Domain → field → subfield → topic"
        description="OpenAlex's four-level hierarchy, stored as a self-referencing table. Counts include every topic below a node (recursive CTE)."
      />
      <div className="mx-auto max-w-7xl px-4 py-8 *:max-w-4xl">
        <Suspense fallback={<ListSkeleton rows={8} />}>
          <Tree />
        </Suspense>
      </div>
    </>
  );
}
