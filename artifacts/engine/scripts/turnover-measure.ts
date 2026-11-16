/**
 * Line turnover on the engine, measured (the coordinator's checks before it is switched on; docs/engine-v2/tug-of-war.md).
 * Plays practice games of `Lines · beginner` on the local backend (`pnpm --filter @workspace/engine dev`), each a
 * spectating host and the three practice partners a practice deal seats (each summons its rule's Simple starter),
 * dilated 10×: half with turnover on (a birth every 30 s, at most 5 live, retired points banked), half as the preset
 * plays today (3 lines, a birth every 240 s). From each game's record it reports, by setup:
 *
 * - two-state cycles in the last third: lines moved at least 6 times in it through at most 2 states, and their share
 *   of the last third's moves;
 * - rungs stepped by third: moves that raised the mover's main part (the score's first entry);
 * - survival: of the bits a move gave its mover on a line, the share still theirs after the next move on that line by
 *   another seat (a line that retired or ended first counts as kept);
 * - fairness: the top seat's final total over the bottom seat's;
 * - banked: the share of a seat's final total held on retired lines.
 *
 * Usage (from artifacts/engine, the dev backend running):
 *   node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/turnover-measure.ts [games per setup, default 6] [parallel, default 3]
 */
import { admin, humans, perform } from "../test/v2-helpers.ts";

const GAMES = Number(process.argv[2] ?? 6), PARALLEL = Number(process.argv[3] ?? 3), SCALE = 10;
type Setup = { name: string; overrides: Record<string, unknown> };
const SETUPS: Setup[] = [
  { name: "today (3 lines, a birth every 240 s)", overrides: {} },
  { name: "turnover (a birth every 30 s, 5 live)", overrides: { liveCap: 5, birthSeconds: 30 } },
];

async function play(setup: Setup, k: number): Promise<any[]> {
  const [host] = await humans(`measure host ${k}`);
  const { roomId } = (await perform(host!, "room.create", { name: `measure ${k}`, preset: "lines-beginner" })).result;
  await perform(host!, "room.setSpectator", { spectator: true }, { roomId });
  await perform(host!, "seats.fillPracticePartners", {}, { roomId });
  const set = await perform(host!, "room.settings", { overrides: { planningSeconds: 5, ...setup.overrides } }, { roomId });
  if (!set.ok) throw new Error(JSON.stringify(set));
  await admin.mutation("v2/lobby:setTimeScale", { roomId, factor: SCALE });
  const started = await perform(host!, "game.start", {}, { roomId });
  if (!started.ok) throw new Error(JSON.stringify(started));
  const gameId = started.result.gameId, deadline = Date.now() + 400_000;
  while ((await host!.query("v2/games:header", { gameId })).phase !== "ended") {
    if (Date.now() > deadline) throw new Error(`game ${gameId} did not end`);
    await new Promise(r => setTimeout(r, 2000));
  }
  const events: any[] = [];
  for (let last = -1; ;) {
    const page = await admin.query("v2/testing:events", { gameId, after: last });
    if (page.length === 0) break;
    events.push(...page);
    last = page.at(-1).seq;
  }
  return events;
}

/** A score entry as a number ("3", "-1/2", "2.5"); NaN when it is not one. */
function numberOf(x: unknown): number {
  if (typeof x !== "string") return NaN;
  const [p, q] = x.split("/");
  return q === undefined ? Number(p) : Number(p) / Number(q);
}

interface Game { cycles: number; lateMoves: number; onCycles: number; rungs: number[]; kept: number[]; fairness: number; banked: number[]; moves: number; retired: number }

