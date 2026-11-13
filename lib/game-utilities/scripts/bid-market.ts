/**
 * The bid phase as a balance mechanism: evidence from simulated games (offline, deterministic). docs/bid-phase.md
 * quotes its tables. It plays the family-balance model (scripts/family-balance.ts: whole simplified games, simple
 * greedy play, the shipped calibration tables and game-core's payoff rule) on the default setup, Annotated basics,
 * deals with `dealWithBids` (src/bidding.ts) and takes each winner's handicap off their total with `applyHandicap`.
 *
 *   node --experimental-strip-types lib/game-utilities/scripts/bid-market.ts [--games 100] [--players 3,4]
 *        [--policy greedy|deny|random] [--shade 0.67] [--noise 0] [--min 1] [--rounds 40] [--workers 4]
 *     --games:  games per batch (one batch per family for the strength table, one per bidding scenario; 36 batches
 *               for both table sizes). 100 is a quick look (two to three minutes on four cores, win shares within
 *               about ±5 points); docs/bid-phase.md used 1000 (23 minutes).
 *     --shade:  the fraction of their value a shading bidder bids. Default (n − 1) / n: the first-price equilibrium
 *               with n bidders whose values are independent and uniform (2/3 at a table of 3, 3/4 at 4).
 *     --min:    the smallest bid allowed (whole percent, default 1): bidders bid only where their bid reaches it, and the
 *               lowball bidder bids exactly it on the best rule. Measures a minimum bid as a rule of the game.
 *     --noise:  each bidder misjudges each family's value by up to this many points (whole, uniform). Default 0:
 *               everybody at the table has the same values, so equal bids are common and are won at random.
 *
 * What it prints:
 *   1. Strength: one player holds the family (won by bid, so nobody else has it); the others are dealt from the
 *      rest. Mean final score and win share, before any handicap.
 *   2. The equalising handicap of each family: the percentage off the holder's score that brings their win share
 *      (headline) or their mean score down to a reference: a seat at a table where nobody bids, or the weakest family.
 *   3. The market: tables of truthful, shading and never-bidding players under first and second price. Per family,
 *      the share of its holders who win; the spread of those shares; the handicap paid; the win share of each kind of
 *      bidder at mixed tables.
 * Seats are shuffled every game (the model's seat order favours the first seat), and every scenario of one table size
 * plays the same seeds, so scenarios differ by their bids and not by their luck.
 */
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { seededRng } from "@workspace/game-types";
import { applyHandicap, dealWithBids, fairAligned, tableFor, BID_MAX_PERCENT, BID_MIN_PERCENT, type Bid, type BidPricing } from "../src/index.ts";
import { harness, type God, type Policy } from "./family-balance.ts";

// ------------------------------------------------------------------------------------------------
// pure helpers (test/bid-market.test.ts)
// ------------------------------------------------------------------------------------------------

/**
 * The handicap (percent, possibly negative) at which a holder with this score and this best rival stops winning: they
 * win with handicap h exactly when h is below it. A game already lost, or a score of zero, has none to give: −Infinity.
 */
export function winThreshold(score: number, bestRival: number): number {
  return score > 0 && score > bestRival ? 100 * (1 - bestRival / score) : -Infinity;
}

/**
 * The smallest handicap in 0..100 at which the share of games won (those whose `winThreshold` is above it) is at most
 * `target`. 0 when the holder wins no more often than the target without any handicap.
 */
export function equalisingByWins(thresholds: readonly number[], target: number): number {
  if (!thresholds.length) return 0;
  const sorted = [...thresholds].sort((a, b) => b - a);
  const allowed = Math.floor(target * sorted.length + 1e-9);
  if (allowed >= sorted.length) return 0;
  return Math.min(100, Math.max(0, sorted[allowed]));
}

/** The handicap in 0..100 that brings a mean score down to `reference`; 0 when it is already at or below it. */
export function equalisingByScore(meanScore: number, reference: number): number {
  return meanScore > 0 && meanScore > reference ? Math.min(100, 100 * (1 - Math.max(0, reference) / meanScore)) : 0;
}

