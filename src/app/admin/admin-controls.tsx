"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/components/paper/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function RoleSelect({ userId, role, name }: { userId: number; role: string; name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  return (
    <>
      <label htmlFor={`role-${userId}`} className="sr-only">
        Role for {name}
      </label>
      <select
        id={`role-${userId}`}
        value={value}
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
        onChange={async (e) => {
          const next = e.target.value;
          try {
            await api(`/admin/users/${userId}`, { method: "PATCH", body: { role: next } });
            setValue(next);
            toast.success(`${name} is now ${next.toLowerCase()}`);
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Role change refused");
          }
        }}
      >
        <option value="RESEARCHER">Researcher</option>
        <option value="CURATOR">Curator</option>
        <option value="ADMIN">Administrator</option>
      </select>
    </>
  );
}

export function ActiveToggle({ userId, active, name }: { userId: number; active: boolean; name: string }) {
  const [value, setValue] = useState(active);
  return (
    <Switch
      checked={value}
      aria-label={`${name} is ${value ? "active" : "inactive"}`}
      onCheckedChange={async (v) => {
        try {
          await api(`/admin/users/${userId}`, { method: "PATCH", body: { is_active: v } });
          setValue(v);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Change refused");
        }
      }}
    />
  );
}

export function ActionButton({ path, label, done }: { path: string; label: string; done: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<Record<string, unknown>>(path, { method: "POST" });
          toast.success(
            `${done}${r && "processed" in r ? `: ${r.processed} rows` : r && "took_ms" in r ? ` in ${r.took_ms} ms` : ""}`,
          );
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Working…" : label}
    </Button>
  );
}
