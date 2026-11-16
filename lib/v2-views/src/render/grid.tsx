/**
 * The grid scene (docs/engine-v2/grids.md §3, §7): the board as an SVG of numbered cells, with the representation's own
 * elements on it. Numbers only, in the ink of the page: the owner took colour off the beginner board on purpose, so no
 * value has a colour of its own; colour means only a mark (focus, candidate), a highlight or a change.
 *
 * - `right` / `bottom`: a value beside each row and under each column (totals, mirror gaps, bends), the margin's word
 *   over it; a short note beside a row's value ("3 short").
 * - groups, by their cells, whatever the representation (they may overlap, and a group may be any set of cells):
 *   two neighbours get a step label on their shared edge; two cells apart are joined by a link, the value in a badge in
 *   the first cell's corner towards the other; any other group gets its value in a label at its middle and an outline
 *   (for overlapping groups, only on the one a mark or a pointer picks out, so nine windows do not tangle).
 * - Pointing at a total lights the cells it is made of (`data-member`); cross-highlighting is by `meaning`, as for lines.
 * - Compact (160 × 100): the cells, the right margin, and only what a mark cites of the rest; no words, no step labels.
 * Notes with no room beside their element, and elements a mark cites outside the layout, are listed under the picture.
 */
import type { ReactElement, ReactNode } from "react";
import type { ElementRef, ElementValue, GridScene } from "@workspace/v2-core";
import { fmtQ, fmtValue } from "../format.ts";
import { markRefs } from "../refs.ts";
import type { RenderProps, SceneRenderer } from "../scene.ts";
import { compactMarks, elAttrs, hover, key, markState, NOTE_MAX, numberOf, Readouts } from "./common.tsx";

type P = RenderProps<GridScene>;
type Group = GridScene["groups"] extends readonly (infer G)[] | undefined ? G : never;

interface Geo {
  readonly c: number;       // cell side
  readonly digit: number;   // digit font size
  readonly pad: number;
  readonly margin: number;  // right margin width
  readonly foot: number;    // bottom margin height
  readonly label: number;   // label font size
}
const GEO: Record<"compact" | "expanded", Geo> = {
  compact: { c: 18, digit: 12, pad: 3, margin: 22, foot: 15, label: 9 },
  expanded: { c: 44, digit: 22, pad: 8, margin: 40, foot: 26, label: 11 },
};
const NOTE_CHAR = 6.2; // px per character of an 11 px note, for sizing the notes column

/** "+4", "−6", "0": a step's value with its sign. */
const signed = (v: ElementValue): string => {
  const q = numberOf(v);
  if (!q) return fmtValue(v);
  return (q.n > 0n ? "+" : "") + fmtQ(q);
};

type Kind = "step" | "link" | "box";
function kindOf(g: Group, cols: number): Kind {
  if (g.cells.length !== 2) return "box";
  const [a, b] = g.cells as [number, number];
  const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols)), dc = Math.abs((a % cols) - (b % cols));
  return dr + dc === 1 ? "step" : "link";
}

/** Whether a group's cells exactly fill their bounding rectangle (a box, a window), and that rectangle. */
function rectOf(cells: readonly number[], cols: number): { r0: number; c0: number; r1: number; c1: number; full: boolean } {
  const rs = cells.map(i => Math.floor(i / cols)), cs = cells.map(i => i % cols);
  const r0 = Math.min(...rs), r1 = Math.max(...rs), c0 = Math.min(...cs), c1 = Math.max(...cs);
  return { r0, c0, r1, c1, full: new Set(cells).size === (r1 - r0 + 1) * (c1 - c0 + 1) };
}

