/**
 * "Possible but hard" (docs/public-log-design.md §5): in simulated games with known utilities, how much does the
 * rival-inference fit (src/inference.ts) learn about which utility functions the other gods hold?
 *
 *   node --experimental-strip-types scripts/inference-experiment.ts [--trials 20] [--shape "Grid(4,base10,rgby)"]
 *
 * Each trial deals k + 1 utilities with the Divine Lottery on a shipped shape (god 0 is the viewer), then builds what
 * the viewer would have seen in a game: `spawns` random objects from the uniform prior plus, for every god, the
 * `pushed` objects of a random pool that god scores highest (what that god's agents push the board toward). The
 * viewer's observation at each value is the peers' net bits, exactly as the engine projects them. The fit runs with
 * no hints, then with one correct hint (another god's family, "probability 0.8", as a negotiation clue would give).
 *
 * Reported per configuration (means over trials):
 * - exact: the top hypothesis is exactly the other gods' draws (as identical-column classes);
 * - families: the top hypothesis names exactly the other gods' families;
 * - recall@k: share of the true families among the k families with the highest presence probability;
 * - p(true) / p(false): mean presence probability of a true family and of the most probable false one;
 * - spectrum@k: share of the true families among the k heaviest families of the free-weight fit.
 */
import { instantiate, objectType, type ObjectValue, type Rng } from "@workspace/game-types";
import { divineLottery, evaluator, surprisal, tableFor, type UtilityDescriptor } from "../src/index.ts";
import { shippedTables } from "../src/calibration-data.ts";
import { candidateColumn, candidatesFor, fitMixture, type Hint } from "../src/inference.ts";
import { paramsKey } from "../src/catalog.ts";

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const TRIALS = Number(arg("trials", "12"));
const SHAPE = arg("shape", "Grid(4,base10,rgby)");
/** Disclose the others' bits rounded to this many bits (0 = not rounded): a knob that turned out not to help (§5). */
const ROUND = Number(arg("round", "0"));
/** The disclosure noise levels to compare (the game's peerNoiseBits options): Gaussian σ in bits. */
const NOISES = arg("noises", "0").split(",").map(Number);
/**
 * The commit-clause side channel (docs/public-log-design.md §5.2): with a clause that decided on the EXACT payoff, an
 * agent binary-searches a value's exact others' sum in about a dozen conditional acts. `--probes N` gives the viewer N
 * of its observed values exactly, as such probing would; the shipped clause decides on the disclosed values, which
 * makes probing equivalent to observing (N = 0).
 */
const PROBES = Number(arg("probes", "0"));

/** A seeded RNG (mulberry32) for reproducible trials. */
function seeded(seed: number): Rng & { u(): number } {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { u, int: (b: number) => Math.floor(u() * b), big: (b: bigint) => BigInt(Math.floor(u() * Number(b))) };
}

