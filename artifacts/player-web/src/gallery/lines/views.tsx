/**
 * PROTOTYPE views for the line annotations storyboards (docs/engine-v2/annotations-design.md §4–§6): each draws one
 * representation of the line with every contributor's badge projected onto it (identity, not hover), the targets as
 * hollow bands and ticks, the next move as a dashed ghost, and a window fitted to the contributors (unequal scales said
 * aloud, a zoom inset for a contributor too small to see).
 */
import type { ReactElement } from "react";
import { Qn, q } from "@workspace/v2-core";
import { intercept, slope, yAt, type LineState } from "@workspace/v2-linear";
import { fmtQ } from "@workspace/v2-views";
import { GLYPH, VIEW_TITLE, type Anchor, type Contributor, type Feature, type Role, type ViewId } from "./model";

export interface ViewProps {
  view: ViewId;
  state: LineState;
  contributors: Contributor[];
  sel: Role | null;
  onSel?: (r: Role | null) => void;
  /** The next move's line, drawn as a dashed ghost. */
  ghost?: { state: LineState; label: string } | null;
  size: "row" | "card";
  /** Width available in px (the card's column). */
  width: number;
}

const dim = (sel: Role | null, r: Role) => (sel !== null && sel !== r ? 0.22 : 1);
const anchorsIn = (cs: Contributor[], v: ViewId) => cs.flatMap(c => (c.anchors[v] ? [{ c, a: c.anchors[v] as Anchor }] : []));

export function View(p: ViewProps): ReactElement {
  const here = anchorsIn(p.contributors, p.view);
  const reads = here.length > 0;
  const body = (() => {
    switch (p.view) {
      case "cart": case "tri": return <Plane {...p} />;
      case "si": return <Equation {...p} />;
      case "table": return <Table {...p} />;
      case "mach": return <Machine {...p} />;
      case "seq": return <Seq {...p} />;
    }
  })();
  return (
    <div className="la-view" data-view={p.view} data-reads={reads ? "" : undefined} data-size={p.size}>
      {body}
      {!reads && p.size === "card" && <p className="la-noread">Your rule's numbers do not show in this view.</p>}
    </div>
  );
}

function Badge({ c, x, y, label, sel, anchor = "start" }: { c: Contributor; x: number; y: number; label?: string; sel: Role | null; anchor?: "start" | "end" | "middle" }) {
  return (
    <g className="la-badge" data-role={c.role} opacity={dim(sel, c.role)}>
      <text x={x} y={y} textAnchor={anchor} className="la-badge-text">{GLYPH[c.role]} {label ?? c.name}</text>
    </g>
  );
}

// ------------------------------------------------------------------ plane

interface Win { x0: number; x1: number; y0: number; y1: number; W: number; H: number; pad: number; unequal: boolean }
const sx = (w: Win, x: number) => w.pad + ((x - w.x0) / (w.x1 - w.x0)) * (w.W - 2 * w.pad);
const sy = (w: Win, y: number) => w.pad + ((w.y1 - y) / (w.y1 - w.y0)) * (w.H - 2 * w.pad);

function featurePoints(fx: Feature): [number, number][] {
  switch (fx.kind) {
    case "ytick": return [[0, fx.y]];
    case "xtick": return [[fx.x, 0]];
    case "yband": return [[0, fx.from], [0, fx.to]];
    case "xband": return [[fx.from, 0], [fx.to, 0]];
    case "point": return [[fx.x, fx.y]];
    case "bracket": return [[fx.x, fx.y0], [fx.x, fx.y1]];
    case "region": return fx.pts;
    case "square": return [[fx.x, fx.y], [fx.x + fx.side, fx.y + fx.side]];
    case "leg": return fx.axis === "x" ? [[fx.to, 0]] : [[0, fx.to]];
  }
}

/** Fit the window to what the rule reads; unequal scales only when equal ones would squash a contributor. */
function fit(pts: [number, number][], W: number, H: number, pad: number): Win {
  let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0]));
  let y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
  const grow = (a: number, b: number, min: number): [number, number] => {
    const span = Math.max(b - a, min), mid = (a + b) / 2;
    return [mid - span * 0.6, mid + span * 0.6];
  };
  [x0, x1] = grow(x0, x1, 4); [y0, y1] = grow(y0, y1, 4);
  const iw = W - 2 * pad, ih = H - 2 * pad;
  const kx = iw / (x1 - x0), ky = ih / (y1 - y0);
  const ratio = Math.max(kx, ky) / Math.min(kx, ky);
  if (ratio <= 3) {
    const k = Math.min(kx, ky), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { x0: cx - iw / k / 2, x1: cx + iw / k / 2, y0: cy - ih / k / 2, y1: cy + ih / k / 2, W, H, pad, unequal: false };
  }
  return { x0, x1, y0, y1, W, H, pad, unequal: true };
}

