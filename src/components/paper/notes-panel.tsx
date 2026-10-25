"use client";

import { Lock, Pencil, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/format";
import type { RoleCode } from "@/lib/roles";
import { BlockSkeleton, EmptyState } from "../states";
import { api } from "./api";

type Note = { note_id: number; note_text: string; is_private: boolean; updated_at: string; is_mine: boolean };

function NoteEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Note;
  onSave: (text: string, isPrivate: boolean) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial?.note_text ?? "");
  const [isPrivate, setPrivate] = useState(initial?.is_private ?? true);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        try {
          await onSave(text, isPrivate);
          if (!initial) setText("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Label htmlFor={`note-${initial?.note_id ?? "new"}`} className="sr-only">
        Note text (Markdown)
      </Label>
      <Textarea
        id={`note-${initial?.note_id ?? "new"}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a note. **Markdown** works."
        rows={4}
        maxLength={20000}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id={`private-${initial?.note_id ?? "new"}`}
            checked={!isPrivate}
            onCheckedChange={(v) => setPrivate(!v)}
          />
          <Label htmlFor={`private-${initial?.note_id ?? "new"}`}>Visible to everyone</Label>
        </div>
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          {initial ? "Save" : "Add note"}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function NotesPanel({
  paperId,
  viewer,
}: {
  paperId: number;
  viewer: { userId: number; role: RoleCode } | null;
}) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const load = useCallback(async () => {
    if (!viewer) return;
    setNotes((await api<{ items: Note[] }>(`/notes?paper_id=${paperId}`)).items);
  }, [paperId, viewer]);
  useEffect(() => {
    load().catch(() => setNotes([]));
  }, [load]);

  if (!viewer) {
    return (
      <EmptyState title="Notes are personal">
        <Link href="/login" className="underline">
          Sign in
        </Link>{" "}
        to write notes. Row-level security keeps private notes visible only to their author.
      </EmptyState>
    );
  }
  if (!notes) return <BlockSkeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <NoteEditor
        onSave={async (text, isPrivate) => {
          await api("/notes", { method: "POST", body: { paper_id: paperId, text, is_private: isPrivate } });
          toast.success("Note saved");
          await load();
        }}
      />
      {notes.length === 0 ? <EmptyState title="No notes on this paper yet" /> : null}
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.note_id} className="rounded-xl border p-4" data-testid="note">
            {editing === n.note_id ? (
              <NoteEditor
                initial={n}
                onCancel={() => setEditing(null)}
                onSave={async (text, isPrivate) => {
                  await api(`/notes/${n.note_id}`, {
                    method: "PATCH",
                    body: { text, is_private: isPrivate },
                  });
                  toast.success("Note updated");
                  setEditing(null);
                  await load();
                }}
              />
            ) : (
              <div className="flex gap-3">
                <div className="prose-sm flex-1 text-sm [&_a]:underline [&_p]:mb-2">
                  <ReactMarkdown>{n.note_text}</ReactMarkdown>
                  <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    {n.is_private ? (
                      <Lock className="size-3" aria-hidden />
                    ) : (
                      <Users className="size-3" aria-hidden />
                    )}
                    {n.is_private ? "private" : "public"} · {n.is_mine ? "you" : "another researcher"} ·{" "}
                    {relativeTime(n.updated_at)}
                  </p>
                </div>
                {n.is_mine ? (
                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Edit note"
                      onClick={() => setEditing(n.note_id)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete note"
                      onClick={async () => {
                        await api(`/notes/${n.note_id}`, { method: "DELETE" });
                        toast.success("Note deleted");
                        await load();
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
