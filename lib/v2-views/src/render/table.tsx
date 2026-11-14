/** The table scene (table of values): a header row and a value row, one column per element; cited columns light. */
import type { ElementRef, ElementValue, SceneData } from "@workspace/v2-core";
import { fmtValue } from "../format.ts";
import type { RenderProps, SceneRenderer } from "../scene.ts";
import { compactMarks, El, key, Readouts } from "./common.tsx";

type Table = Extract<SceneData, { kind: "table" }>;

function Scene({ p }: { p: RenderProps<Table> }) {
  const marks = compactMarks(p);
  const q = { ...p, marks };
  const first = p.scene.columns[0];
  if (first && p.values(first.el).kind === "undefined") return <div className="v2v-undef">{fmtValue(p.values(first.el))}</div>;
  const cols = p.size === "compact" ? p.scene.columns.slice(0, 4) : p.scene.columns;
  const placed = new Set(cols.map(c => key(c.el)));
  return (
    <>
      <table className="v2v-table" aria-label={tableText(p.scene, p.values)}>
        <thead><tr>{cols.map(c => <th key={key(c.el)} scope="col">{c.header}</th>)}</tr></thead>
        <tbody><tr>{cols.map(c => <td key={key(c.el)}><El p={q} r={c.el}>{fmtValue(p.values(c.el))}</El></td>)}</tr></tbody>
      </table>
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
