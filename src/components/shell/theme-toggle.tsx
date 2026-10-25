"use client";

import { MoonStar, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The server cannot know the stored theme, so the label stays neutral until hydration finishes.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const isDark = resolvedTheme !== "light";
  const label = !hydrated
    ? "Toggle colour theme"
    : isDark
      ? "Switch to the light Parchment theme"
      : "Switch to the dark Midnight theme";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Sun className="hidden size-4 dark:block" aria-hidden />
      <MoonStar className="size-4 dark:hidden" aria-hidden />
    </Button>
  );
}
