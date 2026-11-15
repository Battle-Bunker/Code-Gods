/**
 * Generates src/compat.gen.ts: a verdict for every pair of dealt rules of the beginner presets (lines-beginner on line-q,
 * lines-whole on line-z, grids-beginner on grid-4-d10; each family's first dealt numbers, every dealt tie-breaker) and of
 * the grids-arithmetic playtest pool, for a server deal that
 * keeps compatible rules together (docs/engine-v2/rule-compatibility.md).
 *
 * For a pair: the object that maximises their shared points n_A · n_B, and the share of its best alone each keeps there.
 * Compatible: both keep ≥ 80%; partial: both ≥ 50%; conflict: otherwise. Lines: exact over a game-scale grid of
 * lines y = mx + c (line-z: whole m, c with |m| ≤ 10, |c| ≤ 60; line-q: m and c over denominators up to 4, |m| ≤ 10,
 * |c| ≤ 30). Grids: a hill-climbing search with restarts (a lower bound; deterministic).
 *
 *   pnpm --filter @workspace/v2-agents gen-compat
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateSite, q, rng, type Q, type Variant } from "@workspace/v2-core";
import { gridPresets, gridType, grid4, type GridState } from "@workspace/v2-grid";
import { fromMC, lineQ, lineType, presets, type LineState } from "@workspace/v2-linear";
import { valueLookup } from "@workspace/v2-valuation";
import { findValues } from "../src/harness.ts";

type Verdict = "compatible" | "partial" | "conflict";
interface Row { variant: string; a: string; b: string; verdict: Verdict; shareA: number; shareB: number }
const verdictOf = (a: number, b: number): Verdict => (Math.min(a, b) >= 0.8 ? "compatible" : Math.min(a, b) >= 0.5 ? "partial" : "conflict");
const round = (x: number) => Math.round(x * 1000) / 1000;
const rows: Row[] = [];

// ---------------------------------------------------------------- lines (exact over a grid)
function linePairs(presetId: string, variant: Variant, lines: readonly LineState[]): void {
  const pool = presets.find(p => p.id === presetId)!.rules;
  const rules = pool.flatMap(r => (r.tieBreakers as string[]).map(tb => ({ family: r.family, params: r.params as Record<string, unknown>, tieBreaker: tb })));
  const bits = rules.map(rule => {
    const vf = findValues(variant.id, rule);
    if (!vf) throw new Error(`no value function for ${variant.id} ${rule.family}/${rule.tieBreaker}`);
    const look = valueLookup(vf), f = lineType.families.find(x => x.id === rule.family)!;
    return Float64Array.from(lines, s => look(evaluateSite(lineType, f, rule.params, s, variant, 0, rule.tieBreaker).score).bits);
  });
  const best = bits.map(b => b.reduce((x, y) => Math.max(x, y), -Infinity));
  for (let i = 0; i < rules.length; i++) for (let j = 0; j < rules.length; j++) {
    if (rules[i]!.family === rules[j]!.family) continue;
    const a = `${rules[i]!.family}/${rules[i]!.tieBreaker}`, b = `${rules[j]!.family}/${rules[j]!.tieBreaker}`;
    if (a >= b) continue;
    let k = 0, top = -1;
    for (let x = 0; x < lines.length; x++) { const p = bits[i]![x]! * bits[j]![x]!; if (p > top) { top = p; k = x; } }
    const sa = bits[i]![k]! / best[i]!, sb = bits[j]![k]! / best[j]!;
    rows.push({ variant: variant.id, a, b, verdict: verdictOf(sa, sb), shareA: round(sa), shareB: round(sb) });
  }
}
// lines-whole (line-z) is retired from play (the coordinator, 15 Nov): no verdicts.
{
  // lines-beginner on line-q: lines y = mx + c with m and c over denominators up to 4, |m| ≤ 10, |c| ≤ 30.
  const values = (top: number): Q[] => {
    const seen = new Map<string, Q>();
    for (let d = 1; d <= 4; d++) for (let n = -top * d; n <= top * d; n++) { const x = q(n, d); seen.set(`${x.n}/${x.d}`, x); }
    return [...seen.values()];
  };
  const lines: LineState[] = [];
  for (const m of values(10)) if (m.n !== 0n) for (const c of values(30)) lines.push({ lines: [fromMC(m, c)] });
  linePairs("lines-beginner", lineQ, lines);
}

// ---------------------------------------------------------------- grids (search)
// Each grid preset's pairs (rules meet only within their preset); the beginner pool first, on its own seed, so its
// verdicts do not move when another preset joins.
function gridPairs(presetId: string, seed: string): void {
  const pool = gridPresets.find(p => p.id === presetId)!.rules;
  // Each family's first dealt numbers (a verdict is by family and tie-breaker).
  const rules = pool.flatMap(r => r.tieBreakers.map(tb => ({ family: r.family, params: r.params as Record<string, unknown>, tieBreaker: tb })))
    .filter((x, i, all) => all.findIndex(y => y.family === x.family && y.tieBreaker === x.tieBreaker) === i);
  const value = rules.map(rule => {
    const vf = findValues(grid4.id, rule);
    if (!vf) throw new Error(`no value function for ${rule.family}/${rule.tieBreaker}`);
    const look = valueLookup(vf), f = gridType.families.find(x => x.id === rule.family)!;
    const cache = new Map<string, number>();
    return (s: GridState) => {
      const key = s.cells.join("");
      let v = cache.get(key);
      if (v === undefined) { v = look(evaluateSite(gridType, f, rule.params, s, grid4, 0, rule.tieBreaker).score).bits; cache.set(key, v); }
      return v;
    };
  });
  const r = rng(seed);
  const randomBoard = (): GridState => ({ cells: Array.from({ length: 16 }, () => r.below(10)) });
  const climb = (score: (s: GridState) => number, restarts: number) => {
    let best = { s: randomBoard(), v: -Infinity };
    for (let k = 0; k < restarts; k++) {
      let s = randomBoard(), v = score(s);
      for (;;) {
        let next = s, nv = v;
        for (let i = 0; i < 16; i++) for (let d = 0; d < 10; d++) {
          if (d === s.cells[i]) continue;
          const t = { cells: s.cells.map((x, j) => (j === i ? d : x)) }, tv = score(t);
          if (tv > nv) { next = t; nv = tv; }
        }
        if (next === s) break;
        s = next; v = nv;
      }
      if (v > best.v) best = { s, v };
    }
    return best;
  };
  const alone = rules.map((_, i) => climb(value[i]!, 12).v);
  for (let i = 0; i < rules.length; i++) for (let j = 0; j < rules.length; j++) {
    if (rules[i]!.family === rules[j]!.family) continue;
    const a = `${rules[i]!.family}/${rules[i]!.tieBreaker}`, b = `${rules[j]!.family}/${rules[j]!.tieBreaker}`;
    if (a >= b) continue;
    const found = climb(s => value[i]!(s) * value[j]!(s), 4);
    const sa = Math.min(1, value[i]!(found.s) / alone[i]!), sb = Math.min(1, value[j]!(found.s) / alone[j]!);
    rows.push({ variant: grid4.id, a, b, verdict: verdictOf(sa, sb), shareA: round(sa), shareB: round(sb) });
  }
}
gridPairs("grids-beginner", "gen-compat");
gridPairs("grids-arithmetic", "gen-compat:grids-arithmetic");

const out = `// Generated by lib/v2-agents/scripts/gen-compat.ts (pnpm --filter @workspace/v2-agents gen-compat). Do not edit.
/**
 * A verdict for every pair of dealt rules of the beginner presets, from the object that maximises their shared points:
 * compatible when both keep at least 80% of their best alone there, partial at 50%, conflict otherwise (lines exact at
 * game scale; grids by search, a lower bound). For a deal that keeps compatible rules together.
 */
export type PairVerdict = "compatible" | "partial" | "conflict";
export interface PairVerdictRow { readonly variant: string; readonly a: string; readonly b: string; readonly verdict: PairVerdict; readonly shareA: number; readonly shareB: number }

export const PAIR_VERDICTS: readonly PairVerdictRow[] = ${JSON.stringify(rows, null, 0).replace(/},{/g, "},\n  {").replace(/^\[/, "[\n  ").replace(/\]$/, ",\n]")};

/** The verdict for two rules ("family/tieBreaker") of a variant, in either order; undefined for a pair not listed. */
export function pairVerdict(variant: string, x: string, y: string): PairVerdict | undefined {
  const [a, b] = x < y ? [x, y] : [y, x];
  return PAIR_VERDICTS.find(r => r.variant === variant && r.a === a && r.b === b)?.verdict;
}
`;
writeFileSync(join(import.meta.dirname, "..", "src", "compat.gen.ts"), out);
const count = (v: string, d: Verdict) => rows.filter(r => r.variant === v && r.verdict === d).length;
for (const v of [lineQ.id, grid4.id]) console.log(`${v}: ${count(v, "compatible")} compatible, ${count(v, "partial")} partial, ${count(v, "conflict")} conflict`);
