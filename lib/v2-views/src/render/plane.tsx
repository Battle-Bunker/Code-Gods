/**
 * The plane scene (cart, tri, norm): the line drawn across a window fitted to what the rule reads
 * (docs/engine-v2/annotations-design.md §6). `planeLayout` is pure: it gathers the interesting points from the rule's
 * own marks (no second source), fits the window with d3-scale (plot/viewport.ts), and places the labels of the points
 * that matter at rest (plot/labels.ts). Priorities:
 * - 1: what a focus or measure mark cites, the nearest candidate (the target), the region the rule reads: always in the
 *   window, always labelled;
 * - 2: the other candidates and notes: in the window, labelled where there is room;
 * - 3: the representation's own landmarks (the origin, the intercepts): in the window unless that would crush the
 *   others (then the off-screen axis is named at the edge), never labelled at rest (their titles say what they are).
 * Drawing uses floating point; every number shown is the exact rational of the element or term.
 */
import type { ReactElement } from "react";
import { Qn, type ElementRef, type ElementValue, type Mark, type Q, type SceneData } from "@workspace/v2-core";
import { fmtQ, fmtValue, fmtNum, readable } from "../format.ts";
import { markRefs } from "../refs.ts";
import type { RenderProps, SceneRenderer } from "../scene.ts";
import { clipLine, fitViewport, type Viewport, type XY } from "../plot/viewport.ts";
import { placeLabels, textWidth, type Placed, type Rect, type Seg } from "../plot/labels.ts";
import { elAttrs, hover, key, markState, NOTE_MAX, Readouts, termQ, termText } from "./common.tsx";

type Plane = Extract<SceneData, { kind: "plane" }>;
type P = RenderProps<Plane>;
type Candidate = Extract<Mark, { kind: "candidate" }>;

const N = (q: Q) => Qn.toNumber(q);

/** A point the plane may draw, with why it matters. */
export interface PlanePoint {
  readonly id: string;
  readonly ref: ElementRef | null;
  readonly priority: 1 | 2 | 3;
  readonly x: number; readonly y: number;
  readonly px: number; readonly py: number;
  readonly label: string;
  readonly kind: "focus" | "cand" | "axis-cand" | "item" | "note";
}
export interface PlaneLabel extends Placed { readonly text: string; readonly ax: number; readonly ay: number }

export interface PlaneLayout {
  readonly view: Viewport;
  /** The object's line across the window (box px). */
  readonly line: Seg | null;
  readonly lineRef: ElementRef | null;
  /** The scene's other lines (a system of several), across the window (box px), in item order. */
  readonly others: readonly { readonly ref: ElementRef; readonly seg: Seg | null }[];
  readonly points: readonly PlanePoint[];
  readonly labels: readonly PlaneLabel[];
  /** The triangle with the axes, when the rule reads it: box px, and whether it is too thin to see. */
  readonly region: { readonly ref: ElementRef; readonly pts: readonly XY[]; readonly world: readonly XY[]; readonly thin: boolean } | null;
  /** Axes outside the window, named at the edge: "x-axis below (y = 0)". */
  readonly offAxes: readonly string[];
  /** The marks drawn here: the rule's marks on this plane, projected ones moved onto their plane element (compact: filtered). */
  readonly marks: readonly Mark[];
  /** The axes' numbers that are drawn (none under a label or a point). */
  readonly ticks: readonly TickLabel[];
  /** The square a rule compares an area with (a candidate on an element meaning "squareOfSide"), beside the triangle, in box
   *  px; only on equal scales (a square must look square), else null and the rule's words say it. */
  readonly square: { readonly x: number; readonly y: number; readonly side: number; readonly label: string; readonly ref: ElementRef } | null;
}

export interface TickLabel { readonly text: string; readonly x: number; readonly y: number; readonly anchor: "middle" | "end"; readonly box: Rect }

/** The axes' numbers: along the axes (or the edges, when an axis is off the window), every other one when crowded. */
export function tickLabels(v: Viewport): TickLabel[] {
  const out: TickLabel[] = [];
  const yAt = Math.min(v.box.h - 3, Math.max(10, (v.y0 <= 0 && v.y1 >= 0 ? v.sy(0) : v.box.h - 4) + 11));
  const xAt = Math.min(v.box.w - 3, Math.max(28, (v.x0 <= 0 && v.x1 >= 0 ? v.sx(0) : 30) - 4));
  const wOf = (t: string) => t.length * 5.5;
  const ex = Math.max(1, Math.ceil(Math.max(...v.xTicks.map(t => wOf(tickText(t)) + 8)) / Math.abs(v.sx(v.xStep) - v.sx(0))));
  const ey = Math.max(1, Math.ceil(14 / Math.abs(v.sy(0) - v.sy(v.yStep))));
  v.xTicks.forEach((x, i) => { if (x !== 0 && i % ex === 0) { const t = tickText(x), w = wOf(t); out.push({ text: t, x: v.sx(x), y: yAt, anchor: "middle", box: { x: v.sx(x) - w / 2, y: yAt - 9, w, h: 11 } }); } });
  v.yTicks.forEach((y, i) => { if (y !== 0 && i % ey === 0) { const t = tickText(y), w = wOf(t); out.push({ text: t, x: xAt, y: v.sy(y) + 3, anchor: "end", box: { x: xAt - w, y: v.sy(y) - 6, w, h: 11 } }); } });
  return out;
}

