/**
 * Alternative interaction modes for rules a focus cell explains poorly (docs/annotations-design.md §11):
 *
 *   PartScrubber   step through every piece of the rule in reading order with a running total ("count as you go"):
 *                  for whole-board counts and long lines, where no one cell owns the story.
 *   WhatIfBoard    pick a cell, see every way it could change, each scored by the card program, and preview any of
 *                  them: for global rules (centroids, maxima, totals) where a cell's role is "it moves the score".
 *   StoryPlayer    a process rule told step by step (Castle Keeper's flood), ending on the score.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS, type GridColourSet, type GridSymbolSet, type Instantiation } from "@workspace/game-types";
import {
  toneOf, whatIf, type Cell, type Draw, type FocusView, type GoalExplainer, type Part, type Story, type StoryRole, type WhatIfEntry,
} from "@workspace/game-utilities";
import { gridModel } from "../grid-display.ts";
import type { GridSettings } from "../registry.ts";
import { GoalBoard, GoalTile, useColourCueSetting as useCue } from "./GoalBoard.tsx";
import { TONE_COLOUR, boardPx, cellX, cellY, groupRows, moveFocus, signed } from "./layout.ts";
const btn = "border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-40";

/** Prev / play / next and a step counter, shared by the scrubber and the story player. */
function Stepper({ index, count, onIndex, label, interval = 1400 }: { index: number; count: number; onIndex: (i: number) => void; label: ReactNode; interval?: number }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (index >= count - 1) { setPlaying(false); return; }
    const t = setTimeout(() => onIndex(index + 1), interval);
    return () => clearTimeout(t);
  }, [playing, index, count, interval]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="mode-stepper">
      <button type="button" className={btn} disabled={index <= 0} onClick={() => onIndex(index - 1)} aria-label="Previous step" data-testid="button-step-prev">◀</button>
      <button type="button" className={btn} onClick={() => { if (index >= count - 1) onIndex(0); setPlaying(p => !p); }} data-testid="button-step-play">{playing ? "Pause" : "Play"}</button>
      <button type="button" className={btn} disabled={index >= count - 1} onClick={() => onIndex(index + 1)} aria-label="Next step" data-testid="button-step-next">▶</button>
      <input type="range" min={0} max={Math.max(0, count - 1)} value={index} onChange={e => onIndex(Number(e.target.value))} aria-label="Step" className="w-40" />
      <span className="text-muted-foreground" aria-live="polite">{label}</span>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// part scrubber
// ------------------------------------------------------------------------------------------------

