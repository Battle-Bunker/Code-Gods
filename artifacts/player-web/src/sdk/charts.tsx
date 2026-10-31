/**
 * A small chart toolkit for panels: plain SVG, no chart library, theme-aware through CSS variables,
 * with redundant encodings (labels, shapes, dashes) so colour is never the only channel. Every chart
 * takes plain numbers. Keep inputs to a few hundred points; aggregate first if you have more.
 */
import { useId, useMemo, type ReactNode } from "react";

/** Categorical colours: theme tokens first, then a colour-blind-safe fallback (Okabe–Ito). */
export const SERIES = ["hsl(var(--primary))", "#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442"];
/** Distinct dash patterns that go with SERIES, so series stay apart without colour. */
export const DASHES = ["", "4 2", "1 2", "6 2 1 2", "8 3", "2 4", "3 1", "10 2 2 2"];
const INK = "hsl(var(--foreground))";
const MUTED = "hsl(var(--muted-foreground))";
const GRID = "hsl(var(--border))";

export const fmtBits = (bits: number) => `${Math.abs(bits) >= 100 ? bits.toFixed(0) : Math.abs(bits) >= 10 ? bits.toFixed(1) : bits.toFixed(2)}b`;

function extent(values: readonly number[], pad = 0): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [0, 1];
  let lo = Math.min(...finite), hi = Math.max(...finite);
  if (lo === hi) { lo -= 1; hi += 1; }
  const p = (hi - lo) * pad;
  return [lo - p, hi + p];
}
const scale = ([d0, d1]: [number, number], [r0, r1]: [number, number]) => (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

/** A tiny inline line chart. */
export function Sparkline({ values, width = 120, height = 28, color = SERIES[0], zero = false, label }: {
  values: readonly number[]; width?: number; height?: number; color?: string; zero?: boolean; label?: string;
}) {
  const [lo, hi] = extent(zero ? [...values, 0] : values, 0.05);
  const x = scale([0, Math.max(1, values.length - 1)], [1, width - 1]), y = scale([lo, hi], [height - 1, 1]);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} role="img" aria-label={label ?? `trend of ${values.length} points`} className="inline-block align-middle">
      {zero && lo < 0 && hi > 0 && <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={GRID} strokeDasharray="2 2" />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
      {values.length > 0 && <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2} fill={color} />}
    </svg>
  );
}

export type Series = { label: string; points: readonly { x: number; y: number }[] };

