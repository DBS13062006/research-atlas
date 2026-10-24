"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { NAV_SECTIONS } from "@/lib/nav";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
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
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command palette"
        description="Jump to a page or search the atlas"
      >
        <CommandInput placeholder="Type a page name, or search papers…" />
        <CommandList>
          <CommandEmpty>No matching pages.</CommandEmpty>
          {NAV_SECTIONS.map((section) => (
            <CommandGroup key={section.title} heading={section.title}>
              {section.items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.hint}`}
                  onSelect={() => go(item.href)}
                >
                  <item.icon className="size-4 text-muted-foreground" aria-hidden />
                  <span>{item.label}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">{item.hint}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