function nice(span: number, n = 6): number {
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}
const num = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return r < 0 ? `−${-r}` : String(r);
};

function lineSeg(w: Win, m: number, c: number): [number, number, number, number] | null {
  const pts: [number, number][] = [];
  for (const x of [w.x0, w.x1]) { const y = m * x + c; if (y >= w.y0 && y <= w.y1) pts.push([x, y]); }
  if (m !== 0) for (const y of [w.y0, w.y1]) { const x = (y - c) / m; if (x > w.x0 && x < w.x1) pts.push([x, y]); }
  if (pts.length < 2) return null;
  pts.sort((a, b) => a[0] - b[0]);
  const a = pts[0]!, b = pts[pts.length - 1]!;
  return [sx(w, a[0]), sy(w, a[1]), sx(w, b[0]), sy(w, b[1])];
}

function Plane(p: ViewProps): ReactElement {
  const l = p.state.lines[0]!;
  const m = Qn.toNumber(slope(l)), c = Qn.toNumber(intercept(l));
  const here = anchorsIn(p.contributors, p.view);
  const W = p.size === "row" ? Math.min(p.width, 200) : Math.min(p.width, 420), H = p.size === "row" ? 120 : Math.round(W * 0.72);
  const pts: [number, number][] = [[0, 0], [0, c]];
  if (m !== 0) pts.push([-c / m, 0]);
  for (const { a } of here) for (const fx of a.fx ?? []) pts.push(...featurePoints(fx));
  // Room on both sides of each axis, so the labels of what sits on an axis are not squeezed against an edge.
  const xs0 = pts.map(q => q[0]), ys0 = pts.map(q => q[1]);
  pts.push([-0.5 * Math.min(...xs0), 0], [-0.5 * Math.max(...xs0), 0], [0, -0.35 * Math.min(...ys0)], [0, -0.35 * Math.max(...ys0)]);
  const w = fit(pts.filter(([x, y]) => Math.abs(x) < 1e7 && Math.abs(y) < 1e7), W, H, p.size === "row" ? 6 : 12);
  const sxStep = nice(w.x1 - w.x0), syStep = nice(w.y1 - w.y0);
  const grid: ReactElement[] = [];
  for (let x = Math.ceil(w.x0 / sxStep) * sxStep; x <= w.x1; x += sxStep) {
    grid.push(<line key={`gx${x}`} className={Math.abs(x) < 1e-9 ? "la-axis" : "la-grid"} x1={sx(w, x)} x2={sx(w, x)} y1={0} y2={H} />);
    if (p.size === "card" && Math.abs(x) > 1e-9) grid.push(<text key={`lx${x}`} className="la-tick" x={sx(w, x)} y={Math.min(H - 3, Math.max(10, sy(w, 0) + 11))} textAnchor="middle">{num(x)}</text>);
  }
  for (let y = Math.ceil(w.y0 / syStep) * syStep; y <= w.y1; y += syStep) {
    grid.push(<line key={`gy${y}`} className={Math.abs(y) < 1e-9 ? "la-axis" : "la-grid"} y1={sy(w, y)} y2={sy(w, y)} x1={0} x2={W} />);
    if (p.size === "card" && Math.abs(y) > 1e-9) grid.push(<text key={`ly${y}`} className="la-tick" x={Math.min(W - 3, Math.max(14, sx(w, 0) - 4))} y={sy(w, y) + 3} textAnchor="end">{num(y)}</text>);
  }
  const seg = lineSeg(w, m, c);
  const boxes: { x: number; y: number; w: number }[] = [];
  const spot = (x: number, y: number, t: string, anchor: "start" | "end" | "middle" = "start") => {
    const tw = t.length * 6.1, bx = anchor === "middle" ? x - tw / 2 : anchor === "end" ? x - tw : x;
    let yy = y;
    for (let i = 0; i < 8 && boxes.some(b => Math.abs(b.y - yy) < 12 && bx < b.x + b.w && b.x < bx + tw); i++) yy += 12;
    boxes.push({ x: bx, y: yy, w: tw });
    return { x: Math.max(2, Math.min(W - tw - 2, bx)), y: Math.max(11, Math.min(H - 3, yy)) };
  };
  const back: ReactElement[] = [], front: ReactElement[] = [];
  const insets: ReactElement[] = [];
  let squashed = false;
  here.forEach(({ c: con, a }, ci) => {
    const o = dim(p.sel, con.role);
    (a.fx ?? []).forEach((fx, i) => {
      const k = `${ci}-${i}`;
      const showLabel = p.size === "card" || fx.kind === "point" || (fx.kind === "ytick" && fx.strong) || (fx.kind === "xtick" && fx.strong);
      switch (fx.kind) {
        case "yband": case "xband": {
          const r = fx.kind === "yband"
            ? { x: sx(w, 0) - 6, y: sy(w, fx.to), width: 12, height: Math.max(2, sy(w, fx.from) - sy(w, fx.to)) }
            : { x: sx(w, fx.from), y: sy(w, 0) - 6, width: Math.max(2, sx(w, fx.to) - sx(w, fx.from)), height: 12 };
          back.push(<rect key={k} className="la-band" data-role={con.role} opacity={o} {...r} />);
          if (fx.label && p.size === "card") { const s = spot(r.x + r.width + 4, r.y + 9, `target: ${fx.label}`); back.push(<text key={k + "t"} className="la-target-label" data-role={con.role} opacity={o} x={s.x} y={s.y}>target: {fx.label}</text>); }
          break;
        }
        case "ytick": case "xtick": {
          const X = fx.kind === "ytick" ? sx(w, 0) : sx(w, fx.x), Y = fx.kind === "ytick" ? sy(w, fx.y) : sy(w, 0);
          front.push(<line key={k} className="la-tick-mark" data-role={con.role} data-strong={fx.strong ? "" : undefined} opacity={o}
            x1={fx.kind === "ytick" ? X - 7 : X} x2={fx.kind === "ytick" ? X + 7 : X} y1={fx.kind === "ytick" ? Y : Y - 7} y2={fx.kind === "ytick" ? Y : Y + 7} />);
          if (showLabel) { const s = spot(fx.kind === "ytick" ? X - 10 : X, fx.kind === "ytick" ? Y + 4 : Y + 20, fx.label, fx.kind === "ytick" ? "end" : "middle"); front.push(<text key={k + "t"} className="la-feat-label" data-role={con.role} data-faint={fx.strong ? undefined : ""} opacity={o} x={s.x} y={s.y}>{fx.label}</text>); }
          break;
        }
        case "point": {
          const X = sx(w, fx.x), Y = sy(w, fx.y);
          front.push(<circle key={k} className={fx.hollow ? "la-target-pt" : "la-pt"} data-role={con.role} opacity={o} cx={X} cy={Y} r={fx.hollow ? 5 : 3.5} />);
          if (fx.ring) front.push(<circle key={k + "r"} className="la-ring" data-role={con.role} opacity={o} cx={X} cy={Y} r={8} />);
          const t = `${GLYPH[con.role]} ${con.owner ? `${con.owner}'s ` : ""}${fx.label}`;
          const s = spot(X + 10, Y - 6, t);
          front.push(<text key={k + "t"} className="la-feat-label" data-role={con.role} opacity={o} x={s.x} y={s.y} fontWeight={600}>{t}</text>);
          break;
        }
        case "bracket": {
          const X = sx(w, fx.x) + 10, A = sy(w, fx.y0), B = sy(w, fx.y1);
          front.push(<path key={k} className="la-bracket" data-role={con.role} opacity={o} d={`M${X - 4},${A} h4 V${B} h-4`} />);
          if (p.size === "card") { const s = spot(X + 4, (A + B) / 2 + 4, fx.label); front.push(<text key={k + "t"} className="la-feat-label" data-role={con.role} opacity={o} x={s.x} y={s.y}>{fx.label}</text>); }
          break;
        }
        case "region": {
          const P = fx.pts.map(([x, y]) => [sx(w, x), sy(w, y)] as const);
          back.push(<polygon key={k} className="la-region" data-role={con.role} opacity={o} points={P.map(q => q.join(",")).join(" ")} />);
          const bw = Math.max(...P.map(q => q[0])) - Math.min(...P.map(q => q[0])), bh = Math.max(...P.map(q => q[1])) - Math.min(...P.map(q => q[1]));
          const cx = P.reduce((s, q) => s + q[0], 0) / 3, cy = P.reduce((s, q) => s + q[1], 0) / 3;
          if (Math.min(bw, bh) < 20 && p.size === "card") {
            insets.push(<Inset key={k + "i"} pts={fx.pts} role={con.role} label={fx.label} W={W} H={H} from={[cx, cy]} />);
          } else {
            const t = `${GLYPH[con.role]} ${fx.label}`;
            front.push(<text key={k + "t"} className="la-region-label" data-role={con.role} opacity={o} x={cx} y={cy + 4} textAnchor="middle">{p.size === "row" ? `${GLYPH[con.role]} ${fx.label.replace("area ", "")}` : t}</text>);
          }
          break;
        }
        case "square": {
          // Unequal scales would draw the square as a rectangle: the ruler shows it instead.
          if (w.unequal) { squashed = true; break; }
          const X0 = sx(w, fx.x), Y0 = sy(w, fx.y + fx.side), X1 = sx(w, fx.x + fx.side), Y1 = sy(w, fx.y);
          back.push(<rect key={k} className="la-square" data-role={con.role} opacity={o} x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} />);
          if (p.size === "card") { const s = spot((X0 + X1) / 2, (Y0 + Y1) / 2 + 4, `nearest square ${fx.label}`, "middle"); front.push(<text key={k + "t"} className="la-feat-label" data-role={con.role} opacity={o} x={s.x} y={s.y}>nearest square {fx.label}</text>); }
          break;
        }
        case "leg": {
          const [x1, y1] = fx.axis === "x" ? [sx(w, fx.to), sy(w, 0)] : [sx(w, 0), sy(w, fx.to)];
          front.push(<line key={k} className="la-leg" data-role={con.role} opacity={o} x1={sx(w, 0)} y1={sy(w, 0)} x2={x1} y2={y1} />);
          if (p.size === "card") {
            const s = fx.axis === "x" ? spot((sx(w, 0) + x1) / 2, sy(w, 0) + (fx.to * (c > 0 ? 1 : -1) > 0 ? 16 : -6), `leg ${fx.label}`, "middle") : spot(sx(w, 0) + (c / Math.abs(c) * m > 0 ? -6 : 6), (sy(w, 0) + y1) / 2, `leg ${fx.label}`, m * c > 0 ? "end" : "start");
            front.push(<text key={k + "t"} className="la-feat-label" data-role={con.role} opacity={o} x={s.x} y={s.y}>leg {fx.label}</text>);
          }
          break;
        }
      }
    });
  });
  const ghost = p.ghost ? (() => {
    const g = p.ghost.state.lines[0]!;
    const s = lineSeg(w, Qn.toNumber(slope(g)), Qn.toNumber(intercept(g)));
    if (!s) return null;
    // The ghost's words sit at the end of the line away from the axes' labels.
    const far = Math.abs(s[0] - sx(w, 0)) > Math.abs(s[2] - sx(w, 0)) ? [s[0], s[1]] : [s[2], s[3]];
    const t = spot(far[0] < W / 2 ? far[0] + 4 : far[0] - 4, Math.min(H - 14, Math.max(far[1], 12) + 14), p.ghost.label, far[0] < W / 2 ? "start" : "end");
    return <g className="la-ghost"><line x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} />{p.size === "card" && <text x={t.x} y={t.y}>{p.ghost.label}</text>}</g>;
  })() : null;
  const slopeGlyph = w.unequal && p.size === "card";
  return (
    <figure className="la-plane-wrap">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="la-plane" role="img" aria-label={`${VIEW_TITLE[p.view]}: ${here.map(h => h.c.sentence).join(" ")}`}>
        {grid}
        {back}
        {ghost}
        {seg && <line className="la-line" x1={seg[0]} y1={seg[1]} x2={seg[2]} y2={seg[3]} />}
        {front}
        {insets}
      </svg>
      {slopeGlyph && (
        <figcaption className="la-scale">
          Scales differ: across, one square is {num(sxStep)}; up, one square is {num(syStep)}. The line really is {Math.abs(m) >= 1 ? `${num(Math.abs(m))} times steeper than` : "flatter than"} a 45° line.{squashed && " These scales cannot draw a square as a square: the nearest square is on the ruler instead."}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * A contributor too thin to see (a triangle 0.2 wide and 59 tall): no zoom can fix its shape, so it is redrawn as a
 * schematic in a corner box, each axis stretched to fill it, said to be "not to scale", joined to its place by a leader.
 */
function Inset({ pts, role, label, W, from }: { pts: [number, number][]; role: Role; label: string; W: number; H: number; from: [number, number] }) {
  const IW = 130, IH = 90, X = W - IW - 6, Y = 6, m = 14;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const P = pts.map(([x, y]) => [X + m + ((x - x0) / (x1 - x0 || 1)) * (IW - 2 * m), Y + m + 4 + ((y1 - y) / (y1 - y0 || 1)) * (IH - 2 * m - 14)] as const);
  return (
    <g className="la-inset">
      <line className="la-leader" x1={from[0]} y1={from[1]} x2={X} y2={Y + IH / 2} />
      <rect className="la-inset-box" x={X} y={Y} width={IW} height={IH} />
      <polygon className="la-region" data-role={role} points={P.map(q => q.join(",")).join(" ")} />
      <text className="la-feat-label" data-role={role} x={X + 4} y={Y + 11}>not to scale</text>
      <text className="la-feat-label" data-role={role} x={X + 4} y={Y + IH - 4}>{GLYPH[role]} {label}</text>
    </g>
  );
}

// ------------------------------------------------------------------ equation

function Equation(p: ViewProps): ReactElement {
  const l = p.state.lines[0]!;
  const m = slope(l), c = intercept(l);
  const here = anchorsIn(p.contributors, "si");
  const on = (el: "m" | "c") => here.filter(h => h.a.eq?.el === el);
  const term = (el: "m" | "c", text: string) => {
    const cs = on(el);
    const top = cs[0]?.c;
    return (
      <span className="la-eq-el" data-role={top?.role} data-sel={top && p.sel === top.role ? "" : undefined}
        style={{ opacity: top ? dim(p.sel, top.role) : 1 }}>
        {cs.map(h => <sup key={h.c.role} className="la-eq-badge" data-role={h.c.role}>{GLYPH[h.c.role]}</sup>)}
        {text}
      </span>
    );
  };
  const mText = Qn.eq(m, Qn.ONE) ? "" : Qn.eq(m, q(-1)) ? "−" : fmtQ(m);
  const g = p.ghost?.state.lines[0];
  return (
    <div className="la-eq" data-size={p.size}>
      <div className="la-eq-main">
        y = {term("m", mText)}x {c.n < 0n ? "−" : "+"} {term("c", fmtQ(Qn.abs(c)))}
      </div>
      {p.size === "card" && here.filter(h => h.a.eq?.note).map(h => (
        <div key={h.c.role} className="la-eq-note" data-role={h.c.role} style={{ opacity: dim(p.sel, h.c.role) }}>
          {GLYPH[h.c.role]} {h.c.name === "m" || h.c.name === "c" ? `${h.c.name} = ${h.c.value} ` : ""}{h.a.eq!.note}
        </div>
      ))}
      {g && p.size === "card" && <div className="la-eq-ghost">{p.ghost!.label} → y = {fmtQ(slope(g))}x {intercept(g).n < 0n ? "−" : "+"} {fmtQ(Qn.abs(intercept(g)))}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ table

function Table(p: ViewProps): ReactElement {
  const l = p.state.lines[0]!;
  const here = anchorsIn(p.contributors, "table");
  const cells = new Map<number, { c: Contributor; cell: NonNullable<Anchor["cells"]>[number] }>();
  for (const h of here) for (const cell of h.a.cells ?? []) if (!cells.has(cell.x)) cells.set(cell.x, { c: h.c, cell });
  let xs = [...cells.keys()].sort((a, b) => a - b);
  if (xs.length === 0) xs = [0, 1, 2, 3, 4];
  else {
    const lo = Math.max(xs[0]! - 1, xs.length > 6 ? xs[0]! : -3), hi = xs[xs.length - 1]! + (xs.length > 6 ? 0 : 1);
    xs = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  if (p.size === "row") xs = xs.filter(x => cells.has(x)).slice(0, 6).concat(xs.filter(x => cells.has(x)).length ? [] : xs.slice(0, 4));
  return (
    <div className="la-table-wrap">
      <table className="la-table">
        <tbody>
          <tr><th>x</th>{xs.map(x => <td key={x} data-role={cells.get(x)?.c.role}>{x < 0 ? `−${-x}` : x}</td>)}</tr>
          <tr><th>y</th>{xs.map(x => {
            const h = cells.get(x);
            return (
              <td key={x} data-role={h?.c.role} data-mark={h?.cell.mark} style={{ opacity: h ? dim(p.sel, h.c.role) : 1 }}>
                {h && <span className="la-cell-badge">{GLYPH[h.c.role]}</span>}{fmtQ(yAt(l, q(x)))}
              </td>
            );
          })}</tr>
          {p.size === "card" && cells.size > 0 && (
            <tr className="la-table-notes"><th />{xs.map(x => {
              const h = cells.get(x);
              return <td key={x} data-role={h?.c.role} data-mark={h?.cell.mark} style={{ opacity: h ? dim(p.sel, h.c.role) : 1 }}>{h?.cell.note ?? ""}</td>;
            })}</tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ machine and pattern (rarely read by the pool)

function Machine(p: ViewProps): ReactElement {
  const l = p.state.lines[0]!;
  const here = anchorsIn(p.contributors, "mach");
  const at = (k: "times" | "plus" | "fixed") => here.find(h => h.a.mach?.at === k);
  const st = (k: "times" | "plus", text: string) => {
    const h = at(k);
    return <span className="la-mach-stage" data-role={h?.c.role} style={{ opacity: h ? dim(p.sel, h.c.role) : 1 }}>{h && <sup className="la-eq-badge" data-role={h.c.role}>{GLYPH[h.c.role]}</sup>}{text}</span>;
  };
  const fx = at("fixed");
  return (
    <div className="la-mach">
      <span>in</span> → {st("times", `× ${fmtQ(slope(l))}`)} → {st("plus", `+ ${fmtQ(intercept(l))}`)} → <span>out</span>
      {fx && p.size === "card" && <div className="la-eq-note" data-role={fx.c.role}>{GLYPH[fx.c.role]} {fx.a.mach!.note}</div>}
    </div>
  );
}

function Seq(p: ViewProps): ReactElement {
  const l = p.state.lines[0]!;
  return <div className="la-seq">{[0, 1, 2, 3, 4].map(n => <span key={n} className="la-seq-term">{fmtQ(yAt(l, q(n)))}</span>)}<span>… each step adds {fmtQ(slope(l))}</span></div>;
}
