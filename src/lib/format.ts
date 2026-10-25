// Formatting helpers for the "map coordinates" style of metadata: DOI · 2017 · 4,213 citations.
const nf = new Intl.NumberFormat("en-IN");

export const formatNumber = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : nf.format(n);

export function plural(n: number, one: string, many = `${one}s`) {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function relativeTime(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return formatDate(date);
}

export function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

export const STATUS_LABEL: Record<string, string> = {
  NOT_READ: "Not read",
  READING: "Reading",
  READ: "Read",
  RETRACTED: "Retracted",
  EXPRESSION_OF_CONCERN: "Expression of concern",
  CORRECTED: "Corrected",
  REINSTATED: "Reinstated",
  EXTENDS: "Extends",
  IMPROVES_UPON: "Improves upon",
  CONTRADICTS: "Contradicts",
  REPLICATES: "Replicates",
  RELATED_TO: "Related to",
};

export const label = (code: string | null | undefined) =>
  code ? (STATUS_LABEL[code] ?? code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ")) : "";

// The eight colour-blind-safe category hues (see globals.css --cat-*), for communities and topics.
export const CATEGORY_COLORS = [
  "#e69f00",
  "#56b4e9",
  "#009e73",
  "#f0e442",
  "#0072b2",
  "#cc79a7",
  "#44aa99",
  "#b8a07e",
];
export const categoryColor = (i: number) => (i < 0 ? "#7c8799" : CATEGORY_COLORS[i % CATEGORY_COLORS.length]);
