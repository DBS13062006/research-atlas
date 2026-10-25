"use client";

import dynamic from "next/dynamic";
import type { AtlasPoint } from "@/server/services/graph-views";

const AtlasCanvas = dynamic(() => import("./atlas-canvas").then((m) => m.AtlasCanvas), {
  ssr: false,
  loading: () => <div className="h-[380px] animate-pulse rounded-xl border bg-muted/40" />,
});

export function MiniAtlas({ points }: { points: AtlasPoint[] }) {
  return (
    <AtlasCanvas
      points={points}
      height={380}
      interactive={false}
      ariaLabel={`A live map of ${points.length} papers`}
    />
  );
}
