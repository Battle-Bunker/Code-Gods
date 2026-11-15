/**
 * The five lens moves (lenses-and-mutators.md §5: turn, fold, swap, lean, zoom) drawn on the plane and said for a
 * 12-year-old. Each sketch shows the old line faint and the new line bold, plus what the move holds still or measures:
 * - turn: the pin (or the origin) and an arc with its sense; about the origin, the two dotted perpendiculars from O,
 *   the same length, because a turn about O keeps the line's distance from O;
 * - fold: the dashed crease (or mirror) and one pair of twin dots, ticked at equal distances either side of it;
 * - swap (gradient with y-intercept): the point above x = 1 both lines share, at height m + c, with its vertical guide;
 *   swap (b with c): the two y-intercepts, one the other turned upside down;
 * - lean: the pin where the line crosses the x-axis, "1 up" from it, and the arrow of how much further sideways;
 * - zoom: dotted rays from O through both crossings, with arrows from the old crossings to the new.
 * `sketchMove` is pure (world coordinates, exact numbers in its words) so tests check it against the line the mutator
 * really makes; `MoveSketch` draws it. Any other move draws nothing (null): its own view already shows it.
 */
import { Qn, q, type Q } from "@workspace/v2-core";
import { turnAngleWords, type Line } from "@workspace/v2-linear";
import { fmtQ, MINUS } from "./format.ts";
import { clipLine, fitViewport, type XY } from "./plot/viewport.ts";

export interface SketchPoint extends XY { readonly role: "pin" | "shared" | "origin" | "old" | "new"; readonly label?: string }
export interface SketchGuide {
  readonly role: "perp" | "pair" | "arrow" | "guide";
  readonly from: XY;
  readonly to: XY;
  readonly label?: string;
  /** Which side of an upright guide its label sits (left unless said). */
  readonly side?: "left" | "right";
}
export interface Sketch {
  readonly kind: "turn" | "fold" | "swap" | "lean" | "zoom";
  readonly before: Line;
  readonly after: Line;
  readonly points: readonly SketchPoint[];
  readonly guides: readonly SketchGuide[];
  /** The crease or mirror, drawn dashed across the window. */
  readonly crease?: Line;
  /** The turn: about a centre, from the old line's direction (world radians), by `sweep` radians, anticlockwise or not. */
  readonly arc?: { readonly centre: XY; readonly start: number; readonly sweep: number; readonly ccw: boolean; readonly label: string };
  /** What a 12-year-old reads under the picture. */
  readonly words: string;
}
export interface SketchCall { readonly mutator: string; readonly args: Readonly<Record<string, string>> }

const N = (x: Q) => Qn.toNumber(x);
const yAt = (l: Line, x: Q): Q | null => (l.b === 0n ? null : Qn.div(Qn.neg(Qn.add(Qn.mul(q(l.a), x), q(l.c))), q(l.b)));
const xAt = (l: Line, y: Q): Q | null => (l.a === 0n ? null : Qn.div(Qn.neg(Qn.add(Qn.mul(q(l.b), y), q(l.c))), q(l.a)));
const slopeOf = (l: Line): Q | null => (l.b === 0n ? null : q(-l.a, l.b));
const pt = (x: Q, y: Q) => ({ x: N(x), y: N(y) });
const at = (x: Q, y: Q) => `(${fmtQ(x)}, ${fmtQ(y)})`;
/** The angle of the line's direction (world radians), pointing right (or up, for an upright line). */
const dirAngle = (l: Line) => (l.b === 0n ? Math.PI / 2 : Math.atan(-Number(l.a) / Number(l.b)));

