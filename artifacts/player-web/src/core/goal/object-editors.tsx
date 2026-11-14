/**
 * The object editor, able to set every legal value of its instantiation: pick a cell (click, or arrow keys), then its
 * symbol and colour from the board's own palette (src/lib/object-editor-model.ts).
 */
import { MONO_TILE } from "@workspace/object-views";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { isMonoColours, type GridColourSet, type Instantiation, type ObjectValue } from "@workspace/game-types";
import { gridCellsOf, gridPalette, withGridCell } from "@/lib/object-editor-model";

export interface ObjectEditorProps {
  value: ObjectValue;
  inst: Instantiation;
  onChange: (value: ObjectValue) => void;
}

/** The editor for the instantiation's objects (grids are the only object type). */
export function ObjectEditor(props: ObjectEditorProps) {
  return <GridEditor {...props} />;
}

function GridEditor({ value, inst, onChange }: ObjectEditorProps) {
  const palette = useMemo(() => gridPalette(inst), [inst]);
  const cells = useMemo(() => gridCellsOf(value, inst), [value, inst]);
  const [at, setAt] = useState<[number, number]>([0, 0]);
  // Arrow keys move the selection and focus with it (a roving tabindex: one tab stop for the whole board).
  const focusNext = useRef(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => { if (focusNext.current) { focusNext.current = false; buttons.current.get(`${at[0]},${at[1]}`)?.focus(); } }, [at]);
  const size = cells?.length ?? 0;
  useEffect(() => { if (at[0] >= size || at[1] >= size) setAt([0, 0]); }, [size]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cells) return <p className="text-xs text-destructive">This value is not a grid of this board.</p>;
  const [r, c] = at[0] < size && at[1] < size ? at : [0, 0];
  const cell = cells[r][c];
  const set = (patch: { sym?: number; col?: number }) => onChange(withGridCell(value, inst, r, c, patch));
  // A numbers-only (mono) board has one colour: nothing about colour is named, keyed or offered.
  const mono = isMonoColours(inst.args.colours as GridColourSet);
  const name = (rr: number, cc: number) => mono ? palette.symbols[cells[rr][cc].sym].name : `${palette.colours[cells[rr][cc].col].name} ${palette.symbols[cells[rr][cc].sym].name}`;

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (copy, zoom) stay the browser's
    const move: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const step = (n: number, k: number, d: number) => (n + d + k) % k;
    if (move[e.key]) {
      e.preventDefault();
      setAt([Math.min(size - 1, Math.max(0, r + move[e.key][0])), Math.min(size - 1, Math.max(0, c + move[e.key][1]))]);
      focusNext.current = true;
    } else if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault(); set({ sym: step(cell.sym, palette.symbols.length, e.key === "-" ? -1 : 1) });
    } else if (!mono && (e.key === "c" || e.key === "C")) {
      e.preventDefault(); set({ col: step(cell.col, palette.colours.length, e.key === "C" ? -1 : 1) });
    }
  };

  return (
    <div className="space-y-3" data-testid="object-editor-grid">
      <div role="grid" aria-label={`Board cells: arrow keys move, + and − change the symbol${mono ? "" : ", c changes the colour"}`} className="inline-grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${size}, 2.25rem)` }} onKeyDown={onKey}>
        {cells.map((row, rr) => row.map((x, cc) => {
          const selected = rr === r && cc === c, colour = palette.colours[x.col];
          return (
            <button key={`${rr},${cc}`} type="button" role="gridcell" aria-selected={selected} tabIndex={selected ? 0 : -1}
              aria-label={`Row ${rr + 1}, column ${cc + 1}: ${name(rr, cc)}`} data-testid={`editor-cell-${rr}-${cc}`}
              ref={el => { if (el) buttons.current.set(`${rr},${cc}`, el); else buttons.current.delete(`${rr},${cc}`); }}
              onClick={() => setAt([rr, cc])}
              className={`h-9 w-9 font-mono text-sm font-semibold ${selected ? "outline outline-2 outline-offset-1 outline-ring" : ""}`}
              style={mono ? { background: MONO_TILE.css, color: MONO_TILE.ink } : { background: colour.css, color: colour.ink }}>
              {palette.symbols[x.sym].glyph}
            </button>
          );
        }))}
      </div>
      <div className="flex flex-wrap items-end gap-4 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Symbol of row {r + 1}, column {c + 1}</span>
          <select className="border bg-background px-2 py-1 text-sm" value={cell.sym} data-testid="editor-symbol"
            onChange={e => set({ sym: Number(e.target.value) })}>
            {palette.symbols.map(s => <option key={s.index} value={s.index}>{s.glyph} ({s.name})</option>)}
          </select>
        </label>
        {!mono && <fieldset className="flex flex-col gap-1">
          <legend className="text-muted-foreground">Colour</legend>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Colour of row ${r + 1}, column ${c + 1}`}>
            {palette.colours.map(k => (
              <button key={k.index} type="button" role="radio" aria-checked={cell.col === k.index} title={k.name}
                data-testid={`editor-colour-${k.letter}`} onClick={() => set({ col: k.index })}
                className={`h-7 min-w-7 px-1 text-[11px] font-semibold ${cell.col === k.index ? "outline outline-2 outline-offset-1 outline-ring" : ""}`}
                style={{ background: k.css, color: k.ink }}>
                {k.letter}<span className="sr-only"> {k.name}</span>
              </button>
            ))}
          </div>
        </fieldset>}
      </div>
    </div>
  );
}
