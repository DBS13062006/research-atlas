"use client";

import type { LabResultSet } from "@/server/services/lab";

function show(value: unknown): { text: string; muted: boolean } {
  if (value === null) return { text: "NULL", muted: true };
  if (typeof value === "object") return { text: JSON.stringify(value), muted: false };
  return { text: String(value), muted: false };
}

export function ResultGrid({ result }: { result: LabResultSet }) {
  if (result.columns.length === 0) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        statement {result.statement}: {result.command || "OK"}
        {result.rowCount ? ` · ${result.rowCount} rows affected` : ""}
      </p>
    );
  }
  return (
    <figure className="m-0 space-y-1">
      <figcaption className="font-mono text-xs text-muted-foreground">
        statement {result.statement}: {result.command} · {result.rowCount.toLocaleString("en-IN")} rows
        {result.truncated ? " (first 200 shown)" : ""}
      </figcaption>
      <div className="max-h-[420px] overflow-auto rounded-lg border">
        <table className="w-full text-left font-mono text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {result.columns.map((c) => (
                <th key={c} scope="col" className="px-2.5 py-1.5 font-medium whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {result.rows.map((row, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: result rows have no stable key
              <tr key={i} className="align-top hover:bg-muted/40">
                {result.columns.map((column, j) => {
                  const { text, muted } = show(row[j]);
                  return (
                    <td
                      key={column}
                      className={`max-w-96 px-2.5 py-1 ${muted ? "text-muted-foreground italic" : ""}`}
                    >
                      <span className="line-clamp-3 break-words">{text}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