/** never: passes. truthful: bids their value. shading: bids a fraction of it. lowball: the minimum bid, on their best family only. */
export type BidderType = "truthful" | "shading" | "never" | "lowball";

/** What one bidder bids: family → whole percent, only where the bid is at least the minimum. */
export function bidsOf(type: BidderType, values: Readonly<Record<string, number>>, shade: number, min: number = BID_MIN_PERCENT): Record<string, number> {
  const out: Record<string, number> = {};
  if (type === "never") return out;
  if (type === "lowball") {
    const best = Object.entries(values).sort((a, b) => b[1] - a[1])[0];
    if (best && Math.round(best[1]) >= BID_MIN_PERCENT) out[best[0]] = min;
    return out;
  }
  for (const [f, v] of Object.entries(values)) {
    const percent = Math.min(BID_MAX_PERCENT, Math.round(type === "shading" ? shade * v : v));
    if (percent >= min) out[f] = percent;
  }
  return out;
}

/** How uneven a list of win shares is: largest minus smallest, and the standard deviation (weighted when weights are given). */
export function spread(shares: readonly number[], weights?: readonly number[]): { range: number; sd: number } {
  if (!shares.length) return { range: 0, sd: 0 };
  const w = weights ?? shares.map(() => 1), total = w.reduce((a, b) => a + b, 0);
  const mean = shares.reduce((a, x, i) => a + x * w[i], 0) / total;
  return { range: Math.max(...shares) - Math.min(...shares), sd: Math.sqrt(shares.reduce((a, x, i) => a + w[i] * (x - mean) ** 2, 0) / total) };
}

// ------------------------------------------------------------------------------------------------
// jobs (run on worker threads; every game is seeded by its own index, so the split changes nothing)
// ------------------------------------------------------------------------------------------------

interface Common { n: number; from: number; to: number; rounds: number; policy: Policy }
interface StrengthJob extends Common { kind: "strength"; family: string }
interface MarketJob extends Common { kind: "market"; pricing: BidPricing; table: BidderType[]; values: Record<string, number>; shade: number; noise: number; min: number }
type Job = StrengthJob | MarketJob;
/** Numbers per game: strength [holder's score, best rival's score]; market, per seat [player, family index, score, handicap, won]. */
const MARKET_FIELDS = 5;

let model: ReturnType<typeof harness> | undefined, modelRounds = -1;
function runJob(job: Job): number[] {
  if (!model || modelRounds !== job.rounds) { model = harness("annotated", job.rounds); modelRounds = job.rounds; }
  const h = model, out: number[] = [];
  const options = { exclude: h.setup.settings.excludedFamilies, hasTable: (d: { familyId: string; params: unknown }) => !!tableFor(h.tables, d as never, h.inst) };
  const ids = Array.from({ length: job.n }, (_, i) => `p${i}`);
  for (let g = job.from; g < job.to; g++) {
    const seed = job.kind === "strength" ? `bid-market|strength|${job.n}|${job.family}|${g}` : `bid-market|${job.n}|${g}`;
    const rng = seededRng(seed + "|deal");
    const seats = [...ids];
    for (let i = seats.length - 1; i > 0; i--) { const j = rng.int(i + 1); [seats[i], seats[j]] = [seats[j], seats[i]]; }
    const bids: Bid[] = [];
    if (job.kind === "strength") bids.push({ playerId: "p0", familyId: job.family, percent: BID_MAX_PERCENT });
    else ids.forEach((playerId, i) => {
      if (job.table[i] === "never") return;
      const mine = job.noise ? Object.fromEntries(h.pool.map(f => [f, (job.values[f] ?? 0) + rng.int(2 * job.noise + 1) - job.noise])) : job.values;
      for (const [familyId, percent] of Object.entries(bidsOf(job.table[i], mine, job.shade, job.min))) bids.push({ playerId, familyId, percent });
    });
    // The engine's default dealer. It has no synergy matrix for this board, so there it is the plain lottery.
    const { deal, wins } = dealWithBids(fairAligned.id, h.inst, seats, bids, rng, options, job.kind === "market" ? job.pricing : "first");
    const gods = deal.map(d => h.god(d));
    if (gods.some(x => !x)) throw new Error("A dealt rule has no calibration table");
    const res = h.play(gods as God[], seats.map(() => job.policy), seed);
    if (job.kind === "strength") {
      const s = seats.indexOf("p0");
      if (deal[s].familyId !== job.family) throw new Error(`${job.family} was not dealt to its bidder`);
      out.push(res.pay[s], Math.max(...res.pay.filter((_, j) => j !== s)));
    } else {
      const handicap = seats.map(id => wins.find(w => w.playerId === id)?.handicap ?? 0);
      const net = res.pay.map((p, s) => applyHandicap(p, handicap[s])), winner = net.indexOf(Math.max(...net));
      seats.forEach((id, s) => out.push(Number(id.slice(1)), h.pool.indexOf(deal[s].familyId), res.pay[s], handicap[s], s === winner ? 1 : 0));
    }
  }
  return out;
}