/** "y = 2x + 5", "y = −x", "x = 3", "y = 4" as a person writes it. */
export function lineWords(l: Line): string {
  if (l.b === 0n) return `x = ${fmtQ(q(-l.c, l.a))}`;
  const m = slopeOf(l)!, c = yAt(l, Qn.ZERO)!;
  const mt = Qn.isZero(m) ? "" : Qn.eq(m, Qn.ONE) ? "x" : Qn.eq(m, q(-1)) ? `${MINUS}x` : `${fmtQ(m)}x`;
  if (!mt) return `y = ${fmtQ(c)}`;
  if (Qn.isZero(c)) return `y = ${mt}`;
  return `y = ${mt} ${c.n < 0n ? MINUS : "+"} ${fmtQ(Qn.abs(c))}`;
}

/** The point of a line nearest the origin. */
function foot(l: Line): XY {
  const a = Number(l.a), b = Number(l.b), c = Number(l.c), n2 = a * a + b * b;
  return { x: (-a * c) / n2, y: (-b * c) / n2 };
}
/** A point reflected in the line A·x + B·y + C = 0. */
function reflect(p: XY, m: Line): XY {
  const A = Number(m.a), B = Number(m.b), C = Number(m.c), s = (A * p.x + B * p.y + C) / (A * A + B * B);
  return { x: p.x - 2 * A * s, y: p.y - 2 * B * s };
}
const parse = (s: string | undefined): Q | null => { try { return s === undefined ? null : Qn.parse(s); } catch { return null; } };
function parseLine(s: string): Line | null {
  const p = s.split(",").map(x => x.trim());
  return p.length === 3 && p.every(x => /^-?\d+$/.test(x)) ? { a: BigInt(p[0]!), b: BigInt(p[1]!), c: BigInt(p[2]!) } : null;
}
/** "3 up for every 4 across" for a gradient 3/4 (its sign said by the turn's direction). */
const riseRun = (t: Q) => `${Qn.abs(t).n} up for every ${t.d} across`;
/** "twice", "3 times", "half", "⅔ of" as far. */
function times(f: Q): string {
  const a = Qn.abs(f);
  if (Qn.eq(a, q(2))) return "twice as far";
  if (Qn.eq(a, q(1, 2))) return "half as far";
  return Qn.cmp(a, Qn.ONE) > 0 ? `${fmtQ(a)} times as far` : `${fmtQ(a)} as far`;
}

function turnSketch(before: Line, after: Line, a: SketchCall["args"]): Sketch | null {
  const quarter = a.turn === "left" || a.turn === "right";
  const t = quarter ? null : parse(a.turn);
  if (!quarter && !t) return null;
  const ccw = quarter ? a.turn === "left" : Qn.sign(t!) > 0;
  const sweep = quarter ? Math.PI / 2 : Math.atan(Math.abs(N(t!)));
  // The angle as the log note says it (turnAngleWords: "45° (one eighth turn)", "about 37°"), and the slope it matches.
  const angle = quarter ? `${turnAngleWords(a.turn!)}, a right angle` : `${turnAngleWords(t!)} (the angle of a slope that goes ${riseRun(t!)})`;
  const arcLabel = quarter ? "¼ turn" : turnAngleWords(t!).replace(/^about /, "≈").replace(/ \(.*\)$/, "");
  const sense = ccw ? "anticlockwise" : "clockwise";
  const slopeNow = slopeOf(after);
  const ends = slopeNow ? ` Now the line goes ${slopeNow.n < 0n ? "down" : "up"} ${fmtQ(Qn.abs(slopeNow))} for every 1 across: ${lineWords(after)}.` : ` Now it stands upright: ${lineWords(after)}.`;
  if (a.centre === "origin") {
    if (before.c === 0n) return null;
    const f0 = foot(before), f1 = foot(after);
    const O = { x: 0, y: 0 };
    return {
      kind: "turn", before, after,
      points: [{ ...O, role: "origin", label: "O" }],
      guides: [{ role: "perp", from: O, to: f0 }, { role: "perp", from: O, to: f1 }],
      arc: { centre: O, start: Math.atan2(f0.y, f0.x), sweep, ccw, label: arcLabel },
      words: `Turn the whole line around the origin O, like a clock hand pinned at O, ${quarter ? turnAngleWords(a.turn!) : `by ${angle}`}, ${sense}. The line stays the same distance from O: the two dotted lines from O are the same length.${ends}`,
    };
  }
  const x0 = parse(a.centre);
  const y0 = x0 && yAt(before, x0);
  if (!x0 || !y0) return null;
  // About a pin, either quarter turn makes the same line (the perpendicular), so its sense is drawn anticlockwise.
  return {
    kind: "turn", before, after,
    points: [{ ...pt(x0, y0), role: "pin", label: at(x0, y0) }],
    guides: [],
    arc: { centre: pt(x0, y0), start: dirAngle(before), sweep, ccw: quarter ? true : ccw, label: arcLabel },
    words: `Stick a pin in the line at ${at(x0, y0)} and turn the line around it${quarter ? `, ${angle}` : `, ${sense}, by ${angle}`}. The pin stays put.${ends}`,
  };
}

