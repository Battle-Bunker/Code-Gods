/**
 * Capacity experiments (deterministic): evidence for the energy-economy redesign, on the balance-settings harness.
 * Rules under test (switches on the harness Config): R1 capacity = power × T (fullChargeSeconds), R2 no per-agent 4 Hz
 * cap (rateCap: false), R3 the offer price log2(live objects)/κ (offerPrice), R4 the debt bound (debtBound).
 * "before" = no T, cap on, no offer price; "after" = T, cap off, offer price on.
 *
 *   node --experimental-transform-types lib/game-core/scripts/balance-settings.ts --experiments [1,2,…|all] [--games 200] [--wingames 1000]
 *        [--rooms grid-first-steps,grid-classic,grid-master,grid-first-steps@4Hz]     (narrows experiments 1 and 2)
 *
 * It prints markdown tables: 1 the T sweep, 2 careful against blunt, 3 the hoarder, 4 agent-count neutrality, 5 the
 * offer price against a mutation, 6 the god's own account (arithmetic with game-core's energy functions, no games).
 * Every game is seeded (seed 1000 + i), so a row is reproducible from its command.
 */
import { play, base, type Config, type Policy } from "./balance-settings.ts";
import {
  SEED_SETUPS, DEFAULT_SETTINGS, CHANGE_READ_RATIO, type AgentAccount,
  energyCapacity, settleDeityEnergy, chargeDeityAccount, defaultShare, fullReadCharge, rankTotals,
} from "../src/index.ts";

// ------------------------------------------------------------------------------------------------ aggregation
interface Stat { m: number; se: number }
function stat(xs: number[]): Stat {
  const n = xs.length || 1, m = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1);
  return { m, se: Math.sqrt(v / n) };
}
interface GodAgg { offersHz: Stat; actsHz: Stat; spentHz: Stat; offerCostHz: Stat; incomeHz: Stat; lateEnergy: Stat; win: Stat; payoff: Stat }
interface Agg {
  games: number; errors: number; acts: Stat; skips: Stat; readShare: number;
  /** Income lost at the capacity as a share of income: agents' accounts, gods' own accounts. */
  agentWaste: number; deityWaste: number;
  /** Offers taken per world second (all gods), and the share of the stream no agent could take. */
  offersHz: Stat; passedShare: number;
  god: GodAgg[];
}
const cache = new Map<string, Agg>();
function run(c: Config, games: number): Agg {
  const key = JSON.stringify([{ ...c, name: "" }, games]);
  const hit = cache.get(key); if (hit) return hit;
  const n = c.players, per: Record<keyof GodAgg, number[]>[] = Array.from({ length: n }, () => ({ offersHz: [], actsHz: [], spentHz: [], offerCostHz: [], incomeHz: [], lateEnergy: [], win: [], payoff: [] }));
  const acts: number[] = [], skips: number[] = [], offersHz: number[] = [];
  let errors = 0, read = 0, change = 0, aInc = 0, aWaste = 0, dInc = 0, dWaste = 0, passed = 0, offered = 0;
  const ids = Array.from({ length: n }, (_, g) => `g${g}`);
  for (let i = 0; i < games; i++) {
    const r = play(c, 1000 + i);
    if (r.error) { errors++; continue; }
    const w = Math.max(r.worldSeconds, 1e-9), winner = Number(rankTotals(ids, r.totals)[0].godId.slice(1));
    acts.push(r.acts); skips.push(r.skips); read += r.readSpent; change += r.changeSpent; passed += r.passed;
    let off = 0;
    r.gods.forEach((g, k) => {
      const p = per[k]; off += g.offers;
      p.offersHz.push(g.offers / w); p.actsHz.push(g.acts / w); p.spentHz.push(g.spent / w); p.offerCostHz.push(g.offerSpent / w);
      p.incomeHz.push(g.agentIncome / w); p.lateEnergy.push(g.lateEnergy); p.win.push(k === winner ? 1 : 0); p.payoff.push(r.totals[k]);
      aInc += g.agentIncome; aWaste += g.agentWasted; dInc += g.deityIncome; dWaste += g.deityWasted;
    });
    offersHz.push(off / w); offered += off;
  }
  const out: Agg = {
    games, errors, acts: stat(acts), skips: stat(skips), readShare: read / Math.max(1e-9, read + change),
    agentWaste: aWaste / Math.max(1e-9, aInc), deityWaste: dWaste / Math.max(1e-9, dInc), offersHz: stat(offersHz), passedShare: passed / Math.max(1, passed + offered),
    god: per.map(p => ({ offersHz: stat(p.offersHz), actsHz: stat(p.actsHz), spentHz: stat(p.spentHz), offerCostHz: stat(p.offerCostHz), incomeHz: stat(p.incomeHz), lateEnergy: stat(p.lateEnergy), win: stat(p.win), payoff: stat(p.payoff) })),
  };
  cache.set(key, out);
  return out;
}

