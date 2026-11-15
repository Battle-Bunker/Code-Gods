/**
 * pnpm --filter @workspace/v2-valuation pmi -- [--presets grids-beginner,grids-more-rules] [--draws 200000] [--levels 4,6,8] [--seed s]
 *
 * Independence of seated grid rules (owner decision 39: rules as roughly perpendicular value vectors, so that two
 * players at 20 bits each mark an object as rare as 40 bits). For every pair of dealt rules A, B (one per family per
 * tie-breaker) and a level of t bits: PMI(t) = log2 P(A ≥ t, B ≥ t) − log2 P(A ≥ t) − log2 P(B ≥ t), where "A ≥ t"
 * is the upper set of boards whose bits under A's committed value function are at least t, all three estimated from
 * the same boards drawn from π. 0: independent (joint rarity is the sum of bits); > 0: aligned (the pair is easier to
 * satisfy together than apart); < 0: in tension. A pair whose joint upper set is too thin is reported as such.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, evaluateSite, hashHex, rng, type RuleFamily } from "@workspace/v2-core";
import { grid4, gridPresets, gridType, type GridState } from "@workspace/v2-grid";
import { valueLookup, type ValueFunction } from "./value.ts";
import { drawFromPi } from "./value-grid.ts";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]!; };
const presetIds = opt("presets", "grids-beginner,grids-more-rules").split(",");
const DRAWS = Number(opt("draws", "200000")), LEVELS = opt("levels", "4,6,8").split(",").map(Number), MIN_JOINT = 30;
const draw = drawFromPi(grid4, rng("pmi", opt("seed", "v2")));

interface Rule { name: string; family: string; bits: (cells: number[]) => number }
const VALUES = join(import.meta.dirname, "..", "values", grid4.id);
const rules: Rule[] = [];
for (const id of presetIds) {
  const preset = gridPresets.find(p => p.id === id);
  if (!preset) throw new Error(`No grid preset ${id}`);
  for (const pr of preset.rules) {
    const family = gridType.families.find(f => f.id === pr.family) as RuleFamily<GridState, unknown>;
    for (const tb of pr.tieBreakers) {
      const file = join(VALUES, pr.family, `${hashHex(canonicalJson(pr.params))}-${tb}.json`);
      if (!existsSync(file)) continue;
      const look = valueLookup(JSON.parse(readFileSync(file, "utf8")) as ValueFunction);
      rules.push({ name: `${pr.family}+${tb}`, family: pr.family, bits: cells => look(evaluateSite(gridType, family, pr.params, { cells }, grid4, 0, tb).score).bits });
    }
  }
}

// Each rule's bits on every drawn board, as one array per rule.
const bits = rules.map(() => new Float32Array(DRAWS));
for (let k = 0; k < DRAWS; k++) { const b = draw(); for (const [i, r] of rules.entries()) bits[i]![k] = r.bits(b); }

const L = LEVELS.length;
const marginal = rules.map((_, i) => LEVELS.map(t => { let n = 0; for (let k = 0; k < DRAWS; k++) if (bits[i]![k]! >= t) n++; return n; }));
/** pmi[i][j][l]: NaN when the joint upper set holds fewer than MIN_JOINT boards (too thin to read). */
const pmi = rules.map(() => rules.map(() => new Array<number>(L).fill(NaN)));
for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) {
  if (rules[i]!.family === rules[j]!.family) continue;
  for (const [l, t] of LEVELS.entries()) {
    let n = 0;
    const a = bits[i]!, b = bits[j]!;
    for (let k = 0; k < DRAWS; k++) if (a[k]! >= t && b[k]! >= t) n++;
    const v = n < MIN_JOINT ? NaN : Math.log2(n / DRAWS) - Math.log2(marginal[i]![l]! / DRAWS) - Math.log2(marginal[j]![l]! / DRAWS);
    pmi[i]![j]![l] = v; pmi[j]![i]![l] = v;
  }
}

const fams = [...new Set(rules.map(r => r.family))];
const famPmi = (f: string, g: string, l: number) => {
  const vs: number[] = [];
  for (const [i, A] of rules.entries()) for (const [j, B] of rules.entries()) if (A.family === f && B.family === g && !Number.isNaN(pmi[i]![j]![l]!)) vs.push(pmi[i]![j]![l]!);
  return vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : NaN;
};
console.log(`PMI ${presetIds.join(" + ")}: ${rules.length} rules, ${DRAWS} boards from π; PMI(t) = log2 P(A≥t, B≥t) − log2 P(A≥t) − log2 P(B≥t), bits; "·" too thin (joint < ${MIN_JOINT} boards)`);
for (const [l, t] of LEVELS.entries()) {
  console.log(`\nFAMILY PAIRS at t = ${t} bits (mean over tie-breakers):`);
  console.log("".padEnd(20) + fams.map(f => f.slice(0, 6).padStart(7)).join(""));
  for (const f of fams) console.log(f.padEnd(20) + fams.map(g => { if (f === g) return "      ·"; const v = famPmi(f, g, l); return Number.isNaN(v) ? "      ·" : v.toFixed(2).padStart(7); }).join(""));
  const all: number[] = [];
  for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) if (!Number.isNaN(pmi[i]![j]![l]!)) all.push(pmi[i]![j]![l]!);
  const near = all.filter(v => Math.abs(v) <= 0.5).length, pos = all.filter(v => v > 0.5).length, neg = all.filter(v => v < -0.5).length;
  console.log(`rule pairs read at ${t} bits: ${all.length}; |PMI| ≤ 0.5: ${near}; > 0.5 (aligned): ${pos}; < −0.5 (tension): ${neg}`);
  const top = rules.flatMap((A, i) => rules.map((B, j) => ({ i, j, v: pmi[i]![j]![l]! }))).filter(x => x.i < x.j && !Number.isNaN(x.v)).sort((x, y) => y.v - x.v);
  console.log(`most aligned: ${top.slice(0, 6).map(x => `${rules[x.i]!.name} × ${rules[x.j]!.name} ${x.v.toFixed(2)}`).join("; ")}`);
  console.log(`most in tension: ${top.slice(-4).map(x => `${rules[x.i]!.name} × ${rules[x.j]!.name} ${x.v.toFixed(2)}`).join("; ")}`);
}
