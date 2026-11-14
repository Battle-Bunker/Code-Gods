/**
 * The plane scene (cart, tri): an SVG of the line on a grid, zoomed to what matters (the origin, the intercepts, every
 * point a mark cites), with equal scales on both axes so a gradient looks like itself. Marks:
 * - focus: a ring on a point, a heavier line on a segment; numbers go to the readouts;
 * - candidate: a tick on an axis (xAxisMark, yAxisMark), a hollow dot (pointAtX …), a dashed line (ghost), labelled with
 *   its coordinate and, in the expanded view, its term ("3 · 1 away");
 * - measure: a bracket between two points, labelled with its term;
 * - note: words beside the element (expanded only).
 * Drawing uses floating point; every number shown is the exact rational of the element or term.
 */
import type { ReactElement } from "react";
import { Qn, type ElementRef, type ElementValue, type Mark, type Q, type SceneData } from "@workspace/v2-core";
import { fmtQ, fmtValue } from "../format.ts";
import { markRefs } from "../refs.ts";
import type { RenderProps, SceneRenderer } from "../scene.ts";
import { compactMarks, elAttrs, NOTE_MAX, hover, key, markState, Readouts, termQ, termText } from "./common.tsx";

type Plane = Extract<SceneData, { kind: "plane" }>;
type P = RenderProps<Plane>;
interface Pt { x: number; y: number }

const N = (q: Q) => Qn.toNumber(q);

/** A drawable geometry for an element value. */
function geom(v: ElementValue): { point: Pt } | { seg: [Pt, Pt] } | null {
  if (v.kind === "point") return { point: { x: N(v.x), y: N(v.y) } };
  if (v.kind === "segment") return { seg: [{ x: N(v.from.x), y: N(v.from.y) }, { x: N(v.to.x), y: N(v.to.y) }] };
  return null;
}

interface View { x0: number; x1: number; y0: number; y1: number; w: number; h: number; pad: number }

/** The world window: the origin, intercepts and mark points, padded, at least ±4, fitted to the box's aspect. */
function fit(points: Pt[], w: number, h: number, pad: number, limit: number): View {
  let x0 = -2, x1 = 2, y0 = -2, y1 = 2;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > limit || Math.abs(p.y) > limit) continue;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const grow = (a: number, b: number): [number, number] => {
    const span = Math.max(b - a, 6), mid = (a + b) / 2;
    return [mid - span * 0.62, mid + span * 0.62];
  };
  [x0, x1] = grow(x0, x1); [y0, y1] = grow(y0, y1);
  const iw = w - 2 * pad, ih = h - 2 * pad;
  const k = Math.min(iw / (x1 - x0), ih / (y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x0: cx - iw / k / 2, x1: cx + iw / k / 2, y0: cy - ih / k / 2, y1: cy + ih / k / 2, w, h, pad };
}
const sx = (v: View, x: number) => v.pad + ((x - v.x0) / (v.x1 - v.x0)) * (v.w - 2 * v.pad);
const sy = (v: View, y: number) => v.pad + ((v.y1 - y) / (v.y1 - v.y0)) * (v.h - 2 * v.pad);

/** The infinite line through two points, clipped to the view (Liang–Barsky); null when it misses. */
function clipLine(v: View, a: Pt, b: Pt): [Pt, Pt] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = -Infinity, t1 = Infinity;
  const edges: [number, number][] = [[-dx, a.x - v.x0], [dx, v.x1 - a.x], [-dy, a.y - v.y0], [dy, v.y1 - a.y]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
  }
  if (t0 > t1) return null;
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
}

function niceStep(span: number): number {
  const raw = span / 8;
  for (const s of [1, 2, 5, 10, 20, 50]) if (raw <= s) return s;
  return 100;
}

const inView = (v: View, p: Pt) => p.x >= v.x0 && p.x <= v.x1 && p.y >= v.y0 && p.y <= v.y1;

