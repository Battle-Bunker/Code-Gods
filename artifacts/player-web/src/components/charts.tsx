/**
 * Plain SVG charts for the game panes (dataviz method): a line chart over world time and a scatter, each as wide as
 * its pane (390 px phones included), thin marks (2 px lines, 8 px dots with a 2 px surface ring), hairline grid,
 * text in text colours, series colours from the categorical slots `--series-1…8` in index.css (validated against the
 * card surface; a colour follows the player, by roster order), and a hover read-out. The maths is in
 * src/panes/chart-model.ts.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clock, pointsText } from "@/core/words";
import {
  axisNumber, CARE_KINDS, careTitle, scale, ticks, timeDomain, timeTicks, valueDomain, valuesAt, type CareKind, type CarePoint, type Series,
} from "@/panes/chart-model";

/** The colour of a categorical slot (0-based); past the eighth, the muted grey. */
export const slotColour = (slot: number | null) => (slot !== null && slot >= 0 && slot < 8 ? `var(--series-${slot + 1})` : "var(--series-other)");

/** The width of the element, following its pane as it is resized. */
function useWidth(initial = 320) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || initial);
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(([e]) => { if (e) setWidth(Math.max(200, Math.floor(e.contentRect.width))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return { ref, width };
}

const GRID = "hsl(var(--border))";
const SURFACE = "hsl(var(--card))";
const TICK = "fill-muted-foreground text-[11px] tabular-nums";

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  // Kept inside the chart: to the right of the pointer, or to its left near the right edge.
  const left = x > width * 0.6;
  return (
    <div role="status" className="pointer-events-none absolute top-1 z-10 max-w-[240px] border border-[hsl(var(--popover-border))] bg-popover px-2 py-1 text-xs shadow-sm"
      style={left ? { right: width - x + 8 } : { left: x + 8 }}>
      {children}
    </div>
  );
}

function Legend({ items }: { items: { key: string; label: string; colour: string; dot?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="chart-legend">
      {items.map(i => (
        <li key={i.key} className="inline-flex items-center gap-1.5">
          {i.dot
            ? <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: i.colour }} />
            : <span aria-hidden className="inline-block h-[2px] w-3.5 rounded" style={{ background: i.colour }} />}
          <span className="text-foreground">{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Points over world time, one line per series (the viewer's drawn last, on top). Two or more series get a legend;
 * a single series is named by the pane's title.
 */
export function LineChart({ series, height = 180, label, testId }: { series: readonly Series[]; height?: number; label: string; testId?: string }) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const all = useMemo(() => series.flatMap(s => s.points), [series]);
  const y = valueDomain(all.map(p => p.y)), x = timeDomain(all.map(p => p.x));
  const yTicks = ticks(y, height < 150 ? 3 : 4);
  const left = 10 + 6.5 * Math.max(...yTicks.map(t => axisNumber(t).length)), right = 10, top = 8, bottom = 22;
  const sx = scale(x, left, width - right), sy = scale(y, height - bottom, top);
  const xTicks = timeTicks(x, Math.max(2, Math.floor((width - left - right) / 70)));
  const drawn = [...series].sort((a, b) => Number(a.you) - Number(b.you));
  const read = hover === null ? null : valuesAt(series, x.lo + ((hover - left) / Math.max(1, width - left - right)) * (x.hi - x.lo));
  const rows = read ? [...read.rows].sort((a, b) => b.y - a.y) : [];
  return (
    <div className="space-y-1.5" data-testid={testId}>
      {series.length > 1 && <Legend items={[...series].sort((a, b) => Number(b.you) - Number(a.you)).map(s => ({ key: s.key, label: s.label, colour: slotColour(s.slot) }))} />}
      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block touch-pan-y select-none"
          onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); const px = e.clientX - r.left; setHover(px >= left && px <= width - right ? px : null); }}
          onPointerLeave={() => setHover(null)}>
          <title>{label}</title>
          {yTicks.map(t => (
            <g key={`y${t}`}>
              <line x1={left} x2={width - right} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={left - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle" className={TICK}>{axisNumber(t)}</text>
            </g>
          ))}
          {xTicks.map(t => <text key={`x${t}`} x={sx(t)} y={height - 6} textAnchor="middle" className={TICK}>{clock(t)}</text>)}
          {read && <line x1={sx(read.at)} x2={sx(read.at)} y1={top} y2={height - bottom} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />}
          {drawn.map(s => {
            const d = s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
            const end = s.points.at(-1)!;
            return (
              <g key={s.key} data-series={s.key}>
                <path d={d} fill="none" stroke={slotColour(s.slot)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={sx(end.x)} cy={sy(end.y)} r={4} fill={slotColour(s.slot)} stroke={SURFACE} strokeWidth={2} />
              </g>
            );
          })}
          {read && rows.map(r => {
            const p = r.series.points.find(q => q.x === read.at)!;
            return <circle key={`h${r.series.key}`} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={slotColour(r.series.slot)} stroke={SURFACE} strokeWidth={2} />;
          })}
        </svg>
        {read && hover !== null && rows.length > 0 && (
          <Tooltip x={sx(read.at)} width={width}>
            <p className="text-muted-foreground">at {clock(read.at)}</p>
            {rows.map(r => (
              <p key={r.series.key} className="flex items-center gap-1.5 tabular-nums">
                <span aria-hidden className="inline-block h-[2px] w-3 rounded" style={{ background: slotColour(r.series.slot) }} />
                {series.length > 1 && <span>{r.series.label}</span>}<span className="ml-auto pl-2">{pointsText(r.y)}</span>
              </p>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

const KIND_SLOT = Object.fromEntries(CARE_KINDS.map(k => [k.kind, k.slot])) as Record<CareKind, number | null>;

/**
 * Every line as a dot: across, your ✨ rarity; up, how much the others want it. Lines on the same spot share one dot,
 * bigger by their number (the read-out lists them).
 */
export function CareScatter({ points, height = 220 }: { points: readonly CarePoint[]; height?: number }) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<string | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, CarePoint[]>();
    for (const p of points) {
      const k = `${p.rarity}|${p.want}`;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].map(([key, list]) => ({ key, list, p: list[0]! }));
  }, [points]);
  const x = valueDomain(points.map(p => p.rarity)), y = valueDomain(points.map(p => p.want));
  const yTicks = ticks(y, 4);
  const left = 10 + 6.5 * Math.max(...yTicks.map(t => axisNumber(t).length)), right = 14, top = 12, bottom = 36;
  const sx = scale(x, left, width - right), sy = scale(y, height - bottom, top);
  const xTicks = ticks(x, Math.max(2, Math.floor((width - left - right) / 60)));
  const radius = (n: number) => Math.min(10, 4 + 1.5 * Math.sqrt(n - 1));
  const shown = groups.find(g => g.key === hover);
  return (
    <div ref={ref} className="relative w-full" data-testid="care-scatter">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" className="block touch-pan-y select-none"
        aria-label={`${points.length} lines: across, your ✨ rarity; up, how much the others want it`} onPointerLeave={() => setHover(null)}>
        {yTicks.map(t => (
          <g key={`y${t}`}>
            <line x1={left} x2={width - right} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={left - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle" className={TICK}>{axisNumber(t)}</text>
          </g>
        ))}
        <line x1={left} x2={left} y1={top} y2={height - bottom} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
        {xTicks.map(t => <text key={`x${t}`} x={sx(t)} y={height - bottom + 14} textAnchor="middle" className={TICK}>{axisNumber(t)}</text>)}
        <text x={(left + width - right) / 2} y={height - 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">your ✨ rarity →</text>
        <text x={left + 4} y={top - 2} className="fill-muted-foreground text-[11px]">↑ how much the others want it</text>
        {groups.map(g => (
          <g key={g.key} data-kind={g.p.kind} data-lines={g.list.map(p => p.number).join(" ")}
            onPointerEnter={() => setHover(g.key)} onClick={() => setHover(g.key)}>
            <circle cx={sx(g.p.rarity)} cy={sy(g.p.want)} r={Math.max(10, radius(g.list.length) + 4)} fill="transparent" />
            <circle cx={sx(g.p.rarity)} cy={sy(g.p.want)} r={radius(g.list.length)} fill={slotColour(KIND_SLOT[g.p.kind])} stroke={SURFACE} strokeWidth={2} />
          </g>
        ))}
      </svg>
      {shown && (
        <Tooltip x={sx(shown.p.rarity)} width={width}>
          {shown.list.length === 1 ? <p>{careTitle(shown.p)}</p> : (
            <>
              <p>{shown.list.length} lines here: {shown.list.slice(0, 8).map(p => p.number).join(", ")}{shown.list.length > 8 ? " …" : ""}</p>
              <p className="text-muted-foreground">{careTitle(shown.p).replace(/^Line \d+: /, "each: ")}</p>
            </>
          )}
        </Tooltip>
      )}
    </div>
  );
}