function foldSketch(before: Line, after: Line, a: SketchCall["args"]): Sketch | null {
  let crease: Line, pins: SketchPoint[] = [], where: string;
  if (typeof a.mirror === "string") {
    const m = parseLine(a.mirror);
    if (!m) return null;
    crease = m; where = `the dashed mirror ${lineWords(m)}`;
  } else {
    const x0 = parse(a.x0), s = parse(a.s), y0 = x0 && yAt(before, x0);
    if (!x0 || !s || !y0) return null;
    // s·x − y + (y0 − s·x0) = 0, in whole numbers.
    const c = Qn.sub(y0, Qn.mul(s, x0)), L = s.d * c.d / gcdBig(s.d, c.d);
    crease = { a: s.n * (L / s.d), b: -L, c: c.n * (L / c.d) };
    pins = [{ ...pt(x0, y0), role: "pin", label: at(x0, y0) }];
    where = `a ${Qn.isZero(s) ? "level" : `${fmtQ(s)} gradient`} dashed crease through the line's point ${at(x0, y0)}`;
  }
  // A dot on the old line, away from the crease, and its twin on the new line.
  const base = pins[0] ?? foot(before);
  const d = dirAngle(before), step = Math.max(2, Math.hypot(base.x, base.y) / 2);
  let A = { x: base.x + step * Math.cos(d), y: base.y + step * Math.sin(d) };
  if (Math.hypot(reflect(A, crease).x - A.x, reflect(A, crease).y - A.y) < 1e-9) A = { x: base.x - step * Math.cos(d), y: base.y - step * Math.sin(d) };
  const B = reflect(A, crease);
  return {
    kind: "fold", before, after, crease,
    points: [...pins, { ...A, role: "old" }, { ...B, role: "new" }],
    guides: [{ role: "pair", from: A, to: B }],
    words: `Fold the paper along ${where}: the old line lands exactly on the new one, ${lineWords(after)}. Each dot on the old line meets its twin on the new line, the same distance from the crease on the other side (the ticks).`,
  };
}
function gcdBig(x: bigint, y: bigint): bigint { x = x < 0n ? -x : x; y = y < 0n ? -y : y; while (y) [x, y] = [y, x % y]; return x || 1n; }

