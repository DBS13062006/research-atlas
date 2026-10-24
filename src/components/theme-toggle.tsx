"use client";

import { MoonStar, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to the light Parchment theme" : "Switch to the dark Midnight theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Sun className="hidden size-4 dark:block" aria-hidden />
      <MoonStar className="size-4 dark:hidden" aria-hidden />
    </Button>
  );
}