// ------------------------------------------------------------------------------------------------ formatting
const TS: (number | undefined)[] = [5, 15, 30, 60, 120, 300, undefined];
const tName = (T: number | undefined) => (T === undefined ? "none" : String(T));
const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : x > 0 ? "∞" : "−∞");
const pc = (x: number, d = 0) => `${(100 * x).toFixed(d)}%`;
const pm = (s: Stat, d = 2) => `${s.m.toFixed(d)} ± ${s.se.toFixed(d)}`;
const pmPc = (s: Stat) => `${(100 * s.m).toFixed(1)} ± ${(100 * s.se).toFixed(1)}`;
function table(head: string[], rows: (string | number)[][]): void {
  console.log(`| ${head.join(" | ")} |`); console.log(`|${head.map(() => "---").join("|")}|`);
  for (const r of rows) console.log(`| ${r.join(" | ")} |`);
  console.log("");
}
type Rules = Pick<Config, "fullChargeSeconds" | "rateCap" | "offerPrice" | "debtBound">;
const after = (T: number | undefined, debtBound = false): Rules => ({ fullChargeSeconds: T, rateCap: false, offerPrice: true, debtBound });
const capKept = (T: number | undefined): Rules => ({ fullChargeSeconds: T, rateCap: true, offerPrice: false, debtBound: false });
/** The sweep's rooms: three seed setups as shipped, and First steps with a scarce stream, where offers (not energy) bind. */
const SWEEP_ROOMS: { id: string; seed: string; hz?: number }[] = [
  { id: "grid-first-steps", seed: "grid-first-steps" }, { id: "grid-classic", seed: "grid-classic" }, { id: "grid-master", seed: "grid-master" },
  { id: "grid-first-steps@4Hz", seed: "grid-first-steps", hz: 4 },
];
let ROOMS = SWEEP_ROOMS;
const room = (r: { seed: string; hz?: number }, patch: Partial<Config>) => base(r.seed, patch, r.hz ? { interactionRateHz: r.hz } : {});
const wins = (a: Agg) => a.god.map(g => (100 * g.win.m).toFixed(1)).join(" / ");

// ------------------------------------------------------------------------------------------------ 1. the T sweep
function sweep(games: number, winGames: number): void {
  console.log(`## 1. T sweep, after-rules (no cap, offer price on). Acts, skips, waste and reading: 3 greedy gods × 3 agents, ${games} games per row. Win shares: ${winGames} games per row (fair 33.3; ±${f(100 * Math.sqrt(0.33 * 0.67 / winGames))} points).\n`);
  for (const rm of ROOMS) {
    const s = room(rm, {}).settings;
    console.log(`### ${rm.id} (P = ${s.powerPerSecond}, ${s.interactionRateHz} Hz, ${s.durationMode} ${s.halfLifeSeconds} s)\n`);
    const rows: (string | number)[][] = [];
    const row = (label: string, r: Rules) => {
      const g = run(room(rm, r), games);
      const rgd = run(room(rm, { ...r, policies: ["always", "greedy", "deny"] }), winGames), rgg = run(room(rm, { ...r, policies: ["always", "greedy", "greedy"] }), winGames);
      rows.push([label, Math.round(g.acts.m), Math.round(g.skips.m), pc(g.agentWaste, 1), pc(g.deityWaste, 1), pc(g.readShare, 1), pc(g.passedShare), wins(rgd), wins(rgg)]);
    };
    for (const T of TS) row(tName(T), after(T));
    row("30 + R4 debt bound", after(30, true));
    row("before (none, 4 Hz cap, no offer price)", capKept(undefined));
    table(["T (s)", "acts/game", "skips/game", "income wasted, agents", "income wasted, gods' own", "energy on reading incl. offer", "stream passed (no agent with energy)", "wins always / greedy / deny", "wins always / greedy / greedy"], rows);
  }
}

