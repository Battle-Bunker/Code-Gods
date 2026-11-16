/**
 * Prints the tuples a tree family (any family with a parameter space) gives example lines, and what each cheap move does to them: the tables of
 * docs/engine-v2/tree-families/*.md.
 *   node --experimental-strip-types lib/v2-linear/scripts/tree-walk.ts <family id> '<params as typed>' 'a,b,c' ['a,b,c' …]
 */
import { applyCall, evaluateSite, isInvalid, scoreToWire } from "@workspace/v2-core";
import { describeLine, lineQ, lineType, normalise, type Line, type LineState } from "../src/index.ts";

const treeGeoFamilies = lineType.families.filter(x => x.space) as unknown as { id: string; title: string; space: { parse(t: string): unknown; label(p: never): string }; main: { id: string }; tieBreakers: { id: string }[]; card(p: never, tb: string): string }[];

const [id, typed, ...lines] = process.argv.slice(2);
const f = treeGeoFamilies.find(x => x.id === id);
if (!f) throw new Error(`no family ${id}: ${treeGeoFamilies.map(x => x.id).join(", ")}`);
const p = f.space.parse(typed!);
if ("invalid" in (p as object)) throw new Error((p as { invalid: string }).invalid);
const chain = f.tieBreakers.map(t => t.id).join(">");
const tuple = (s: LineState) => { const t = scoreToWire(evaluateSite(lineType, f as never, p, s, lineQ, 0, chain).score); return t ? `(${t.map(x => x ?? "none").join(", ")})` : "no score"; };
const MOVES: [string, object][] = [
  ["shift up 1", { mutator: "si.shift", site: 0, args: { k: "1" } }], ["shift down 1", { mutator: "si.shift", site: 0, args: { k: "-1" } }],
  ["tilt +1", { mutator: "si.tilt", site: 0, args: { k: "1" } }], ["tilt −1", { mutator: "si.tilt", site: 0, args: { k: "-1" } }],
  ["mirror in the x-axis", { mutator: "cart.mirror", site: 0, args: { axis: "x" } }], ["mirror in the y-axis", { mutator: "cart.mirror", site: 0, args: { axis: "y" } }],
  ["stretch by 2", { mutator: "mach.stretch", site: 0, args: { f: "2" } }],
  ["tilt +1/7", { mutator: "si.tilt", site: 0, args: { k: "1/7" } }],
];
console.log(`${f.title}, ${f.space.label(p as never)}; layers: ${[f.main.id, ...f.tieBreakers.map(t => t.id)].join(", ")}\n\n${f.card(p as never, chain)}\n`);
for (const l of lines) {
  const [a, b, c] = l.split(",").map(BigInt) as [bigint, bigint, bigint];
  const s: LineState = { lines: [normalise(a, b, c) as Line] };
  console.log(`| ${describeLine(s.lines[0]!)} | ${tuple(s)} |`);
  for (const [name, call] of MOVES) {
    const r = applyCall(lineType, lineQ, s, call as never);
    console.log(isInvalid(r) ? `|   ${name} | refused: ${r.invalid} |` : `|   ${name} → ${describeLine((r.result as LineState).lines[0]!)} | ${tuple(r.result as LineState)} |`);
  }
}
