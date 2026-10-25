"use client";

import { BookmarkPlus, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { atLeast, type RoleCode } from "@/lib/roles";

type Collection = { collection_id: number; collection_name: string };

export function PaperActions({
  paperId,
  role,
  collections,
}: {
  paperId: number;
  role: RoleCode;
  collections: Collection[];
}) {
  const router = useRouter();
  const [collection, setCollection] = useState(collections[0]?.collection_id ?? 0);
  const [retractOpen, setRetractOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [retraction, setRetraction] = useState({ retraction_date: "", status: "RETRACTED", reason: "" });

  return (
    <div className="space-y-3">
      {collections.length > 0 ? (
        <div className="flex gap-2">
          <label htmlFor="collection-select" className="sr-only">
            Collection
          </label>
          <select
            id="collection-select"
            value={collection}
            onChange={(e) => setCollection(Number(e.target.value))}
            className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            {collections.map((c) => (
              <option key={c.collection_id} value={c.collection_id}>
                {c.collection_name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={async () => {
              try {
                await api(`/collections/${collection}/papers`, {
                  method: "POST",
                  body: { paper_id: paperId },
                });
                toast.success("Added to the collection");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not add the paper");
              }
            }}
          >
            <BookmarkPlus className="size-4" aria-hidden />
            Save
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/library" />}>
          Create a collection to save papers
        </Button>
      )}
      {atLeast(role, "CURATOR") ? (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          nativeButton={false}
          render={<Link href={`/curate?paper=${paperId}`} />}
        >
          <Pencil className="size-4" aria-hidden />
          Edit in Curate
        </Button>
      ) : null}
      {role === "ADMIN" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={() => setRetractOpen(true)}>
            <ShieldAlert className="size-4" aria-hidden />
            Retract
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" aria-hidden />
            Delete
          </Button>
        </div>
      ) : null}

      <Dialog open={retractOpen} onOpenChange={setRetractOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a retraction</DialogTitle>
            <DialogDescription>
              Calls sp_retract_paper. The date guard trigger rejects a date before publication; the audit and
              graph outbox triggers record the change.
            </DialogDescription>
          </DialogHeader>
          <form
            id="retract-form"
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(`/papers/${paperId}/retraction`, {
                  method: "POST",
                  body: { ...retraction, reason: retraction.reason || null },
                });
                toast.success("Retraction recorded");
                setRetractOpen(false);
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "The database refused the retraction");
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="r-date">Retraction date</Label>
              <Input
                id="r-date"
                type="date"
                required
                value={retraction.retraction_date}
                onChange={(e) => setRetraction({ ...retraction, retraction_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-status">Status</Label>
              <select
                id="r-status"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                value={retraction.status}
                onChange={(e) => setRetraction({ ...retraction, status: e.target.value })}
              >
                <option value="RETRACTED">Retracted</option>
                <option value="EXPRESSION_OF_CONCERN">Expression of concern</option>
                <option value="CORRECTED">Corrected</option>
                <option value="REINSTATED">Reinstated</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-reason">Reason</Label>
              <Textarea
                id="r-reason"
                value={retraction.reason}
                onChange={(e) => setRetraction({ ...retraction, reason: e.target.value })}
              />
            </div>
          </form>
          <DialogFooter>
            <Button type="submit" form="retract-form">
              Record retraction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this paper?</DialogTitle>
            <DialogDescription>
              Its authorships, citations, topic, method and dataset links, resources, retraction record, notes
              and collection entries are deleted with it (ON DELETE CASCADE). This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await api(`/papers/${paperId}`, { method: "DELETE" });
                  toast.success("Paper deleted");
                  router.push("/search");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Delete failed");
                }
              }}
            >
              Delete paper
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
