/**
 * The goal annotation renderer, by scoring unit (owner 2026-11-03; docs/annotations-design.md): the board with the
 * selected unit drawn over it, and beside it (below, when narrow) the list of every unit that makes up the score, in a
 * box each, sorted by what it scores (gains highest first, then losses most negative first, then zeros). The list
 * scrolls inside a fixed maximum height. Hovering or focusing a box selects its unit: its cells light up and an arrow
 * joins it to its box. Hovering the board selects the unit under the pointer by the lens's hover geometry (game-utilities
 * units.ts), with an auxiliary toggle when units of several kinds overlap ([Row | Column], [→ ↓ ↘ ↙]); its box scrolls
 * into view. Tap selects on touch. The board is one keyboard stop (arrow keys step through the units in list order);
 * the list's boxes are reachable in order with Tab.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { hitTest, sortUnits, defaultGeometry, groupOf, toneOf, type Explanation, type GoalExplainer, type HoverMode, type Part } from "@workspace/game-utilities";
import { getColourCue, gridModel, subscribeColourCue, type ColourCue, type GridCellModel } from "../grid-display.ts";
import type { GridSettings } from "../registry.ts";
import {
  TONE_COLOUR, TONE_DASH, TONE_MARK, arrowPath, badgePoint, boardPx, cellX, cellY, centre, isStroke, litCells, linkPath, outlinePath,
  pillPath, signed, type BoardGeometry,
} from "./layout.ts";
import { CellGlyph } from "../glyph.tsx";
import { HowThisScores } from "./HowThisScores.tsx";

export interface GoalBoardProps {
  goal: GoalExplainer;
  /** The board, as a grid wire value of the room's shape. */
  value: string;
  /** The room's Grid settings (size, symbols, colours). */
  grid: GridSettings;
  /** A sentence above the board (the example's caption). */
  caption?: string;
  /** Cells that changed since a compared board, outlined as the grid's detail view does. */
  changed?: boolean[][] | null;
  /**
   * The selected unit's id, chosen by the caller (the part scrubber steps through units this way): the board and the
   * list then follow it and pointing does not change it. Undefined: the board's own selection.
   */
  selected?: string | null;
  /** The board's explanation when the caller already has it (else computed here). */
  explanation?: Explanation | null;
  /** Show "How this scores" under the board (the viewer's own goal, when the explainer has tables). Default: true. */
  howItScores?: boolean;
  testId?: string;
}

const pointsText = (points: readonly number[]) => {
  const chips = points.map((p, k) => (p === 0 ? null : k === 0 ? `${signed(p)} point${Math.abs(p) === 1 ? "" : "s"}` : `${signed(p)} tie-break`)).filter(Boolean);
  return chips.length ? chips.join(" · ") : "0 points";
};

/** The viewer's colour cue (colour only or letter), live. */
export const useColourCueSetting = (): ColourCue => useSyncExternalStore(subscribeColourCue, getColourCue, () => "colour" as ColourCue);

export { Tile as GoalTile };

function Tile({ cell, px, dim, cue = "colour", changed }: { cell: GridCellModel; px: number; dim?: boolean; cue?: ColourCue; changed?: boolean }) {
  return (
    <span className="relative flex items-center justify-center font-mono font-semibold leading-none select-none"
      style={{
        width: px, height: px, backgroundColor: cell.css,
        fontSize: Math.round(px * 0.44), opacity: dim ? 0.32 : 1, transition: "opacity 120ms",
        ...(changed ? { outline: "2px solid currentColor", outlineOffset: -2 } : {}),
      }} data-changed={changed || undefined}>
      <span style={{ color: cell.ink }}><CellGlyph parts={cell.parts} weight={600} /></span>
      {px > 24 && <span className="absolute bottom-0.5 right-0.5 leading-none" style={{ fontSize: 9, color: cell.ink }}>{cell.letter}</span>}
    </span>
  );
}