function Grid({ v, size }: { v: View; size: "compact" | "expanded" }) {
  const step = niceStep(Math.max(v.x1 - v.x0, v.y1 - v.y0));
  const out: ReactElement[] = [];
  for (let x = Math.ceil(v.x0 / step) * step; x <= v.x1; x += step) {
    if (x !== 0) out.push(<line key={`gx${x}`} className="grid" x1={sx(v, x)} x2={sx(v, x)} y1={0} y2={v.h} />);
  }
  for (let y = Math.ceil(v.y0 / step) * step; y <= v.y1; y += step) {
    if (y !== 0) out.push(<line key={`gy${y}`} className="grid" y1={sy(v, y)} y2={sy(v, y)} x1={0} x2={v.w} />);
  }
  if (v.y0 <= 0 && v.y1 >= 0) out.push(<line key="ax" className="axis" x1={0} x2={v.w} y1={sy(v, 0)} y2={sy(v, 0)} />);
  if (v.x0 <= 0 && v.x1 >= 0) out.push(<line key="ay" className="axis" y1={0} y2={v.h} x1={sx(v, 0)} x2={sx(v, 0)} />);
  if (size === "expanded") {
    const lab = step * 2;
    for (let x = Math.ceil(v.x0 / lab) * lab; x <= v.x1; x += lab) {
      if (x !== 0) out.push(<text key={`lx${x}`} className="tick-label" x={sx(v, x)} y={Math.min(v.h - 3, Math.max(10, sy(v, 0) + 11))} textAnchor="middle">{x < 0 ? `−${-x}` : x}</text>);
    }
    for (let y = Math.ceil(v.y0 / lab) * lab; y <= v.y1; y += lab) {
      if (y !== 0) out.push(<text key={`ly${y}`} className="tick-label" x={Math.min(v.w - 3, Math.max(3, sx(v, 0) - 4))} y={sy(v, y) + 3} textAnchor="end">{y < 0 ? `−${-y}` : y}</text>);
    }
  }
  return <g aria-hidden="true">{out}</g>;
}

/** The first element value a scene's items or marks give as a line (the object's line). */
function mainLine(p: P): [Pt, Pt] | null {
  const item = p.scene.items.find(i => i.draw === "line");
  const g = item ? geom(p.values(item.el)) : null;
  return g && "seg" in g ? g.seg : null;
}

/**
 * The label of a candidate: its coordinate ("3"), plus its term in the expanded view ("3 · 1 away") unless a measure
 * already labels the distance from it.
 */
function candLabel(p: P, m: Extract<Mark, { kind: "candidate" }>, marks: readonly Mark[]): string {
  const arg = m.ref.args ? Object.values(m.ref.args)[0] : undefined;
  const v = p.values(m.ref);
  const axis = /AxisMark$/.test(m.ref.name) || v.kind === "segment";
  const what = axis && arg !== undefined ? fmtQ(Qn.parse(arg)) : v.kind === "point" ? fmtValue(v) : arg !== undefined ? fmtQ(Qn.parse(arg)) : "";
  const t = termText(p, m);
  const measured = marks.some(x => x.kind === "measure" && (key(x.to) === key(m.ref) || key(x.from) === key(m.ref)));
  if (!t || p.size === "compact" || measured) return what;
  return `${what} · ${t} away`;
}

/** The candidate to label an element with: one whose term has no measure, else the first. */
function candFor(marks: readonly Mark[], r: ElementRef): Extract<Mark, { kind: "candidate" }> | null {
  const cs = marks.filter((m): m is Extract<Mark, { kind: "candidate" }> => m.kind === "candidate" && key(m.ref) === key(r));
  const measuredTerms = new Set(marks.filter(m => m.kind === "measure").map(m => (m as { term: string }).term));
  return cs.find(c => c.term === undefined || !measuredTerms.has(c.term)) ?? cs[0] ?? null;
}