// ------------------------------------------------------------------------------------------------ 2. careful vs blunt
function careful(winGames: number): void {
  console.log(`## 2. Careful (greedy: look, then act or skip) against blunt (always: read nothing, always edit). Room: always / greedy / greedy, 3 agents each, ${winGames} games per cell. "gain" = the mean greedy seat's win share minus the always seat's (points); "payoff" = mean greedy total payoff ÷ mean always total payoff. Before-rules = 4 Hz cap, no offer price (T = none is today); after-rules = no cap, offer price.\n`);
  for (const rm of ROOMS) {
    console.log(`### ${rm.id}\n`);
    const rows: (string | number)[][] = [];
    for (const T of TS) {
      const cell = (r: Rules) => {
        const a = run(room(rm, { ...r, policies: ["always", "greedy", "greedy"] }), winGames);
        const blunt = a.god[0], gw = (a.god[1].win.m + a.god[2].win.m) / 2, gp = (a.god[1].payoff.m + a.god[2].payoff.m) / 2;
        return [pc(blunt.win.m, 1), pc(gw, 1), `${gw - blunt.win.m >= 0 ? "+" : ""}${f(100 * (gw - blunt.win.m))}`, f(gp / blunt.payoff.m, 3), f(blunt.actsHz.m, 2), f((a.god[1].actsHz.m + a.god[2].actsHz.m) / 2, 2)];
      };
      rows.push([tName(T), ...cell(capKept(T)), ...cell(after(T))]);
    }
    const cols = ["always wins", "greedy wins (mean seat)", "gain (pts)", "payoff ratio", "always acts/s", "greedy acts/s"];
    table(["T (s)", ...cols.map(x => `before: ${x}`), ...cols.map(x => `after: ${x}`)], rows);
  }
}

// ------------------------------------------------------------------------------------------------ 3. the hoarder
function hoarder(games: number): void {
  console.log(`## 3. Hoarder: god 2's three agents read nothing and return no calls; gods 0 and 1 are greedy (3 agents each, default shares 1/2, 1/4, 1/8). grid-first-steps, ${games} games per row and room. "active acts/s" sums gods 0 and 1. Comparison rooms under the same rules: the third god an ordinary greedy player; only the two active gods.\n`);
  for (const hz of [25, 4]) {
    console.log(`### interactionRateHz = ${hz}${hz === 25 ? " (the Grid seeds' value)" : " (scarce stream: offers are the bottleneck)"}\n`);
    const rows: (string | number)[][] = [];
    for (const T of TS) for (const offerPrice of [false, true]) for (const rateCap of [true, false]) {
      const r: Rules = { fullChargeSeconds: T, rateCap, offerPrice, debtBound: false };
      const mk = (patch: Partial<Config>) => run(base("grid-first-steps", { ...r, ...patch }, { interactionRateHz: hz }), games);
      const h = mk({ policies: ["greedy", "greedy", "hoard"] }), third = mk({}), two = mk({ players: 2, policies: ["greedy", "greedy"] });
      const active = (a: Agg) => a.god[0].actsHz.m + a.god[1].actsHz.m, hg = h.god[2];
      rows.push([tName(T), offerPrice ? "on" : "off", rateCap ? "4 Hz" : "none", pc(hg.offersHz.m / hz, 1), f(hg.offersHz.m, 2), f(hg.offerCostHz.m, 2), pc(hg.offerCostHz.m / hg.incomeHz.m, 1),
        Math.round(hg.lateEnergy.m), Math.round((h.god[0].lateEnergy.m + h.god[1].lateEnergy.m) / 2), `${f(active(h), 2)} ± ${f(Math.hypot(h.god[0].actsHz.se, h.god[1].actsHz.se), 2)}`, f(active(third), 2), f(active(two), 2), pc(active(h) / active(third)), pc(active(h) / active(two))]);
    }
    table(["T (s)", "offer price", "rate cap", "hoarder's share of the stream", "hoarder offers/s", "hoarder cost bits/s", "cost ÷ its agents' income", "hoarder energy (2nd-half mean, bits)", "an active god's energy (bits)",
      "active acts/s, hoarder room", "active acts/s, third god greedy", "active acts/s, two gods only", "vs greedy third", "vs two only"], rows);
  }
}