/**
 * The rule's marks as this plane draws them: a mark on the plane (or on cart, whose points every plane shares) as it
 * is; a mark on another representation moved onto the element here that means the same (si.c → cart.yInt,
 * crossing.x0 → cart.xInt, table.y(x=2) → cart.pointAtX(q=2)); a mark with nowhere to go here is dropped. Compact faces
 * keep the focus and measure marks and the nearest candidate.
 */
function localMarks(p: P, project: PlaneLayoutInput["project"]): Mark[] {
  const here = (r: ElementRef): ElementRef | null => {
    if (r.rep === p.rep || r.rep === "cart") return r;
    for (const x of project?.(r, [p.rep, "cart"]) ?? []) if (p.values(x).kind !== "undefined") return x;
    return null;
  };
  const out: Mark[] = [];
  for (const m of p.marks) {
    if (m.kind === "measure") {
      const a = here(m.from), b = here(m.to);
      if (a && b) out.push({ ...m, from: a, to: b });
    } else {
      const r = here(m.ref);
      if (r) out.push({ ...m, ref: r } as Mark);
    }
  }
  if (p.size !== "compact") return out;
  const best = nearestCandidate(p, out, "any");
  return out.filter(m => m.kind === "focus" || m.kind === "measure" || m === best);
}

/** The candidate with the smallest term, among point candidates or any (ghost lines included). */
function nearestCandidate(p: P, marks: readonly Mark[], which: "point" | "any"): Candidate | null {
  let best: Candidate | null = null, bd = Infinity;
  for (const m of marks) {
    if (m.kind !== "candidate" || (which === "point" && p.values(m.ref).kind !== "point")) continue;
    const t = termQ(p, m);
    const d = t ? Math.abs(N(t)) : Infinity;
    if (best === null || d < bd) { best = m; bd = d; }
  }
  return best;
}

