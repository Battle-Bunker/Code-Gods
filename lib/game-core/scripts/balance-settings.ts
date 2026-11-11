/**
 * Settings balance harness (deterministic). Plays seeded whole games per configuration with game-core's real energy
 * (settle, pickByEnergy with the 4 Hz cap, chargeAct, spendDeityEnergy, default shares), scoring (netBits, softHinge,
 * payoff, rankTotals) and timing (gameEndSeconds, poissonIntervalSeconds), on an ABSTRACT world: each object holds one
 * reward surprisal per god (−log2 U, the uniform-prior law of a calibrated ordinal) and an act re-draws a few of them
 * (a local edit). Grid size, symbols and colours enter only through the act's read and change prices (energy-model §3–4):
 * a look at the board costs readBits × READ_PRICE (game-types; --kappa κ overrides 1/READ_PRICE, κ = 1 is the old price).
 * It measures settings, energy, seat order and player count, not goal families (see the balance-families harness).
 *
 *   node --experimental-transform-types lib/game-core/scripts/balance-settings.ts [--games 200] [--only <name>] [--kappa 32]
 *
 * Policies: random (edits blindly, reads nothing), greedy (reads the board, keeps the best of 4 edits for its own
 * payoff, skips when none helps), deny (greedy on own payoff minus the mean opponent payoff).
 */
import {
  DEFAULT_SETTINGS, SEED_SETUPS, validateSettings, type GameSettings,
  newAgentAccount, settleAgentEnergy, chargeAct, pickByEnergy, offerable, spendDeityEnergy, defaultShare,
  netBits, softHinge, rankTotals, gameEndSeconds, poissonIntervalSeconds, CHANGE_READ_RATIO, CHANGE_BETA,
} from "../src/index.ts";

type Policy = "random" | "greedy" | "deny";
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const GAMES = Number(arg("games", "200")), ONLY = arg("only", ""), KAPPA = Number(arg("kappa", String(CHANGE_READ_RATIO)));
if (!(KAPPA >= 1)) throw new Error(`--kappa must be a number ≥ 1, not ${arg("kappa", "")}`);

/** mulberry32: a seeded uniform in [0, 1). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const open = (u: () => number) => () => { let x = u(); while (x <= 0) x = u(); return x; };
const surprisal = (u: () => number) => -Math.log2(open(u)());
// E_μ h for a defence goal whose badness surprisal is −log2 U: ∫ softHinge(s) 2^−s ln2 ds, numerically.
const PENALTY_MEAN = (() => { let m = 0; const N = 20000; for (let i = 0; i < N; i++) m += softHinge(-Math.log2((i + 0.5) / N)); return m / N; })();

interface Config {
  name: string; settings: GameSettings; players: number; policies: Policy[]; agentsPerGod: number; summonBits: number;
  cells: number; symbols: number; colours: number;
}
interface Obj { reward: number[]; penalty: number[] }
interface Agent { god: number; share: number; acct: ReturnType<typeof newAgentAccount>; last?: number }
interface Result {
  totals: number[]; half: number[]; acts: number; skips: number; worldSeconds: number; starved: boolean; error?: string;
  /** Energy spent on reading and on changing. */
  readSpent: number; changeSpent: number;
}

function net(o: Obj, g: number, s: GameSettings): number {
  return s.defenceGoals ? netBits({ rewardBits: o.reward[g], penaltyBits: o.penalty[g], penaltyMeanBits: PENALTY_MEAN }, s.penaltyWeight) : o.reward[g];
}
function payoffs(o: Obj, n: number, s: GameSettings): number[] {
  const nb = Array.from({ length: n }, (_, g) => net(o, g, s));
  const sum = nb.reduce((a, b) => a + b, 0);
  return nb.map(x => { const care = Math.max(0, sum - x); return care === 0 ? 0 : x * care; });
}
const totalsOf = (objs: Obj[], n: number, s: GameSettings) => objs.reduce((t, o) => { payoffs(o, n, s).forEach((p, g) => (t[g] += p)); return t; }, new Array(n).fill(0));