function Scene({ p }: { p: P }): ReactElement {
  const s = p.scene;
  const size = p.size;
  const g = GEO[size];
  const marks = compactMarks(p);
  const q: P = { ...p, marks };
  const expanded = size === "expanded";
  const firstCell = s.cells[0];
  if (firstCell && p.values(firstCell).kind === "undefined") return <div className="v2v-undef">{fmtValue(p.values(firstCell))}</div>;

  const cited = new Set(marks.flatMap(markRefs).map(key));
  const right = s.right ?? [];
  // A compact card keeps the right margin (what most rules are about) and the rest only where a mark cites it.
  const bottom = expanded || (s.bottom ?? []).some(r => cited.has(key(r))) ? s.bottom ?? [] : [];
  const groups = (s.groups ?? []).map((gr, i) => ({ ...gr, i, kind: kindOf(gr, s.cols) }))
    .filter(gr => { const st = markState(marks, gr.el); return expanded || gr.kind !== "step" || st.focus || !!st.cand; });
  // Whether outlined groups share cells (nine windows do; four boxes do not): steps and links always share theirs.
  const seen = new Map<number, number>();
  for (const gr of groups) if (gr.kind === "box") for (const c of gr.cells) seen.set(c, (seen.get(c) ?? 0) + 1);
  const overlapping = [...seen.values()].some(n => n > 1);

  // Notes: a short one beside a row's value; the rest (and any on a group, a cell or a column) listed underneath.
  const shown = (r: ElementRef) => fmtValue(p.values(r));
  const besideNote = new Map<string, string>();
  // Notes listed under the picture, one line per element ("the top half …: = 3² × 1371742; one more 3: add 18 or …").
  const listedBy = new Map<string, { label: string; texts: string[] }>();
  const drawnNotes = new Set<string>();
  const rightKeys = new Set(right.map(key));
  for (const m of expanded ? marks : []) {
    if (m.kind !== "note" || m.ref.rep !== p.rep) continue;
    const k = key(m.ref);
    drawnNotes.add(m.text);
    if (m.text === shown(m.ref)) continue; // the note only repeats the value drawn
    if (rightKeys.has(k) && m.text.length <= NOTE_MAX && !besideNote.has(k)) besideNote.set(k, m.text);
    else {
      const e = listedBy.get(k) ?? { label: p.labelOf(m.ref), texts: [] };
      if (!e.texts.includes(m.text)) e.texts.push(m.text);
      listedBy.set(k, e);
    }
  }
  const listed = [...listedBy.values()].map(e => `${e.label}: ${e.texts.join("; ")}`);
  const noteW = besideNote.size ? Math.max(...[...besideNote.values()].map(t => t.length)) * NOTE_CHAR + 6 : 0;

  // Geometry.
  const { c: C, pad } = g;
  const titleRow = expanded && ((right.length > 0 && !!s.rightTitle)) ? 14 : 0;
  const ox = pad, oy = pad + titleRow;
  const W = s.cols * C, H = s.rows * C;
  const cornerTitle = expanded && bottom.length > 0 && !!s.bottomTitle;
  const hasRight = right.length > 0 || cornerTitle;
  const mx = ox + W + 4;                    // right margin's left edge
  const fy = oy + H + 4;                    // bottom margin's top edge
  const width = mx - 4 + (hasRight ? 4 + g.margin : 0) + (noteW ? noteW + 2 : 0) + pad;
  const height = oy + H + (bottom.length ? 4 + g.foot : 0) + pad;
  const cx = (i: number) => ox + (i % s.cols) * C + C / 2;
  const cy = (i: number) => oy + Math.floor(i / s.cols) * C + C / 2;

  // The cells a lit total or group is made of.
  const lit = (r: ElementRef) => p.highlight !== null && p.meaningOf(r) === p.highlight;
  const members = new Set<number>();
  right.forEach((r, row) => { if (lit(r)) for (let c = 0; c < s.cols; c++) members.add(row * s.cols + c); });
  bottom.forEach((r, col) => { if (lit(r)) for (let row = 0; row < s.rows; row++) members.add(row * s.cols + col); });
  for (const gr of s.groups ?? []) if (lit(gr.el)) for (const c of gr.cells) members.add(c);

  const title = (r: ElementRef, extra = "") => <title>{`${p.labelOf(r)}: ${shown(r)}${extra}`}</title>;

  // ---------------------------------------------------------------- layers
  const outlines: ReactNode[] = [];
  const links: ReactNode[] = [];
  const labels: ReactNode[] = [];
  const badgeAt = new Set<string>();
  // Group labels at their groups' middles: when overlapping groups' labels would collide (eight readings of one board),
  // only those a mark or a pointer picks out are drawn; the others are said in the readouts under the picture.
  const boxLabels: { el: ElementRef; picked: boolean; big: boolean; box: { x: number; y: number; w: number; h: number }; node: ReactNode }[] = [];
  for (const gr of groups) {
    const st = markState(marks, gr.el);
    const attrs = elAttrs(q, gr.el);
    const picked = st.focus || !!st.cand || lit(gr.el);
    const val = gr.kind === "step" ? signed(p.values(gr.el)) : shown(gr.el);
    if (gr.kind === "step") {
      const [a, b] = gr.cells as [number, number];
      const horizontal = Math.floor(a / s.cols) === Math.floor(b / s.cols);
      const x = horizontal ? (cx(a) + cx(b)) / 2 : ox + (a % s.cols) * C + C * 0.8;
      const y = horizontal ? oy + Math.floor(a / s.cols) * C + C * 0.8 : (cy(a) + cy(b)) / 2;
      const w = Math.max(16, val.length * 6.5 + 6);
      labels.push(
        <g key={key(gr.el)} className="step" {...attrs} {...hover(q, gr.el)}>
          <rect className="pill" x={x - w / 2} y={y - 7} width={w} height={14} rx={7} />
          {expanded && <text className="pill-text" x={x} y={y + 3.6}>{val}</text>}
          {title(gr.el)}
        </g>,
      );
    } else if (gr.kind === "link") {
      const [a, b] = gr.cells as [number, number];
      // The badge sits on the side of the first cell facing the other (below the digit, or beside it when the other is
      // more across than down), clear of the digit and of a neighbour's badge; the line runs to the other's facing side.
      const dx = cx(b) - cx(a), dy = cy(b) - cy(a);
      let [sx, sy] = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      if (badgeAt.has(`${a}:${sx}:${sy}`)) [sx, sy] = [-sx, -sy];
      badgeAt.add(`${a}:${sx}:${sy}`);
      const off = C * 0.36;
      const bx = cx(a) + sx * off, by = cy(a) + sy * off;
      const line = <line className="link-line" x1={bx} y1={by} x2={cx(b) - sx * off} y2={cy(b) - sy * off} />;
      if (!expanded) {
        // Compact: no room for numbers or a web of lines; only a link a mark or a pointer picks out is drawn.
        if (picked) links.push(<g key={key(gr.el)} className="link" {...attrs} {...hover(q, gr.el)}>{line}{title(gr.el)}</g>);
        continue;
      }
      links.push(<g key={`${key(gr.el)}-line`} className="link-under" data-focus={attrs["data-focus"]} data-cand={attrs["data-cand"]} data-lit={attrs["data-lit"]}>{line}</g>);
      const w = Math.max(14, val.length * 6 + 5);
      labels.push(
        <g key={key(gr.el)} className="link" {...attrs} {...hover(q, gr.el)}>
          <rect className="badge-bg" x={bx - w / 2} y={by - 6} width={w} height={12} rx={3} />
          <text className="badge" x={bx} y={by + 3.3}>{val}</text>
          {title(gr.el)}
        </g>,
      );
    } else {
      const rc = rectOf(gr.cells, s.cols);
      const inset = 3 + (gr.i % 3); // overlapping outlines step in a little, so neighbours do not share a line
      const outline = rc.full
        ? [<rect key="r" className="box-line" x={ox + rc.c0 * C + inset} y={oy + rc.r0 * C + inset} width={(rc.c1 - rc.c0 + 1) * C - 2 * inset} height={(rc.r1 - rc.r0 + 1) * C - 2 * inset} rx={5} />]
        : gr.cells.map(i => <rect key={i} className="box-line" x={ox + (i % s.cols) * C + inset} y={oy + Math.floor(i / s.cols) * C + inset} width={C - 2 * inset} height={C - 2 * inset} rx={5} />);
      const drawOutline = !overlapping || picked;
      if (!expanded) {
        // Compact: the outline is the group's node (no room for its number).
        if (drawOutline) outlines.push(<g key={key(gr.el)} className="box" {...attrs} {...hover(q, gr.el)}>{outline}{title(gr.el)}</g>);
        else outlines.push(<g key={key(gr.el)} className="box" {...attrs}>{title(gr.el)}</g>);
        continue;
      }
      if (drawOutline) outlines.push(<g key={`${key(gr.el)}-line`} className="box-under" data-focus={attrs["data-focus"]} data-cand={attrs["data-cand"]} data-lit={attrs["data-lit"]}>{outline}</g>);
      const x = gr.cells.reduce((t, i) => t + cx(i), 0) / gr.cells.length;
      const y = gr.cells.reduce((t, i) => t + cy(i), 0) / gr.cells.length;
      const w = Math.max(18, val.length * 7 + 8);
      boxLabels.push({
        // A big group among overlapping ones (a half of the board) is labelled only when picked: its label sits over digits.
        el: gr.el, picked, big: overlapping && gr.cells.length > 4, box: { x: x - w / 2, y: y - 8, w, h: 16 },
        node: (
          <g key={key(gr.el)} className="box" {...attrs} {...hover(q, gr.el)}>
            <rect className="pill" x={x - w / 2} y={y - 8} width={w} height={16} rx={8} />
            <text className="group-label" x={x} y={y + 4}>{val}</text>
            {title(gr.el)}
          </g>
        ),
      });
    }
  }

  const meets = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const unsaid = new Set<string>();
  for (const l of boxLabels) {
    if (!l.picked && (l.big || boxLabels.some(o => o !== l && meets(l.box, o.box)))) {
      // Still a node (its title, cross-highlighting), with nothing drawn; its value is in the readouts.
      unsaid.add(key(l.el));
      labels.push(<g key={key(l.el)} className="box" {...elAttrs(q, l.el)}>{title(l.el)}</g>);
      continue;
    }
    labels.push(l.node);
  }

  const before = p.before;
  // A coloured board: each tile in its colour, with the colour's letter (lib/v2-grid-boards).
  const tint = s.cellColours ?? [];
  const cells = s.cells.map((r, i) => {
    const x = ox + (i % s.cols) * C, y = oy + Math.floor(i / s.cols) * C;
    let was: string | null = null;
    if (expanded && before) {
      try { const b = before(r); if (fmtValue(b) !== shown(r)) was = fmtValue(b); } catch { was = null; }
    }
    return (
      <g key={key(r)} className={tint[i] ? "cell tinted" : "cell"} {...elAttrs(q, r)} data-member={members.has(i) ? "" : undefined} {...hover(q, r)}>
        {tint[i] && <rect className="cell-colour" x={x + 1} y={y + 1} width={C - 2} height={C - 2} rx={expanded ? 4 : 2} style={{ fill: tint[i]!.css }} />}
        <rect className="cell-bg" x={x + 1} y={y + 1} width={C - 2} height={C - 2} rx={expanded ? 4 : 2} />
        <text className="digit" x={x + C / 2} y={y + C / 2 + g.digit * 0.36} fontSize={g.digit} style={tint[i] ? { fill: tint[i]!.ink } : undefined}>{s.cellGlyphs?.[i] ?? shown(r)}</text>
        {tint[i] && <text className="colour-letter" x={x + C - 4} y={y + C - 4} textAnchor="end" fontSize={Math.max(7, g.digit * 0.38)} style={{ fill: tint[i]!.ink }}>{tint[i]!.letter}</text>}
        {was !== null && <text className="was" x={x + 4} y={y + 11}>{was}</text>}
        {title(r)}
      </g>
    );
  });

  const marginCell = (r: ElementRef, x: number, y: number, w: number, h: number) => {
    const note = besideNote.get(key(r));
    return (
      <g key={key(r)} className="margin" {...elAttrs(q, r)} {...hover(q, r)}>
        <rect className="margin-bg" x={x} y={y} width={w} height={h} rx={4} />
        <text className="margin-val" x={x + w / 2} y={y + h / 2 + (expanded ? 5 : 3.5)} fontSize={expanded ? 15 : 10}>{shown(r)}</text>
        {title(r, note ? ` (${note})` : "")}
      </g>
    );
  };
  const rowMargin = right.map((r, row) => marginCell(r, mx, oy + row * C + (expanded ? 6 : 1), g.margin, C - (expanded ? 12 : 2)));
  const colMargin = bottom.map((r, col) => marginCell(r, ox + col * C + (expanded ? 4 : 1), fy, C - (expanded ? 8 : 2), g.foot));
  const notes = right.flatMap((r, row) => {
    const t = besideNote.get(key(r));
    return t ? [<text key={key(r)} className="note" x={mx + g.margin + 4} y={oy + row * C + C / 2 + 4}>{t}</text>] : [];
  });

  const placed = new Set<string>([...s.cells, ...right, ...bottom, ...groups.map(gr => gr.el)].map(key).filter(k => !unsaid.has(k)));
  return (
    <>
      <svg className="v2v-grid" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={gridText(s, p.values)}>
        <rect className="board" x={ox} y={oy} width={W} height={H} rx={expanded ? 6 : 3} />
        {Array.from({ length: s.cols - 1 }, (_, i) => <line key={`v${i}`} className="board-line" x1={ox + (i + 1) * C} y1={oy} x2={ox + (i + 1) * C} y2={oy + H} />)}
        {Array.from({ length: s.rows - 1 }, (_, i) => <line key={`h${i}`} className="board-line" x1={ox} y1={oy + (i + 1) * C} x2={ox + W} y2={oy + (i + 1) * C} />)}
        {outlines}
        {cells}
        {links}
        {labels}
        {rowMargin}
        {colMargin}
        {notes}
        {titleRow > 0 && <text className="margin-title" x={mx + g.margin / 2} y={oy - 4}>{s.rightTitle}</text>}
        {cornerTitle && <text className="margin-title" x={mx + g.margin / 2} y={fy + g.foot / 2 + 4}>{s.bottomTitle}</text>}
      </svg>
      {listed.length > 0 && <ul className="v2v-notes">{listed.map(n => <li key={n}>{n}</li>)}</ul>}
      <Readouts p={q} placed={placed} drawnNotes={drawnNotes} />
    </>
  );
}

