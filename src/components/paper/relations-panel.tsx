"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BlockSkeleton, EmptyState, ErrorState } from "@/components/common/states";
import { PaperPicker, type PickedPaper } from "@/components/paper/paper-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { label, relativeTime } from "@/lib/format";
import { atLeast, type RoleCode } from "@/lib/roles";

const TYPES = ["EXTENDS", "IMPROVES_UPON", "CONTRADICTS", "REPLICATES", "RELATED_TO"] as const;
type Relation = {
  relationId: string;
  type: (typeof TYPES)[number];
  fromPaperId: number;
  fromTitle: string;
  toPaperId: number;
  toTitle: string;
  note: string | null;
  confidence: number;
  createdBy: number;
  createdByName: string | null;
  updatedAt: string;
};

function RelationForm({
  initial,
  onSubmit,
  onCancel,
  withTarget,
}: {
  initial?: Partial<Relation>;
  onSubmit: (v: {
    type: Relation["type"];
    note: string;
    confidence: number;
    target?: PickedPaper;
  }) => Promise<void>;
  onCancel?: () => void;
  withTarget: boolean;
}) {
  const [type, setType] = useState<Relation["type"]>(initial?.type ?? "EXTENDS");
  const [note, setNote] = useState(initial?.note ?? "");
  const [confidence, setConfidence] = useState(initial?.confidence ?? 3);
  const [target, setTarget] = useState<PickedPaper | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (withTarget && !target) {
          toast.error("Choose the other paper first");
          return;
        }
        setBusy(true);
        try {
          await onSubmit({ type, note, confidence, target: target ?? undefined });
        } finally {
          setBusy(false);
        }
      }}
    >
      {withTarget ? <PaperPicker label="Other paper" value={target} onChange={setTarget} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rel-type">This paper…</Label>
          <select
            id="rel-type"
            value={type}
            onChange={(e) => setType(e.target.value as Relation["type"])}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t).toLowerCase()} the other
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rel-conf">Confidence: {confidence} of 5</Label>
          <input
            id="rel-conf"
            type="range"
            min={1}
            max={5}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rel-note">Note (optional)</Label>
        <Textarea
          id="rel-note"
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why do you say so?"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {initial ? "Save changes" : "Add relation"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function RelationsPanel({
  root,
  viewer,
}: {
  root: { paper_id: number };
  viewer: { userId: number; role: RoleCode } | null;
}) {
  const [items, setItems] = useState<Relation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: Relation[] }>(`/papers/${root.paper_id}/relations`)).items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load relations");
    }
  }, [root.paper_id]);
  useEffect(() => {
    load();
  }, [load]);

  const canModerate = viewer ? atLeast(viewer.role, "CURATOR") : false;

  if (error) return <ErrorState>{error}</ErrorState>;
  if (!items) return <BlockSkeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Relations researchers assert between papers. They live only in Neo4j; the creator or a curator can
        edit or delete them.
      </p>
      {items.length === 0 ? <EmptyState title="No curated relations yet" /> : null}
      <ul className="space-y-3">
        {items.map((r) => {
          const outgoing = r.fromPaperId === root.paper_id;
          const mine = viewer && (r.createdBy === viewer.userId || canModerate);
          return (
            <li key={r.relationId} className="rounded-xl border p-4" data-testid="relation">
              {editing === r.relationId ? (
                <RelationForm
                  initial={r}
                  withTarget={false}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (v) => {
                    try {
                      await api(`/relations/${r.relationId}`, {
                        method: "PATCH",
                        body: { type: v.type, note: v.note || null, confidence: v.confidence },
                      });
                      toast.success("Relation updated");
                      setEditing(null);
                      await load();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Update failed");
                    }
                  }}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1 text-sm">
                    <p>
                      {outgoing ? (
                        "This paper"
                      ) : (
                        <Link href={`/papers/${r.fromPaperId}`} className="underline">
                          {r.fromTitle}
                        </Link>
                      )}{" "}
                      <Badge variant="secondary">{label(r.type).toLowerCase()}</Badge>{" "}
                      {outgoing ? (
                        <Link href={`/papers/${r.toPaperId}`} className="underline">
                          {r.toTitle}
                        </Link>
                      ) : (
                        "this paper"
                      )}
                    </p>
                    {r.note ? <p className="mt-1 text-muted-foreground">{r.note}</p> : null}
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      confidence {r.confidence}/5 · by {r.createdByName ?? "a former member"} ·{" "}
                      {relativeTime(r.updatedAt)}
                    </p>
                  </div>
                  {mine ? (
                    <div className="flex gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Edit relation"
                        onClick={() => setEditing(r.relationId)}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete relation"
                        onClick={async () => {
                          try {
                            await api(`/relations/${r.relationId}`, { method: "DELETE" });
                            toast.success("Relation deleted");
                            await load();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Delete failed");
                          }
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {viewer ? (
        adding ? (
          <RelationForm
            withTarget
            onCancel={() => setAdding(false)}
            onSubmit={async (v) => {
              try {
                await api(`/papers/${root.paper_id}/relations`, {
                  method: "POST",
                  body: {
                    to_paper_id: v.target?.paper_id,
                    type: v.type,
                    note: v.note || null,
                    confidence: v.confidence,
                  },
                });
                toast.success("Relation added");
                setAdding(false);
                await load();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not add the relation");
              }
            }}
          />
        ) : (
          <Button variant="outline" onClick={() => setAdding(true)}>
            Relate this paper to another
          </Button>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to add a relation.
        </p>
      )}
    </div>
  );
}