/** Every piece of the board's explanation, one at a time in reading order, with the points counted so far. */
export function PartScrubber({ goal, value, grid, testId = "part-scrubber" }: { goal: GoalExplainer; value: string; grid: GridSettings; testId?: string }) {
  const explanation = useMemo(() => goal.explain(value), [goal, value]);
  // Pieces with cells (a piece is drawn on the board); a new board starts again from the first.
  const parts = useMemo(() => (explanation?.parts ?? []).filter(p => p.cells.length > 0), [explanation]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [goal, value]);
  if (!explanation?.verified || !parts.length) return <GoalBoard goal={goal} value={value} grid={grid} explanation={explanation} testId={testId} />;
  const part: Part = parts[Math.min(index, parts.length - 1)];

  const step = Math.min(index, parts.length - 1);
  const sofar = explanation.components.map((_, k) => parts.slice(0, step + 1).reduce((s, p) => s + p.points[k], 0));
  const view: FocusView = { focus: part.cells[0], headline: `Piece ${step + 1} of ${parts.length}`, parts: [part] };
  return (
    <div className="space-y-2" data-testid={testId}>
      <Stepper index={step} count={parts.length} onIndex={setIndex}
        label={<>Counted so far: <b className="text-foreground" data-testid="scrubber-sofar">{sofar[0]} point{sofar[0] === 1 ? "" : "s"}</b>
          {sofar.length > 1 && <> · tie-break {signed(sofar[1])}</>}</>} />
      <GoalBoard goal={goal} value={value} grid={grid} view={view} explanation={explanation} testId={`${testId}-board`} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// what-if preview
// ------------------------------------------------------------------------------------------------

const VERDICT_BG: Readonly<Record<-1 | 0 | 1, string>> = { 1: "rgba(22,163,74,0.18)", 0: "transparent", [-1]: "rgba(220,38,38,0.14)" };

/**
 * Pick a cell (hover, tap or the arrow keys); the table lists every symbol × colour it could show, each scored by the
 * card program, better in green and worse in red. Point at one to see the board it makes and its score.
 */
export function WhatIfBoard({ draw, inst, goal, value, grid, initialFocus = { r: 0, c: 0 }, testId = "what-if" }: {
  draw: Draw; inst: Instantiation; goal: GoalExplainer; value: string; grid: GridSettings; initialFocus?: Cell; testId?: string;
}) {
  const cue = useCue();
  const [focus, setFocus] = useState<Cell>(initialFocus);
  const [preview, setPreview] = useState<WhatIfEntry | null>(null);
  const table = useMemo(() => whatIf(draw, inst, value, focus), [draw, inst, value, focus]);
  const shown = preview?.value ?? value;
  const model = useMemo(() => gridModel(shown, grid), [shown, grid.size, grid.symbols, grid.colours]);
  if (!model || !table) return null;
  const size = model.size, px = 44, geo = { cell: px, gap: 2, size };
  const score = (o: number | readonly number[]) => (typeof o === "number" ? o : o[0]);
  const symbols = SYMBOL_COMPONENTS[grid.symbols as GridSymbolSet], colours = COLOUR_COMPONENTS[grid.colours as GridColourSet];
  const best = table.entries.flat().reduce((a, b) => (b.verdict > a.verdict || (b.verdict === a.verdict && b.delta > a.delta) ? b : a));
  // Symbols whose rows score alike are one row ("any number" for a colour-only rule), so the table stays short.
  const groups = groupRows(table.entries);
  return (
    <div className="flex flex-wrap items-start gap-x-10 gap-y-4" data-testid={testId}>
      <div className="space-y-2">
        <p className="text-xs" aria-live="polite" data-testid="what-if-score">
          {preview
            ? <>With this change: <b>{score(preview.ordinal)} points</b> <span style={{ color: TONE_COLOUR[toneOf([preview.delta])] }}>({signed(preview.delta)})</span></>
            : <>This board: <b>{score(table.ordinal)} points</b>. Pick a cell, then point at a change.</>}
        </p>
        <div role="grid" tabIndex={0} aria-label="Board: pick a cell" className="relative outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ width: boardPx(geo), height: boardPx(geo) }}
          onKeyDown={e => {
            const next = moveFocus(focus, e.key, size);
            if (next) { e.preventDefault(); setPreview(null); setFocus(next); }
          }}>
          {model.rows.flatMap((row, r) => row.map((cell, c) => (
            <span key={`${r}-${c}`} role="gridcell" aria-selected={focus.r === r && focus.c === c} className="absolute" style={{ left: cellX(geo, c), top: cellY(geo, r) }}
              data-cell={`${r},${c}`} onPointerEnter={e => { if (e.pointerType !== "touch" && !preview) setFocus({ r, c }); }} onPointerDown={() => { setPreview(null); setFocus({ r, c }); }}>
              <GoalTile cell={cell} px={px} cue={cue} changed={!!preview && focus.r === r && focus.c === c} />
            </span>
          )))}
          <svg className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden width={boardPx(geo)} height={boardPx(geo)}>
            <rect x={cellX(geo, focus.c) - 3} y={cellY(geo, focus.r) - 3} width={px + 6} height={px + 6} rx={5} fill="none" stroke="currentColor" strokeWidth={3} />
          </svg>
        </div>
        <p className="max-w-[16rem] text-xs text-muted-foreground" data-testid="what-if-best">
          {best.verdict > 0
            ? <>Best change here: <b className="text-foreground">{symbols.glyphs[best.sym]} in {colours.names[best.col]}</b> ({signed(best.delta)}).</>
            : <>No change to this cell helps you: it is already as good as it gets.</>}
        </p>
      </div>
      <figure className="border bg-background px-2.5 py-2 text-xs" data-testid="what-if-table" onPointerLeave={() => setPreview(null)}>
        <figcaption className="mb-1 font-semibold">What if this cell showed…</figcaption>
        <table className="border-separate" style={{ borderSpacing: "3px 2px" }}>
          <thead><tr><th />{colours.names.map(n => <th key={n} className="font-normal text-muted-foreground">{n}</th>)}</tr></thead>
          <tbody>
            {groups.map(({ syms, row }) => (
              <tr key={syms[0]}>
                <th className="pr-1 text-right font-mono font-normal text-muted-foreground">
                  {syms.length === table.entries.length ? "any" : syms.length > 3 ? `${symbols.glyphs[syms[0]]}…${symbols.glyphs[syms[syms.length - 1]]}` : syms.map(x => symbols.glyphs[x]).join(" ")}
                </th>
                {row.map(e => (
                  <td key={e.col} onPointerEnter={() => setPreview(e)} onFocus={() => setPreview(e)} tabIndex={0}
                    className="cursor-default px-1 text-center font-mono" data-verdict={e.verdict} data-current={e.current || undefined}
                    style={{ background: VERDICT_BG[e.verdict], outline: e.current ? "2px solid currentColor" : preview === e ? "2px dashed currentColor" : undefined, minWidth: 34 }}>
                    {e.current ? "now" : signed(e.delta)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// story player
// ------------------------------------------------------------------------------------------------

const ROLE_STYLE: Readonly<Record<StoryRole, { fill: string; stroke: string; mark: string }>> = {
  wall: { fill: "transparent", stroke: "#0f172a", mark: "" },
  water: { fill: "rgba(37,99,235,0.42)", stroke: "transparent", mark: "≈" },
  "new-water": { fill: "rgba(37,99,235,0.7)", stroke: "#1d4ed8", mark: "≈" },
  "shut-in": { fill: "rgba(234,179,8,0.35)", stroke: "#a16207", mark: "★" },
};

/** A process rule told step by step on its board, with narration and the score at the end. */
export function StoryPlayer({ story, value, grid, testId = "story-player" }: { story: Story; value: string; grid: GridSettings; testId?: string }) {
  const cue = useCue();
  const [index, setIndex] = useState(0);
  const model = useMemo(() => gridModel(value, grid), [value, grid.size, grid.symbols, grid.colours]);
  if (!model) return null;
  const frame = story.frames[Math.min(index, story.frames.length - 1)];
  const px = 44, geo = { cell: px, gap: 2, size: model.size };
  return (
    <div className="space-y-2" data-testid={testId}>
      <Stepper index={index} count={story.frames.length} onIndex={setIndex} label={`Step ${index + 1} of ${story.frames.length}`} interval={1600} />
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div className="relative" style={{ width: boardPx(geo), height: boardPx(geo) }}>
          {model.rows.flatMap((row, r) => row.map((cell, c) => (
            <span key={`${r}-${c}`} className="absolute" style={{ left: cellX(geo, c), top: cellY(geo, r) }}><GoalTile cell={cell} px={px} cue={cue} /></span>
          )))}
          <svg className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden width={boardPx(geo)} height={boardPx(geo)}>
            {frame.marks.map(({ cell, role }, i) => {
              const st = ROLE_STYLE[role], x = cellX(geo, cell.c), y = cellY(geo, cell.r);
              return (
                <g key={i} data-role={role}>
                  <rect x={x + 1.5} y={y + 1.5} width={px - 3} height={px - 3} fill={st.fill} stroke={st.stroke} strokeWidth={role === "wall" ? 3.5 : 2} rx={3} />
                  {st.mark && <text x={x + px - 9} y={y + 13} fontSize={12} fontWeight={700} fill={role === "shut-in" ? "#713f12" : "white"} textAnchor="middle">{st.mark}</text>}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="max-w-[20rem] space-y-1">
          <p className="text-sm leading-snug" aria-live="polite" data-testid="story-text">{frame.text}</p>
          {frame.points !== undefined && <p className="text-sm" data-testid="story-points">Score: <b>{frame.points} point{frame.points === 1 ? "" : "s"}</b></p>}
          <p className="text-[11px] text-muted-foreground">≈ water · ★ shut in · thick outline: wall</p>
        </div>
      </div>
    </div>
  );
}