function overlaps(a: Rect, b: Rect): boolean { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

/** Where a too-thin region's schematic is drawn: the top-right corner. */
export function insetBox(box: { w: number; h: number }, compact: boolean): Rect {
  const w = compact ? 50 : 120, h = compact ? 40 : 66;
  return { x: box.w - w - 4, y: 4, w, h };
}

/** Coefficients a·x + b·y + c = 0 of the object's line: from the general form when the type has it, else the item. */
function lineCoeffs(p: Pick<P, "values" | "scene">): { a: number; b: number; c: number; ref: ElementRef | null } | null {
  const item = p.scene.items.find(i => i.draw === "line");
  const gen = (name: string) => p.values({ rep: "gen", name });
  // A system of several lines: the first item is the main line (the general form, if any, is one line's).
  if (p.scene.items.filter(i => i.draw === "line").length <= 1) try {
    const a = gen("a"), b = gen("b"), c = gen("c");
    if (a.kind === "number" && b.kind === "number" && c.kind === "number") return { a: N(a.q), b: N(b.q), c: N(c.q), ref: item?.el ?? null };
  } catch { /* an object type without a general form */ }
  const v = item ? p.values(item.el) : null;
  if (!v || v.kind !== "segment") return null;
  const x1 = N(v.from.x), y1 = N(v.from.y), x2 = N(v.to.x), y2 = N(v.to.y);
  return { a: y2 - y1, b: x1 - x2, c: x2 * y1 - x1 * y2, ref: item!.el };
}

const pointOf = (v: ElementValue): XY | null => (v.kind === "point" ? { x: N(v.x), y: N(v.y) } : null);

/** A short word for an element: its label without the bracket ("x-intercept"). */
const short = (p: Pick<P, "labelOf">, r: ElementRef) => p.labelOf(r).replace(/\s*\(.*\)/, "");

/** A number as a child reads it: exact when its bottom number is small, else "≈ 6.00". */
const readablePoint = (v: ElementValue): string => (v.kind === "point" ? `(${readable(v.x)}, ${readable(v.y)})` : fmtValue(v));

/** "3 · 1 below" / "3 · exactly": a candidate's coordinate and how far the rule's quantity is from it. */
function candLabel(p: Pick<P, "values" | "terms" | "size" | "marks">, m: Candidate, measured: boolean): string {
  const arg = m.ref.args ? Object.values(m.ref.args)[0] : undefined;
  const v = p.values(m.ref);
  const axis = /AxisMark$/.test(m.ref.name) || v.kind === "segment";
  const what = axis && arg !== undefined ? readable(Qn.parse(arg)) : v.kind === "point" ? readablePoint(v) : arg !== undefined ? readable(Qn.parse(arg)) : "";
  const t = termQ(p as P, m);
  // Several values marked for one layer (a target and its neighbours: 11, 31, 41) are labelled by value alone; the
  // layer's own number is not a distance to each of them.
  const siblings = m.term ? p.marks.filter(x => x.kind === "candidate" && x.term === m.term).length : 1;
  if (!t || p.size === "compact" || measured || siblings > 1) return what;
  return Qn.isZero(t) ? `${what} · exactly` : `${what} · ${readable(Qn.abs(t))} away`;
}

export interface PlaneLayoutInput extends Pick<P, "rep" | "scene" | "values" | "marks" | "terms" | "size" | "project"> {
  readonly meaningOf?: (r: ElementRef) => string;
  readonly labelOf?: (r: ElementRef) => string;
  readonly box: { readonly w: number; readonly h: number };
}

export function planeLayout(input: PlaneLayoutInput): PlaneLayout | null {
  const labelOf = input.labelOf ?? ((r: ElementRef) => r.name);
  const p = { ...input, labelOf } as unknown as P;
  const L = lineCoeffs(p);
  if (!L) return null;
  const compact = p.size === "compact";
  const marks = localMarks(p, input.project);

  // ------------------------------------------------ the interesting points, from the rule's marks
  type Raw = Omit<PlanePoint, "px" | "py">;
  const raw = new Map<string, Raw>();
  const add = (r: Raw) => { const old = raw.get(r.id); if (!old || r.priority < old.priority) raw.set(r.id, old ? { ...r, label: r.label || old.label } : r); };
  const measuredRefs = new Set(marks.filter(m => m.kind === "measure").flatMap(m => markRefs(m).map(key)));
  // The nearest point candidate (smallest term) is the target: priority 1; the others are context.
  const nearest = nearestCandidate(p, marks, "point");
  const here = (r: ElementRef) => [r];
  for (const m of marks) {
    for (const r of markRefs(m).flatMap(here)) {
      const pt = pointOf(p.values(r));
      if (!pt) continue;
      const k = key(r);
      if (m.kind === "focus" || m.kind === "measure") {
        add({ id: k, ref: r, priority: 1, ...pt, kind: "focus", label: compact || r.args ? readablePoint(p.values(r)).replace(/^\((.*), 0\)$/, compact ? "$1" : "($1, 0)") : `${short(p, r)} ${readablePoint(p.values(r))}` });
      } else if (m.kind === "candidate") {
        add({ id: k, ref: r, priority: m === nearest ? 1 : 2, ...pt, kind: /AxisMark$/.test(r.name) ? "axis-cand" : "cand", label: candLabel(p, m, measuredRefs.has(k)) });
      } else if (m.kind === "note" && !compact && m.text.length <= NOTE_MAX) {
        add({ id: `${k}#note`, ref: r, priority: 2, ...pt, kind: "note", label: m.text });
      }
    }
  }
  // The representation's own landmarks: the origin and the line's intercepts (drawn, labelled on demand).
  const land: Raw[] = [{ id: "origin", ref: null, priority: 3, x: 0, y: 0, kind: "item", label: "" }];
  for (const it of p.scene.items) if (it.draw === "point" || it.draw === "tick") {
    const pt = pointOf(p.values(it.el));
    if (pt && !raw.has(key(it.el))) land.push({ id: key(it.el), ref: it.el, priority: 3, ...pt, kind: "item", label: `${short(p, it.el)} ${readablePoint(p.values(it.el))}` });
  }
  // A system of several lines: where each crosses the y-axis (or the x-axis), so every line is in the window.
  const lineEls = p.scene.items.filter(i => i.draw === "line");
  if (lineEls.length > 1) lineEls.forEach((it, i) => {
    const sv = segOf(p.values(it.el));
    if (!sv) return;
    const [a, b] = sv, dx = b.x - a.x, dy = b.y - a.y;
    const at = dx !== 0 ? { x: 0, y: a.y - (a.x * dy) / dx } : { x: a.x, y: 0 };
    land.push({ id: `line${i}`, ref: null, priority: 3, ...at, kind: "item", label: "" });
  });
  // The triangle the rule reads: its corners matter as much as its marks.
  const regionItem = p.scene.items.find(i => i.draw === "region");
  let world: XY[] | null = null;
  if (regionItem && p.values(regionItem.el).kind !== "undefined" && L.a !== 0 && L.b !== 0 && L.c !== 0) {
    world = [{ x: 0, y: 0 }, { x: -L.c / L.a, y: 0 }, { x: 0, y: -L.c / L.b }];
  }

  // The region's label: the rule's own note on it (fractions made readable), else its name and value; priority 1 when
  // the rule cites it.
  let regionLabel: { text: string; priority: 1 | 2 } | null = null;
  if (world && regionItem) {
    const rk = key(regionItem.el);
    const cites = marks.filter(m => markRefs(m).some(r => key(r) === rk));
    const note = cites.find((m): m is Extract<Mark, { kind: "note" }> => m.kind === "note");
    const v = p.values(regionItem.el);
    const text = compact
      ? (v.kind === "number" ? readable(v.q) : "")
      : note ? note.text.replace(/(-?\d+)\/(\d+)/g, (_, n: string, d: string) => readable(Qn.parse(`${n}/${d}`))) : `${short(p, regionItem.el)} ${v.kind === "number" ? readable(v.q) : ""}`;
    regionLabel = { text, priority: cites.length ? 1 : 2 };
  }

  // An area rule's triangle: its legs are what the area is made of, so the two intercepts are labelled as legs.
  if (world && regionItem && regionLabel?.priority === 1) {
    const legs: [string, string, XY][] = [["legX", "xInt", world[1]!], ["legY", "yInt", world[2]!]];
    for (const [leg, at, pt] of legs) {
      let v: ElementValue;
      try { v = p.values({ rep: p.rep, name: leg }); } catch { continue; }
      if (v.kind !== "number") continue;
      add({ id: key({ rep: "cart", name: at }), ref: { rep: "cart", name: at }, priority: 1, ...pt, kind: "item", label: `leg ${readable(v.q)}` });
    }
  }

  // ------------------------------------------------ the window
  const important = [...raw.values()].filter(r => r.priority <= 2);
  // The nearest square, when the rule cites one: side s, beside the triangle, its base on the x-axis.
  const sqMark = marks.find((m): m is Candidate => m.kind === "candidate" && (input.meaningOf?.(m.ref) ?? "").startsWith("squareOfSide"));
  let sqWorld: { x: number; y: number; side: number; ref: ElementRef } | null = null;
  if (sqMark && world && sqMark.ref.args?.s) {
    const side = N(Qn.parse(sqMark.ref.args.s)), gap = Math.max(0.15 * side, 0.5);
    sqWorld = { x: world[1]!.x < 0 ? gap : -side - gap, y: world[2]!.y < 0 ? -side : 0, side, ref: sqMark.ref };
  }
  const sqCorners: XY[] = sqWorld ? [{ x: sqWorld.x, y: sqWorld.y }, { x: sqWorld.x + sqWorld.side, y: sqWorld.y + sqWorld.side }] : [];
  const core: XY[] = [...important, ...(world ?? []), ...sqCorners];
  // Landmarks join the window unless they would shrink what matters more than 8-fold on an axis (and lie beyond 30 units).
  const span = (vs: number[]) => (vs.length ? Math.max(...vs) - Math.min(...vs) : 0);
  const fits = (pt: XY) => {
    if (!core.length) return true;
    for (const ax of ["x", "y"] as const) {
      const vs = core.map(c => c[ax]), s0 = span(vs), s1 = span([...vs, pt[ax]]);
      if (s1 > Math.max(8 * s0, 30)) return false;
    }
    return true;
  };
  const kept = land.filter(fits);
  const pad = compact ? 8 : 18;
  // With nothing else to show (a rule that reads no point here), the line's own intercepts frame it.
  let view = fitViewport({ points: [...core, ...kept], box: input.box, pad });
  if (sqWorld && !view.equal) {
    // A square drawn on unequal scales would be a rectangle: fit without it, and leave it to the words.
    sqWorld = null;
    const without = core.filter(c => !sqCorners.includes(c));
    view = fitViewport({ points: [...without, ...kept], box: input.box, pad });
  }
  const line = clipLine(view, L.a, L.b, L.c);
  const others = p.scene.items.filter(i => i.draw === "line").slice(1).map(it => {
    const sv = segOf(p.values(it.el));
    return { ref: it.el, seg: sv ? lineThrough(view, sv) : null };
  });

  const inView = (pt: XY) => pt.x >= view.x0 && pt.x <= view.x1 && pt.y >= view.y0 && pt.y <= view.y1;
  // When the rule cites nothing here, the landmarks (the intercepts) are what there is to read: labelled where there is room.
  const promote = raw.size === 0 && !regionLabel;
  const points: PlanePoint[] = [...raw.values(), ...kept.filter(k => k.id !== "origin").map(k => (promote ? { ...k, priority: 2 as const } : k))]
    .filter(inView).map(r => ({ ...r, px: view.sx(r.x), py: view.sy(r.y) }));

  // ------------------------------------------------ labels at rest
  const h = 13;
  // Two cited points at one place with the same words (y(1) and x(4) on y = −x + 5, both (1, 4)) get one label.
  const said: PlanePoint[] = [];
  const once = (pt: PlanePoint) => {
    if (said.some(o => o.label === pt.label && Math.hypot(o.px - pt.px, o.py - pt.py) < 6)) return false;
    said.push(pt);
    return true;
  };
  const reqs = points.filter(pt => pt.priority <= 2 && pt.label && once(pt)).map(pt => ({
    id: pt.id, x: pt.px, y: pt.py, w: textWidth(pt.label), h, priority: pt.priority as 1 | 2,
    prefer: (pt.kind === "axis-cand" && pt.ref?.name === "xAxisMark" ? "s" : pt.kind === "axis-cand" ? "w" : undefined) as "s" | "w" | undefined,
  }));
  const segs: Seg[] = [];
  if (line) segs.push(line);
  for (const o of others) if (o.seg) segs.push(o.seg);
  if (view.y0 <= 0 && view.y1 >= 0) segs.push({ x1: 0, y1: view.sy(0), x2: view.box.w, y2: view.sy(0) });
  if (view.x0 <= 0 && view.x1 >= 0) segs.push({ x1: view.sx(0), y1: 0, x2: view.sx(0), y2: view.box.h });
  const region = world && regionItem ? (() => {
    const px = world.map(w => ({ x: view.sx(w.x), y: view.sy(w.y) }));
    const ws = Math.abs(px[1]!.x - px[0]!.x), hs = Math.abs(px[2]!.y - px[0]!.y);
    return { ref: regionItem.el, pts: px, world, thin: Math.min(ws, hs) < 10 };
  })() : null;
  const texts = new Map(points.map(pt => [pt.id, pt.label]));
  if (region && regionLabel?.text) {
    // Anchored inside the triangle (its centroid), or at the right-angle corner of a thin one.
    const c = region.thin ? region.pts[0]! : { x: (region.pts[0]!.x + region.pts[1]!.x + region.pts[2]!.x) / 3, y: (region.pts[0]!.y + region.pts[1]!.y + region.pts[2]!.y) / 3 };
    reqs.push({ id: "region", x: c.x, y: c.y, w: textWidth(regionLabel.text), h, priority: regionLabel.priority, prefer: undefined });
    texts.set("region", regionLabel.text);
  }
  // A measure's words (the distance it brackets) are placed with the rest, at the bracket's middle.
  for (const m of marks) {
    if (m.kind !== "measure") continue;
    const a = pointOf(p.values(m.from)), b = pointOf(p.values(m.to));
    const t = termText(p, m);
    if (!a || !b || !t) continue;
    const id = `measure:${key(m.from)}-${key(m.to)}`;
    reqs.push({ id, x: (view.sx(a.x) + view.sx(b.x)) / 2, y: (view.sy(a.y) + view.sy(b.y)) / 2, w: textWidth(t), h, priority: 1, prefer: undefined });
    texts.set(id, t);
  }
  const offAxes: string[] = [];
  if (view.y0 > 0) offAxes.push("x-axis below (y = 0)"); else if (view.y1 < 0) offAxes.push("x-axis above (y = 0)");
  if (view.x0 > 0) offAxes.push("y-axis to the left (x = 0)"); else if (view.x1 < 0) offAxes.push("y-axis to the right (x = 0)");
  // Kept clear: the not-to-scale inset, the off-axis notes and the axes' numbers (labels go around them; a number a
  // label still covers, or that sits under a point, is left out below).
  const blocked: Rect[] = offAxes.map((t, i) => ({ x: 4, y: view.box.h - 14 - i * 12, w: textWidth(t), h: 12 }));
  if (region?.thin) blocked.push(insetBox(view.box, compact));
  if (sqWorld) {
    // The square's sides are obstacles too: no label crosses them.
    const x0 = view.sx(sqWorld.x), x1 = view.sx(sqWorld.x + sqWorld.side), y0 = view.sy(sqWorld.y + sqWorld.side), y1 = view.sy(sqWorld.y);
    segs.push({ x1: x0, y1: y0, x2: x1, y2: y0 }, { x1: x1, y1: y0, x2: x1, y2: y1 }, { x1: x0, y1: y1, x2: x1, y2: y1 }, { x1: x0, y1: y0, x2: x0, y2: y1 });
  }
  const allTicks = compact ? [] : tickLabels(view);
  if (sqWorld && !compact) {
    const t = `${readable(Qn.parse(sqWorld.ref.args!.s!))} × ${readable(Qn.parse(sqWorld.ref.args!.s!))}`;
    reqs.push({ id: "square", x: view.sx(sqWorld.x + sqWorld.side / 2), y: view.sy(sqWorld.y + sqWorld.side / 2), w: textWidth(t), h, priority: 2, prefer: undefined });
    texts.set("square", t);
  }
  const placed = placeLabels(reqs, segs, view.box, [...blocked, ...allTicks.map(t => t.box)]);
  const labels: PlaneLabel[] = placed.map((l, i) => ({ ...l, text: texts.get(l.id)!, ax: reqs[i]!.x, ay: reqs[i]!.y }));


  const covers = [...labels.filter(l => l.shown).map(l => l.box), ...blocked, ...points.map(pt => ({ x: pt.px - 5, y: pt.py - 5, w: 10, h: 10 }))];
  const ticks = allTicks.filter(t => !covers.some(c => overlaps(c, t.box)));
  const sqV = sqWorld ? p.values(sqWorld.ref) : null;
  const square = sqWorld ? {
    x: view.sx(sqWorld.x), y: view.sy(sqWorld.y + sqWorld.side), side: view.sx(sqWorld.side) - view.sx(0), ref: sqWorld.ref,
    label: `${readable(Qn.parse(sqWorld.ref.args!.s!))} × ${readable(Qn.parse(sqWorld.ref.args!.s!))} = ${sqV?.kind === "number" ? readable(sqV.q) : ""}`,
  } : null;
  return { view, line, lineRef: L.ref, others, points, labels, region, offAxes, marks, ticks, square };
}

// ------------------------------------------------------------------ drawing

const tickText = (t: number) => {
  const r = Math.abs(t) >= 1000 ? Math.round(t).toLocaleString("en-US") : String(Math.round(t * 1000) / 1000);
  return t < 0 ? `−${r.replace("-", "")}` : r;
};


/** The grid, the axes and their numbers; a tick number under a placed label is left out (the label matters more). */
function Grid({ v, ticks }: { v: Viewport; ticks: readonly TickLabel[] }) {
  const out: ReactElement[] = [];
  for (const x of v.xTicks) if (x !== 0) out.push(<line key={`gx${x}`} className="grid" x1={v.sx(x)} x2={v.sx(x)} y1={0} y2={v.box.h} />);
  for (const y of v.yTicks) if (y !== 0) out.push(<line key={`gy${y}`} className="grid" y1={v.sy(y)} y2={v.sy(y)} x1={0} x2={v.box.w} />);
  if (v.y0 <= 0 && v.y1 >= 0) out.push(<line key="ax" className="axis" x1={0} x2={v.box.w} y1={v.sy(0)} y2={v.sy(0)} />);
  if (v.x0 <= 0 && v.x1 >= 0) out.push(<line key="ay" className="axis" y1={0} y2={v.box.h} x1={v.sx(0)} x2={v.sx(0)} />);
  for (const t of ticks) out.push(<text key={`t${t.anchor}${t.text}`} className="tick-label" x={t.x} y={t.y} textAnchor={t.anchor}>{t.text}</text>);
  return <g aria-hidden="true">{out}</g>;
}

const segOf = (v: ElementValue): [XY, XY] | null => (v.kind === "segment" ? [{ x: N(v.from.x), y: N(v.from.y) }, { x: N(v.to.x), y: N(v.to.y) }] : null);
const lineThrough = (v: Viewport, s: [XY, XY]) => {
  const a = s[1].y - s[0].y, b = s[0].x - s[1].x, c = s[1].x * s[0].y - s[0].x * s[1].y;
  return clipLine(v, a, b, c);
};

/**
 * Each line item's colour (0, 1, …) on a plane of several lines: by item order, except across a move (`before`), where
 * a line keeps the colour it had although the canonical order of a system's lines may have flipped: an unchanged line
 * keeps its colour, then a line parallel to one before (a slide) takes that one's, then the rest in order. The colours
 * hold within one drawing of a move (before and after); a stored state is canonical and remembers no colours, so a
 * drawing of one state alone colours by item order.
 */
export function lineColours(now: readonly ElementValue[], before?: readonly ElementValue[]): number[] {
  const n = now.length;
  if (!before || before.length !== n) return now.map((_, i) => i);
  const out: (number | null)[] = now.map(() => null), used = new Set<number>();
  const dir = (v: ElementValue) => { const s = segOf(v); return s ? { x: s[1].x - s[0].x, y: s[1].y - s[0].y } : null; };
  const parallel = (a: ElementValue, b: ElementValue) => { const u = dir(a), w = dir(b); return !!u && !!w && Math.abs(u.x * w.y - u.y * w.x) <= 1e-9 * (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y)); };
  const pass = (same: (a: ElementValue, b: ElementValue) => boolean) => {
    now.forEach((v, i) => {
      if (out[i] !== null) return;
      const j = before.findIndex((b, j) => !used.has(j) && same(v, b));
      if (j >= 0) { out[i] = j; used.add(j); }
    });
  };
  pass((a, b) => fmtValue(a) === fmtValue(b));
  pass(parallel);
  pass(() => true);
  return out as number[];
}