function spawn(u: () => number, n: number): Obj {
  return { reward: Array.from({ length: n }, () => surprisal(u)), penalty: Array.from({ length: n }, () => softHinge(surprisal(u))) };
}
/** One local edit: each god's reward (and penalty) surprisal moves part of the way to a fresh draw. */
function edit(o: Obj, u: () => number, frac: number): Obj {
  const mix = (x: number, y: number) => x * (1 - frac) + y * frac;
  return { reward: o.reward.map(r => mix(r, surprisal(u))), penalty: o.penalty.map(p => mix(p, softHinge(surprisal(u)))) };
}

export function play(c: Config, seed: number): Result {
  const s = c.settings, n = c.players, u = rng(seed), uo = open(u);
  const end = Math.min(gameEndSeconds(s.durationMode, s.halfLifeSeconds, uo), 3600);
  const objs: Obj[] = Array.from({ length: s.startingObjectCount }, () => spawn(u, n));
  // Planning: each god summons up to agentsPerGod agents from startingEnergy, each taking the default share.
  const deity = Array.from({ length: n }, () => ({ balance: s.startingEnergy, settledWorldSeconds: 0 }));
  const allocated = new Array(n).fill(0);
  const agents: Agent[] = [];
  const trySummon = (g: number, t: number) => {
    if (agents.filter(a => a.god === g).length >= Math.min(c.agentsPerGod, s.maxAgentsPerGod)) return;
    try { deity[g] = spendDeityEnergy(deity[g], c.summonBits); } catch { return; }
    const share = defaultShare(allocated[g]); allocated[g] += share;
    agents.push({ god: g, share, acct: newAgentAccount(t) });
  };
  for (let k = 0; k < c.agentsPerGod; k++) for (let g = 0; g < n; g++) trySummon(g, 0);
  const cellBits = Math.log2(c.symbols * c.colours), W = cellBits * 2, changeBits = W + CHANGE_BETA * W * W;
  const lookCharge = c.cells * cellBits / KAPPA; // energy for a whole-board look: its bits at 1/κ
  let readSpent = 0, changeSpent = 0;
  const dt = 0.25, frac = 2 / c.cells;
  let t = 0, acts = 0, skips = 0, nextSpawn = poissonIntervalSeconds(s.spawnRateHz, uo()), oppDebt = 0, half: number[] | null = null;
  try {
    while (t < end) {
      t = Math.min(end, t + dt);
      for (const a of agents) a.acct = settleAgentEnergy(a.acct, t, s.powerPerSecond * a.share);
      for (let g = 0; g < n; g++) {
        deity[g] = settleAgentEnergy(deity[g], t, s.powerPerSecond * Math.max(0, 1 - allocated[g]));
        trySummon(g, t);
      }
      while (nextSpawn <= t) { objs.push(spawn(u, n)); nextSpawn += poissonIntervalSeconds(s.spawnRateHz, uo()); }
      if (!half && t >= end / 2) half = totalsOf(objs, n, s);
      oppDebt += s.interactionRateHz * dt;
      while (oppDebt >= 1 && objs.length) {
        oppDebt -= 1;
        const a = pickByEnergy(agents.filter(x => offerable(x.last, t)), x => x.acct.balance, u);
        if (!a) { oppDebt = 0; break; }
        a.last = t;
        const oi = Math.floor(u() * objs.length), o = objs[oi], pol = c.policies[a.god];
        if (pol === "random") { objs[oi] = edit(o, u, frac); a.acct = chargeAct(a.acct, changeBits); changeSpent += changeBits; acts++; continue; }
        const noise = () => s.peerNoiseBits * Math.sqrt(-2 * Math.log(uo())) * Math.cos(2 * Math.PI * u());
        const value = (x: Obj) => { const p = payoffs(x, n, s); const own = p[a.god] + noise(); if (pol === "greedy") return own; return own - (p.reduce((q, v) => q + v, 0) - p[a.god]) / Math.max(1, n - 1); };
        const base = value(o); let best: Obj | null = null, bestV = base;
        for (let k = 0; k < 4; k++) { const cand = edit(o, u, frac), v = value(cand); if (v > bestV) { bestV = v; best = cand; } }
        readSpent += lookCharge;
        if (best) { objs[oi] = best; a.acct = chargeAct(a.acct, lookCharge + changeBits); changeSpent += changeBits; acts++; }
        else { a.acct = chargeAct(a.acct, lookCharge); skips++; }
      }
    }
    const totals = totalsOf(objs, n, s);
    if (totals.some(x => !Number.isFinite(x))) return { totals, half: half ?? totals, acts, skips, worldSeconds: end, starved: false, error: "non-finite score", readSpent, changeSpent };
    return { totals, half: half ?? totals, acts, skips, worldSeconds: end, starved: acts + skips === 0, readSpent, changeSpent };
  } catch (e) {
    return { totals: new Array(n).fill(0), half: new Array(n).fill(0), acts, skips, worldSeconds: t, starved: false, error: String((e as Error).message), readSpent, changeSpent };
  }
}

