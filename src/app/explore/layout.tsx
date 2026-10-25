import Link from "next/link";
import type { ReactNode } from "react";
import { NAV_SECTIONS } from "@/lib/nav";

export default function ExploreLayout({ children }: { children: ReactNode }) {
  const items = NAV_SECTIONS.find((s) => s.title === "Explore")?.items ?? [];
  return (
    <>
      <nav aria-label="Explore views" className="border-b">
        <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2">
          {items.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <i.icon className="size-4" aria-hidden />
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </>
  );
}
