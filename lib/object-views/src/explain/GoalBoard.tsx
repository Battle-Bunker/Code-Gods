/**
 * The goal annotation renderer (docs/annotations-design.md §3, §6.3): a board at detail size with the focus cell's
 * pieces drawn over it, numbered badges, arrows to a callout column (or below, when narrow), an outcome table for
 * per-cell rules, and a headline. Hover (mouse, pen) or tap moves the focus; the board is one keyboard stop and arrow
 * keys move the focus; the headline and callouts are an aria-live region. Geometry lives in ./layout.ts.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS, type GridColourSet, type GridSymbolSet } from "@workspace/game-types";
import { toneOf, type Cell, type Explanation, type FocusView, type GoalExplainer, type OutcomeTable, type Part, type Tone } from "@workspace/game-utilities";
import { getColourCue, gridModel, patternStyle, subscribeColourCue, type ColourCue, type GridCellModel } from "../grid-display.ts";
import type { GridSettings } from "../registry.ts";
import {
  TONE_COLOUR, TONE_DASH, TONE_MARK, arrowPath, badgePoints, boardPx, calloutOrder, cellX, cellY, centre, isStroke, litCells,
  linkPath, moveFocus, outlinePath, pillPath, signed, type BoardGeometry,
} from "./layout.ts";
import { CellGlyph } from "../glyph.tsx";

export interface GoalBoardProps {
  goal: GoalExplainer;
  /** The board, as a grid wire value of the room's shape. */
  value: string;
  /** The room's Grid settings (size, symbols, colours). */
  grid: GridSettings;
  /** The focus to start on: the top-left cell unless given (the goal card's example passes its chosen cell). */
  initialFocus?: Cell;
  /** A sentence above the board (the example's caption). */
  caption?: string;
  /** Cells that changed since a compared board, outlined as the grid's detail view does. */
  changed?: boolean[][] | null;
  /**
   * A view chosen by the caller instead of the focus cell's (the part scrubber steps through pieces this way): drawn
   * without a focus ring, and pointing at cells does not change it.
   */
  view?: FocusView | null;
  /**
   * Reserve room for several callouts, so the board's height barely changes as the focus moves (a popover positioned
   * against the viewport would otherwise jump, and slip out from under the pointer).
   */
  steady?: boolean;
  /** The board's explanation when the caller already has it (else computed here). */
  explanation?: Explanation | null;
  testId?: string;
}

const NO_PARTS: readonly Part[] = [];
const cellPx = (n: number) => (n <= 4 ? 44 : n <= 5 ? 38 : n <= 6 ? 32 : n <= 7 ? 28 : 22);

const pointsText = (points: readonly number[]) => {
  const chips = points.map((p, k) => (p === 0 ? null : k === 0 ? `${signed(p)} point${Math.abs(p) === 1 ? "" : "s"}` : `${signed(p)} tie-break`)).filter(Boolean);
  return chips.length ? chips.join(" · ") : "0 points";
};

/** A tile as the grid's detail view draws it: the colour, the viewer's colour cue (pattern), the colour letter in a corner. */
/** The viewer's colour cue (pattern or letter), live. */
export const useColourCueSetting = (): ColourCue => useSyncExternalStore(subscribeColourCue, getColourCue, () => "pattern" as ColourCue);

export { Tile as GoalTile };

function Tile({ cell, px, dim, cue = "pattern", changed }: { cell: GridCellModel; px: number; dim?: boolean; cue?: ColourCue; changed?: boolean }) {
  const pattern = cue === "pattern";
  return (
    <span className="relative flex items-center justify-center font-mono font-semibold leading-none select-none"
      style={{
        width: px, height: px, backgroundColor: cell.css, ...(pattern ? patternStyle(cell.letter, cell.ink, px > 30 ? 7 : 5) : {}),
        fontSize: Math.round(px * 0.44), opacity: dim ? 0.32 : 1, transition: "opacity 120ms",
        ...(changed ? { outline: "2px solid currentColor", outlineOffset: -2 } : {}),
      }} data-changed={changed || undefined}>
      <span style={{ color: cell.ink, textShadow: pattern ? `0 0 2px ${cell.css}` : undefined }}><CellGlyph parts={cell.parts} /></span>
      {px > 24 && <span className="absolute bottom-0.5 right-0.5 leading-none" style={{ fontSize: 9, color: cell.ink }}>{cell.letter}</span>}
    </span>
  );
}

