"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV_SECTIONS } from "@/lib/nav";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="xl:hidden" aria-label="Open navigation">
            <Menu className="size-5" aria-hidden />
          </Button>
        }
      />
      <SheetContent side="left" className="w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl font-normal">Research Atlas</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="space-y-6 px-4 pb-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {section.title}
              </p>
              <ul className="mt-2 space-y-1">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                    >
                      <item.icon className="size-4 text-muted-foreground" aria-hidden />
                      <span>
                        {item.label}
                        <span className="block text-xs text-muted-foreground">{item.hint}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
