"use client";

import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

const CommandPaletteDialog = dynamic(() => import("./command-palette-dialog"), { ssr: false });

export function CommandPalette() {
  // "never" until the first open: the dialog (and cmdk with it) is only loaded once it is wanted.
  const [state, setState] = useState<"never" | "open" | "closed">("never");
  const open = state === "open";
  const setOpen = (next: boolean) => setState(next ? "open" : "closed");
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setState((s) => (s === "open" ? "closed" : "open"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden w-56 justify-between text-muted-foreground md:inline-flex"
        onClick={() => setOpen(true)}
      >
        <span className="inline-flex items-center gap-2">
          <Search className="size-3.5" aria-hidden />
          Jump to…
        </span>
        <Kbd>⌘K</Kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open the command palette"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" aria-hidden />
      </Button>
      {state !== "never" ? <CommandPaletteDialog open={open} onOpenChange={setOpen} go={go} /> : null}
    </>
  );
}
