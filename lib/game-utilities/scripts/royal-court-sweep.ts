/**
 * The measurements behind 🫅 Kings and Subjects' tiers (archive/engine-v1:docs/layered-rules-measurements/royal-court.md): the base's
 * exact top and its greedy ten-move level (the gate), then the liveness of every candidate tier value on the corner
 * base, and what a base-only and a tier-aware one-cell greedy agent reach of a tier's top.
 *
 *   node --experimental-strip-types scripts/royal-court-sweep.ts [--only paths,roads] [--agents] [--shape 4,base10]
 *
 * A script, not a test: each value builds a hybrid law (a few seconds). test/royal-court.test.ts re-checks the dealt ones.
 */
import { instantiate, seededRng } from "@workspace/game-types";
import { context, evaluator, family } from "../src/catalog.ts";
import { gridSpec } from "../src/families/grid/_util.ts";
import { withTiers, type TierValue } from "../src/families/grid/tiers.ts";
import { hybridLawOf, tierLiveness } from "../src/families/grid/tiers-hybrid.ts";
import { courtScore, courtSquares, courtTiers, noKingPenalty, type CourtP } from "../src/families/grid/layered/royal_court.ts";

const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i < 0 ? undefined : argv[i + 1]; };
const [size, symbols] = (opt("shape") ?? "4,base10").split(",");
const only = opt("only")?.split(",");
const ID = "kings_and_subjects";
const inst = instantiate("Grid", { size: Number(size), symbols, colours: "mono" });
const ctx = context(inst), g = gridSpec(ctx), N = g.N, S = g.S;
const CORNERS: CourtP = { squares: "corners" };
const cmp = (a: readonly number[], b: readonly number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };

// ---- the base -------------------------------------------------------------------------------------------------
const boxes = courtSquares(N, "corners").map(({ r, c }) => [r * N + c, r * N + c + 1, (r + 1) * N + c, (r + 1) * N + c + 1]);
const baseOf = (b: readonly number[]): number[] => {
  let courts = 0, gap = 0;
  for (const u of boxes) { const s = courtScore(u.map(i => g.value[b[i]]), noKingPenalty(g)).score; courts += s[0]; gap += s[1]; }
  return [courts, gap];
};
/** One-cell steepest ascent for `moves` moves from a random board; returns the board. */
function greedy(score: (b: number[]) => readonly number[], start: number[], moves: number): number[] {
  const b = start.slice();
  let cur = score(b);
  for (let m = 0; m < moves; m++) {
    let best: [number, number] | null = null, bv = cur;
    for (let i = 0; i < b.length; i++) {
      const was = b[i];
      for (let s = 0; s < S; s++) { if (s === was) continue; b[i] = s; const v = score(b); if (cmp(v, bv) > 0) { bv = v; best = [i, s]; } }
      b[i] = was;
    }
    if (!best) break;
    b[best[0]] = best[1];
    cur = bv;
  }
  return b;
}
const rng = seededRng("royal-court-sweep");
const randomBoard = () => Array.from({ length: N * N }, () => rng.int(S));
{
  const probe = withTiers(courtTiers, CORNERS, [{ id: "paths", x: 20 }], g);
  const law = hybridLawOf(ID, courtTiers, probe, ctx)!;
  const top = law.baseLevels[law.baseLevels.length - 1];
  console.log(`base ${inst.key}: ${law.baseLevels.length} levels, top [${top[0]}] at ${(-top[1]).toFixed(2)} bits (exact)`);
  for (const moves of [4, 10, 20]) {
    const courts = Array.from({ length: 400 }, () => baseOf(greedy(baseOf, randomBoard(), moves))[0]);
    const hist = [0, 1, 2, 3, 4].map(k => courts.filter(c => c === k).length);
    console.log(`greedy ${moves} moves (400 starts): mean courts ${(courts.reduce((a, c) => a + c, 0) / courts.length).toFixed(2)}, histogram 0..4 ${hist.join("/")}`);
  }
}

// ---- the tiers ------------------------------------------------------------------------------------------------
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const CANDIDATES: Record<string, TierValue[]> = {
  paths: range(4, 44).map(x => ({ id: "paths", x })),
  pairs: range(0, 30).map(x => ({ id: "pairs", x })),
  pathPairs: range(0, 30).map(x => ({ id: "pathPairs", x })),
  roads: range(1, 12).map(y => ({ id: "roads", y })),
  sameRoads: range(1, 8).map(y => ({ id: "sameRoads", y })),
  longestRoad: [{ id: "longestRoad" }],
  sameRoad: [{ id: "sameRoad" }],
};
const wireOf = (b: readonly number[], letter: string) => range(0, N - 1).map(r => b.slice(r * N, r * N + N).map(s => "0123456789ABCDEF"[s] + letter).join(",")).join("/");
const letter = String(family(ID).exemplar!(CORNERS as never, ctx))[1];

console.log("\n| tier | tierTop | tierMin | shareAtTop | addedBits | top bits | levels | build s | problems |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [name, values] of Object.entries(CANDIDATES)) {
  if (only && !only.includes(name)) continue;
  for (const v of values) {
    const p = withTiers(courtTiers, CORNERS, [v], g), t0 = performance.now();
    const live = tierLiveness(ID, courtTiers, p, ctx)!, law = hybridLawOf(ID, courtTiers, p, ctx)!;
    const secs = (performance.now() - t0) / 1000, param = "x" in v ? `x=${v.x}` : "y" in v ? `y=${v.y}` : "";
    const dist = law.topTier.map(([t, q]) => `${t}:${q.toPrecision(2)}`).join(" ");
    console.log(`| ${name} ${param} | ${live.tierTop} | ${live.tierMin} | ${live.shareAtTop.toExponential(2)} | ${live.addedBits.toFixed(1)} | ${(-law.levels[law.levels.length - 1][1]).toFixed(1)} | ${law.levels.length} | ${secs.toFixed(1)} | ${live.problems.join("; ") || "none"} | ${argv.includes("--dist") ? dist : ""}`);
    if (argv.includes("--agents") && live.problems.length === 0) {
      // A base-only greedy agent (30 moves) and a tier-aware one (the whole rule), as shares of the tier's top.
      const u = evaluator({ familyId: ID, params: p as never }, inst), full = (b: number[]) => u(wireOf(b, letter)) as number[];
      const topTier = typeof live.tierTop === "number" ? live.tierTop : live.tierTop[0];
      let baseOnly = 0, aware = 0, n = 40, atTop = 0;
      for (let i = 0; i < n; i++) {
        const start = randomBoard();
        const a = full(greedy(baseOf, start, 30)), b = full(greedy(full, start, 30));
        baseOnly += a[2] / topTier; aware += b[2] / topTier;
        if (b[0] === boxes.length) atTop++;
      }
      console.log(`|   agents (${n} starts, 30 moves) | base-only greedy holds ${(100 * baseOnly / n).toFixed(0)}% of the tier's top | tier-aware greedy ${(100 * aware / n).toFixed(0)}% | (${atTop}/${n} at the base's top) |`);
    }
  }
}
