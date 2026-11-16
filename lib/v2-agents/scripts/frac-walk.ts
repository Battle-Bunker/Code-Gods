/**
 * One rule family's tuple and bits for given lines (gradient;intercept), and after each cheap move of row 10, for a
 * walk-through (docs/engine-v2/fraction-families.md):
 *
 *   node --experimental-strip-types scripts/frac-walk.ts repeating-bottom '{"B":3}' "near>x-whole" "5/26;7/13" "2;5"
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyCall, canonicalJson, evaluateSite, hashHex, isInvalid, Qn } from "@workspace/v2-core";
import { lineType, fromMC } from "@workspace/v2-linear";
import { findVariant, valueLookup } from "@workspace/v2-valuation";
const [fid, pj, tb, ...lines] = process.argv.slice(2);
const { variant } = findVariant("line-q");
const fam = lineType.families.find(f => f.id === fid)!;
const params = JSON.parse(pj!);
const look = valueLookup(JSON.parse(readFileSync(join(import.meta.dirname, "../../v2-valuation/values/line-q", fid!, `${hashHex(canonicalJson(params))}-${tb}.json`), "utf8")));
const show = (s: any) => { const e = evaluateSite(lineType, fam as never, params, s, variant, 0, tb!); const t = e.score?.map(x => x === null ? "–" : Qn.toWire(x as never)); return `${lineType.encode(s)} (${t?.join(", ")}) ${e.score ? look(e.score).bits.toFixed(1) : 0} bits`; };
const BUMPS: [string, string, Record<string, string>][] = [["shift +1", "si.shift", { k: "1" }], ["tilt +1", "si.tilt", { k: "1" }], ["nudge a", "gen.nudge", { which: "a", k: "1" }], ["nudge b", "gen.nudge", { which: "b", k: "1" }], ["nudge c", "gen.nudge", { which: "c", k: "1" }], ["half shift", "si.shift", { k: "1/2" }], ...["x", "y", "origin", "diagonal"].map(a => [`mirror ${a}`, "cart.mirror", { axis: a }] as [string, string, Record<string, string>])];
for (const l of lines) {
  const [m, c] = l.split(";").map(x => Qn.parse(x));
  const s = { lines: [fromMC(m!, c!)] } as any;
  console.log(`\n${l}: ${show(s)}`);
  for (const [n, mu, a] of BUMPS) { const r = applyCall(lineType, variant, s, { mutator: mu, site: 0, args: a }); console.log(`  ${n}: ${isInvalid(r) ? "invalid" : show(r.result)}`); }
}