function Scene({ p }: { p: P }) {
  const box = planeRenderer.box[p.size];
  const L = planeLayout({ ...p, box });
  const lineItem = p.scene.items.find(i => i.draw === "line");
  if (!L) return <div className="v2v-undef">{lineItem ? fmtValue(p.values(lineItem.el)) : "nothing to draw"}</div>;
  const { view: v, marks } = L;
  const q: P = { ...p, marks };
  const placed = new Set<string>();
  const drawnNotes = new Set<string>();
  const back: ReactElement[] = [], front: ReactElement[] = [];

  if (L.square) {
    placed.add(key(L.square.ref));
    back.push(<rect key="square" className="square" x={L.square.x} y={L.square.y} width={L.square.side} height={L.square.side} {...elAttrs(q, L.square.ref)} {...hover(q, L.square.ref)}><title>{`the nearest square: ${L.square.label}`}</title></rect>);
    const sl = L.labels.find(l => l.id === "square");
    if (sl?.shown) front.push(<text key="square-label" className="cand-label label-halo" x={sl.box.x + 1} y={sl.box.y + sl.box.h - 3}>{sl.text}</text>);
  }
  if (L.region) {
    placed.add(key(L.region.ref));
    const regionValue = p.values(L.region.ref);
    const val = regionValue.kind === "number" ? readable(regionValue.q) : fmtValue(regionValue);
    if (!L.region.thin) {
      back.push(<polygon key="region" className="region" points={L.region.pts.map(x => `${x.x},${x.y}`).join(" ")} {...elAttrs(q, L.region.ref)} {...hover(q, L.region.ref)}><title>{`${p.labelOf(L.region.ref)}: ${val}`}</title></polygon>);
      // The legs the area is made of, along the axes.
      const [o, xi, yi] = L.region.pts;
      back.push(<line key="legx" className="leg" x1={o!.x} y1={o!.y} x2={xi!.x} y2={xi!.y} />, <line key="legy" className="leg" x1={o!.x} y1={o!.y} x2={yi!.x} y2={yi!.y} />);
    } else {
      // Too thin to see at this scale: a schematic in the corner, each side stretched, said to be not to scale.
      const ib = insetBox(v.box, p.size === "compact"), IW = ib.w, IH = ib.h, X = ib.x, Y = ib.y, m = 6;
      const ws = L.region.world, xs = ws.map(w => w.x), ys = ws.map(w => w.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      // Room for a line of words under the stretched triangle, in both sizes: an inset with no words read as an empty box.
      const foot = p.size === "compact" ? 9 : 11;
      const at = ws.map(w => ({ x: X + m + ((w.x - x0) / (x1 - x0 || 1)) * (IW - 2 * m), y: Y + m + ((y1 - w.y) / (y1 - y0 || 1)) * (IH - 2 * m - foot) }));
      const [o, xi, yi] = at;
      front.push(
        <g key="inset" className="inset">
          <rect className="inset-box" x={X} y={Y} width={IW} height={IH} />
          <polygon className="region" points={at.map(c => `${c.x},${c.y}`).join(" ")} {...elAttrs(q, L.region.ref)} {...hover(q, L.region.ref)}><title>{`${p.labelOf(L.region.ref)}: ${val} (drawn not to scale)`}</title></polygon>
          <line className="leg" x1={o!.x} y1={o!.y} x2={xi!.x} y2={xi!.y} />
          <line className="leg" x1={o!.x} y1={o!.y} x2={yi!.x} y2={yi!.y} />
          <text className="note inset-label" x={X + 3} y={Y + IH - 3}>{p.size === "compact" ? val : `area ${val}, not to scale`}</text>
        </g>,
      );
    }
  }

  // Every line of the scene (a system has several), each in its colour; across a move, a line keeps its colour.
  const lineItems = p.scene.items.filter(i => i.draw === "line");
  const many = lineItems.length > 1;
  const nowVals = lineItems.map(i => p.values(i.el));
  const beforeVals = p.before ? lineItems.map(i => { try { return p.before!(i.el); } catch { return { kind: "undefined", reason: "" } as ElementValue; } }) : undefined;
  const colour = lineColours(nowVals, beforeVals);
  const tone = (c: number) => (many ? String(c + 1) : undefined);
  if (beforeVals) {
    // Where a moved line was: each line before that no line now is, faint, in its colour.
    const kept = new Set(nowVals.map(v => fmtValue(v)));
    beforeVals.forEach((b, j) => {
      const s = segOf(b);
      if (!s || kept.has(fmtValue(b)) || !nowVals.some(v => segOf(v))) return;
      const c = lineThrough(v, s);
      if (c) back.push(<line key={`was${j}`} className="line-was" data-line={tone(j)} {...c} />);
    });
  }
  if (p.next) lineItems.forEach((it, i) => {
    let nx: ElementValue;
    try { nx = p.next!(it.el); } catch { return; }
    const s = segOf(nx);
    if (!s || fmtValue(nx) === fmtValue(p.values(it.el))) return;
    const c = lineThrough(v, s);
    // Unlabelled on the drawing (a word there would sit on the axes' numbers): the move's words are beside the face.
    if (c) back.push(<g key={`next${i}`} data-next="" data-line={tone(colour[i]!)}><line className="line-next" {...c} /><title>the line after the next move</title></g>);
  });

  // Ghost lines (candidate segments: the line of gradient g through the same y-intercept).
  const ghosts = marks.filter((m): m is Candidate => m.kind === "candidate" && p.values(m.ref).kind === "segment");
  let nearestGhost: Mark | null = null, best = Infinity;
  for (const g of ghosts) { const t = termQ(p, g); const d = t ? Math.abs(N(t)) : Infinity; if (d < best) { best = d; nearestGhost = g; } }
  for (const m of ghosts) {
    const s = segOf(p.values(m.ref))!;
    const c = lineThrough(v, s);
    if (!c) continue;
    placed.add(key(m.ref));
    const t = candLabel(p, m, false);
    const at = { x: c.x1 + (c.x2 - c.x1) * 0.82, y: c.y1 + (c.y2 - c.y1) * 0.82 };
    back.push(
      <g key={`g${key(m.ref)}`} {...elAttrs(q, m.ref)} {...hover(q, m.ref)}>
        <line className="ghost" data-near={m === nearestGhost ? "" : undefined} {...c} />
        {p.size === "expanded" && <text className="cand-label label-halo" x={Math.min(at.x + 4, v.box.w - textWidth(t))} y={Math.max(at.y - 4, 10)}>{t}</text>}
        <title>{p.labelOf(m.ref)}</title>
      </g>,
    );
  }

  const drawLine = (ref: ElementRef, seg: Seg, i: number) => {
    placed.add(key(ref));
    const st = markState(marks, ref);
    back.push(
      <g key={`line${i}`} data-line={tone(colour[i]!)} {...elAttrs(q, ref, { changedFrom: !many })} data-changed={many && beforeVals && !beforeVals.some(b => fmtValue(b) === fmtValue(nowVals[i]!)) ? "" : undefined} {...hover(q, ref)}>
        <line className="hit" {...seg} />
        <line className="line" data-focus={st.focus ? "" : undefined} {...seg} />
        <title>{p.labelOf(ref)}</title>
      </g>,
    );
  };
  if (L.line && L.lineRef) drawLine(L.lineRef, L.line, 0);
  L.others.forEach((o, i) => { if (o.seg) drawLine(o.ref, o.seg, i + 1); });

  const labelOf = new Map(L.labels.map(l => [l.id, l]));
  // Measures: a bracket between two points, labelled with the term.
  for (const m of marks) {
    if (m.kind !== "measure") continue;
    const a = pointOf(p.values(m.from)), b = pointOf(p.values(m.to));
    if (!a || !b) continue;
    const A = { x: v.sx(a.x), y: v.sy(a.y) }, B = { x: v.sx(b.x), y: v.sy(b.y) };
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1, off = 7;
    const nx = (-(B.y - A.y) / len) * off, ny = ((B.x - A.x) / len) * off;
    const flip = ny < 0 || (ny === 0 && nx > 0) ? -1 : 1;
    const ox = nx * flip, oy = ny * flip;
    front.push(
      <g key={`m${key(m.from)}-${key(m.to)}`} data-mark="measure" data-term={m.term}>
        <path className="measure" d={`M${A.x},${A.y} l${ox},${oy} L${B.x + ox},${B.y + oy} l${-ox},${-oy}`} />
        {(() => { const ml = labelOf.get(`measure:${key(m.from)}-${key(m.to)}`); return ml ? <text className="measure-label label-halo" data-priority={1} x={ml.box.x + 1} y={ml.box.y + ml.box.h - 3}>{ml.text}</text> : null; })()}
      </g>,
    );
  }

  // Points: each drawn once, with its label where the placer put it.
  const rl = labelOf.get("region");
  if (rl?.shown && L.region) {
    front.push(<text key="region-label" className="region-label label-halo" data-priority={rl.priority} x={rl.box.x + 1} y={rl.box.y + rl.box.h - 3} {...elAttrs(q, L.region.ref)}>{rl.text}</text>);
    const n = marks.find((m): m is Extract<Mark, { kind: "note" }> => m.kind === "note" && key(m.ref) === key(L.region!.ref));
    if (n) drawnNotes.add(n.text);
  }
  const drawn = new Set<string>();
  for (const pt of L.points) {
    if (!pt.ref) continue;
    const k = key(pt.ref);
    const lab = labelOf.get(pt.id);
    const labelEl = lab && lab.shown ? (
      <>
        {lab.leader && <line className="leader" x1={pt.px} y1={pt.py} x2={Math.min(Math.max(pt.px, lab.box.x), lab.box.x + lab.box.w)} y2={Math.min(Math.max(pt.py, lab.box.y), lab.box.y + lab.box.h)} />}
        <text className={pt.kind === "note" ? "note label-halo" : "cand-label label-halo"} data-priority={pt.priority} x={lab.box.x + 1} y={lab.box.y + lab.box.h - 3}>{lab.text}</text>
      </>
    ) : null;
    if (pt.kind === "note") { if (labelEl) { drawnNotes.add(lab!.text); front.push(<g key={pt.id}>{labelEl}</g>); } continue; }
    if (drawn.has(k)) continue;
    drawn.add(k);
    placed.add(k);
    const st = markState(marks, pt.ref);
    const axisMark = /AxisMark$/.test(pt.ref.name), isX = pt.ref.name === "xAxisMark";
    const X = pt.px, Y = pt.py;
    front.push(
      <g key={`p${k}`} data-priority={pt.priority} {...elAttrs(q, pt.ref)} {...hover(q, pt.ref)}>
        {axisMark
          ? <line className="cand" x1={isX ? X : X - 5} x2={isX ? X : X + 5} y1={isX ? Y - 5 : Y} y2={isX ? Y + 5 : Y} />
          : st.cand ? <circle className="cand" cx={X} cy={Y} r={3.6} /> : <circle className="dot" data-focus={st.focus ? "" : undefined} cx={X} cy={Y} r={p.size === "compact" ? 2.4 : 3} />}
        {st.focus && <circle className="ring" cx={X} cy={Y} r={6} />}
        {labelEl}
        <title>{`${p.labelOf(pt.ref)}: ${fmtValue(p.values(pt.ref))}`}</title>
      </g>,
    );
  }

  const caption = p.size === "expanded" && !v.equal
    ? `Scales differ: across, one square is ${tickText(v.xStep)}; up, one square is ${tickText(v.yStep)}.`
    : null;
  return (
    <>
      <svg className="v2v-plane" width={v.box.w} height={v.box.h} viewBox={`0 0 ${v.box.w} ${v.box.h}`} role="img" aria-label={planeText(p.scene, p.values)}
        data-scales={v.equal ? "equal" : "independent"}>
        <Grid v={v} ticks={L.ticks} />
        {back}
        {front}
        {p.size === "expanded" && L.offAxes.map((t, i) => <text key={t} className="note label-halo" x={4} y={v.box.h - 4 - i * 12}>{t}</text>)}
      </svg>
      {caption && <p className="v2v-scale-note">{caption}</p>}
      <Readouts p={q} placed={placed} drawnNotes={drawnNotes} />
    </>
  );
}

function planeText(scene: Plane, values: (r: ElementRef) => ElementValue): string {
  const parts: string[] = [];
  const many = scene.items.filter(i => i.draw === "line").length > 1;
  let n = 0;
  for (const it of scene.items) {
    const v = values(it.el);
    if (it.draw === "line") {
      n++;
      parts.push(v.kind === "segment" ? `${many ? `line ${n}` : "a line"} through ${fmtValue({ kind: "point", ...v.from })} and ${fmtValue({ kind: "point", ...v.to })}` : fmtValue(v));
    } else if (v.kind !== "undefined") {
      parts.push(`${it.el.name} ${fmtValue(v)}`);
    }
  }
  return parts.join("; ");
}

export const planeRenderer: SceneRenderer<Plane> = {
  kind: "plane",
  box: { compact: { w: 160, h: 100 }, expanded: { w: 340, h: 236 } },
  render: p => <Scene p={p} />,
  text: (scene, values) => planeText(scene, values),
};