function Scene({ p }: { p: P }) {
  const box = planeRenderer.box[p.size];
  const marks = compactMarks(p);
  const q: P = { ...p, marks };
  const line = mainLine(p);
  const lineItem = p.scene.items.find(i => i.draw === "line");
  if (lineItem && !line) {
    return <div className="v2v-undef">{fmtValue(p.values(lineItem.el))}</div>;
  }

  // What the window must show: the origin, the line's axis crossings, every item point and cited point.
  const pts: Pt[] = [{ x: 0, y: 0 }];
  if (line) {
    const [a, b] = line;
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx !== 0) pts.push({ x: 0, y: a.y - (dy / dx) * a.x });
    if (dy !== 0) pts.push({ x: a.x - (dx / dy) * a.y, y: 0 });
  }
  for (const it of p.scene.items) { const g = geom(p.values(it.el)); if (g && "point" in g) pts.push(g.point); }
  for (const m of marks) for (const r of markRefs(m)) { const g = geom(p.values(r)); if (g && "point" in g) pts.push(g.point); }
  const v = fit(pts, box.w, box.h, p.size === "compact" ? 4 : 8, 30);

  const placed = new Set<string>();
  const drawnNotes = new Set<string>();
  const layers: ReactElement[] = [];
  // Labels already placed (screen boxes); a new label that would overlap one moves down a line.
  const boxes: { x: number; y: number; w: number }[] = [];
  const spot = (x: number, y: number, text: string, anchor: "start" | "middle" = "start") => {
    const w = text.length * 5.6, x0 = anchor === "middle" ? x - w / 2 : x;
    let yy = y;
    for (let i = 0; i < 6 && boxes.some(b => Math.abs(b.y - yy) < 11 && x0 < b.x + b.w && b.x < x0 + w); i++) yy += 11;
    boxes.push({ x: x0, y: yy, w });
    return yy;
  };
  const front: ReactElement[] = [];

  // Region: the triangle the line makes with the axes.
  for (const it of p.scene.items.filter(i => i.draw === "region")) {
    if (!line || p.values(it.el).kind === "undefined") continue; // its sentence goes to the readouts
    const [a, b] = line;
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx === 0 || dy === 0) continue;
    placed.add(key(it.el));
    const yInt = a.y - (dy / dx) * a.x, xInt = a.x - (dx / dy) * a.y;
    const pts3 = [[0, 0], [xInt, 0], [0, yInt]].map(([x, y]) => `${sx(v, x!)},${sy(v, y!)}`).join(" ");
    layers.push(<polygon key={`r${key(it.el)}`} className="region" points={pts3} {...elAttrs(q, it.el)} {...hover(q, it.el)}><title>{p.labelOf(it.el)}: {fmtValue(p.values(it.el))}</title></polygon>);
  }

  // The previous line, when it moved.
  if (p.before && lineItem) {
    const g = geom(p.before(lineItem.el));
    if (g && "seg" in g && fmtValue(p.before(lineItem.el)) !== fmtValue(p.values(lineItem.el))) {
      const c = clipLine(v, g.seg[0], g.seg[1]);
      if (c) layers.push(<line key="was" className="line-was" x1={sx(v, c[0].x)} y1={sy(v, c[0].y)} x2={sx(v, c[1].x)} y2={sy(v, c[1].y)} />);
    }
  }

  // Ghost lines (candidates and other cited segments).
  const ghostMarks = marks.filter((m): m is Extract<Mark, { kind: "candidate" }> => m.kind === "candidate" && geom(p.values(m.ref)) !== null && "seg" in geom(p.values(m.ref))!);
  const nearest = ghostMarks.reduce<{ m: Mark | null; d: number }>((acc, m) => {
    const t = termQ(p, m); const d = t ? Math.abs(N(t)) : Infinity;
    return d < acc.d ? { m, d } : acc;
  }, { m: null, d: Infinity }).m;
  for (const m of ghostMarks) {
    const g = geom(p.values(m.ref)) as { seg: [Pt, Pt] };
    const c = clipLine(v, g.seg[0], g.seg[1]);
    if (!c) continue;
    placed.add(key(m.ref));
    const at = { x: c[0].x + (c[1].x - c[0].x) * 0.82, y: c[0].y + (c[1].y - c[0].y) * 0.82 };
    layers.push(
      <g key={`g${key(m.ref)}`} {...elAttrs(q, m.ref)} {...hover(q, m.ref)}>
        <line className="ghost" data-near={m === nearest ? "" : undefined} x1={sx(v, c[0].x)} y1={sy(v, c[0].y)} x2={sx(v, c[1].x)} y2={sy(v, c[1].y)} />
        {(() => { const t = candLabel(p, m, marks); const X = Math.min(sx(v, at.x) + 4, v.w - t.length * 5.6 - 2); return <text className="cand-label label-halo" x={X} y={spot(X, sy(v, at.y) - 4, t)}>{t}</text>; })()}
        <title>{p.labelOf(m.ref)}</title>
      </g>,
    );
  }

  // The line itself.
  if (line && lineItem) {
    placed.add(key(lineItem.el));
    const c = clipLine(v, line[0], line[1]);
    if (c) {
      const st = markState(marks, lineItem.el);
      layers.push(
        <g key="line" {...elAttrs(q, lineItem.el)} {...hover(q, lineItem.el)}>
          <line className="hit" x1={sx(v, c[0].x)} y1={sy(v, c[0].y)} x2={sx(v, c[1].x)} y2={sy(v, c[1].y)} />
          <line className="line" data-focus={st.focus ? "" : undefined} x1={sx(v, c[0].x)} y1={sy(v, c[0].y)} x2={sx(v, c[1].x)} y2={sy(v, c[1].y)} />
          <title>{p.labelOf(lineItem.el)}</title>
        </g>,
      );
    }
  }

  // Measures: a bracket between two points.
  for (const m of marks) {
    if (m.kind !== "measure") continue;
    const a = geom(p.values(m.from)), b = geom(p.values(m.to));
    if (!a || !b || !("point" in a) || !("point" in b)) continue;
    const A = { x: sx(v, a.point.x), y: sy(v, a.point.y) }, B = { x: sx(v, b.point.x), y: sy(v, b.point.y) };
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const off = 7; // the bracket sits beside the segment (below an x-axis gap, left of a y-axis gap)
    const nx = (-(B.y - A.y) / len) * off, ny = ((B.x - A.x) / len) * off;
    const flip = ny < 0 || (ny === 0 && nx > 0) ? -1 : 1;
    const ox = nx * flip, oy = ny * flip;
    const d = `M${A.x},${A.y} l${ox},${oy} L${B.x + ox},${B.y + oy} l${-ox},${-oy}`;
    const mid = { x: (A.x + B.x) / 2 + ox * 2.4, y: (A.y + B.y) / 2 + oy * 2.4 + 4 };
    front.push(
      <g key={`m${key(m.from)}-${key(m.to)}`} data-mark="measure" data-term={m.term}>
        <path className="measure" d={d} />
        <text className="measure-label label-halo" x={mid.x} y={mid.y} textAnchor="middle">{termText(p, m)}</text>
      </g>,
    );
  }

  // Points: scene items and cited points (focus rings, candidate ticks and dots).
  const pointRefs = new Map<string, { r: ElementRef; item: boolean }>();
  for (const it of p.scene.items) if (it.draw === "point" || it.draw === "tick") pointRefs.set(key(it.el), { r: it.el, item: true });
  for (const m of marks) for (const r of markRefs(m)) {
    if (r.rep !== p.rep && r.rep !== "cart") continue;
    const g = geom(p.values(r));
    if (g && "point" in g && !pointRefs.has(key(r))) pointRefs.set(key(r), { r, item: false });
  }
  for (const { r } of pointRefs.values()) {
    const g = geom(p.values(r));
    if (!g || !("point" in g) || !inView(v, g.point)) continue; // undefined or off the window: a readout instead
    placed.add(key(r));
    const X = sx(v, g.point.x), Y = sy(v, g.point.y);
    const st = markState(marks, r);
    const axisMark = /AxisMark$/.test(r.name);
    const cand = candFor(marks, r);
    const label = cand ? candLabel(p, cand, marks) : "";
    const isX = r.name === "xAxisMark";
    front.push(
      <g key={`p${key(r)}`} {...elAttrs(q, r)} {...hover(q, r)}>
        {axisMark
          ? <line className="cand" x1={isX ? X : X - 5} x2={isX ? X : X + 5} y1={isX ? Y - 5 : Y} y2={isX ? Y + 5 : Y} />
          : st.cand
            ? <circle className="cand" cx={X} cy={Y} r={3.6} />
            : <circle className="dot" data-focus={st.focus ? "" : undefined} cx={X} cy={Y} r={p.size === "compact" ? 2.4 : 3} />}
        {st.focus && <circle className="ring" cx={X} cy={Y} r={6} />}
        {label && <text className="cand-label label-halo" x={isX ? X : X + 7} y={spot(isX ? X : X + 7, isX ? Y - 8 : Y + 3.5, label, isX ? "middle" : "start")} textAnchor={isX ? "middle" : "start"}>{label}</text>}
        {p.size === "expanded" && st.notes.filter(n => n.length <= NOTE_MAX).slice(0, 1).map(n => {
          drawnNotes.add(n);
          const X0 = Math.min(X + 7, v.w - n.length * 5.4 - 2);
          return <text key="note" className="note label-halo" x={X0} y={spot(X0, Y - 8, n)}>{n}</text>;
        })}
        <title>{p.labelOf(r)}: {fmtValue(p.values(r))}</title>
      </g>,
    );
  }

  return (
    <>
      <svg className="v2v-plane" width={v.w} height={v.h} viewBox={`0 0 ${v.w} ${v.h}`} role="img" aria-label={planeText(p.scene, p.values)}>
        <Grid v={v} size={p.size} />
        {layers}
        {front}
      </svg>
      <Readouts p={q} placed={placed} drawnNotes={drawnNotes} />
    </>
  );
}

function planeText(scene: Plane, values: (r: ElementRef) => ElementValue): string {
  const parts: string[] = [];
  for (const it of scene.items) {
    const v = values(it.el);
    if (it.draw === "line") {
      parts.push(v.kind === "segment" ? `a line through ${fmtValue({ kind: "point", ...v.from })} and ${fmtValue({ kind: "point", ...v.to })}` : fmtValue(v));
    } else if (v.kind !== "undefined") {
      parts.push(`${it.el.name} ${fmtValue(v)}`);
    }
  }
  return parts.join("; ");
}

export const planeRenderer: SceneRenderer<Plane> = {
  kind: "plane",
  box: { compact: { w: 160, h: 100 }, expanded: { w: 320, h: 220 } },
  render: p => <Scene p={p} />,
  text: (scene, values) => planeText(scene, values),
};