// ------------------------------------------------------------------------------------------------ 4. agent-count neutrality
function neutrality(games: number): void {
  const NS = [1, 2, 3, 5, 10];
  console.log(`## 4. Agent-count neutrality: god 0 runs n pre-created agents with equal shares 0.9/n (no summon priced); gods 1 and 2 are greedy with 2 agents at 0.45 each. grid-classic board, fixed 300 s, P = 64. ${games} games per row at 25 Hz, ${Math.max(20, Math.round(games / 2))} at 100 Hz; mean ± standard error over games. (a) before: 4 Hz cap, no T; (b) capacity T = 30 with the cap kept; (c) after: no cap, T = 30, offer price.\n`);
  const variants: [string, Rules][] = [["(a) before", capKept(undefined)], ["(b) cap + T=30", capKept(30)], ["(c) after", after(30)]];
  for (const hz of [25, 100]) for (const pol of ["always", "greedy", "hoard"] as Policy[]) {
    console.log(`### ${hz} Hz, god 0 policy: ${pol}\n`);
    const rows: (string | number)[][] = [];
    for (const [label, r] of variants) for (const n of NS) {
      const c = base("grid-classic", { ...r, policies: [pol, "greedy", "greedy"], shares: [new Array(n).fill(0.9 / n), [0.45, 0.45], [0.45, 0.45]] }, { interactionRateHz: hz, durationMode: "fixed", halfLifeSeconds: 300 });
      const g = run(c, hz === 25 ? games : Math.max(20, Math.round(games / 2))).god[0];
      rows.push([label, n, pm(g.offersHz), pm(g.actsHz), pm(g.spentHz), pmPc(g.win), Math.round(g.lateEnergy.m)]);
    }
    table(["rules", "n agents", "offers/s", "acts/s", "energy spent/s", "win share %", "god 0 energy (bits)"], rows);
  }
}

// ------------------------------------------------------------------------------------------------ 5. the offer price
/** The cheapest change on each seed's board (docs/energy-model.md §2.1, "Cheapest change C"). */
const CHEAPEST_CHANGE: Record<string, number> = { "grid-first-steps": 11.5, "grid-annotated-basics": 16.3, "grid-classic": 14.3, "grid-low-income": 14.3, "grid-big": 17.8, "grid-master": 18.7 };
function offerPrice(): void {
  console.log(`## 5. The offer price log2(live objects)/κ (κ = ${CHANGE_READ_RATIO}) against the cheapest change C (docs/energy-model.md §2.1) and a full read at 1/κ (fullReadCharge). "after 600 s" uses startingObjectCount + spawnRateHz × 600 objects.\n`);
  const rows = SEED_SETUPS.map(sd => {
    const s = sd.settings, n0 = s.startingObjectCount, n1 = n0 + s.spawnRateHz * 600, C = CHEAPEST_CHANGE[sd.seedId], read = fullReadCharge(s);
    const o0 = Math.log2(n0) / CHANGE_READ_RATIO, o1 = Math.log2(n1) / CHANGE_READ_RATIO;
    return [sd.seedId, n0, f(o0, 3), Math.round(n1), f(o1, 3), C ?? "?", f(read, 2), C ? pc(o0 / C, 1) : "?", C ? pc(o1 / C, 1) : "?", pc(o0 / read, 1), f(s.interactionRateHz * o1, 1), s.powerPerSecond];
  });
  table(["seed", "objects at start", "offer price (bits)", "objects after 600 s", "offer price then", "cheapest change C", "full read ÷ κ", "offer ÷ C (start)", "offer ÷ C (600 s)", "offer ÷ full read", "whole stream's offers, bits/s (600 s)", "P (bits/s per god)"], rows);
}