const m = /^(\w+)\((.*)\)$/.exec(SHAPE)!;
const [size, symbols, colours] = m[2].split(",");
const inst = instantiate(m[1], { size: Number(size), symbols, colours });
const tables = shippedTables(inst.key);
const T = objectType(inst.objectType), codec = T.codec(inst);
const bitsOf = (d: UtilityDescriptor, v: ObjectValue) => surprisal(tableFor(tables, d, inst)!, evaluator(d, inst)(v));
const candidates = candidatesFor(inst);
console.log(`${inst.key}: ${candidates.length} candidate draws, ${new Set(candidates.map(c => c.familyId)).size} families; ${TRIALS} trials per row${ROUND ? `; others' bits rounded to ${ROUND} bit` : ""}${PROBES ? `; ${PROBES} values probed exactly (the old commit clause)` : ""}\n`);

type Row = { exact: number; families: number; recall: number; pTrue: number; pFalse: number; spectrum: number; ms: number };
/** Standard normal from the seeded uniform (Box–Muller). */
const gauss = (u: () => number) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
function trial(seed: number, others: number, spawns: number, pushed: number, hinted: boolean, noise: number): Row {
  const rng = seeded(seed);
  const deal = divineLottery.select(inst, others + 1, rng, { hasTable: d => !!tableFor(tables, d, inst) });
  const pool = Array.from({ length: 3000 }, () => codec.encode(T.spawn(inst, rng)) as ObjectValue);
  const seen = new Set<ObjectValue>();
  for (let i = 0; i < spawns; i++) seen.add(pool[i]);
  for (const d of deal) {
    const ranked = pool.map(v => [v, bitsOf(d, v)] as const).sort((a, b) => b[1] - a[1]);
    for (const [v] of ranked.slice(0, pushed)) seen.add(v);
  }
  const values = [...seen];
  const exactY = values.map(v => deal.slice(1).reduce((s, d) => s + bitsOf(d, v), 0));
  const noisy = exactY.map((x, t) => x + (noise > 0 && t >= PROBES ? noise * gauss(rng.u) : 0));
  const y = ROUND > 0 ? noisy.map(x => Math.round(x / ROUND) * ROUND) : noisy;
  const started = performance.now();
  const columns = candidates.flatMap(candidate => { const column = candidateColumn(candidate, values, tables, inst, 1); return column ? [{ candidate, column }] : []; });
  const truth = deal.slice(1);
  const hints: Hint[] = hinted ? [{ familyId: truth[0].familyId, probability: 0.8 }] : [];
  const fit = fitMixture({ y, columns, others, hints, noiseBits: noise });
  const ms = performance.now() - started;
  const key = (familyId: string, params: unknown) => `${familyId}:${paramsKey(params)}`;
  const top = fit.hypotheses[0];
  const classKeys = top.draws.map(d => new Set([d, ...d.aliases].map(x => key(x.familyId, x.params))));
  const remaining = [...classKeys];
  const exact = truth.every(t => { const i = remaining.findIndex(s => s.has(key(t.familyId, t.params))); if (i < 0) return false; remaining.splice(i, 1); return true; });
  const fams = (xs: { familyId: string }[]) => xs.map(x => x.familyId).sort().join(",");
  const trueFams = new Set(truth.map(t => t.familyId));
  const kTop = fit.families.slice(0, trueFams.size).map(f => f.familyId);
  const recall = kTop.filter(f => trueFams.has(f)).length / trueFams.size;
  const pTrue = [...trueFams].reduce((s, f) => s + (fit.families.find(x => x.familyId === f)?.probability ?? 0), 0) / trueFams.size;
  const pFalse = fit.families.find(f => !trueFams.has(f.familyId))?.probability ?? 0;
  const specFams = [...new Set(fit.spectrum.weights.map(w => w.familyId))].slice(0, trueFams.size);
  const spectrum = specFams.filter(f => trueFams.has(f)).length / trueFams.size;
  return { exact: exact ? 1 : 0, families: fams(top.draws) === fams(truth) ? 1 : 0, recall, pTrue, pFalse, spectrum, ms };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
console.log("| noise σ | gods | observed values | hint | exact draws | exact families | recall@k | p(true family) | p(best false) | spectrum@k | ms per fit |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const CONFIGS = (arg("configs", "3:20:0,3:20:10,3:60:30,3:150:60,6:20:10,6:60:30,6:150:60")).split(",").map(c => c.split(":").map(Number));
for (const noise of NOISES) for (const [gods, spawns, pushed] of CONFIGS) {
  for (const hinted of [false, true]) {
    const rows = Array.from({ length: TRIALS }, (_, i) => trial(1000 + i, gods - 1, spawns, pushed, hinted, noise));
    const mean = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
    const observed = `${spawns} spawns + ${pushed}/god pushed`;
    console.log(`| ${noise} | ${gods} | ${observed} | ${hinted ? "1 correct" : "none"} | ${pct(mean(r => r.exact))} | ${pct(mean(r => r.families))} | ${pct(mean(r => r.recall))} | ${mean(r => r.pTrue).toFixed(2)} | ${mean(r => r.pFalse).toFixed(2)} | ${pct(mean(r => r.spectrum))} | ${Math.round(mean(r => r.ms))} |`);
  }
}
