/**
 * Ground-truth games for the coordination-incentives model (docs/coordination-incentives.md): REAL engine games on
 * the default setup (Annotated basics), three gods, one scripted agent each, summoned during planning with the whole
 * power budget. Each game's record is appended to lib/game-utilities/scripts/coordination-engine-games.json.
 *
 * Run from artifacts/engine with the dev engine up (`pnpm --filter @workspace/engine dev`, wait for `[dev] READY`):
 *
 *   node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/coordination-games.ts \
 *     --table a|b|c|all|fill|probe [--games N] [--plans rrr,ggg] [--seconds 240] [--concurrency 3]
 *
 * Tables: a = random/random/random; b = greedy/greedy/greedy; c = one random seat (rotated through seats 0, 1, 2) and
 * two greedy seats; probe = one short random/greedy/greedy game that is printed, not recorded.
 * Seat = join order = roster order (the owner is seat 0).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { energyCapacity, instantiationOf, leaderboard, seedSetupSettings, type GameSettings } from "@workspace/game-core";
import { availableFamilies, context, family, type UtilityDescriptor } from "@workspace/game-utilities";
import { admin, api, envelope, gods, internal, raw, roomWith, sleep, startGame, touch, waitFor, type God } from "../test/game-helpers.ts";

type Policy = "random" | "greedy";
const OUT = fileURLToPath(new URL("../../../lib/game-utilities/scripts/coordination-engine-games.json", import.meta.url));
const SETUP = "grid-annotated-basics";
/** Planning long enough for three summons (each is examined in the sandbox: 30 s was too short with three games at once); the range's minimum is 0: no planning at all. */
const PLANNING_SECONDS = 90;
const POWER_SHARE = 1;

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };

/** The agents' language: Python programs cost about half of the same TypeScript at summon (ast-bits-v1 against ts-ast-bits-v1-uniform). */
const LANGUAGE = "python";

/** `random`: one uniformly random digit into one uniformly random cell; reads nothing (`random` is the act's seeded stream). */
export const RANDOM_SOURCE = `import random

def agent(grid):
    r = random.randrange
    return [write((r(4), r(4)), r(10))]
`;

/**
 * `greedy`: the god's own rule (its card's program, verbatim), evaluated on every one-cell write (16 cells × 10 digits,
 * the cell's own digit included: it never beats the board) on a plain copy of the board built from the prelude's own
 * Cell and Grid; returns the first write (row by row, digits ascending) with the highest ordinal that strictly beats the
 * board's, or [] (a skip) when none does. Reads every cell's value once. Deterministic: it never draws from random.
 */
export function greedySource(utility: UtilityDescriptor, settings: GameSettings): string {
  const card = family(utility.familyId).card.python(utility.params, context(instantiationOf(settings)));
  return `${card}
def agent(grid):
    c = [Cell() for x in grid.cells]
    for y, x in zip(c, grid.cells):
        y.row, y.col, y.value = x.row, x.col, x.value
    for y in c:
        i = 4 * y.row + y.col
        y.right = c[i + 1] if y.col < 3 else None
        y.down = c[i + 4] if y.row < 3 else None
    board = Grid([c[i:i + 4] for i in (0, 4, 8, 12)])
    best, move = utility(board), []
    for y in c:
        old = y.value
        for y.value in range(10):
            u = utility(board)
            if u > best:
                best, move = u, [write(y, y.value)]
        y.value = old
    return move
`;
}

const sourceOf = (policy: Policy, utility: UtilityDescriptor, settings: GameSettings) => policy === "random" ? RANDOM_SOURCE : greedySource(utility, settings);

/** The dearest summon price validated so far, by whether the game has a greedy seat: later games start with enough energy. */
const dearest = new Map<boolean, number>();
/** Never below the setup's own startingEnergy (200). */
const energyFor = (price: number) => Math.max(seedSetupSettings(SETUP).startingEnergy, Math.ceil(price / 25) * 25 + 25);