// ------------------------------------------------------------------------------------------------ 6. the god's account
const PROGRAMS = [60, 150, 400, 1137];
const fits = (bits: number) => { const ok = PROGRAMS.filter(p => p <= bits + 1e-9); return ok.length ? `≤ ${ok[ok.length - 1]}` : "none"; };
function godAccount(): void {
  const start = DEFAULT_SETTINGS.startingEnergy, T6 = [15, 30, 60, 120];
  console.log(`## 6. The god's own account: capacity = retained share × P × T (energyCapacity). Refilling from empty takes T world seconds at any retained share (capacity ÷ income). "fits" = the largest reference program (${PROGRAMS.join(", ")} bits) a full account pays for. startingEnergy = ${start}.\n`);
  for (const P of [64, 32, 8]) {
    console.log(`### P = ${P}${P === 64 ? " (Grid)" : P === 32 ? " (grid-low-income)" : " (general defaults)"}\n`);
    table(["T (s)", ...[0.1, 0.25, 0.5, 1].map(r => `retained ${pc(r)}: capacity (fits)`), "seconds to refill from empty", "startingEnergy kept in planning"],
      T6.map(T => [T, ...[0.1, 0.25, 0.5, 1].map(r => { const cap = energyCapacity(P * r, T); return `${f(cap, 0)} (${fits(cap)})`; }), T, f(Math.min(start, energyCapacity(P, T)), 0)]));
    table(["program (bits)", ...[0.1, 0.25, 0.5, 1].map(r => `retained ${pc(r)}: smallest T that fits it (s); seconds to save it from empty`)],
      PROGRAMS.map(p => [p, ...[0.1, 0.25, 0.5, 1].map(r => `${f(p / (P * r), 1)}`)]));
  }
  console.log(`### The first five minutes (real deity-account functions): planning with world time stopped and ${start} bits, summon a 60-bit agent at the default share (half of unallocated), then a second; then world time runs. Each cell: the god's balance (largest reference program it can pay for).\n`);
  const rows: (string | number)[][] = [];
  for (const P of [64, 32, 8]) for (const T of [...T6, undefined]) {
    let acct: AgentAccount = { balance: start, settledWorldSeconds: 0 }, allocated = 0;
    const terms = () => ({ powerPerSecond: P, allocated, fullChargeSeconds: T });
    const cell = (a: AgentAccount) => `${f(a.balance, 0)} (${fits(a.balance)})`;
    const out: string[] = [];
    acct = settleDeityEnergy(acct, 0, terms()); out.push(f(acct.balance, 0));
    for (let k = 0; k < 2; k++) {
      try { acct = chargeDeityAccount(acct, 60, 0, terms()); allocated += defaultShare(allocated); acct = settleDeityEnergy(acct, 0, terms()); out.push(f(acct.balance, 0)); }
      catch { out.push("refused"); }
    }
    for (const t of [30, 60, 300]) out.push(cell(settleDeityEnergy(acct, t, terms())));
    rows.push([P, tName(T), pc(1 - allocated), f(energyCapacity(P * (1 - allocated), T), 0), ...out]);
  }
  table(["P", "T (s)", "retained after summons", "capacity after summons", "planning balance (clamped)", "after 1st summon", "after 2nd summon", "at 30 s", "at 60 s", "at 300 s"], rows);
  console.log(`### Agents' capacities at P = 64 (share × P × T), against a one-cell change (16.3 bits on the Classic board in this harness), a row repaint on 4×4 (86 bits) and the whole 4×4 grid (985 bits). With R4 the largest act an agent can ever commit costs at most 2 × capacity (full balance down to −capacity).\n`);
  table(["T (s)", ...[0.5, 0.3, 0.25, 0.125].map(sh => `share ${sh}: capacity`), "seconds of income for 86 bits at share 0.25", "for 985 bits at share 0.25"],
    [5, 15, 30, 60, 120, 300].map(T => [T, ...[0.5, 0.3, 0.25, 0.125].map(sh => f(energyCapacity(64 * sh, T), 0)), f(86 / 16, 1), f(985 / 16, 1)]));
}

/** Run the experiments named in `which` ("all" or a comma list of 1–6); `rooms` (a comma list of sweep room ids) narrows 1 and 2. */
export function runExperiments(which: string, games: number, winGames: number, rooms = ""): void {
  if (rooms) ROOMS = SWEEP_ROOMS.filter(r => rooms.split(",").includes(r.id));
  const want = (k: number) => which === "all" || which.startsWith("--") || which.split(",").includes(String(k));
  if (want(1)) sweep(games, winGames);
  if (want(2)) careful(winGames);
  if (want(3)) hoarder(games);
  if (want(4)) neutrality(games);
  if (want(5)) offerPrice();
  if (want(6)) godAccount();
}