function swapSketch(before: Line, after: Line, a: SketchCall["args"]): Sketch | null {
  const c0 = yAt(before, Qn.ZERO), c1 = yAt(after, Qn.ZERO);
  const ints: SketchPoint[] = [
    ...(c0 ? [{ ...pt(Qn.ZERO, c0), role: "old" as const, label: fmtQ(c0) }] : []),
    ...(c1 ? [{ ...pt(Qn.ZERO, c1), role: "new" as const, label: fmtQ(c1) }] : []),
  ];
  if (a.pair === "m-c") {
    const m = slopeOf(before);
    if (!m || !c0) return null;
    const h = Qn.add(m, c0);
    return {
      kind: "swap", before, after,
      points: [{ ...pt(Qn.ONE, h), role: "shared", label: at(Qn.ONE, h) }, ...ints],
      guides: [{ role: "guide", from: { x: 1, y: 0 }, to: pt(Qn.ONE, h), label: "x = 1", side: "right" }],
      words: `Swap the slope and the starting height: ${lineWords(before)} becomes ${lineWords(after)}. Both lines pass through the same point above x = 1, at height ${fmtQ(h)} (${fmtQ(m)} ${c0.n < 0n ? MINUS : "+"} ${fmtQ(Qn.abs(c0))}), so that point stays put.`,
    };
  }
  if (a.pair === "b-c") {
    const flip = c0 && c1 && !Qn.isZero(c0) ? `the height where it crosses the y-axis turns upside down, from ${fmtQ(c0)} to ${fmtQ(c1)}` : "the line swings round to a new place";
    return {
      kind: "swap", before, after, points: ints, guides: [],
      words: `Swap two numbers of the equation ax + by + c = 0 (b and c): ${flip}, and the slope changes with it. ${lineWords(before)} becomes ${lineWords(after)}.`,
    };
  }
  return null;
}

function leanSketch(before: Line, after: Line, a: SketchCall["args"]): Sketch | null {
  const k = parse(a.k), x0 = xAt(before, Qn.ZERO);
  const x1old = xAt(before, Qn.ONE), x1new = xAt(after, Qn.ONE);
  if (!k || !x0 || !x1old || !x1new) return null;
  const side = Qn.sign(k) > 0 ? "left" : "right";
  return {
    kind: "lean", before, after,
    points: [{ ...pt(x0, Qn.ZERO), role: "pin", label: at(x0, Qn.ZERO) }],
    guides: [
      { role: "guide", from: pt(x0, Qn.ZERO), to: pt(x0, Qn.ONE), label: "1 up" },
      { role: "arrow", from: pt(x1old, Qn.ONE), to: pt(x1new, Qn.ONE), label: `${fmtQ(Qn.abs(k))} further ${side}` },
    ],
    words: `Pin the line where it crosses the x-axis, at ${at(x0, Qn.ZERO)}, and lean it: for every 1 up, the line now goes ${fmtQ(Qn.abs(k))} further ${side} (the arrow at height 1). It becomes ${lineWords(after)}.`,
  };
}

function zoomSketch(before: Line, after: Line, a: SketchCall["args"]): Sketch | null {
  const f = parse(a.f);
  if (!f) return null;
  const guides: SketchGuide[] = [], said: string[] = [];
  const xs = [xAt(before, Qn.ZERO), xAt(after, Qn.ZERO)], ys = [yAt(before, Qn.ZERO), yAt(after, Qn.ZERO)];
  if (xs[0] && xs[1] && !Qn.isZero(xs[0])) { guides.push({ role: "arrow", from: pt(xs[0], Qn.ZERO), to: pt(xs[1], Qn.ZERO), label: `×${fmtQ(f)}` }); said.push(`from ${fmtQ(xs[0])} to ${fmtQ(xs[1])} on the x-axis`); }
  if (ys[0] && ys[1] && !Qn.isZero(ys[0])) { guides.push({ role: "arrow", from: pt(Qn.ZERO, ys[0]), to: pt(Qn.ZERO, ys[1]), label: `×${fmtQ(f)}` }); said.push(`from ${fmtQ(ys[0])} to ${fmtQ(ys[1])} on the y-axis`); }
  if (!guides.length) return null;
  const flip = Qn.sign(f) < 0 ? " The number is below 0, so everything also flips to the other side of O." : "";
  return {
    kind: "zoom", before, after,
    points: [{ x: 0, y: 0, role: "origin", label: "O" }],
    guides,
    words: `Zoom from the origin O: everything ends up ${times(f)} from the origin, so the line's crossings move ${said.join(" and ")} (the arrows), and it keeps the same slope.${flip} It becomes ${lineWords(after)}.`,
  };
}