async function playGame(label: string, table: string, policies: Policy[], seconds: number, startingEnergy?: number): Promise<any> {
  const hasGreedy = policies.includes("greedy");
  if (startingEnergy === undefined && dearest.has(hasGreedy)) startingEnergy = energyFor(dearest.get(hasGreedy)!);
  const names = policies.map((p, i) => `Seat${i} ${p} ${label}`);
  const members: God[] = await gods(...names);
  await Promise.all(members.map(touch));
  const base = seedSetupSettings(SETUP);
  const overrides = { halfLifeSeconds: seconds, planningSeconds: PLANNING_SECONDS, languages: ["python", "typescript"], ...(startingEnergy ? { startingEnergy } : {}) };
  const settings = { ...base, ...overrides } as GameSettings;
  const { roomId } = await roomWith(members, settings as unknown as Record<string, unknown>);
  const game = await startGame(members[0], roomId);
  const start = await raw(game.gameId);
  const roster: string[] = start.game.roster.map((m: any) => m.id);
  const deities = [...start.deities].sort((a: any, b: any) => a.index - b.index);
  const send = (god: God, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  // The seat of each client: its god id (its subject) placed in the roster.
  const seatOf = members.map(m => roster.indexOf(m.subject));
  if (seatOf.some((s, i) => s !== i)) throw new Error(`join order is not roster order: ${seatOf}`);
  const sources = policies.map((p, i) => sourceOf(p, deities[i].utility, settings));
  // Prices first (validate): a program dearer than the starting energy needs a new game with more of it.
  const prices = await Promise.all(members.map(async (m, i) => {
    const r = await send(m, { type: "validate", language: LANGUAGE, source: sources[i] });
    if (!r.accepted) throw new Error(`${label}: validate refused: ${r.message}`);
    return r.validation as { cost: number; affordable: boolean; expectedActCost: number; changeRate?: number; skipRate?: number; expectedSuccessRate?: number; warnings?: string[] };
  }));
  dearest.set(hasGreedy, Math.max(dearest.get(hasGreedy) ?? 0, ...prices.map(p => p.cost)));
  if (prices.some(p => !p.affordable)) {
    await members[0].c.mutation(api.rooms.endActiveGame, { roomId });
    const need = energyFor(dearest.get(hasGreedy)!);
    console.log(`[${label}] summon prices ${prices.map(p => p.cost.toFixed(1))} exceed startingEnergy ${settings.startingEnergy}: replaying with ${Math.max(need, (startingEnergy ?? 0) + 50)}`);
    return playGame(label, table, policies, seconds, Math.max(need, (startingEnergy ?? 0) + 50));
  }
  const summons = await Promise.all(members.map(async (m, i) => {
    const r = await send(m, { type: "summon", name: `${policies[i]}${i}`, language: LANGUAGE, source: sources[i], powerShare: POWER_SHARE });
    if (!r.accepted) throw new Error(`${label}: summon refused: ${r.message}`);
    return r;
  }));
  const afterSummon = await admin.query(internal.testing.gameCounters, { gameId: game.gameId });
  const summonedInPlanning = afterSummon.phase === "planning";
  const objectsAtStart = start.objects.length;
  // Play: keep the gods active (an idle deployment parks its games) and watch world time advance.
  const wallStart = Date.now();
  let lastWorld = 0, lastWall = Date.now(), worstStall = 0, runningSince: number | undefined;
  for (;;) {
    // A slow backend can time a call out: the next round tries again.
    let c: any;
    try {
      await Promise.all(members.map(touch));
      c = await admin.query(internal.testing.gameCounters, { gameId: game.gameId });
    } catch (error) { console.warn(`[${label}] poll failed: ${(error as Error).message.split("\n")[1] ?? error}`); await sleep(2000); continue; }
    if (c.phase === "running" && runningSince === undefined) runningSince = Date.now();
    if (c.worldSeconds > lastWorld) { lastWorld = c.worldSeconds; lastWall = Date.now(); }
    else if (c.phase === "running") worstStall = Math.max(worstStall, Date.now() - lastWall);
    if (c.phase === "ended" || c.phase === "recovery") break;
    if (Date.now() - wallStart > (seconds + PLANNING_SECONDS + 600) * 1000) throw new Error(`${label}: the game did not end`);
    await sleep(5000);
  }
  const wallRunningSeconds = runningSince === undefined ? null : (Date.now() - runningSince) / 1000;
  const end = await raw(game.gameId);
  const world = end.game.worldSeconds;
  const rows = leaderboard(roster, end.objects.map((o: any) => new Map(o.scores.map((s: any) => [s.god, s.netBits]))));
  const byGod = new Map(rows.map(r => [r.godId, r]));
  const events = end.batches.flatMap((b: any) => b.events);
  const count = (t: string) => events.filter((e: any) => e.t === t).length;
  const seats = roster.map((godId, i) => {
    const agent = end.agents.find((a: any) => a.ownerId === godId);
    const deity = end.deities.find((d: any) => d.godId === godId);
    const income = agent.powerShare * settings.powerPerSecond;
    // The world time of the summon (0 in planning): the agent earns from then.
    const summonWorld: number = events.find((e: any) => e.t === "summon" && e.ownerId === godId)?.world ?? 0;
    // Capacity (settings.fullChargeSeconds): an account holds at most its income × fullChargeSeconds; income past it is lost.
    const capacity = energyCapacity(income, end.game.settings.fullChargeSeconds);
    const energyBalance = Math.min(capacity, agent.account.balance + income * Math.max(0, world - agent.account.settledWorldSeconds));
    return {
      seat: i, policy: policies[i], utility: deities[i].utility,
      summonPrice: agent.summonCost, expectedActCost: agent.expectedActCost, powerShare: agent.powerShare,
      // Whether the deity could pay from the setup's own startingEnergy, in planning; else the world seconds it must save at full income.
      affordableAtDefaultStartingEnergy: agent.summonCost <= base.startingEnergy,
      secondsToSaveAtDefault: Math.max(0, (agent.summonCost - base.startingEnergy) / base.powerPerSecond),
      deityCapacity: energyCapacity(base.powerPerSecond, end.game.settings.fullChargeSeconds),
      validation: { changeRate: prices[i].changeRate, skipRate: prices[i].skipRate, expectedSuccessRate: prices[i].expectedSuccessRate, warnings: summons[i].warnings ?? [] },
      totalPayoff: byGod.get(godId)!.totalPayoff, rank: byGod.get(godId)!.rank,
      acts: agent.acts, transforms: agent.transforms ?? 0, skips: agent.skips ?? 0, failures: agent.failures ?? null,
      lastFailures: agent.lastFailures ?? {},
      spent: agent.spent, spentRead: agent.spentRead ?? 0,
      energyBalance, agentCapacity: capacity, atCapacityAtEnd: energyBalance >= capacity - 1e-6,
      summonWorld,
      // Income the capacity refused (the agent started at 0 at its summon): earned − spent − what it holds.
      incomeLostToCapacity: Math.max(0, income * (world - summonWorld) - agent.spent - energyBalance),
      storedAccount: agent.account, deityEnergyStored: deity?.account ?? null,
      source: sources[i],
    };
  });
  return {
    table, label, gameId: game.gameId, playedAt: new Date().toISOString(),
    setup: SETUP, overrides, settings: end.game.settings, agentLanguage: LANGUAGE, summonedInPlanning,
    worldSeconds: world, endAtWorld: end.game.endAtWorld, phase: end.game.phase, wallRunningSeconds, worstStallMs: worstStall,
    objectsAtStart, objectsAtEnd: end.objects.length, engineStats: end.game.stats ?? null,
    events: { transform: count("transform"), fail: count("fail"), skip: count("skip"), spawn: count("spawn") },
    seats,
    // Each object's final per-god net bits, roster order.
    objects: end.objects.map((o: any) => ({ version: o.version, net: roster.map(id => o.scores.find((s: any) => s.god === id)?.netBits ?? 0) })),
  };
}

function summarize(r: any) {
  const w = r.worldSeconds;
  console.log(`[${r.label}] world ${w.toFixed(1)} s (wall ${r.wallRunningSeconds?.toFixed(0)} s, worst stall ${r.worstStallMs} ms), objects ${r.objectsAtStart} → ${r.objectsAtEnd}, stats ${JSON.stringify(r.engineStats)}`);
  for (const s of r.seats) {
    const fails = Object.values(s.failures ?? {}).reduce((a: number, b: any) => a + b, 0);
    console.log(`  seat ${s.seat} ${s.policy} ${s.utility.familyId} ${JSON.stringify(s.utility.params)} price ${s.summonPrice.toFixed(1)} payoff ${s.totalPayoff.toFixed(1)} rank ${s.rank}`
      + ` acts/s ${(s.acts / w).toFixed(2)} transforms/s ${(s.transforms / w).toFixed(2)} skips/s ${(s.skips / w).toFixed(2)} fails/s ${(fails / w).toFixed(2)} ${JSON.stringify(s.failures)}`
      + ` spent ${s.spent.toFixed(0)} (read ${s.spentRead.toFixed(0)}) balance ${s.energyBalance.toFixed(0)} ${JSON.stringify(s.lastFailures)}`);
  }
}

/**
 * `--table price --files a.ts,b.py`: the engine's own examination (validate) of each program file in a planning game
 * on the default setup: summon price and its parts, expected act cost (read + change), measured rates, diagnostics.
 */
async function priceFiles(files: string[]) {
  const members = await gods("Price 0", "Price 1", "Price 2");
  await Promise.all(members.map(touch));
  const settings = { ...seedSetupSettings(SETUP), planningSeconds: 3600, languages: ["python", "typescript"] };
  const { roomId } = await roomWith(members, settings as unknown as Record<string, unknown>);
  const game = await startGame(members[0], roomId);
  for (const file of files) {
    const source = readFileSync(file, "utf8"), language = file.endsWith(".py") ? "python" : "typescript";
    const r = await members[0].c.action(api.commands.submit, { roomId, envelope: envelope({ type: "validate", language, source }, game.gameId) });
    if (!r.accepted || !r.validation) { console.log(JSON.stringify({ file, refused: r.message })); continue; }
    const v = r.validation;
    console.log(JSON.stringify({ file, language, chars: source.length, cost: v.cost, parts: v.parts, expectedActCost: v.expectedActCost, breakdown: v.breakdown,
      changeRate: v.changeRate, skipRate: v.skipRate, invalidRate: v.invalidRate, expectedSuccessRate: v.expectedSuccessRate, randomized: v.randomized,
      warnings: v.warnings, diagnostics: v.diagnostics }));
  }
  // --greedy: the generated greedy program of every family of the default pool (its first parameters).
  if (process.argv.includes("--greedy")) {
    const inst = instantiationOf(settings as GameSettings), ctx = context(inst);
    for (const f of availableFamilies(inst, "reward", settings.excludedFamilies) as any[]) {
      const source = greedySource({ familyId: f.id, params: f.support(ctx)[0] } as UtilityDescriptor, settings as GameSettings);
      const r = await members[0].c.action(api.commands.submit, { roomId, envelope: envelope({ type: "validate", language: LANGUAGE, source }, game.gameId) });
      const v = r.validation;
      console.log(JSON.stringify(v ? { family: f.id, cost: v.cost, parts: v.parts, expectedActCost: v.expectedActCost, breakdown: v.breakdown, changeRate: v.changeRate, skipRate: v.skipRate, diagnostics: v.diagnostics } : { family: f.id, refused: r.message }));
    }
  }
  await members[0].c.mutation(api.rooms.endActiveGame, { roomId });
}

async function main() {
  if (arg("table", "probe") === "price") return priceFiles(arg("files", "").split(",").filter(Boolean));
  const table = arg("table", "probe"), seconds = Number(arg("seconds", table === "probe" ? "30" : "240"));
  const concurrency = Number(arg("concurrency", "3"));
  const plans: Policy[][] = [];
  if (table === "probe") plans.push(["random", "greedy", "greedy"]);
  const R: Policy = "random", G: Policy = "greedy";
  const tableA = (n: number): Policy[][] => Array.from({ length: n }, () => [R, R, R]);
  const tableB = (n: number): Policy[][] => Array.from({ length: n }, () => [G, G, G]);
  const tableC = (n: number): Policy[][] => Array.from({ length: n }, (_, i) => [0, 1, 2].map(s => (s === i % 3 ? R : G)));
  if (table === "a") plans.push(...tableA(Number(arg("games", "3"))));
  if (table === "b") plans.push(...tableB(Number(arg("games", "6"))));
  if (table === "c") plans.push(...tableC(Number(arg("games", "6"))));
  // Everything, with the cheap random games spread over the batches of three (the greedy acts are the sandbox's load).
  if (table === "all") {
    const a = tableA(3), b = tableB(6), c = tableC(3);
    for (let i = 0; i < 3; i++) plans.push(b[2 * i], b[2 * i + 1], a[i]);
    plans.push(...c);
  }
  // Replays for games of a batch that failed to start: --table fill --plans rrr,ggg,rgg
  if (table === "fill") plans.push(...arg("plans", "").split(",").filter(Boolean).map(p => [...p].map(ch => (ch === "r" ? R : G))));
  const stamp = Date.now().toString(36);
  // A game the machine starved (fewer than 93% of rate × seconds opportunities) or that failed is replayed, at most twice.
  const queue = plans.map(policies => ({ policies, tries: 0 }));
  for (let n = 0; queue.length; ) {
    const batch = queue.splice(0, concurrency);
    const tableOf = (p: Policy[]) => (p.every(x => x === "random") ? "a" : p.every(x => x === "greedy") ? "b" : "c");
    const results = await Promise.allSettled(batch.map(p => playGame(`${table === "probe" ? "probe" : tableOf(p.policies)}${n++}-${stamp}`, tableOf(p.policies), p.policies, seconds)));
    results.forEach((r, j) => {
      const again = () => { if (table !== "probe" && batch[j].tries < 2) queue.push({ policies: batch[j].policies, tries: batch[j].tries + 1 }); };
      if (r.status === "rejected") { console.error(`game failed: ${r.reason?.stack ?? r.reason}`); again(); return; }
      summarize(r.value);
      if (table === "probe") return;
      const expected = r.value.settings.interactionRateHz * seconds;
      if (r.value.engineStats.opportunities < 0.93 * expected) { console.log(`[${r.value.label}] STARVED (${r.value.engineStats.opportunities} of ${expected} opportunities): dropped, replaying`); again(); return; }
      const stored = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
      stored.push(r.value);
      writeFileSync(OUT, `${JSON.stringify(stored, null, 1)}\n`);
    });
  }
}

await main();
void waitFor;
process.exit(0);
