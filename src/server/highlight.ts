import "server-only";

import { createHighlighter, type Highlighter } from "shiki";

// Server-side syntax highlighting for catalog source. Both themes are emitted as CSS variables
// (--shiki-light / --shiki-dark) and globals.css picks one from the active app theme.
let highlighter: Promise<Highlighter> | null = null;

export async function highlight(code: string, lang: "sql" | "cypher"): Promise<string> {
  highlighter ??= createHighlighter({
    themes: ["github-light-default", "github-dark-default"],
    langs: ["sql", "cypher"],
  });
  return (await highlighter).codeToHtml(code, {
    lang,
    themes: { light: "github-light-default", dark: "github-dark-default" },
    defaultColor: false,
  });
}