/** A multi-series line chart with axes and a legend. */
export function LineChart({ series, width = 320, height = 160, xLabel, yLabel, zero = true, format = fmtBits }: {
  series: readonly Series[]; width?: number; height?: number; xLabel?: string; yLabel?: string; zero?: boolean; format?: (v: number) => string;
}) {
  const m = { l: 40, r: 8, t: 8, b: 22 };
  const xs = series.flatMap(s => s.points.map(p => p.x)), ys = series.flatMap(s => s.points.map(p => p.y));
  const [x0, x1] = extent(xs), [y0, y1] = extent(zero ? [...ys, 0] : ys, 0.08);
  const x = scale([x0, x1], [m.l, width - m.r]), y = scale([y0, y1], [height - m.b, m.t]);
  return (
    <figure className="m-0">
      <svg width={width} height={height} role="img" aria-label={yLabel ?? "line chart"}>
        {[y0, (y0 + y1) / 2, y1].map(v => (
          <g key={v}>
            <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={m.l - 4} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill={MUTED}>{format(v)}</text>
          </g>
        ))}
        {zero && y0 < 0 && y1 > 0 && <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke={INK} strokeOpacity={0.4} />}
        {series.map((s, i) => (
          <path key={s.label} fill="none" stroke={SERIES[i % SERIES.length]} strokeDasharray={DASHES[i % DASHES.length]} strokeWidth={1.5}
            d={s.points.map((p, j) => `${j ? "L" : "M"}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join("")} />
        ))}
        {xLabel && <text x={width - m.r} y={height - 4} textAnchor="end" fontSize={9} fill={MUTED}>{xLabel}</text>}
      </svg>
      {series.length > 1 && <Legend items={series.map(s => s.label)} />}
    </figure>
  );
}

export function Legend({ items }: { items: readonly string[] }) {
  return (
    <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
      {items.map((label, i) => (
        <span key={label} className="inline-flex items-center gap-1">
          <svg width={16} height={6} aria-hidden><line x1={0} x2={16} y1={3} y2={3} stroke={SERIES[i % SERIES.length]} strokeWidth={2} strokeDasharray={DASHES[i % DASHES.length]} /></svg>
          {label}
        </span>
      ))}
    </figcaption>
  );
}

/** Horizontal bars with labels and values; negative values extend left of a zero line. */
export function BarList({ items, format = fmtBits, max = 20 }: {
  items: readonly { label: ReactNode; value: number; key?: string; title?: string }[]; format?: (v: number) => string; max?: number;
}) {
  const shown = items.slice(0, max);
  const lo = Math.min(0, ...shown.map(i => i.value)), hi = Math.max(0, ...shown.map(i => i.value));
  const span = hi - lo || 1, zero = (-lo / span) * 100;
  return (
    <ul className="m-0 list-none space-y-1 p-0 text-[11px]">
      {shown.map((item, i) => {
        const w = (Math.abs(item.value) / span) * 100, left = item.value < 0 ? zero - w : zero;
        return (
          <li key={item.key ?? i} title={item.title} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-2">
            <span className="truncate">{item.label}</span>
            <span className="relative h-2.5 bg-[hsl(var(--muted))]">
              <span className="absolute inset-y-0" style={{ left: `${left}%`, width: `${w}%`, background: item.value < 0 ? SERIES[6] : SERIES[0] }} />
              {lo < 0 && <span className="absolute inset-y-0 w-px bg-[hsl(var(--foreground))] opacity-40" style={{ left: `${zero}%` }} />}
            </span>
            <span className="tabular-nums">{format(item.value)}</span>
          </li>
        );
      })}
      {items.length > max && <li className="opacity-60">+{items.length - max} more</li>}
    </ul>
  );
}

/**
 * A labelled scatter plot; points may carry a label shown on hover and a highlight flag. `xColour` / `yColour` colour an
 * axis label (e.g. the "yours" and "others" dimension colours, `dimensionVar` in @workspace/object-views).
 */
export function ScatterPlot({ points, width = 280, height = 200, xLabel, yLabel, xColour = MUTED, yColour = MUTED, format = fmtBits, onSelect }: {
  points: readonly { x: number; y: number; label?: string; key?: string; highlight?: boolean }[];
  width?: number; height?: number; xLabel?: string; yLabel?: string; xColour?: string; yColour?: string; format?: (v: number) => string;
  onSelect?: (key: string) => void;
}) {
  const m = { l: 40, r: 8, t: 8, b: 24 };
  const [x0, x1] = extent([...points.map(p => p.x), 0], 0.08), [y0, y1] = extent([...points.map(p => p.y), 0], 0.08);
  const x = scale([x0, x1], [m.l, width - m.r]), y = scale([y0, y1], [height - m.b, m.t]);
  return (
    <svg width={width} height={height} role="img" aria-label={`${yLabel ?? "y"} against ${xLabel ?? "x"}`}>
      <line x1={x(0)} x2={x(0)} y1={m.t} y2={height - m.b} stroke={GRID} />
      <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke={GRID} />
      {[x0, x1].map(v => <text key={`x${v}`} x={x(v)} y={height - 10} textAnchor="middle" fontSize={9} fill={MUTED}>{format(v)}</text>)}
      {[y0, y1].map(v => <text key={`y${v}`} x={m.l - 4} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill={MUTED}>{format(v)}</text>)}
      {xLabel && <text x={width - m.r} y={height - 1} textAnchor="end" fontSize={9} style={{ fill: xColour }}>{xLabel} →</text>}
      {yLabel && <text x={2} y={m.t + 6} fontSize={9} style={{ fill: yColour }}>↑ {yLabel}</text>}
      {points.map((p, i) => (
        <g key={p.key ?? i} onClick={p.key && onSelect ? () => onSelect(p.key!) : undefined} className={onSelect ? "cursor-pointer" : undefined}>
          {p.highlight
            ? <rect x={x(p.x) - 3.5} y={y(p.y) - 3.5} width={7} height={7} fill={SERIES[2]} stroke={INK} strokeWidth={0.5} />
            : <circle cx={x(p.x)} cy={y(p.y)} r={3} fill={SERIES[0]} fillOpacity={0.75} />}
          {p.label && <title>{p.label}</title>}
        </g>
      ))}
    </svg>
  );
}

/** A grid heatmap (rows × columns of numbers), diverging around zero. */
export function Heatmap({ rows, cell = 14, format = fmtBits, rowLabels, colLabels }: {
  rows: readonly (readonly number[])[]; cell?: number; format?: (v: number) => string; rowLabels?: readonly string[]; colLabels?: readonly string[];
}) {
  const id = useId();
  const max = useMemo(() => Math.max(1e-9, ...rows.flat().map(v => Math.abs(v))), [rows]);
  const fill = (v: number) => v >= 0
    ? `color-mix(in oklab, ${SERIES[1]} ${Math.round((v / max) * 100)}%, transparent)`
    : `color-mix(in oklab, ${SERIES[6]} ${Math.round((-v / max) * 100)}%, transparent)`;
  const left = rowLabels ? 48 : 0, top = colLabels ? 14 : 0;
  const cols = Math.max(0, ...rows.map(r => r.length));
  return (
    <svg width={left + cols * cell} height={top + rows.length * cell} role="img" aria-labelledby={id}>
      <title id={id}>heatmap, {rows.length} rows by {cols} columns; blue positive, orange negative</title>
      {colLabels?.map((l, c) => <text key={c} x={left + c * cell + cell / 2} y={10} textAnchor="middle" fontSize={8} fill={MUTED}>{l}</text>)}
      {rows.map((r, i) => (
        <g key={i}>
          {rowLabels && <text x={left - 4} y={top + i * cell + cell / 2} textAnchor="end" dominantBaseline="middle" fontSize={8} fill={MUTED}>{rowLabels[i]}</text>}
          {r.map((v, j) => (
            <rect key={j} x={left + j * cell} y={top + i * cell} width={cell - 1} height={cell - 1} fill={fill(v)} stroke={GRID} strokeWidth={0.5}>
              <title>{format(v)}</title>
            </rect>
          ))}
        </g>
      ))}
    </svg>
  );
}

/** Lanes of spans over time: one lane per row (e.g. an agent), spans coloured by kind, plus point markers. */
export function Timeline({ lanes, from, to, width = 320, laneHeight = 14, now }: {
  lanes: readonly { label: string; spans: readonly { start: number; end: number; kind: "ok" | "cool" | "idle"; title?: string }[]; marks?: readonly { at: number; title?: string }[] }[];
  from: number; to: number; width?: number; laneHeight?: number; now?: number;
}) {
  const left = 64, x = scale([from, Math.max(from + 1e-9, to)], [left, width - 4]);
  const color = { ok: SERIES[3], cool: SERIES[6], idle: GRID } as const;
  return (
    <svg width={width} height={lanes.length * (laneHeight + 4) + 4} role="img" aria-label="timeline">
      {lanes.map((lane, i) => {
        const y = 4 + i * (laneHeight + 4);
        return (
          <g key={lane.label}>
            <text x={left - 4} y={y + laneHeight / 2} textAnchor="end" dominantBaseline="middle" fontSize={9} fill={MUTED}>{lane.label}</text>
            {lane.spans.map((s, j) => (
              <rect key={j} x={x(s.start)} y={y} width={Math.max(1, x(s.end) - x(s.start))} height={laneHeight}
                fill={color[s.kind]} fillOpacity={s.kind === "idle" ? 0.4 : 0.8} strokeDasharray={s.kind === "cool" ? "2 1" : undefined} stroke={s.kind === "cool" ? INK : "none"} strokeWidth={0.5}>
                {s.title && <title>{s.title}</title>}
              </rect>
            ))}
            {lane.marks?.map((m, j) => <line key={`m${j}`} x1={x(m.at)} x2={x(m.at)} y1={y} y2={y + laneHeight} stroke={INK} strokeWidth={1}>{m.title && <title>{m.title}</title>}</line>)}
          </g>
        );
      })}
      {now !== undefined && <line x1={x(now)} x2={x(now)} y1={0} y2={lanes.length * (laneHeight + 4) + 4} stroke={INK} strokeDasharray="2 2" />}
    </svg>
  );
}

/**
 * A compact sortable-looking table (sorting is the caller's job: pass rows in order). A column's `colour` colours its
 * header and cells (e.g. the "yours" and "others" dimension colours).
 */
export function Table<Row>({ rows, columns, rowKey, max = 50, onRowClick }: {
  rows: readonly Row[]; columns: readonly { header: string; cell: (row: Row) => ReactNode; align?: "left" | "right"; colour?: string }[];
  rowKey: (row: Row, index: number) => string; max?: number; onRowClick?: (row: Row) => void;
}) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr>{columns.map(c => <th key={c.header} className={`border-b border-[hsl(var(--border))] px-1 py-0.5 font-semibold ${c.align === "right" ? "text-right" : "text-left"}`}
          style={c.colour ? { color: c.colour } : undefined}>{c.header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.slice(0, max).map((row, i) => (
          <tr key={rowKey(row, i)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? "cursor-pointer hover:bg-[hsl(var(--muted))]" : undefined}>
            {columns.map(c => <td key={c.header} className={`px-1 py-0.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`}
              style={c.colour ? { color: c.colour } : undefined}>{c.cell(row)}</td>)}
          </tr>
        ))}
      </tbody>
      {rows.length > max && <tfoot><tr><td colSpan={columns.length} className="px-1 opacity-60">+{rows.length - max} more</td></tr></tfoot>}
    </table>
  );
}
