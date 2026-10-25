"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/components/paper/api";
import { PaperPicker, type PickedPaper } from "@/components/paper/paper-picker";
import { BlockSkeleton, EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const ForceGraph = dynamic(() => import("@/components/graph/force-graph").then((m) => m.ForceGraph), {
  ssr: false,
  loading: () => <BlockSkeleton className="h-[380px]" />,
});

export function NewTrailButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    visibility: "PRIVATE" as "PUBLIC" | "PRIVATE",
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>New trail</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New reading trail</DialogTitle>
            <DialogDescription>
              A route through papers, stored as (:Trail)-[:STEP]-&gt;(:Paper) in Neo4j.
            </DialogDescription>
          </DialogHeader>
          <form
            id="new-trail"
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const { trail_id } = await api<{ trail_id: string }>("/trails", {
                  method: "POST",
                  body: { ...form, description: form.description || null },
                });
                router.push(`/trails/${trail_id}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create the trail");
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="t-title">Title</Label>
              <Input
                id="t-title"
                required
                maxLength={150}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-desc">Description</Label>
              <Textarea
                id="t-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="t-public"
                checked={form.visibility === "PUBLIC"}
                onCheckedChange={(v) => setForm({ ...form, visibility: v ? "PUBLIC" : "PRIVATE" })}
              />
              <Label htmlFor="t-public">Public</Label>
            </div>
          </form>
          <DialogFooter>
            <Button type="submit" form="new-trail">
              Create trail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Step = {
  position: number;
  paperId: number;
  title: string;
  year: number | null;
  annotation: string | null;
};

export function TrailEditor({
  trail,
  editable,
  cites,
}: {
  trail: {
    trailId: string;
    title: string;
    description: string | null;
    visibility: "PUBLIC" | "PRIVATE";
    stepsList: Step[];
  };
  editable: boolean;
  cites: { citing: number; cited: number }[];
}) {
  const router = useRouter();
  const [steps, setSteps] = useState(trail.stepsList);
  const [adding, setAdding] = useState<PickedPaper | null>(null);
  const [note, setNote] = useState("");
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [meta, setMeta] = useState({
    title: trail.title,
    description: trail.description ?? "",
    visibility: trail.visibility,
  });
  const [metaOpen, setMetaOpen] = useState(false);
  const base = `/trails/${trail.trailId}`;

  async function refresh() {
    const t = await api<{ stepsList: Step[] }>(base);
    setSteps(t.stepsList);
  }

  async function swap(i: number, j: number) {
    const order = steps.map((s) => s.position);
    [order[i], order[j]] = [order[j], order[i]];
    try {
      await api(`${base}/steps`, { method: "PUT", body: { order } });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reorder");
    }
  }

  const ids = new Set(steps.map((s) => s.paperId));
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        {steps.length === 0 ? (
          <EmptyState title="This trail has no stops yet">
            {editable ? "Add the first paper on the right." : null}
          </EmptyState>
        ) : (
          <ol className="relative space-y-3 border-l-2 border-primary/40 pl-6" aria-label="Trail stops">
            {steps.map((s, i) => (
              <li
                key={`${s.position}-${s.paperId}`}
                className="relative rounded-xl border bg-card p-4"
                data-testid="trail-step"
              >
                <span className="absolute -left-[37px] top-4 flex size-6 items-center justify-center rounded-full border-2 border-primary bg-background font-mono text-xs">
                  {s.position}
                </span>
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/papers/${s.paperId}`} className="font-medium hover:underline">
                      {s.title}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{s.year}</span>
                    {editingStep === s.position ? (
                      <form
                        className="mt-2 space-y-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await api(`${base}/steps/${s.position}`, {
                            method: "PATCH",
                            body: { annotation: annotation || null },
                          });
                          setEditingStep(null);
                          await refresh();
                        }}
                      >
                        <Label htmlFor={`ann-${s.position}`} className="sr-only">
                          Annotation
                        </Label>
                        <Textarea
                          id={`ann-${s.position}`}
                          value={annotation}
                          onChange={(e) => setAnnotation(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" type="submit">
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            onClick={() => setEditingStep(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : s.annotation ? (
                      <p className="mt-1 text-sm text-muted-foreground">{s.annotation}</p>
                    ) : null}
                  </div>
                  {editable ? (
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Move stop ${s.position} up`}
                        disabled={i === 0}
                        onClick={() => swap(i, i - 1)}
                      >
                        <ArrowUp className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Move stop ${s.position} down`}
                        disabled={i === steps.length - 1}
                        onClick={() => swap(i, i + 1)}
                      >
                        <ArrowDown className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Annotate stop ${s.position}`}
                        onClick={() => {
                          setEditingStep(s.position);
                          setAnnotation(s.annotation ?? "");
                        }}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove stop ${s.position}`}
                        onClick={async () => {
                          await api(`${base}/steps/${s.position}`, { method: "DELETE" });
                          toast.success("Stop removed; later stops moved up");
                          await refresh();
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <aside className="space-y-6">
        {steps.length > 1 ? (
          <div className="space-y-2">
            <h2 className="text-lg">The route on the citation graph</h2>
            <ForceGraph
              height={380}
              ariaLabel={`Route of the trail ${trail.title}`}
              nodes={steps.map((s, i) => ({
                id: String(s.paperId),
                label: `${s.position}. ${s.title}`,
                color: i === 0 ? "var(--brass)" : "var(--chart-2)",
                size: 9,
                href: `/papers/${s.paperId}`,
              }))}
              edges={[
                ...steps.slice(1).map((s, i) => ({
                  source: String(steps[i].paperId),
                  target: String(s.paperId),
                  color: "var(--brass)",
                  directed: true,
                  label: "next stop",
                })),
                ...cites
                  .filter((c) => ids.has(c.citing) && ids.has(c.cited))
                  .map((c) => ({
                    source: String(c.citing),
                    target: String(c.cited),
                    dashed: true,
                    directed: true,
                    label: "cites",
                  })),
              ]}
            />
            <p className="text-xs text-muted-foreground">
              Gold arrows follow the trail; dashed arrows are citations between its stops.
            </p>
          </div>
        ) : null}
        {editable ? (
          <>
            <form
              className="space-y-3 rounded-xl border p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!adding) return;
                try {
                  await api(`${base}/steps`, {
                    method: "POST",
                    body: { paper_id: adding.paper_id, annotation: note || null },
                  });
                  setAdding(null);
                  setNote("");
                  await refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not add the stop");
                }
              }}
            >
              <h2 className="text-lg">Add a stop</h2>
              <PaperPicker label="Paper" value={adding} onChange={setAdding} />
              <div className="space-y-1.5">
                <Label htmlFor="step-note">Annotation (optional)</Label>
                <Textarea id="step-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <Button type="submit" disabled={!adding}>
                Add to the end
              </Button>
            </form>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMetaOpen(true)}>
                Edit trail
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await api(base, { method: "DELETE" });
                  toast.success("Trail deleted");
                  router.push("/trails");
                }}
              >
                Delete trail
              </Button>
            </div>
            <Dialog open={metaOpen} onOpenChange={setMetaOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit trail</DialogTitle>
                  <DialogDescription>Rename it or change who can see it.</DialogDescription>
                </DialogHeader>
                <form
                  id="edit-trail"
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await api(base, {
                      method: "PATCH",
                      body: {
                        title: meta.title,
                        description: meta.description || null,
                        visibility: meta.visibility,
                      },
                    });
                    setMetaOpen(false);
                    router.refresh();
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="m-title">Title</Label>
                    <Input
                      id="m-title"
                      value={meta.title}
                      onChange={(e) => setMeta({ ...meta, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-desc">Description</Label>
                    <Textarea
                      id="m-desc"
                      value={meta.description}
                      onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="m-public"
                      checked={meta.visibility === "PUBLIC"}
                      onCheckedChange={(v) => setMeta({ ...meta, visibility: v ? "PUBLIC" : "PRIVATE" })}
                    />
                    <Label htmlFor="m-public">Public</Label>
                  </div>
                </form>
                <DialogFooter>
                  <Button type="submit" form="edit-trail">
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : null}
      </aside>
    </div>
  );
}