function summarize(c: Config, games: number) {
  const n = c.players, seatWins = new Array(n).fill(0), polWins: Record<string, number> = {};
  let blow = 0, comeback = 0, acts = 0, skips = 0, starved = 0, ties = 0, errors: string[] = [], spread = 0, len = 0, readSpent = 0, changeSpent = 0;
  for (let i = 0; i < games; i++) {
    const r = play(c, 1000 + i);
    if (r.error) { if (errors.length < 3) errors.push(`seed ${1000 + i}: ${r.error}`); continue; }
    const ids = Array.from({ length: n }, (_, g) => `g${g}`);
    const rows = rankTotals(ids, r.totals), win = Number(rows[0].godId.slice(1));
    if (rows.length > 1 && rows[0].totalPayoff === rows[1].totalPayoff) ties++;
    seatWins[win]++; polWins[c.policies[win]] = (polWins[c.policies[win]] ?? 0) + 1;
    const sorted = [...r.totals].sort((a, b) => b - a), mean = r.totals.reduce((a, b) => a + b, 0) / n;
    if (sorted[0] > 2 * Math.max(sorted[1], 1e-9)) blow++;
    spread += mean > 0 ? (sorted[0] - sorted[n - 1]) / mean : 0;
    const halfLeader = rankTotals(ids, r.half)[0].godId;
    if (halfLeader !== rows[0].godId) comeback++;
    acts += r.acts; skips += r.skips; len += r.worldSeconds; readSpent += r.readSpent; changeSpent += r.changeSpent; if (r.starved) starved++;
  }
  const ok = games - errors.length || 1, pct = (x: number) => `${Math.round((100 * x) / ok)}%`;
  return {
    name: c.name, seat0: pct(seatWins[0]), seatLast: pct(seatWins[n - 1]), fair: `${Math.round(100 / n)}%`, blowout: pct(blow), comeback: pct(comeback),
    spread: (spread / ok).toFixed(2), actsPerGame: Math.round(acts / ok), skipsPerGame: Math.round(skips / ok),
    readShare: `${Math.round((100 * readSpent) / Math.max(1e-9, readSpent + changeSpent))}%`, worldS: Math.round(len / ok), ties: pct(ties), starved: pct(starved),
    policyWins: Object.entries(polWins).map(([k, v]) => `${k}:${pct(v)}`).join(" "), errors: errors.join("; "),
  };
}

