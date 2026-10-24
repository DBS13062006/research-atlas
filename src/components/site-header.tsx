import Link from "next/link";
import type { ReactNode } from "react";
import { CommandPalette } from "@/components/command-palette";
import { CompassMark } from "@/components/compass-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { PRIMARY_NAV } from "@/lib/nav";

export function SiteHeader({ account }: { account?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-display text-xl">
          <CompassMark className="size-7" />
          <span>Research Atlas</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <CommandPalette />
          <ThemeToggle />
          {account}
        </div>
      </div>
    </header>
  );
}