/** One tile of the room's symbol and colour (outcome tables), drawn like the board's tiles. */
function SampleTile({ sym, col, grid, px }: { sym: number; col: number; grid: GridSettings; px: number }) {
  const code = SYMBOL_COMPONENTS[grid.symbols as GridSymbolSet]?.codes[sym], letter = COLOUR_COMPONENTS[grid.colours as GridColourSet]?.letters[col];
  const model = code && letter ? gridModel(`${code}${letter}`, { ...grid, size: 1 }) : null;
  return model ? <Tile cell={model.rows[0][0]} px={px} /> : null;
}

function Callout({ part, index, explanation, model, setRef }: {
  part: Part; index: number; explanation: Explanation; model: ReturnType<typeof gridModel>; setRef: (el: HTMLDivElement | null) => void;
}) {
  const tone = toneOf(part.points);
  const small = part.cells.length <= 4 && part.shape !== "region" && part.shape !== "ring" && part.shape !== "window";
  return (
    <div ref={setRef} className="border bg-background px-2.5 py-2 text-xs leading-snug shadow-sm" style={{ borderLeft: `4px ${TONE_DASH[tone] ? "dashed" : "solid"} ${TONE_COLOUR[tone]}` }}
      data-testid="goal-callout" data-tone={tone} data-part={part.id}>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: TONE_COLOUR[tone] }}>{index + 1}</span>
        <span className="font-semibold">{part.title}</span>
        <span className="ml-auto whitespace-nowrap font-mono font-semibold" style={{ color: TONE_COLOUR[tone] }}>{pointsText(part.points)}</span>
      </div>
      {small && model && (
        <div className="mt-1 flex gap-0.5" aria-hidden>
          {part.shape === "block"
            ? <span className="inline-grid grid-cols-2 gap-px">{part.cells.map((x, i) => <Tile key={i} cell={model.rows[x.r][x.c]} px={18} />)}</span>
            : part.cells.map((x, i) => <Tile key={i} cell={model.rows[x.r][x.c]} px={18} />)}
        </div>
      )}
      {part.facts.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {part.facts.map((f, i) => (
            <li key={i} className="flex gap-1"><span aria-hidden className="font-bold" style={{ color: f.ok ? TONE_COLOUR.gain : TONE_COLOUR.loss }}>{f.ok ? "✓" : "✗"}</span>
              <span><span className="sr-only">{f.ok ? "yes: " : "no: "}</span>{f.text}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Table({ table, grid }: { table: OutcomeTable; grid: GridSettings }) {
  return (
    <figure className="border bg-background px-2.5 py-2 text-xs" data-testid="goal-outcome-table">
      <figcaption className="mb-1 font-semibold">{table.title}</figcaption>
      <table className="border-separate" style={{ borderSpacing: "6px 3px" }}>
        <thead><tr><th />{table.cols.map(c => <th key={c} className="font-normal text-muted-foreground">{c}</th>)}</tr></thead>
        <tbody>
          {table.entries.map((row, r) => (
            <tr key={r}>
              <th className="pr-1 text-left font-normal text-muted-foreground">{table.rows[r]}</th>
              {row.map((e, c) => {
                const here = table.at?.[0] === r && table.at?.[1] === c, tone = toneOf([e.points]);
                return (
                  <td key={c} className="text-center">
                    <span className="inline-flex flex-col items-center gap-0.5 p-0.5"
                      style={{ outline: here ? "2.5px solid currentColor" : undefined, outlineOffset: 1 }} data-here={here || undefined}>
                      <SampleTile sym={e.sample.sym} col={e.sample.col} grid={grid} px={22} />
                      <span className="font-mono font-semibold" style={{ color: TONE_COLOUR[tone] }}>{signed(e.points)}</span>
                      {here && <span className="text-[10px] font-semibold leading-none">this cell</span>}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

interface Arrow { d: string; tone: Tone }

/**
 * A board explained for one focus cell at a time. Without a rich explanation (a family without a lens, or an
 * explanation that does not add up to the card's score) it draws the board and its score only.
 */
export function GoalBoard({ goal, value, grid, initialFocus, caption, changed, view: chosen, steady, explanation: given, testId = "goal-board" }: GoalBoardProps) {
  const cue = useColourCueSetting();
  const model = useMemo(() => gridModel(value, grid), [value, grid.size, grid.symbols, grid.colours]);
  const size = model?.size ?? 0;
  const geo: BoardGeometry = useMemo(() => ({ cell: cellPx(size), gap: 2, size }), [size]);
  const explanation = useMemo(() => (given !== undefined ? given : goal.explain(value)), [given, goal, value]);
  const [focus, setFocus] = useState<Cell>(initialFocus ?? { r: 0, c: 0 });
  // A new starting cell (another example) moves the focus; a live board update does not, so a reader keeps their cell.
  useEffect(() => { if (initialFocus) setFocus(initialFocus); }, [initialFocus?.r, initialFocus?.c]);
  const rich = !!explanation?.verified;
  const controlled = chosen !== undefined;
  const focused: FocusView | null = useMemo(() => (!controlled && rich && explanation ? goal.focus(value, explanation, focus) : null), [controlled, rich, explanation, goal, value, focus]);
  const view = controlled ? (rich ? chosen : null) : focused;

  const parts = view?.parts ?? NO_PARTS;
  const badges = useMemo(() => badgePoints(geo, parts, view?.focus), [geo, parts, view?.focus]);
  const order = useMemo(() => calloutOrder(badges), [badges]);
  // A piece's number is its callout's place in the column, so the numbers read 1, 2, 3 down the side.
  const number = useMemo(() => { const n: number[] = []; order.forEach((i, k) => { n[i] = k + 1; }); return n; }, [order]);
  const lit = useMemo(() => (view ? litCells(view.focus, parts, size) : null), [view, parts, size]);

  // Arrows: measured after layout, from each badge to its callout.
  const root = useRef<HTMLDivElement>(null), board = useRef<HTMLDivElement>(null);
  const callouts = useRef<(HTMLDivElement | null)[]>([]);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setTick(t => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const r = root.current?.getBoundingClientRect(), b = board.current?.getBoundingClientRect();
    if (!r || !b || !view) { setArrows(a => (a.length ? [] : a)); return; }
    const ox = b.left - r.left, oy = b.top - r.top, out: Arrow[] = [];
    parts.forEach((p, i) => {
      const c = callouts.current[i]?.getBoundingClientRect();
      if (!c) return;
      const below = c.left < b.right - 4;
      const from = { x: ox + badges[i].x, y: oy + badges[i].y };
      const to = below ? { x: c.left - r.left + 12, y: c.top - r.top - 3 } : { x: c.left - r.left - 3, y: c.top - r.top + 14 };
      out.push({ d: arrowPath(from, to, below), tone: toneOf(p.points) });
    });
    setArrows(out);
  }, [view, parts, badges, geo, focus, tick]);

  if (!model) return null;
  const px = boardPx(geo);
  const pick = (x: Cell) => { if (!controlled) setFocus(f => (f.r === x.r && f.c === x.c ? f : x)); };
  const onPointer = (x: Cell) => (e: PointerEvent) => { if (e.pointerType !== "touch") pick(x); };
  const onDown = (x: Cell) => (e: PointerEvent) => { if (e.pointerType === "touch") pick(x); };
  const onKey = (e: KeyboardEvent) => {
    const next = moveFocus(focus, e.key, size);
    if (next) { e.preventDefault(); pick(next); }
  };
  const ord = explanation ? (typeof explanation.ordinal === "number" ? [explanation.ordinal] : explanation.ordinal) : null;
  const score = goal.score(value), scoreArr = score === null ? null : typeof score === "number" ? [score] : score;
  const total: ReactNode = rich && ord && explanation
    ? <>This board: <b>{ord[0]} point{ord[0] === 1 ? "" : "s"}</b>{explanation.components.slice(1).map((name, k) => <span key={k} className="text-muted-foreground"> · {name.replace(/^tie-break: /, "tie-break (")}{name.startsWith("tie-break: ") ? ")" : ""} {signed(ord[k + 1])}</span>)}</>
    : scoreArr ? <>This board: <b>{scoreArr[0]} point{scoreArr[0] === 1 ? "" : "s"}</b></> : null;

  return (
    <div ref={root} className="relative text-left" data-testid={testId} data-rich={rich || undefined}>
      {caption && <p className="mb-2 text-xs leading-snug text-muted-foreground" data-testid="goal-board-caption">{caption}</p>}
      <div aria-live="polite" className="mb-2 text-xs leading-snug">
        {view && <p className="font-semibold" data-testid="goal-board-headline">{view.headline}</p>}
        {total && <p data-testid="goal-board-total">{total}</p>}
        {explanation && !explanation.verified && <p className="text-muted-foreground">Can't explain this board yet.</p>}
      </div>
      <div className="flex flex-wrap items-start gap-x-12 gap-y-5">
        <div ref={board} role="grid" aria-label={`Board ${size} by ${size}. Use the arrow keys to move the focus.`} tabIndex={0} onKeyDown={onKey}
          className="relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ width: px, height: px }} data-testid="goal-board-grid">
          {model.rows.flatMap((row, r) => row.map((cell, c) => (
            <span key={`${r}-${c}`} role="gridcell" aria-selected={focus.r === r && focus.c === c} aria-label={`${cell.name}`}
              onPointerEnter={onPointer({ r, c })} onPointerMove={onPointer({ r, c })} onPointerDown={onDown({ r, c })}
              className="absolute" style={{ left: cellX(geo, c), top: cellY(geo, r) }} data-cell={`${r},${c}`}>
              <Tile cell={cell} px={geo.cell} dim={!!lit && !lit[r][c]} cue={cue} changed={!!changed?.[r]?.[c]} />
            </span>
          )))}
          <svg className="pointer-events-none absolute inset-0 overflow-visible" width={px} height={px} aria-hidden>
            {parts.map((p, i) => {
              const tone = toneOf(p.points), colour = TONE_COLOUR[tone];
              return isStroke(p.shape) ? (
                <path key={p.id} data-part={p.id} d={pillPath(geo, p.cells, geo.cell * 0.47 - (i % 2) * 3)} stroke={colour} strokeWidth={3}
                  strokeDasharray={TONE_DASH[tone]} fill={colour} fillOpacity={0.1} />
              ) : (
                <path key={p.id} data-part={p.id} d={outlinePath(geo, p.cells, 2 + (i % 3) * 3)} stroke={colour} strokeWidth={3} strokeDasharray={TONE_DASH[tone]} strokeLinecap="square" fill="none" />
              );
            })}
            {parts.flatMap(p => (p.links ?? []).map((l, k) => (
              <path key={`${p.id}:l${k}`} d={linkPath(geo, l.from, l.to)} fill="none" stroke={l.ok ? TONE_COLOUR.gain : TONE_COLOUR.loss}
                strokeWidth={2.5} strokeDasharray={l.ok ? undefined : "5 4"} strokeLinecap="round" />
            )))}
            {parts.flatMap(p => (p.spots ?? []).map((s, k) => {
              const c = centre(geo, s.cell);
              return <circle key={`${p.id}:${k}`} cx={c.x} cy={c.y} r={geo.cell * 0.36} fill="none" stroke="#0f172a" strokeOpacity={0.75} strokeWidth={2} strokeDasharray="3 3" />;
            }))}
            {view && !controlled && <rect x={cellX(geo, focus.c) - 3} y={cellY(geo, focus.r) - 3} width={geo.cell + 6} height={geo.cell + 6} rx={5} fill="none" stroke="currentColor" strokeWidth={3} data-focus="" />}
            {parts.map((p, i) => {
              const tone = toneOf(p.points);
              return (
                <g key={`b:${p.id}`}>
                  <circle cx={badges[i].x} cy={badges[i].y} r={7.5} fill={TONE_COLOUR[tone]} stroke="white" strokeWidth={1.5} />
                  <text x={badges[i].x} y={badges[i].y + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="white">{number[i]}</text>
                </g>
              );
            })}
          </svg>
        </div>
        {view && (
          <div className={`min-w-[13rem] max-w-[22rem] flex-1 space-y-2 ${steady ? "min-h-[24rem]" : ""}`} data-testid="goal-board-callouts">
            {view.note && <p className="text-xs leading-snug" data-testid="goal-board-note">{view.note}</p>}
            {order.map(i => (
              <Callout key={parts[i].id} part={parts[i]} index={number[i] - 1} explanation={explanation!} model={model}
                setRef={el => { callouts.current[i] = el; }} />
            ))}
            {view.table && <Table table={view.table} grid={grid} />}
          </div>
        )}
      </div>
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%" aria-hidden>
        <defs>
          {(["gain", "loss", "zero"] as const).map(t => (
            <marker key={t} id={`goal-arrow-${t}`} viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 z" fill={TONE_COLOUR[t]} />
            </marker>
          ))}
        </defs>
        {arrows.map((a, i) => (
          <path key={i} d={a.d} fill="none" stroke={TONE_COLOUR[a.tone]} strokeOpacity={0.8} strokeWidth={1.75}
            markerEnd={`url(#goal-arrow-${a.tone})`} />
        ))}
      </svg>
      <span className="sr-only">{view ? order.map(i => parts[i]).map((p, i) => `${i + 1}. ${p.title}, ${pointsText(p.points)}. ${p.facts.map(f => `${f.ok ? TONE_MARK.gain : TONE_MARK.loss} ${f.text}`).join(". ")}`).join(" ") : ""}</span>
    </div>
  );
}
