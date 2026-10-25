"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { AtlasPoint } from "@/server/services/graph-views";

const AtlasCanvas = dynamic(() => import("@/components/atlas/atlas-canvas").then((m) => m.AtlasCanvas), {
  ssr: false,
  loading: () => <div className="h-[380px] animate-pulse rounded-xl border bg-muted/40" />,
});

// `packed` holds five integers per paper (see cachedAtlasPreview); the preview is not interactive,
// so titles and years are left out.
export function MiniAtlas({ packed }: { packed: number[] }) {
  const points = useMemo(() => {
    const out: AtlasPoint[] = [];
    for (let i = 0; i < packed.length; i += 5) {
      out.push({
        id: i / 5,
        x: packed[i] / 1000,
        y: packed[i + 1] / 1000,
        c: packed[i + 2],
        w: packed[i + 3],
        r: packed[i + 4] === 1,
        y_: null,
        t: "",
      });
    }
    return out;
  }, [packed]);
  return (
    <AtlasCanvas
      points={points}
      height={380}
      interactive={false}
      ariaLabel={`A live map of ${points.length} papers`}
    />
  );
}