if (!isMainThread && parentPort) {
  const port = parentPort;
  port.on("message", ({ id, job }: { id: number; job: Job }) => port.postMessage({ id, rows: runJob(job) }));
}

/** Runs the jobs on `workers` threads; the results in the jobs' order. */
function runJobs(jobs: readonly Job[], workers: number, onDone: (done: number) => void): Promise<number[][]> {
  const out: number[][] = new Array(jobs.length);
  if (!jobs.length) return Promise.resolve(out);
  return new Promise((resolve, reject) => {
    let next = 0, done = 0;
    const pool = Array.from({ length: Math.min(workers, jobs.length) }, () => new Worker(fileURLToPath(import.meta.url)));
    const feed = (w: Worker) => { if (next < jobs.length) { const id = next++; w.postMessage({ id, job: jobs[id] }); } };
    for (const w of pool) {
      w.on("message", (m: { id: number; rows: number[] }) => {
        out[m.id] = m.rows; onDone(++done);
        if (done === jobs.length) { pool.forEach(p => void p.terminate()); resolve(out); } else feed(w);
      });
      w.on("error", e => { pool.forEach(p => void p.terminate()); reject(e); });
      feed(w);
    }
  });
}

// ------------------------------------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------------------------------------

const CHUNK = 25;
const pct = (x: number, digits = 0) => (Number.isFinite(x) ? `${(100 * x).toFixed(digits)}%` : "–");
const row = (cells: readonly (string | number)[]) => `| ${cells.join(" | ")} |`;
const table = (head: readonly string[], rows: readonly (readonly (string | number)[])[]) =>
  [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");
const mean = (a: readonly number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

interface Scenario { label: string; n: number; pricing: BidPricing; table: BidderType[] }
interface MarketResult {
  /** Per family: holders, holders who won, handicap points paid by its holders, holders who won it by bid. */
  held: number[]; won: number[]; paid: number[]; bought: number[];
  /** Per bidder type: seats, wins. */
  byType: Map<BidderType, [number, number]>;
  meanScore: number; games: number;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
  const GAMES = Number(flag("games", "100")), ROUNDS = Number(flag("rounds", "40")), NOISE = Number(flag("noise", "0")), MIN = Number(flag("min", "1"));
  const sizes = flag("players", "3,4").split(",").map(Number), policy = flag("policy", "greedy") as Policy;
  const workers = Number(flag("workers", String(Math.min(8, availableParallelism()))));
  const shadeOf = (n: number) => Number(flag("shade", String((n - 1) / n)));
  const h = harness("annotated", ROUNDS), pool = h.pool, started = Date.now();
  const common = (n: number) => ({ n, rounds: ROUNDS, policy });
  const chunks = <J extends Job>(base: Omit<J, "from" | "to">): J[] =>
    Array.from({ length: Math.ceil(GAMES / CHUNK) }, (_, c) => ({ ...base, from: c * CHUNK, to: Math.min(GAMES, (c + 1) * CHUNK) }) as J);
  const progress = (what: string, total: number) => (done: number) => {
    if (done % 20 === 0 || done === total) process.stderr.write(`\r${what}: ${done}/${total} batches, ${((Date.now() - started) / 1000).toFixed(0)}s `);
    if (done === total) process.stderr.write("\n");
  };
  /** Runs the scenarios and adds each one's games up. */
  async function market(scenarios: readonly Scenario[], values: Map<number, Record<string, number>>, what: string): Promise<MarketResult[]> {
    const jobs = scenarios.flatMap(s => chunks<MarketJob>({ kind: "market", ...common(s.n), pricing: s.pricing, table: s.table, values: values.get(s.n) ?? {}, shade: shadeOf(s.n), noise: NOISE, min: MIN }));
    const rows = await runJobs(jobs, workers, progress(what, jobs.length)), per = Math.ceil(GAMES / CHUNK);
    return scenarios.map((s, i) => {
      const r: MarketResult = { held: pool.map(() => 0), won: pool.map(() => 0), paid: pool.map(() => 0), bought: pool.map(() => 0), byType: new Map(), meanScore: 0, games: GAMES };
      const flat = rows.slice(i * per, (i + 1) * per).flat();
      for (let k = 0; k < flat.length; k += MARKET_FIELDS) {
        const [player, f, score, handicap, won] = flat.slice(k, k + MARKET_FIELDS);
        r.held[f]++; r.won[f] += won; r.paid[f] += handicap; if (handicap > 0) r.bought[f]++;
        const t = r.byType.get(s.table[player]) ?? [0, 0]; t[0]++; t[1] += won; r.byType.set(s.table[player], t);
        r.meanScore += score / (flat.length / MARKET_FIELDS);
      }
      return r;
    });
  }

  console.log(`# Bid market on ${h.setup.name} (${h.inst.key}): policy=${policy} rounds=${ROUNDS} games per batch=${GAMES} noise=${NOISE} min bid=${MIN}%`);
  console.log(`Families: ${pool.join(", ")}\n`);

  // 1. Strength of each family when one player holds it alone, and the table where nobody bids.
  const strengthJobs = sizes.flatMap(n => pool.flatMap(family => chunks<StrengthJob>({ kind: "strength", ...common(n), family })));
  const strengthRows = await runJobs(strengthJobs, workers, progress("strength", strengthJobs.length));
  const noBids = await market(sizes.map(n => ({ label: "nobody bids", n, pricing: "first", table: Array.from({ length: n }, () => "never" as BidderType) })), new Map(), "no bids");
  const values = new Map<number, Record<string, number>>();
  const per = Math.ceil(GAMES / CHUNK);
  sizes.forEach((n, si) => {
    const stats = pool.map((family, fi) => {
      const flat = strengthRows.slice((si * pool.length + fi) * per, (si * pool.length + fi + 1) * per).flat();
      const scores: number[] = [], thresholds: number[] = [];
      for (let k = 0; k < flat.length; k += 2) { scores.push(flat[k]); thresholds.push(winThreshold(flat[k], flat[k + 1])); }
      return { family, meanScore: mean(scores), win: thresholds.filter(t => t > 0).length / thresholds.length, thresholds };
    });
    const weakestWin = Math.min(...stats.map(s => s.win)), weakestScore = Math.min(...stats.map(s => s.meanScore)), fairScore = noBids[si].meanScore;
    const before = noBids[si];
    console.log(`## ${n} players: strength and equalising handicap`);
    console.log(`One player holds the family (nobody else can have it); the other ${n - 1} are dealt from the other ${pool.length - 1}. ${GAMES} games per family.`);
    console.log(`A seat at a table where nobody bids: win share ${pct(1 / n)}, mean score ${fairScore.toFixed(0)}. Sampling error of a win share: about ±${(100 * Math.sqrt(0.25 / GAMES)).toFixed(1)} points.\n`);
    const lines = stats.map(s => ({ ...s,
      hWinFair: equalisingByWins(s.thresholds, 1 / n), hWinWeak: equalisingByWins(s.thresholds, weakestWin),
      hScoreFair: equalisingByScore(s.meanScore, fairScore), hScoreWeak: equalisingByScore(s.meanScore, weakestScore) }))
      .sort((a, b) => b.hWinFair - a.hWinFair || b.win - a.win);
    console.log(table(["Family", "Mean score", "Win share", "No-bid win share", "h: win share = fair seat", "h: win share = weakest", "h: score = fair seat", "h: score = weakest"],
      lines.map(l => { const fi = pool.indexOf(l.family); return [l.family, l.meanScore.toFixed(0), pct(l.win), pct(before.won[fi] / before.held[fi]),
        `${l.hWinFair.toFixed(0)}%`, `${l.hWinWeak.toFixed(0)}%`, `${l.hScoreFair.toFixed(0)}%`, `${l.hScoreWeak.toFixed(0)}%`]; })));
    console.log();
    values.set(n, Object.fromEntries(lines.map(l => [l.family, l.hWinFair])));
  });

  // 3. The market. Bidders value a family at "h: win share = fair seat".
  const scenarios: Scenario[] = sizes.flatMap(n => {
    const all = (t: BidderType) => Array.from({ length: n }, () => t), one = (t: BidderType, rest: BidderType) => [t, ...all(rest).slice(1)];
    const both = (label: string, tbl: BidderType[]): Scenario[] => (["first", "second"] as BidPricing[]).map(pricing => ({ label, n, pricing, table: tbl }));
    return [...both("all truthful", all("truthful")), ...both("all shading", all("shading")),
      ...both("one never among truthful", one("never", "truthful")), ...both("one truthful among never", one("truthful", "never")),
      { label: "one lowball among never", n, pricing: "first" as BidPricing, table: one("lowball", "never") }];
  });
  const results = await market(scenarios, values, "market");
  const MIN_HELD = Math.max(20, Math.round(GAMES / 20));
  sizes.forEach((n, si) => {
    const mine = scenarios.map((s, i) => ({ s, r: results[i] })).filter(x => x.s.n === n);
    const cols = [{ s: { label: "nobody bids", n, pricing: "first", table: [] } as Scenario, r: noBids[si] }, ...mine];
    const name = (s: Scenario) => (s.label === "nobody bids" ? s.label : `${s.label}, ${s.pricing}`);
    const share = (r: MarketResult, f: number) => (r.held[f] >= MIN_HELD ? r.won[f] / r.held[f] : NaN);
    console.log(`## ${n} players: the market (shading bids ${pct(shadeOf(n))} of value)`);
    console.log(`Bids: ${pool.filter(f => Math.round(values.get(n)![f]) >= 1).map(f => `${f} ${Math.round(values.get(n)![f])}%`).join(", ") || "none"} (truthful).`);
    console.log(`Share of a family's holders who win, after handicaps. "–": held fewer than ${MIN_HELD} times. ${GAMES} games per column, the same seeds.\n`);
    const homogeneous = cols.filter(c => c.s.label === "nobody bids" || c.s.label.startsWith("all "));
    console.log(table(["Family", ...homogeneous.map(c => name(c.s))], pool.map((f, fi) => [f, ...homogeneous.map(c => pct(share(c.r, fi)))])));
    console.log();
    const summary = cols.map(c => {
      const kept = pool.map((_, fi) => fi).filter(fi => c.r.held[fi] >= MIN_HELD);
      const sp = spread(kept.map(fi => c.r.won[fi] / c.r.held[fi])), wsp = spread(kept.map(fi => c.r.won[fi] / c.r.held[fi]), kept.map(fi => c.r.held[fi]));
      const bought = c.r.bought.reduce((a, b) => a + b, 0), paid = c.r.paid.reduce((a, b) => a + b, 0);
      const types = [...c.r.byType].sort((x, y) => x[0].localeCompare(y[0])).map(([t, [seats, wins]]) => `${t} ${pct(wins / seats, 1)}`).join(", ");
      return [name(c.s), kept.length, pct(sp.range), pct(wsp.sd, 1), (bought / c.r.games).toFixed(2), bought ? `${(paid / bought).toFixed(1)}%` : "–", types];
    });
    console.log(table(["Table", "Families held", "Spread (max − min)", "Spread (sd, by holders)", "Rules won by bid per game", "Mean handicap paid", `Win share per seat by bidder type (fair ${pct(1 / n, 1)})`], summary));
    console.log();
  });
  console.log(`Run time: ${((Date.now() - started) / 1000).toFixed(0)}s on ${workers} threads.`);
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) await main();