// ------------------------------------------------------------------------------------------------ configurations
const BOARD: Record<string, { cells: number; symbols: number; colours: number }> = {
  "grid-first-steps": { cells: 16, symbols: 10, colours: 3 }, "grid-annotated-basics": { cells: 16, symbols: 10, colours: 3 },
  "grid-classic": { cells: 25, symbols: 10, colours: 4 }, "grid-low-income": { cells: 25, symbols: 10, colours: 4 },
  "grid-big": { cells: 36, symbols: 16, colours: 6 }, "grid-master": { cells: 49, symbols: 52, colours: 6 },
};
function base(seedId: string, patch: Partial<Config> = {}, settingsPatch: Partial<GameSettings> = {}): Config {
  const setup = SEED_SETUPS.find(x => x.seedId === seedId)!;
  const settings = { ...setup.settings, ...settingsPatch } as GameSettings;
  const players = patch.players ?? 3;
  return { name: seedId, settings, players, policies: Array.from({ length: players }, () => "greedy" as Policy), agentsPerGod: 3, summonBits: 60, ...BOARD[seedId], ...patch };
}
function configs(): Config[] {
  const out: Config[] = [];
  const add = (name: string, c: Config) => { try { validateSettings(c.settings); } catch (e) { console.log(`INVALID ${name}: ${(e as Error).message}`); return; } out.push({ ...c, name }); };
  for (const sd of SEED_SETUPS) add(`${sd.seedId} (3 greedy)`, base(sd.seedId));
  const B = "grid-classic";
  for (const p of [2, 4, 6, 8]) add(`${B} players=${p}`, base(B, { players: p, policies: new Array(p).fill("greedy") }));
  for (const pp of [0, 1, 8, 32, 128, 1e4]) add(`${B} power=${pp}`, base(B, {}, { powerPerSecond: pp }));
  for (const se of [0, 50, 400, 1e6]) add(`${B} startingEnergy=${se}`, base(B, {}, { startingEnergy: se }));
  for (const hz of [1, 25, 300, 1000]) add(`${B} rate=${hz}Hz`, base(B, {}, { interactionRateHz: hz }));
  for (const h of [30, 120, 1200]) add(`${B} fixed ${h}s`, base(B, {}, { halfLifeSeconds: h, durationMode: "fixed" }));
  add(`${B} halfLife 300s`, base(B, {}, { durationMode: "halfLife" }));
  for (const so of [0, 10, 160]) add(`${B} objects=${so}`, base(B, {}, { startingObjectCount: so }));
  add(`${B} objects=0 spawn=0`, base(B, {}, { startingObjectCount: 0, spawnRateHz: 0 }));
  for (const w of [0, 0.5, 2, 10]) add(`${B} defence w=${w}`, base(B, {}, { defenceGoals: true, penaltyWeight: w }));
  for (const nb of [0, 16]) add(`${B} peerNoise=${nb}`, base(B, {}, { peerNoiseBits: nb }));
  add(`${B} 1 agent/god`, base(B, { agentsPerGod: 1 }));
  add(`${B} 10 agents/god`, base(B, { agentsPerGod: 10 }));
  add(`${B} random vs greedy vs deny`, base(B, { policies: ["random", "greedy", "deny"] }));
  add(`${B} deny vs greedy vs greedy`, base(B, { policies: ["deny", "greedy", "greedy"] }));
  add(`${B} 2p random vs greedy`, base(B, { players: 2, policies: ["random", "greedy"] }));
  add(`${B} 2p deny vs greedy`, base(B, { players: 2, policies: ["deny", "greedy"] }));
  add(`grid-master power=8`, base("grid-master", {}, { powerPerSecond: 8 }));
  const F = "grid-first-steps";
  add(`${F} random vs greedy vs greedy`, base(F, { policies: ["random", "greedy", "greedy"] }));
  add(`${F} random vs greedy vs deny`, base(F, { policies: ["random", "greedy", "deny"] }));
  add(`grid-master random vs greedy vs deny`, base("grid-master", { policies: ["random", "greedy", "deny"] }));
  add(`grid-first-steps 8p`, base("grid-first-steps", { players: 8, policies: new Array(8).fill("greedy") }));
  return out.filter(c => !ONLY || c.name.includes(ONLY));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = configs().map(c => summarize(c, GAMES));
  console.table(rows);
}