function measure(events: any[]): Game {
  const start = events.find(e => e.kind === "gameStarted")!.data, seconds = start.settings.worldSeconds as number;
  const seats: string[] = start.players.map((p: any) => p.memberId);
  const bits = new Map<number, Map<string, number>>(), main = new Map<number, Map<string, number>>();
  const retired = new Set<number>();
  const third = (t: number) => Math.min(2, Math.floor((3 * t) / seconds));
  const rungs = [0, 0, 0];
  const late = new Map<number, { moves: number; states: Set<string> }>();
  // Open claims: a move's gain to its mover, waiting for the next move on that line by another seat.
  const open = new Map<number, { by: string; before: number; after: number }[]>();
  const kept: number[] = [];
  let pending: { number: number; by: string; at: number; before: string; after: string } | null = null, moves = 0;
  for (const e of events) {
    if (e.kind === "act") pending = e.data.outcome === "committed" && e.data.after !== e.data.before
      ? { number: e.data.number, by: e.data.memberId, at: e.data.worldSeconds, before: e.data.before, after: e.data.after } : null;
    else if (e.kind === "retired") {
      retired.add(e.data.number);
      for (const c of open.get(e.data.number) ?? []) kept.push(1);
      open.delete(e.data.number);
    } else if (e.kind === "values") {
      const n = e.data.number as number, b = bits.get(n) ?? new Map(), m = main.get(n) ?? new Map();
      const was = new Map(b), wasMain = new Map(m);
      for (const v of e.data.values) { b.set(v.memberId, v.rarityBits); m.set(v.memberId, numberOf(v.score?.[0])); }
      bits.set(n, b); main.set(n, m);
      const act = pending && pending.number === n ? pending : null;
      pending = null;
      if (!act) continue;
      moves++;
      const t = third(act.at);
      if ((m.get(act.by) ?? NaN) > (wasMain.get(act.by) ?? NaN)) rungs[t]!++;
      if (t === 2) { const l = late.get(n) ?? { moves: 0, states: new Set([act.before]) }; l.moves++; l.states.add(act.after); late.set(n, l); }
      // Claims on this line by seats other than the mover are settled by this move.
      const claims = open.get(n) ?? [];
      const still = [];
      for (const c of claims) {
        if (c.by === act.by) { still.push(c); continue; }
        const now = b.get(c.by) ?? 0, gain = c.after - c.before;
        kept.push(Math.max(0, Math.min(1, (now - c.before) / gain)));
      }
      const mine = { by: act.by, before: was.get(act.by) ?? 0, after: b.get(act.by) ?? 0 };
      open.set(n, [...still.filter(c => c.by !== act.by), ...(mine.after > mine.before ? [mine] : [])]);
    }
  }
  for (const claims of open.values()) for (const _ of claims) kept.push(1);   // the game ended first
  const end = events.find(e => e.kind === "gameEnded")?.data?.standings ?? events.filter(e => e.kind === "tick").at(-1)!.data.standings;
  const totals = new Map<string, number>(end.map((r: any) => [r.memberId, r.total]));
  const pointsOn = (n: number, s: string) => { const b = bits.get(n)!; const all = [...b.values()].reduce((a, x) => a + x, 0); return (b.get(s) ?? 0) * (all - (b.get(s) ?? 0)); };
  const banked = seats.map(s => { const total = totals.get(s) ?? 0; const r = [...retired].reduce((a, n) => a + pointsOn(n, s), 0); return total > 0 ? r / total : 0; });
  const lateMoves = [...late.values()].reduce((a, l) => a + l.moves, 0);
  const cyc = [...late.values()].filter(l => l.moves >= 6 && l.states.size <= 2);
  const sorted = seats.map(s => totals.get(s) ?? 0).sort((a, b) => b - a);
  return {
    cycles: cyc.length, lateMoves, onCycles: cyc.reduce((a, l) => a + l.moves, 0), rungs, kept, moves,
    fairness: sorted.at(-1)! > 0 ? sorted[0]! / sorted.at(-1)! : Infinity, banked, retired: retired.size,
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : NaN; };

for (const setup of SETUPS) {
  const games: Game[] = [];
  for (let i = 0; i < GAMES; i += PARALLEL) {
    const batch = await Promise.all(Array.from({ length: Math.min(PARALLEL, GAMES - i) }, (_, j) => play(setup, i + j)));
    games.push(...batch.map(measure));
  }
  const lateMoves = games.reduce((a, g) => a + g.lateMoves, 0), onCycles = games.reduce((a, g) => a + g.onCycles, 0);
  const kept = games.flatMap(g => g.kept), finite = games.map(g => g.fairness).filter(Number.isFinite);
  console.log(`\n## ${setup.name}: ${games.length} games`);
  console.log(`- moves a game: ${mean(games.map(g => g.moves)).toFixed(0)}; lines retired a game: ${mean(games.map(g => g.retired)).toFixed(1)}`);
  console.log(`- two-state cycles in the last third: ${mean(games.map(g => g.cycles)).toFixed(1)} lines a game, ${(100 * onCycles / Math.max(1, lateMoves)).toFixed(0)}% of the last third's ${lateMoves} moves`);
  console.log(`- rungs stepped by third (a game): ${[0, 1, 2].map(t => mean(games.map(g => g.rungs[t]!)).toFixed(1)).join(" / ")}`);
  console.log(`- bits a move gave its mover still theirs after the next move by another seat: mean ${(100 * mean(kept)).toFixed(0)}%, fully kept ${(100 * kept.filter(x => x >= 1).length / Math.max(1, kept.length)).toFixed(0)}% (${kept.length} gains)`);
  console.log(`- fairness (top total ÷ bottom total): median ${median(finite).toFixed(2)}, mean ${mean(finite).toFixed(2)}${finite.length < games.length ? ` (${games.length - finite.length} games with a bottom total ≤ 0)` : ""}`);
  console.log(`- banked share of a seat's final total: median ${(100 * median(games.flatMap(g => g.banked))).toFixed(0)}%, mean ${(100 * mean(games.flatMap(g => g.banked))).toFixed(0)}%`);
}
