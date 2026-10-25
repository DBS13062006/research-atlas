"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TopicBranch = {
  id: number;
  name: string;
  level: number;
  papers: number;
  children: TopicBranch[];
};

// A disclosure tree: each row is a toggle button beside the topic's link, so no interactive
// element is nested inside another (a <summary> containing a link would be).
function Branch({ node }: { node: TopicBranch }) {
  const [open, setOpen] = useState(node.level === 0);
  const listId = `topic-children-${node.id}`;
  return (
    <li>
      <div className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted">
        {node.children.length ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`${open ? "Hide" : "Show"} subtopics of ${node.name}`}
            onClick={() => setOpen(!open)}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <Link href={`/topics/${node.id}`} className="flex-1 py-1 hover:underline">
          {node.name}
        </Link>
        <span className="px-1 font-mono text-xs text-muted-foreground">{formatNumber(node.papers)}</span>
      </div>
      {node.children.length && open ? (
        <ul id={listId} className="ml-4 border-l pl-2">
          {node.children.map((c) => (
            <Branch key={c.id} node={c} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function TopicTree({ roots }: { roots: TopicBranch[] }) {
  return (
    <ul className="space-y-1" aria-label="Topic tree">
      {roots.map((r) => (
        <Branch key={r.id} node={r} />
      ))}
    </ul>
  );
}