/** The sketch of a lens move from the line before to the line after, or null for a move that is not one. */
export function sketchMove(before: Line, after: Line, call: SketchCall): Sketch | null {
  switch (call.mutator) {
    case "rot.turn": return turnSketch(before, after, call.args);
    case "fold": return foldSketch(before, after, call.args);
    case "coef.swap": return swapSketch(before, after, call.args);
    case "basis.lean": return leanSketch(before, after, call.args);
    case "basis.zoom": return zoomSketch(before, after, call.args);
    default: return null;
  }
}

const W = 320, H = 240, PAD = 36;

/** The sketch drawn: axes, the old line faint, the new line bold, the move's own marks, and its words beneath. */
export function MoveSketch({ before, after, call }: { before: Line; after: Line; call: SketchCall }) {
  const s = sketchMove(before, after, call);
  if (!s) return null;
  const crossings = (l: Line) => [
    ...(l.a !== 0n ? [{ x: -Number(l.c) / Number(l.a), y: 0 }] : []),
    ...(l.b !== 0n ? [{ x: 0, y: -Number(l.c) / Number(l.b) }] : []),
  ];
  // About a centre, both lines a little way either side of it, so the arc and the turn are seen whole.
  const around = (c: XY) => [before, after].flatMap(l => {
    const d = dirAngle(l), r = Math.max(2, Math.hypot(c.x, c.y) / 2);
    const p = l.b === 0n ? { x: -Number(l.c) / Number(l.a), y: c.y } : { x: c.x, y: (-Number(l.a) * c.x - Number(l.c)) / Number(l.b) };
    return [-1, 1].map(k => ({ x: p.x + k * r * Math.cos(d), y: p.y + k * r * Math.sin(d) }));
  });
  const v = fitViewport({
    points: [{ x: 0, y: 0 }, ...crossings(before), ...crossings(after), ...s.points, ...s.guides.flatMap(g => [g.from, g.to]), ...(s.arc ? around(s.arc.centre) : [])],
    box: { w: W, h: H }, pad: PAD,
  });
  const seg = (l: Line) => clipLine(v, Number(l.a), Number(l.b), Number(l.c));
  const old = seg(before), now = seg(after), crease = s.crease && seg(s.crease);
  const P = (p: XY) => ({ x: v.sx(p.x), y: v.sy(p.y) });
  // Screen scale per world unit, across and up (the y axis points down on screen).
  const kx = v.sx(1) - v.sx(0), ky = v.sy(0) - v.sy(1);
  let arcPath: string | null = null, arcLabel: XY | null = null, arcAnchor: "start" | "end" | "middle" = "middle";
  if (s.arc) {
    const c = P(s.arc.centre), n = 24, dir = s.arc.ccw ? 1 : -1;
    // Between the perpendiculars about the origin (half their length), else a fixed size about the pin.
    const perp = s.guides.find(g => g.role === "perp");
    const r = perp ? Math.min(60, Math.max(24, Math.hypot(P(perp.to).x - c.x, P(perp.to).y - c.y) / 2)) : 40;
    const onArc = (th: number) => { const dx = Math.cos(th) * kx, dy = Math.sin(th) * ky, len = Math.hypot(dx, dy) || 1; return { x: c.x + (r * dx) / len, y: c.y - (r * dy) / len }; };
    const pts = Array.from({ length: n + 1 }, (_, i) => onArc(s.arc!.start + (dir * s.arc!.sweep * i) / n));
    arcPath = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    // The label outside the arc's middle, anchored away from the centre, so neither the arrowhead at the arc's end nor
    // the window's edge covers it (round 23: "¼ TUR▶").
    const mid = onArc(s.arc.start + (dir * s.arc.sweep) / 2);
    const ux = (mid.x - c.x) / r, uy = (mid.y - c.y) / r;
    const w = s.arc.label.length * 6.5;
    const anchor: "start" | "end" | "middle" = ux > 0.3 ? "start" : ux < -0.3 ? "end" : "middle";
    const lx = c.x + ux * (r + 10), ly = c.y + uy * (r + 10) + (uy > 0.3 ? 10 : uy < -0.3 ? 0 : 4);
    const lo = anchor === "start" ? 4 : anchor === "end" ? 4 + w : 4 + w / 2, hi = anchor === "start" ? W - 4 - w : anchor === "end" ? W - 4 : W - 4 - w / 2;
    arcLabel = { x: Math.min(hi, Math.max(lo, lx)), y: Math.min(H - 6, Math.max(14, ly)) };
    arcAnchor = anchor;
  }
  const ox = v.x0 <= 0 && v.x1 >= 0 ? v.sx(0) : null, oy = v.y0 <= 0 && v.y1 >= 0 ? v.sy(0) : null;
  return (
    // Its own .v2v root: the colours are variables set there, and a host pane need not be inside one (round 23: in What
    // if the axes and both lines were drawn without a colour, so only the dots and labels showed).
    <div className="v2v v2v-sketch" data-kind={s.kind} data-testid="move-sketch">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={s.words}>
        <defs>
          <marker id="v2v-sketch-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="head" />
          </marker>
        </defs>
        {oy !== null && <line className="axis" x1={0} y1={oy} x2={W} y2={oy} />}
        {ox !== null && <line className="axis" x1={ox} y1={0} x2={ox} y2={H} />}
        {crease && <line className="crease" data-part="crease" {...crease} />}
        {old && <line className="old" {...old}><title>{`before: ${lineWords(before)}`}</title></line>}
        {now && <line className="new" {...now}><title>{`after: ${lineWords(after)}`}</title></line>}
        {s.guides.map((g, i) => {
          const a = P(g.from), b = P(g.to);
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          // A tick across each half of a twin pair: the two halves are the same length.
          const ticks = g.role === "pair" ? [0.25, 0.75].map(t => {
            const cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t, len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const nx = (-(b.y - a.y) / len) * 5, ny = ((b.x - a.x) / len) * 5;
            return <line key={t} className="tick" x1={cx - nx} y1={cy - ny} x2={cx + nx} y2={cy + ny} />;
          }) : null;
          return (
            <g key={i} data-part={g.role}>
              <line className={g.role} x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd={g.role === "arrow" ? "url(#v2v-sketch-head)" : undefined} />
              {ticks}
              {g.label && (Math.abs(a.x - b.x) < 1
                ? <text className="label" x={g.side === "right" ? mid.x + 5 : mid.x - 5} y={mid.y + 4} textAnchor={g.side === "right" ? "start" : "end"}>{g.label}</text>
                : <text className="label" x={Math.min(W - 4, Math.max(4, mid.x))} y={mid.y - 7} textAnchor="middle">{g.label}</text>)}
            </g>
          );
        })}
        {arcPath && (
          <g data-part="arc">
            <path className="arc" d={arcPath} markerEnd="url(#v2v-sketch-head)" />
            {arcLabel && <text className="label" data-part="arc-label" x={arcLabel.x} y={arcLabel.y} textAnchor={arcAnchor}>{s.arc!.label}</text>}
          </g>
        )}
        {s.points.map((p, i) => {
          const c = P(p);
          return (
            <g key={i} data-part={p.role}>
              <circle className={`dot ${p.role}`} cx={c.x} cy={c.y} r={p.role === "pin" || p.role === "shared" ? 4.5 : 3.2} />
              {p.label && <text className="label" x={c.x + 6} y={c.y - 6}>{p.label}</text>}
            </g>
          );
        })}
      </svg>
      <p className="v2v-sketch-words" data-testid="text-move-sketch">{s.words}</p>
    </div>
  );
}