/** "3 1 1 3 / 0 4 8 0 / … · total per row: 8, 12, 8, 12 · total per column: … · pair totals: 6, …". */
function gridText(s: GridScene, values: (r: ElementRef) => ElementValue): string {
  const v = (r: ElementRef) => fmtValue(values(r));
  if (s.cells[0] && values(s.cells[0]).kind === "undefined") return v(s.cells[0]);
  // A coloured board reads as the old game wrote it: "7R 3G …" (the glyph, then the colour's letter).
  const cell = (r: ElementRef, i: number) => (s.cellGlyphs?.[i] ?? v(r)) + (s.cellColours?.[i]?.letter ?? "");
  const rows = Array.from({ length: s.rows }, (_, r) => s.cells.slice(r * s.cols, (r + 1) * s.cols).map((x, j) => cell(x, r * s.cols + j)).join(" ")).join(" / ");
  const parts = [rows];
  if (s.right?.length) parts.push(`${s.rightTitle ?? "value"} per row: ${s.right.map(v).join(", ")}`);
  if (s.bottom?.length) parts.push(`${s.bottomTitle ?? "value"} per column: ${s.bottom.map(v).join(", ")}`);
  if (s.groups?.length) parts.push(`${s.groupTitle ?? "groups"}: ${s.groups.map(gr => v(gr.el)).join(", ")}`);
  return parts.join(" · ");
}

export const gridRenderer: SceneRenderer<GridScene> = {
  kind: "grid",
  box: { compact: { w: 160, h: 100 }, expanded: { w: 320, h: 260 } },
  render: p => <Scene p={p} />,
  text: (scene, values) => gridText(scene, values),
};
