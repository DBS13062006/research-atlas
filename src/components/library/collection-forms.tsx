"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/components/paper/api";
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

export function NewCollectionButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", is_public: false });
  return (
    <>
      <Button onClick={() => setOpen(true)}>New collection</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>Collections are private unless you make them public.</DialogDescription>
          </DialogHeader>
          <form
            id="new-collection"
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const { collection_id } = await api<{ collection_id: number }>("/collections", {
                  method: "POST",
                  body: { name: form.name, description: form.description || null, is_public: form.is_public },
                });
                setOpen(false);
                router.push(`/library/${collection_id}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create the collection");
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Name</Label>
              <Input
                id="c-name"
                required
                maxLength={150}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-desc">Description</Label>
              <Textarea
                id="c-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="c-public"
                checked={form.is_public}
                onCheckedChange={(v) => setForm({ ...form, is_public: v })}
              />
              <Label htmlFor="c-public">Public</Label>
            </div>
          </form>
          <DialogFooter>
            <Button type="submit" form="new-collection">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CollectionSettings({
  id,
  name,
  description,
  isPublic,
}: {
  id: number;
  name: string;
  description: string | null;
  isPublic: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name, description: description ?? "", is_public: isPublic });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Settings
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collection settings</DialogTitle>
            <DialogDescription>Rename, describe, publish — or delete the collection.</DialogDescription>
          </DialogHeader>
          <form
            id="edit-collection"
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(`/collections/${id}`, {
                  method: "PATCH",
                  body: { name: form.name, description: form.description || null, is_public: form.is_public },
                });
                setOpen(false);
                toast.success("Saved");
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not save");
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="e-name">Name</Label>
              <Input
                id="e-name"
                required
                maxLength={150}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-desc">Description</Label>
              <Textarea
                id="e-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="e-public"
                checked={form.is_public}
                onCheckedChange={(v) => setForm({ ...form, is_public: v })}
              />
              <Label htmlFor="e-public">Public</Label>
            </div>
          </form>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="destructive"
              onClick={async () => {
                await api(`/collections/${id}`, { method: "DELETE" });
                toast.success("Collection deleted");
                router.push("/library");
              }}
            >
              Delete collection
            </Button>
            <Button type="submit" form="edit-collection">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