/** One scoring unit's box in the list: what it is, what it scores, its tiles and the rule's checks. */
function UnitBox({ part, selected, model, onSelect, setRef }: {
  part: Part; selected: boolean; model: ReturnType<typeof gridModel>; onSelect: () => void; setRef: (el: HTMLDivElement | null) => void;
}) {
  const tone = toneOf(part.points);
  const small = part.cells.length <= 4 && part.shape !== "region" && part.shape !== "ring" && part.shape !== "window";
  return (
    <div ref={setRef} role="option" aria-selected={selected} tabIndex={0} onPointerEnter={e => { if (e.pointerType !== "touch") onSelect(); }}
      onFocus={onSelect} onClick={onSelect}
      className={`border bg-background px-2.5 py-2 text-xs leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "shadow-md" : "shadow-sm"}`}
      style={{ borderLeft: `4px ${TONE_DASH[tone] ? "dashed" : "solid"} ${TONE_COLOUR[tone]}`, ...(selected ? { outline: `2px solid ${TONE_COLOUR[tone]}`, outlineOffset: -1 } : {}) }}
      data-testid="goal-unit" data-tone={tone} data-part={part.id} data-selected={selected || undefined}>
      <div className="flex items-center gap-1.5">
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

const cellPx = (n: number) => (n <= 4 ? 44 : n <= 5 ? 38 : n <= 6 ? 32 : n <= 7 ? 28 : 22);
/** The list's maximum height: it scrolls inside, so a busy board never makes the page grow. */
export const UNIT_LIST_MAX_HEIGHT = "22rem";

/**
 * A board explained unit by unit. Without a rich explanation (a family without a lens, or an explanation that does not
 * add up to the card's score) it draws the board and its score only.
 */
export function GoalBoard({ goal, value, grid, caption, changed, selected: chosen, explanation: given, howItScores = true, testId = "goal-board" }: GoalBoardProps) {
  const cue = useColourCueSetting();
  const model = useMemo(() => gridModel(value, grid), [value, grid.size, grid.symbols, grid.colours]);
  const size = model?.size ?? 0;
  const geo: BoardGeometry = useMemo(() => ({ cell: cellPx(size), gap: 2, size }), [size]);
  const explanation = useMemo(() => (given !== undefined ? given : goal.explain(value)), [given, goal, value]);
  const rich = !!explanation?.verified;
  const units = useMemo(() => (rich && explanation ? sortUnits(explanation.parts) : []), [rich, explanation]);
  const geometry = useMemo(() => (rich ? goal.hover(value) ?? defaultGeometry(units) : null), [rich, goal, value, units]);
  const modes: readonly HoverMode[] = geometry?.modes ?? [];
  const [modeId, setModeId] = useState<string | null>(null);
  const mode = modes.find(m => m.id === modeId) ?? modes[0] ?? null;
  const controlled = chosen !== undefined;
  const [own, setOwn] = useState<string | null>(null);
  const selectedId = controlled ? chosen : own ?? units[0]?.id ?? null;
  const selected = units.find(u => u.id === selectedId) ?? null;
  // A unit picked in the list switches the board's hover mode to its kind, so pointing next picks the same kind.
  const pick = (u: Part, fromBoard: boolean) => {
    if (controlled) return;
    setOwn(u.id);
    if (!fromBoard) { const m = modes.find(x => x.groups.includes(groupOf(u))); if (m && m.id !== mode?.id) setModeId(m.id); }
    else scrollTo.current = u.id;
  };

  const root = useRef<HTMLDivElement>(null), board = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null);
  const boxes = useRef(new Map<string, HTMLDivElement>());
  const scrollTo = useRef<string | null>(null);
  const [arrow, setArrow] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setTick(t => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The selected box scrolls into view when the board (or the caller) picked it; then the arrow is measured.
  useLayoutEffect(() => {
    const box = selected ? boxes.current.get(selected.id) : null;
    if (box && (scrollTo.current === selected!.id || controlled)) { box.scrollIntoView?.({ block: "nearest" }); scrollTo.current = null; }
    const r = root.current?.getBoundingClientRect(), b = board.current?.getBoundingClientRect(), c = box?.getBoundingClientRect();
    const l = list.current?.getBoundingClientRect();
    if (!r || !b || !c || !selected || !l || c.bottom < l.top || c.top > l.bottom) { setArrow(null); return; }
    const below = c.left < b.right - 4, at = badgePoint(geo, selected.cells);
    const from = { x: b.left - r.left + at.x, y: b.top - r.top + at.y };
    const to = below ? { x: c.left - r.left + 12, y: c.top - r.top - 3 } : { x: c.left - r.left - 3, y: Math.max(c.top, l.top) - r.top + 14 };
    setArrow(arrowPath(from, to, below));
  }, [selected, geo, tick, controlled]);

  const workings = useMemo(() => (howItScores && rich ? goal.workings(value) : null), [howItScores, rich, goal, value]);
  if (!model) return null;
  const px = boardPx(geo);
  const lit = litCells(selected, size);
  const pointAt = (e: PointerEvent<HTMLDivElement>) => {
    if (controlled || !mode || !board.current) return;
    const b = board.current.getBoundingClientRect(), step = geo.cell + geo.gap;
    const hit = hitTest(units, mode, { x: (e.clientX - b.left) / step, y: (e.clientY - b.top) / step });
    if (hit && hit.id !== selectedId) pick(hit, true);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => { if (e.pointerType !== "touch") pointAt(e); };
  const onKey = (e: KeyboardEvent) => {
    if (!units.length) return;
    const i = Math.max(0, units.findIndex(u => u.id === selectedId));
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? Math.min(units.length - 1, i + 1)
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? Math.max(0, i - 1) : e.key === "Home" ? 0 : e.key === "End" ? units.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    pick(units[next], true);
  };
  const ord = explanation ? (typeof explanation.ordinal === "number" ? [explanation.ordinal] : explanation.ordinal) : null;
  const score = goal.score(value), scoreArr = score === null ? null : typeof score === "number" ? [score] : score;
  const total: ReactNode = rich && ord && explanation
    ? <>This board: <b>{ord[0]} point{ord[0] === 1 ? "" : "s"}</b>{explanation.components.slice(1).map((name, k) => <span key={k} className="text-muted-foreground"> · {name.replace(/^tie-break: /, "tie-break (")}{name.startsWith("tie-break: ") ? ")" : ""} {signed(ord[k + 1])}</span>)}</>
    : scoreArr ? <>This board: <b>{scoreArr[0]} point{scoreArr[0] === 1 ? "" : "s"}</b></> : null;
  const tone = selected ? toneOf(selected.points) : "zero";

  return (
    <div ref={root} className="relative text-left" data-testid={testId} data-rich={rich || undefined}>
      {caption && <p className="mb-2 text-xs leading-snug text-muted-foreground" data-testid="goal-board-caption">{caption}</p>}
      <div className="mb-2 text-xs leading-snug">
        {total && <p data-testid="goal-board-total">{total}</p>}
        {explanation && !explanation.verified && <p className="text-muted-foreground">Can't explain this board yet.</p>}
      </div>
      {modes.length > 1 && !controlled && (
        <div role="radiogroup" aria-label="Point at" className="mb-2 flex flex-wrap items-center gap-1 text-xs" data-testid="goal-hover-modes">
          <span className="text-muted-foreground">Point at:</span>
          {modes.map(m => (
            <button key={m.id} type="button" role="radio" aria-checked={m.id === mode?.id} onClick={() => setModeId(m.id)}
              className={`border px-1.5 py-0.5 ${m.id === mode?.id ? "bg-foreground text-background" : "bg-background"}`} data-testid={`goal-hover-mode-${m.id}`}>{m.label}</button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-x-12 gap-y-5">
        <div ref={board} role="application" aria-label={`Board ${size} by ${size}: point at a scoring unit, or use the arrow keys to step through them.`}
          tabIndex={0} onKeyDown={onKey} onPointerMove={onMove} onPointerDown={e => { if (e.pointerType === "touch") pointAt(e); }}
          className="relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ width: px, height: px }} data-testid="goal-board-grid">
          {model.rows.flatMap((row, r) => row.map((cell, c) => (
            <span key={`${r}-${c}`} aria-label={cell.name} className="absolute" style={{ left: cellX(geo, c), top: cellY(geo, r) }} data-cell={`${r},${c}`}>
              <Tile cell={cell} px={geo.cell} dim={!!lit && !lit[r][c]} cue={cue} changed={!!changed?.[r]?.[c]} />
            </span>
          )))}
          <svg className="pointer-events-none absolute inset-0 overflow-visible" width={px} height={px} aria-hidden>
            {selected && (isStroke(selected.shape) ? (
              <path data-part={selected.id} d={pillPath(geo, selected.cells, geo.cell * 0.47)} stroke={TONE_COLOUR[tone]} strokeWidth={3}
                strokeDasharray={TONE_DASH[tone]} fill={TONE_COLOUR[tone]} fillOpacity={0.1} />
            ) : (
              <path data-part={selected.id} d={outlinePath(geo, selected.cells, 2)} stroke={TONE_COLOUR[tone]} strokeWidth={3} strokeDasharray={TONE_DASH[tone]} strokeLinecap="square" fill="none" />
            ))}
            {selected && (selected.links ?? []).map((l, k) => (
              <path key={`l${k}`} d={linkPath(geo, l.from, l.to)} fill="none" stroke={l.ok ? TONE_COLOUR.gain : TONE_COLOUR.loss}
                strokeWidth={2.5} strokeDasharray={l.ok ? undefined : "5 4"} strokeLinecap="round" />
            ))}
            {selected && (selected.spots ?? []).map((s, k) => {
              const c = centre(geo, s.cell);
              return <circle key={`s${k}`} cx={c.x} cy={c.y} r={geo.cell * 0.36} fill="none" stroke="#0f172a" strokeOpacity={0.75} strokeWidth={2} strokeDasharray="3 3" />;
            })}
            {selected && (() => { const at = badgePoint(geo, selected.cells); return <circle cx={at.x} cy={at.y} r={5} fill={TONE_COLOUR[tone]} stroke="white" strokeWidth={1.5} />; })()}
          </svg>
        </div>
        {rich && (
          <div ref={list} role="listbox" aria-label="Scoring units, gains first" className="min-w-[13rem] max-w-[22rem] flex-1 space-y-2 overflow-y-auto pr-1"
            style={{ maxHeight: UNIT_LIST_MAX_HEIGHT }} onScroll={() => setTick(t => t + 1)} data-testid="goal-units">
            {units.map(u => (
              <UnitBox key={u.id} part={u} selected={u.id === selectedId} model={model} onSelect={() => pick(u, false)}
                setRef={el => { if (el) boxes.current.set(u.id, el); else boxes.current.delete(u.id); }} />
            ))}
          </div>
        )}
      </div>
      {workings && <div className="mt-4"><HowThisScores workings={workings} /></div>}
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%" aria-hidden>
        <defs>
          {(["gain", "loss", "zero"] as const).map(t => (
            <marker key={t} id={`goal-arrow-${t}`} viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 z" fill={TONE_COLOUR[t]} />
            </marker>
          ))}
        </defs>
        {arrow && <path d={arrow} fill="none" stroke={TONE_COLOUR[tone]} strokeOpacity={0.8} strokeWidth={1.75} markerEnd={`url(#goal-arrow-${tone})`} data-testid="goal-unit-arrow" />}
      </svg>
      <span aria-live="polite" className="sr-only">{selected ? `${selected.title}, ${pointsText(selected.points)}. ${selected.facts.map(f => `${f.ok ? TONE_MARK.gain : TONE_MARK.loss} ${f.text}`).join(". ")}` : ""}</span>
    </div>
  );
}
