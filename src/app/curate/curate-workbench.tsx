"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BlockSkeleton, EmptyState } from "@/components/common/states";
import { PaperPicker, type PickedPaper } from "@/components/paper/paper-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { label, relativeTime } from "@/lib/format";

type Named = { id: number; name: string };
type Paper = {
  paper_id: number;
  title: string;
  abstract: string | null;
  doi: string | null;
  publication_date: string | null;
  work_type: string;
  open_access: boolean;
  oa_status: string | null;
  paper_url: string | null;
  methods: { method_id: number; method_name: string; usage_type: string }[];
  datasets: { dataset_id: number; dataset_name: string; usage_type: string }[];
};

const WORK_TYPES = ["ARTICLE", "PREPRINT", "PROCEEDINGS", "REVIEW", "BOOK_CHAPTER", "DATASET", "OTHER"];
const OA = ["", "DIAMOND", "GOLD", "GREEN", "HYBRID", "BRONZE", "CLOSED"];
const select = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30";

function ImportByDoi() {
  const [doi, setDoi] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    paper_id: number;
    title: string;
    created: boolean;
    embedded: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setResult(null);
        try {
          setResult(await api("/import/doi", { method: "POST", body: { doi } }));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Import failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="doi">DOI</Label>
        <Input
          id="doi"
          placeholder="10.48550/arXiv.1706.03762"
          value={doi}
          onChange={(e) => setDoi(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Importing…" : "Import from OpenAlex"}
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {result ? (
        <Alert data-testid="import-result">
          <AlertTitle>{result.created ? "Imported" : "Already in the atlas — refreshed"}</AlertTitle>
          <AlertDescription>
            <Link href={`/papers/${result.paper_id}`} className="underline">
              {result.title}
            </Link>
            <span className="block text-xs text-muted-foreground">
              sp_import_paper ran as your curator role; the outbox was drained into Neo4j
              {result.embedded ? " and the paper was embedded" : ""}.
            </span>
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

function EditPaper({ initial }: { initial: PickedPaper | null }) {
  const [picked, setPicked] = useState<PickedPaper | null>(initial);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [methods, setMethods] = useState<Named[]>([]);
  const [datasets, setDatasets] = useState<Named[]>([]);
  const [newMethod, setNewMethod] = useState({ id: 0, usage: "USED" });
  const [newDataset, setNewDataset] = useState({ id: 0, usage: "BENCHMARKING" });

  const load = useCallback(async (id: number) => {
    const p = await api<Paper>(`/papers/${id}`);
    setPaper(p);
    setForm({
      title: p.title,
      abstract: p.abstract ?? "",
      doi: p.doi ?? "",
      publication_date: p.publication_date ?? "",
      work_type: p.work_type,
      open_access: p.open_access,
      oa_status: p.oa_status ?? "",
      paper_url: p.paper_url ?? "",
    });
  }, []);

  useEffect(() => {
    if (picked) load(picked.paper_id).catch(() => toast.error("Could not load the paper"));
    else setPaper(null);
  }, [picked, load]);

  useEffect(() => {
    api<{ items: { method_id: number; method_name: string }[] }>("/methods").then((r) =>
      setMethods(r.items.map((m) => ({ id: m.method_id, name: m.method_name }))),
    );
    api<{ items: { dataset_id: number; dataset_name: string }[] }>("/datasets").then((r) =>
      setDatasets(r.items.map((d) => ({ id: d.dataset_id, name: d.dataset_name }))),
    );
  }, []);

  return (
    <div className="space-y-4">
      <PaperPicker label="Paper to edit" value={picked} onChange={setPicked} />
      {!picked ? (
        <EmptyState title="Choose a paper to edit" />
      ) : !paper ? (
        <BlockSkeleton className="h-64" />
      ) : (
        <>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                await api(`/papers/${paper.paper_id}`, {
                  method: "PATCH",
                  body: {
                    title: form.title,
                    abstract: form.abstract || null,
                    doi: form.doi || null,
                    publication_date: form.publication_date || null,
                    work_type: form.work_type,
                    open_access: form.open_access,
                    oa_status: form.oa_status || null,
                    paper_url: form.paper_url || null,
                  },
                });
                toast.success("Saved");
                await load(paper.paper_id);
              } catch (err) {
                // Database rules come back as plain-language problems naming the constraint.
                setError(err instanceof Error ? err.message : "Save failed");
              }
            }}
          >
            {error ? (
              <Alert variant="destructive" data-testid="save-error">
                <AlertTitle>The database refused this change</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="f-title">Title</Label>
              <Input
                id="f-title"
                value={String(form.title ?? "")}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-abstract">Abstract</Label>
              <Textarea
                id="f-abstract"
                rows={5}
                value={String(form.abstract ?? "")}
                onChange={(e) => setForm({ ...form, abstract: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="f-doi">DOI</Label>
                <Input
                  id="f-doi"
                  value={String(form.doi ?? "")}
                  onChange={(e) => setForm({ ...form, doi: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-date">Publication date</Label>
                <Input
                  id="f-date"
                  type="date"
                  value={String(form.publication_date ?? "")}
                  onChange={(e) => setForm({ ...form, publication_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-type">Work type</Label>
                <select
                  id="f-type"
                  className={select}
                  value={String(form.work_type)}
                  onChange={(e) => setForm({ ...form, work_type: e.target.value })}
                >
                  {WORK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {label(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-oa">Open-access status</Label>
                <select
                  id="f-oa"
                  className={select}
                  value={String(form.oa_status)}
                  onChange={(e) => setForm({ ...form, oa_status: e.target.value })}
                >
                  {OA.map((t) => (
                    <option key={t} value={t}>
                      {t ? label(t) : "Unknown"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="f-open"
                checked={Boolean(form.open_access)}
                onCheckedChange={(v) => setForm({ ...form, open_access: v })}
              />
              <Label htmlFor="f-open">Open access</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Try a rule: mark it open access with status Closed (chk_paper_oa_status_matches_flag), or reuse
              another paper's DOI (uq_paper_doi).
            </p>
            <Button type="submit">Save paper</Button>
          </form>

          <div className="grid gap-6 border-t pt-6 md:grid-cols-2">
            <div className="space-y-2">
              <h3 className="font-medium">Methods</h3>
              <ul className="space-y-1">
                {paper.methods.map((m) => (
                  <li key={m.method_id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {m.method_name} <Badge variant="outline">{label(m.usage_type)}</Badge>
                    </span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Unlink ${m.method_name}`}
                      onClick={async () => {
                        await api(`/papers/${paper.paper_id}/methods/${m.method_id}`, { method: "DELETE" });
                        await load(paper.paper_id);
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <label htmlFor="add-method" className="sr-only">
                  Method
                </label>
                <select
                  id="add-method"
                  className={select}
                  value={newMethod.id}
                  onChange={(e) => setNewMethod({ ...newMethod, id: Number(e.target.value) })}
                >
                  <option value={0}>Add a method…</option>
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <label htmlFor="method-usage" className="sr-only">
                  Usage
                </label>
                <select
                  id="method-usage"
                  className={`${select} w-32`}
                  value={newMethod.usage}
                  onChange={(e) => setNewMethod({ ...newMethod, usage: e.target.value })}
                >
                  {["PROPOSED", "USED", "COMPARED", "EXTENDED", "BASELINE", "OTHER"].map((u) => (
                    <option key={u} value={u}>
                      {label(u)}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!newMethod.id}
                  onClick={async () => {
                    await api(`/papers/${paper.paper_id}/methods`, {
                      method: "POST",
                      body: { method_id: newMethod.id, usage_type: newMethod.usage },
                    });
                    await load(paper.paper_id);
                  }}
                >
                  Link
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">Datasets</h3>
              <ul className="space-y-1">
                {paper.datasets.map((d) => (
                  <li key={d.dataset_id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {d.dataset_name} <Badge variant="outline">{label(d.usage_type)}</Badge>
                    </span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Unlink ${d.dataset_name}`}
                      onClick={async () => {
                        await api(`/papers/${paper.paper_id}/datasets/${d.dataset_id}`, { method: "DELETE" });
                        await load(paper.paper_id);
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <label htmlFor="add-dataset" className="sr-only">
                  Dataset
                </label>
                <select
                  id="add-dataset"
                  className={select}
                  value={newDataset.id}
                  onChange={(e) => setNewDataset({ ...newDataset, id: Number(e.target.value) })}
                >
                  <option value={0}>Add a dataset…</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <label htmlFor="dataset-usage" className="sr-only">
                  Usage
                </label>
                <select
                  id="dataset-usage"
                  className={`${select} w-36`}
                  value={newDataset.usage}
                  onChange={(e) => setNewDataset({ ...newDataset, usage: e.target.value })}
                >
                  {["TRAINING", "VALIDATION", "TESTING", "BENCHMARKING", "OTHER"].map((u) => (
                    <option key={u} value={u}>
                      {label(u)}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!newDataset.id}
                  onClick={async () => {
                    await api(`/papers/${paper.paper_id}/datasets`, {
                      method: "POST",
                      body: { dataset_id: newDataset.id, usage_type: newDataset.usage },
                    });
                    await load(paper.paper_id);
                  }}
                >
                  Link
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type Relation = {
  relationId: string;
  type: string;
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

function Moderation() {
  const [items, setItems] = useState<Relation[] | null>(null);
  const load = useCallback(async () => setItems((await api<{ items: Relation[] }>("/relations")).items), []);
  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);
  if (!items) return <BlockSkeleton className="h-40" />;
  if (items.length === 0) return <EmptyState title="No curated relations to review" />;
  return (
    <ul className="divide-y rounded-xl border">
      {items.map((r) => (
        <li key={r.relationId} className="flex items-start gap-3 px-4 py-3 text-sm">
          <div className="flex-1">
            <Link href={`/papers/${r.fromPaperId}`} className="hover:underline">
              {r.fromTitle}
            </Link>{" "}
            <Badge variant="secondary">{label(r.type).toLowerCase()}</Badge>{" "}
            <Link href={`/papers/${r.toPaperId}`} className="hover:underline">
              {r.toTitle}
            </Link>
            {r.note ? <p className="text-muted-foreground">{r.note}</p> : null}
            <p className="font-mono text-xs text-muted-foreground">
              by {r.createdByName ?? "a former member"} · confidence {r.confidence}/5 ·{" "}
              {relativeTime(r.updatedAt)}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await api(`/relations/${r.relationId}`, { method: "DELETE" });
              toast.success("Relation removed");
              await load();
            }}
          >
            Remove
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function CurateWorkbench({ initial }: { initial: PickedPaper | null }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 space-y-4">
        <h2 className="text-2xl">Edit a paper</h2>
        <EditPaper initial={initial} />
      </section>
      <aside className="space-y-10">
        <section className="space-y-4">
          <h2 className="text-2xl">Import by DOI</h2>
          <ImportByDoi />
        </section>
        <section className="space-y-4">
          <h2 className="text-2xl">Moderate relations</h2>
          <Moderation />
        </section>
      </aside>
    </div>
  );
}
