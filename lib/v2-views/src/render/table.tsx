/**
 * The table scene (table of values): a header row and a value row, one column per element; cited columns light.
 *
 * A scene may carry rows under the values (the line's "y ÷ x"). A row is drawn only when a mark cites one of its cells,
 * so other rules read the table as plain values. A row with `check: "whole"` ticks each whole number and crosses the
 * first cell from the left that is not one (where a run of multiples stops). A column whose row cell a rule focuses is
 * shaded as part of the run. With rows drawn, a column with no cell in them is left out of the compact face.
 */
import type { ElementRef, ElementValue } from "@workspace/v2-core";
import type { TableRow, TableScene } from "@workspace/v2-linear";
import { fmtValue } from "../format.ts";
import { markRefs } from "../refs.ts";
import type { RenderProps, SceneRenderer } from "../scene.ts";
import { compactMarks, El, key, markState, Readouts } from "./common.tsx";

type Table = TableScene;

const isWhole = (v: ElementValue): boolean => v.kind === "number" && v.q.d === 1n;

/**
 * "x" and ["0", "1", …] when every header reads "x = …", else null: the variable is written once in the corner, so
 * nine columns fit a phone.
 */
function factorHeaders(headers: readonly string[]): { name: string; values: string[] } | null {
  const parts = headers.map(h => /^(\S+) = (.+)$/.exec(h));
  const name = parts[0]?.[1];
  if (!name || parts.some(m => !m || m[1] !== name)) return null;
  return { name, values: parts.map(m => m![2]!) };
}

/** The index of the first cell from the left that is not a whole number, or −1. */
function firstMiss(row: TableRow, values: (r: ElementRef) => ElementValue): number {
  return row.cells.findIndex(c => c !== null && !isWhole(values(c)));
}

function Scene({ p }: { p: RenderProps<Table> }) {
  const marks = compactMarks(p);
  const q = { ...p, marks };
  const first = p.scene.columns[0];
  if (first && p.values(first.el).kind === "undefined") return <div className="v2v-undef">{fmtValue(p.values(first.el))}</div>;
  const cited = new Set(marks.flatMap(m => markRefs(m).map(key)));
  const rows = (p.scene.rows ?? []).filter(r => r.cells.some(c => c !== null && cited.has(key(c))));
  let idx = p.scene.columns.map((_, i) => i);
  if (p.size === "compact") idx = idx.filter(i => rows.every(r => r.cells[i] != null)).slice(0, 4);
  const misses = rows.map(r => (r.check === "whole" ? firstMiss(r, p.values) : -1));
  const inRun = (i: number) => rows.some(r => { const c = r.cells[i]; return c != null && markState(marks, c).focus; });
  const placed = new Set([...idx.map(i => key(p.scene.columns[i]!.el)), ...rows.flatMap(r => idx.flatMap(i => (r.cells[i] ? [key(r.cells[i]!)] : [])))]);
  const run = (i: number) => (inRun(i) ? "" : undefined);
  const factored = factorHeaders(p.scene.columns.map(c => c.header));
  const labels = factored !== null || rows.length > 0;
  const header = (i: number) => (factored ? factored.values[i]! : p.scene.columns[i]!.header);
  return (
    <>
      <div className="v2v-table-wrap">
        <table className="v2v-table" aria-label={tableText(p.scene, p.values)}>
          <thead>
            <tr>
              {labels && <th scope="row">{factored?.name ?? ""}</th>}
              {idx.map(i => <th key={i} scope="col" data-run={run(i)}>{header(i)}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              {labels && <th scope="row">{p.scene.valueLabel ?? ""}</th>}
              {idx.map(i => { const c = p.scene.columns[i]!; return <td key={i} data-run={run(i)}><El p={q} r={c.el}>{fmtValue(p.values(c.el))}</El></td>; })}
            </tr>
            {rows.map((r, ri) => (
              <tr key={r.label} data-row="">
                <th scope="row">{r.label}</th>
                {idx.map(i => {
                  const c = r.cells[i];
                  if (!c) return <td key={i} className="v2v-table-none" data-run={run(i)} />;
                  const v = p.values(c);
                  const miss = misses[ri] === i;
                  return (
                    <td key={i} data-run={run(i)} data-miss={miss ? "" : undefined}>
                      <El p={q} r={c}>{fmtValue(v)}</El>
                      {r.check === "whole" && (isWhole(v) ? <span className="v2v-check" aria-label="whole">✓</span> : miss ? <span className="v2v-check" aria-label="not whole">✗</span> : null)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Readouts p={q} placed={placed} />
    </>
  );
}

function tableText(scene: Table, values: (r: ElementRef) => ElementValue): string {
  return scene.columns.map(c => `${c.header}: ${fmtValue(values(c.el))}`).join(", ");
}

export const tableRenderer: SceneRenderer<Table> = {
  kind: "table",
  box: { compact: { w: 160, h: 100 }, expanded: { w: 320, h: 220 } },
  render: p => <Scene p={p} />,
  text: tableText,
};
