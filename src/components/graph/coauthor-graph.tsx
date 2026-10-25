"use client";

import dynamic from "next/dynamic";
import { BlockSkeleton } from "../states";

const ForceGraph = dynamic(() => import("./force-graph").then((m) => m.ForceGraph), {
  ssr: false,
  loading: () => <BlockSkeleton className="h-[420px]" />,
});

export function CoauthorGraph({
  center,
  coauthors,
}: {
  center: { id: number; name: string };
  coauthors: { author_id: number; name: string; papers: number }[];
}) {
  return (
    <ForceGraph
      height={420}
      ariaLabel={`Co-author network of ${center.name}`}
      nodes={[
        { id: String(center.id), label: center.name, color: "var(--brass)", size: 12 },
        ...coauthors.map((c) => ({
          id: String(c.author_id),
          label: c.name,
          color: "var(--chart-2)",
          size: 4 + Math.min(8, c.papers * 1.5),
          href: `/authors/${c.author_id}`,
          title: `${c.name}: ${c.papers} shared papers`,
        })),
      ]}
      edges={coauthors.map((c) => ({
        source: String(center.id),
        target: String(c.author_id),
        label: `${c.papers} shared papers`,
      }))}
    />
  );
}
