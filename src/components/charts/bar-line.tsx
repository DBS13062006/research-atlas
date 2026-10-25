"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Papers per year as bars with an optional second series as a line (citations, moving average).
export function YearChart({
  data,
  barKey,
  barLabel,
  lineKey,
  lineLabel,
  height = 240,
}: {
  data: Record<string, number | null>[];
  barKey: string;
  barLabel: string;
  lineKey?: string;
  lineLabel?: string;
  height?: number;
}) {
  return (
    <figure className="m-0 w-full">
      <figcaption className="sr-only">
        {barLabel} per year{lineLabel ? ` with ${lineLabel}` : ""}:{" "}
        {data.map((d) => `${d.year}: ${d[barKey]}`).join(", ")}
      </figcaption>
      {lineLabel ? (
        <ul className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-hidden>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[var(--chart-2)]" />
            {barLabel}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-[var(--brass)]" />
            {lineLabel}
            {lineKey !== "moving_avg" ? " (right axis)" : ""}
          </li>
        </ul>
      ) : null}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: lineKey ? 0 : 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="a"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          {lineKey && lineKey !== "moving_avg" ? (
            <YAxis
              yAxisId="b"
              orientation="right"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
          ) : null}
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--foreground)" }}
          />
          <Bar
            yAxisId="a"
            dataKey={barKey}
            name={barLabel}
            fill="var(--chart-2)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
          {lineKey ? (
            <Line
              yAxisId={lineKey === "moving_avg" ? "a" : "b"}
              dataKey={lineKey}
              name={lineLabel}
              stroke="var(--brass)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}
