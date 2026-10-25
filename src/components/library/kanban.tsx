"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { GripVertical, NotebookPen, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { label } from "@/lib/format";

export type Item = {
  paper_id: number;
  reading_status: "NOT_READ" | "READING" | "READ";
  priority: "LOW" | "MEDIUM" | "HIGH";
  position: number;
  title: string;
  publication_year: number | null;
  author_names: string | null;
  retraction_status: string | null;
  my_notes: number;
};

const COLUMNS = ["NOT_READ", "READING", "READ"] as const;
const PRIORITY_STYLE: Record<Item["priority"], string> = {
  HIGH: "border-l-primary",
  MEDIUM: "border-l-chart-2",
  LOW: "border-l-border",
};

function Card({
  item,
  collectionId,
  editable,
  onMove,
  onRemove,
}: {
  item: Item;
  collectionId: number;
  editable: boolean;
  onMove: (to: Item["reading_status"]) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.paper_id,
    disabled: !editable,
  });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-l-4 bg-card p-3 shadow-sm ${PRIORITY_STYLE[item.priority]} ${isDragging ? "z-10 opacity-80 shadow-lg" : ""}`}
      data-testid="kanban-card"
    >
      <div className="flex gap-2">
        {editable ? (
          <button
            type="button"
            className="mt-0.5 cursor-grab text-muted-foreground"
            aria-label={`Drag ${item.title}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <Link
            href={`/papers/${item.paper_id}`}
            className="text-sm font-medium leading-snug hover:underline"
          >
            {item.title}
          </Link>
          <p className="mt-1 truncate text-xs text-muted-foreground">{item.author_names}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="font-mono text-[10px]">
              {item.publication_year ?? "—"}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {label(item.priority).toLowerCase()} priority
            </Badge>
            {item.my_notes ? (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <NotebookPen className="size-3" aria-hidden /> {item.my_notes}
              </Badge>
            ) : null}
            {item.retraction_status && item.retraction_status !== "REINSTATED" ? (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <ShieldAlert className="size-3" aria-hidden /> retracted
              </Badge>
            ) : null}
          </div>
          {editable ? (
            <div className="mt-2 flex items-center gap-1">
              <label className="sr-only" htmlFor={`status-${collectionId}-${item.paper_id}`}>
                Move {item.title}
              </label>
              <select
                id={`status-${collectionId}-${item.paper_id}`}
                value={item.reading_status}
                onChange={(e) => onMove(e.target.value as Item["reading_status"])}
                className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs dark:bg-input/30"
              >
                {COLUMNS.map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove ${item.title} from the collection`}
                onClick={onRemove}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Column({
  status,
  children,
  count,
}: {
  status: Item["reading_status"];
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={label(status)}
      className={`flex min-h-64 flex-col rounded-xl border bg-muted/30 p-3 transition-colors ${isOver ? "border-primary bg-primary/5" : ""}`}
    >
      <h3 className="mb-3 flex items-center justify-between text-sm font-medium">
        {label(status)}
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      </h3>
      <ul className="flex flex-1 flex-col gap-2">{children}</ul>
    </section>
  );
}

export function Kanban({
  collectionId,
  initial,
  editable,
}: {
  collectionId: number;
  initial: Item[];
  editable: boolean;
}) {
  const [items, setItems] = useState(initial);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  async function move(paperId: number, to: Item["reading_status"]) {
    const before = items;
    const position = items.filter((i) => i.reading_status === to).length;
    setItems((list) =>
      list.map((i) => (i.paper_id === paperId ? { ...i, reading_status: to, position } : i)),
    );
    try {
      await api(`/collections/${collectionId}/papers/${paperId}`, {
        method: "PATCH",
        body: { reading_status: to, position },
      });
      toast.success(`Moved to ${label(to)}`);
    } catch (err) {
      setItems(before);
      toast.error(err instanceof Error ? err.message : "Could not move the card");
    }
  }

  async function remove(paperId: number) {
    const before = items;
    setItems((list) => list.filter((i) => i.paper_id !== paperId));
    try {
      await api(`/collections/${collectionId}/papers/${paperId}`, { method: "DELETE" });
    } catch (err) {
      setItems(before);
      toast.error(err instanceof Error ? err.message : "Could not remove the paper");
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const to = e.over?.id as Item["reading_status"] | undefined;
    const item = items.find((i) => i.paper_id === e.active.id);
    if (to && item && item.reading_status !== to) move(item.paper_id, to);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((status) => {
          const col = items
            .filter((i) => i.reading_status === status)
            .sort((a, b) => a.position - b.position);
          return (
            <Column key={status} status={status} count={col.length}>
              {col.length === 0 ? (
                <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Drop papers here
                </li>
              ) : null}
              {col.map((item) => (
                <Card
                  key={item.paper_id}
                  item={item}
                  collectionId={collectionId}
                  editable={editable}
                  onMove={(to) => move(item.paper_id, to)}
                  onRemove={() => remove(item.paper_id)}
                />
              ))}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}
