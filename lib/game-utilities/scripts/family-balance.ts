/**
 * Family-versus-family balance harness (offline, deterministic). Plays whole simplified games with the real family
 * evaluators, the shipped calibration tables (surprisal bits) and game-core's payoff rule π_i = n_i · max(0, Σ_{j≠i} n_j),
 * on a seed setup's shape and family pool, and prints per-family statistics.
 *
 *   node --experimental-strip-types lib/game-utilities/scripts/family-balance.ts [setup] [games] [policy] [players]
 *     setup:   annotated (default: game-core SEED_SETUPS) | rgb (Grid(4,base10,rgb) on its tuned defaults; no setup ships it)
 *     games:   games per family (default 60);  policy: random | greedy | deny | mixed (default greedy);  players: 3
 *     env ROUNDS=40 (turns per player), MATRIX=1 (print the pairwise table)
 *
 * Model (an abstraction of a live game, no engine): K = startingObjectCount uniform spawns; players take turns in
 * seat order; a turn picks one of C candidate moves (the type's own `propose`: resample a cell or swap two) over
 * random objects. random: any candidate; greedy: maximises own total payoff; deny: own payoff minus the mean rival's.
 * Families are dealt uniformly from the setup's pool (one sampled param per god), so each family meets every other.
 */
import { fileURLToPath } from "node:url";
import { instantiate, objectType, seededRng, type Instantiation, type ObjectValue, type Rng } from "@workspace/game-types";
import { SEED_SETUPS, defaultSettingsFor } from "../../game-core/src/settings.ts";
import { availableFamilies, context, evaluator, surprisal, tableFor, type CalibrationTable } from "../src/index.ts";
import { shippedTables } from "../src/calibration-data.ts";

export type Policy = "random" | "greedy" | "deny";
export interface God { familyId: string; score: (w: ObjectValue) => number; top: number }

/**
 * The model on one seed setup: its pool, the dealt-rule scorer and the simulated game. Exported for the scripts that
 * build on it (scripts/bid-market.ts); running this file prints the balance table below.
 */
export function harness(setupArg = "annotated", ROUNDS = Number(process.env.ROUNDS ?? 40)) {
const setup = setupArg === "rgb"
  ? { seedId: "grid-4-rgb", name: "Grid 4×4 rgb", settings: defaultSettingsFor("Grid", ["python"], { size: 4, symbols: "base10", colours: "rgb" }) }
  : SEED_SETUPS.find(s => s.seedId === "grid-annotated-basics")!;
const inst: Instantiation = instantiate(setup.settings.objectType, setup.settings.typeArgs);
const type = objectType(inst.objectType), codec = type.codec(inst), ctx = context(inst), tables = shippedTables(inst.key);
const K = setup.settings.startingObjectCount ?? 10, C = 16;

const pool = availableFamilies(inst, "reward", setup.settings.excludedFamilies).map(f => f.id);
/** The scorer of one dealt rule (surprisal bits from its shipped table), or null when it has no table. */
function god(draw: { familyId: string; params: unknown }): God | null {
  const t: CalibrationTable | undefined = tableFor(tables, draw as never, inst);
  if (!t) return null;
  const ev = evaluator(draw as never, inst);
  return { familyId: draw.familyId, score: w => surprisal(t, ev(w)), top: t.levels[t.levels.length - 1][1] };
}
function deal(familyId: string, rng: Rng): God | null {
  const f = availableFamilies(inst, "reward").find(x => x.id === familyId)!;
  return god({ familyId, params: f.sample(rng, ctx) });
}
const payoffs = (bits: number[][]): number[] => bits[0].map((_, i) => bits.reduce((s, b) => {
  const peers = b.reduce((a, x, j) => a + (j === i ? 0 : x), 0);
  return s + (peers > 0 ? b[i] * peers : 0);
}, 0));

function play(gods: God[], policies: Policy[], seed: string) {
  const rng = seededRng(seed);
  const objs = Array.from({ length: K }, () => type.spawn(inst, rng));
  const bits = objs.map(o => gods.map(g => g.score(codec.encode(o))));
  const leadHistory: number[] = [];
  for (let r = 0; r < ROUNDS; r++) for (let p = 0; p < gods.length; p++) {
    let best: { k: number; v: unknown; b: number[] } | null = null, bestV = -Infinity;
    for (let c = 0; c < (policies[p] === "random" ? 1 : C); c++) {
      const k = rng.int(K), v = type.propose(objs[k], inst, rng), w = codec.encode(v);
      const b = gods.map(g => g.score(w)), trial = bits.slice(); trial[k] = b;
      const pay = payoffs(trial), rival = pay.reduce((a, x, j) => a + (j === p ? 0 : x), 0) / (gods.length - 1);
      const val = policies[p] === "deny" ? pay[p] - rival : pay[p];
      if (val > bestV) { bestV = val; best = { k, v, b }; }
    }
    objs[best!.k] = best!.v as never; bits[best!.k] = best!.b;
    if (p === gods.length - 1) { const pay = payoffs(bits); leadHistory.push(pay.indexOf(Math.max(...pay))); }
  }
  const pay = payoffs(bits), winner = pay.indexOf(Math.max(...pay));
  // decided early: the final winner led at every round from the halfway point on
  const early = leadHistory.slice(ROUNDS / 2).every(x => x === winner);
  return { pay, winner, early, own: gods.map((_, i) => bits.reduce((s, b) => s + b[i], 0) / K) };
}

return { setup, inst, tables, pool, K, ROUNDS, god, deal, payoffs, play };
}

interface Stat { games: number; wins: number; pay: number[]; own: number[]; share: number[]; firstSeatWins: number; firstSeatGames: number; early: number; vs: Map<string, [number, number]> }
function main() {
const [setupArg = "annotated", gamesArg = "60", policyArg = "greedy", playersArg = "3"] = process.argv.slice(2);
const { setup, inst, pool, K, ROUNDS, deal, play } = harness(setupArg);
const P = Number(playersArg), GAMES = Number(gamesArg);
const stats = new Map<string, Stat>(pool.map(f => [f, { games: 0, wins: 0, pay: [], own: [], share: [], firstSeatWins: 0, firstSeatGames: 0, early: 0, vs: new Map() }]));
const missing = new Set<string>();
let seat0 = 0, total = 0;
const mixed = policyArg === "mixed";
for (let fi = 0; fi < pool.length; fi++) for (let g = 0; g < GAMES; g++) {
  const seed = `${setup.seedId}|${policyArg}|${pool[fi]}|${g}`, rng = seededRng(seed + "|deal");
  const ids = [pool[fi]];
  while (ids.length < P) ids.push(pool[rng.int(pool.length)]);
  for (let i = ids.length - 1; i > 0; i--) { const j = rng.int((i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const gods = ids.map(id => deal(id, rng));
  if (gods.some(x => !x)) { ids.forEach((id, i) => { if (!gods[i]) missing.add(id); }); continue; }
  const pols: Policy[] = ids.map(() => (mixed ? (["random", "greedy", "deny"] as Policy[])[rng.int(3)] : policyArg as Policy));
  const res = play(gods as God[], pols, seed);
  total++; if (res.winner === 0) seat0++;
  ids.forEach((id, i) => {
    const s = stats.get(id)!; s.games++; s.pay.push(res.pay[i]); s.own.push(res.own[i]); s.share.push(res.own[i] / gods[i]!.top);
    if (res.winner === i) { s.wins++; if (res.early) s.early++; }
    if (i === 0) { s.firstSeatGames++; if (res.winner === 0) s.firstSeatWins++; }
    ids.forEach((o, j) => { if (j === i || o === id) return; const v = s.vs.get(o) ?? [0, 0]; v[1]++; if (res.pay[i] > res.pay[j]) v[0]++; s.vs.set(o, v); });
  });
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
console.log(`setup=${setup.name} inst=${inst.key} policy=${policyArg} players=${P} games=${total} K=${K} rounds=${ROUNDS} seat0 wins=${(seat0 / total).toFixed(3)} (fair ${(1 / P).toFixed(3)})`);
if (missing.size) console.log(`no shipped table: ${[...missing].join(", ")}`);
console.log("family".padEnd(26) + "n".padStart(5) + "win".padStart(7) + "pairwin".padStart(9) + "meanPay".padStart(10) + "sdPay".padStart(9) + "ownBits".padStart(9) + "share".padStart(7) + "early".padStart(7));
const rows = [...stats].filter(([, s]) => s.games).map(([f, s]) => {
  const pw = [...s.vs.values()].reduce((a, v) => [a[0] + v[0], a[1] + v[1]], [0, 0]);
  return { f, s, win: s.wins / s.games, pw: pw[0] / Math.max(1, pw[1]) };
}).sort((a, b) => b.pw - a.pw);
for (const { f, s, win, pw } of rows) console.log(f.padEnd(26) + String(s.games).padStart(5) + win.toFixed(3).padStart(7) + pw.toFixed(3).padStart(9)
  + mean(s.pay).toFixed(1).padStart(10) + sd(s.pay).toFixed(1).padStart(9) + mean(s.own).toFixed(2).padStart(9) + mean(s.share).toFixed(2).padStart(7)
  + (s.early / Math.max(1, s.wins)).toFixed(2).padStart(7));
if (process.env.MATRIX) {
  console.log("\npairwise win rate (row beats column), cells with >= 8 meetings");
  const ids = rows.map(r => r.f);
  console.log("".padEnd(22) + ids.map(i => i.slice(0, 6).padStart(7)).join(""));
  for (const a of ids) console.log(a.slice(0, 21).padEnd(22) + ids.map(b => { const v = stats.get(a)!.vs.get(b); return v && v[1] >= 8 ? (v[0] / v[1]).toFixed(2).padStart(7) : "      ."; }).join(""));
}
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
