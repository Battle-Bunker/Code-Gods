"use node";
/**
 * One tick of a live v2 game (spec §6.1): advance world time by the wall time that passed (at most MAX_DT), draw the
 * window's births and opportunities from the game's seed, give each opportunity to an agent with probability
 * proportional to its settled energy and an object uniformly, run the act in the sandbox (`runAct`, lib/v2-agents),
 * and send everything to `loop:commit`, which owns every write. Deterministic given the seed and the tick's inputs.
 */
import { predicateBits, predicateRunner, runAct } from "@workspace/v2-agents";
import { commitLocks, hash64, isInvalid, rng, type ActLock, type LockRates } from "@workspace/v2-core";
import { actCredit, affordable, agentIncome, energyCapacity, opportunities, pickByEnergy, readCharge, settle } from "@workspace/v2-economy";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { MAX_DT } from "./loop";
import { regularBirths, timeScaleOf } from "./duration";
import { predicateBoxesFor, sandboxFor } from "./runtime";
import { birthDraws, decode, penaltyWeightOf, scopeOf, typeOf, variantOf } from "./world";
import { capOf, liveLines, offerable, pickLine, retiringCount } from "./turnover";
import type { Turnover } from "./presets";
import { actReadings } from "./disclose";
import { penaltyMean, valueFnIn, valueRecord } from "./values";
import { knownFamily } from "./deal";
import { actLock, defaultLockRates, lockSeen, type LockWire } from "./lockWire";

type Snapshot = {
  phase: string; seed: string; variant: string; leaseId: string; tick: number; acts: number; objects: number; endsAt: number | null;
  worldSeconds: number; lastTickAt: number;
  /** Line turnover: the live lines, oldest first (absent: every number up to `objects`). */
  live?: number[];
  /** Turnover with released states: each live line's object, oldest first. */
  liveObjectIds?: string[];
  /** The world second the game ends at (private in halfLife mode; the tick only follows it). */
  endWorld: number;
  held: { objectId: string; state: string }[]; noiseKey: string | null;
  settings: { worldSeconds: number; startingObjects: number; peerNoiseVariance?: number; timeScale?: number; regularBirths?: boolean; commitClause?: boolean; locks?: boolean; lockRates?: LockRates; penaltyWeight?: number; turnover?: Turnover; stepBudget?: number; interactionComputeMs?: number; economy: { powerPerSecond: number; fullChargeSeconds: number; opportunitiesPerSecond: number; birthsPerSecond: number } };
  seats: { memberId: string; rule: { family: string; params: unknown; tieBreaker: string | null; ruleKey: string }; defence?: { family: string; params: unknown; ruleKey: string } }[];
  ready: ("typescript" | "python")[];
  agents: TickAgent[];
  /** Where the next page of live agents starts (`tickAgents`); null when the snapshot holds them all. */
  agentsCursor: string | null;
};
type TickAgent = { agentId: string; memberId: string; language: "typescript" | "python"; source: string; version: number; share: number; energy: number; settledAt: number };
const SNAPSHOT = makeFunctionReference<"query", { gameId: Id<"v2Games"> }, Snapshot | null>("v2/loop:snapshot");
const TICK_AGENTS = makeFunctionReference<"query", { gameId: Id<"v2Games">; cursor: string | null }, { agents: TickAgent[]; cursor: string | null }>("v2/loop:tickAgents");
const STATES = makeFunctionReference<"query", { gameId: Id<"v2Games">; numbers: number[]; locks?: boolean }, { number: number; objectId: string; state: string; version: number; locks?: LockWire[]; nextLock?: number }[]>("v2/loop:statesOf");
const COMMIT = makeFunctionReference<"mutation">("v2/loop:commit");
type ActInput = { value?: { mine: number; others: number; points: number }; history: { mine: boolean; pointsBefore: number; pointsAfter: number }[] };
const ACT_INPUTS = makeFunctionReference<"query", { gameId: Id<"v2Games">; memberIds: Id<"v2Members">[]; objectIds: Id<"v2Objects">[] }, (ActInput & { memberId: string; objectId: string })[]>("v2/loop:actInputs");
/** Players × lines per actInputs batch (each pair reads one document). */
const PAIRS_PER_BATCH = 600;
const FAILED = makeFunctionReference<"mutation">("v2/loop:tickFailed");

export const tick = internalAction({
  args: { gameId: v.id("v2Games"), leaseId: v.string() },
  handler: async (ctx, { gameId, leaseId }) => {
    try {
      const snap = await ctx.runQuery(SNAPSHOT, { gameId });
      if (!snap || snap.phase !== "live" || snap.leaseId !== leaseId) return;
      // Up to 200 agents a player (call 35): the rest of the live agents, a page at a time (loop.ts TICK_AGENT_PAGE).
      // Each page is its own read; the commit re-checks every act's agent (destroyed since: skipped; energy re-settled).
      const seen = new Set(snap.agents.map(a => a.agentId));
      for (let cursor = snap.agentsCursor; cursor !== null;) {
        const next = await ctx.runQuery(TICK_AGENTS, { gameId, cursor });
        for (const a of next.agents) if (!seen.has(a.agentId)) { seen.add(a.agentId); snap.agents.push(a); }
        cursor = next.cursor;
      }
      const now = Date.now();
      // World time follows the wall clock to the announced end (endsAt), so a game ends when its clock says 0:00
      // however slow the ticks run; one tick does at most MAX_DT seconds of births and opportunities. A dilated game
      // (decision 37) runs its world `timeScale` times faster than the wall: the same game in less wall time.
      const f = timeScaleOf(snap.settings);
      const wall = snap.endsAt !== null ? snap.endWorld - (snap.endsAt - now) * f / 1000 : snap.worldSeconds + (now - snap.lastTickAt) * f / 1000;
      const world = Math.max(snap.worldSeconds, Math.min(snap.endWorld, wall));
      const dt = Math.min(MAX_DT * f, world - snap.worldSeconds);
      const variant = variantOf(snap.variant), econ = snap.settings.economy;
      const r = rng(snap.seed, "tick", snap.tick);

      // Births: on the preset's regular schedule (decision 31: the beginner games), else v1's stochastic rate.
      const nBorn = snap.settings.regularBirths ? regularBirths(econ.birthsPerSecond, snap.worldSeconds, world) : opportunities(econ.birthsPerSecond, dt, r);
      // Each birth's first draws: the commit places the first that no object holds (decision 24).
      const born = Array.from({ length: nBorn }, (_, i) => birthDraws(snap.variant, `${snap.seed}:${snap.objects + i + 1}`));
      // Decision 24: who holds each state as this tick sees it, for the agents' `occupied`: the objects, this tick's
      // births (the commit places the same draw: the first no object holds), then each act that commits here.
      const holder = new Map(snap.held.map(h => [h.state, h.objectId]));
      born.forEach((draws, i) => { const w = draws.find(d => !holder.has(d)); if (w !== undefined) holder.set(w, `born:${i}`); });
      // Turnover: the lines these births retire (the oldest live ones) release their states when the settings say so.
      const cap = capOf(snap.settings), retiring = retiringCount(snap.live?.length ?? snap.objects, nBorn, cap);
      if (snap.liveObjectIds && retiring > 0) {
        const gone = new Set(snap.liveObjectIds.slice(0, retiring));
        for (const [state, id] of holder) if (gone.has(id)) holder.delete(state);
      }
      // Disclosure noise on the others' sums (owner decision 32, disclose.ts actReadings): every read an agent makes is
      // an independent measurement, never shared, deterministic given the act's seed.
      const noise = { noiseKey: snap.noiseKey ?? undefined, settings: snap.settings };
      // Offers among the live lines this tick's births will not retire (turnover, retirement-design.md); with no
      // turnover every line is live and the draws are the ones before turnover existed.
      const offered = cap === null ? null : offerable(liveLines(snap), nBorn, cap);
      const liveObjects = offered?.length ?? snap.objects;
      const nOffers = liveObjects > 0 ? opportunities(econ.opportunitiesPerSecond, dt, r) : 0;
      const picks = Array.from({ length: nOffers }, () => offered ? pickLine(offered, r) : 1 + r.below(snap.objects));
      const locking = snap.settings.locks === true;
      const states = new Map((await ctx.runQuery(STATES, { gameId, numbers: picks, ...(locking ? { locks: true } : {}) })).map(s => [s.number, s]));
      // Locks (docs/engine-v2/locks.md): each offered object's live locks as this tick sees them, updated act by act
      // (the commit re-checks every act against the locks then).
      const type = typeOf(snap.variant);
      const lockView = new Map<number, { live: ActLock[]; next: number }>();
      // Predicates run in their own sandboxes, one per language an agent or a live lock is written in (§2).
      // Only when something is offered: the live locks' languages, and the acting agents' own (an agent writes a new lock in it).
      const lockLanguages = locking && picks.length ? [...new Set([...snap.ready, ...[...states.values()].flatMap(s => (s.locks ?? []).map(l => l.language))])] : [];
      const lockRun = locking ? predicateRunner(type, variant, await predicateBoxesFor(ctx, lockLanguages)) : null;
      const rates: LockRates = snap.settings.lockRates ?? defaultLockRates(econ);
      if (locking) for (const s of states.values()) lockView.set(s.number, { live: (s.locks ?? []).map(actLock), next: s.nextLock ?? 1 });

      // Energy settled to this tick's world time, then spent act by act (the commit settles again, authoritatively).
      const acting = snap.agents.filter(a => snap.ready.includes(a.language));
      const balance = new Map(snap.agents.map(a => {
        const income = agentIncome(econ.powerPerSecond, a.share);
        return [a.agentId, settle({ balance: a.energy, settledWorldSeconds: a.settledAt }, world, income, energyCapacity(income, econ.fullChargeSeconds)).balance];
      }));
      const local = new Map<number, string>();   // states changed earlier in this tick
      // Every offered line, for every player with an agent: fetched up front in parallel batches (the act loop is serial).
      const memberIds = [...new Set(snap.agents.map(a => a.memberId))] as Id<"v2Members">[];
      const objectIds = [...new Set([...states.values()].map(s => s.objectId))] as Id<"v2Objects">[];
      const per = Math.max(1, Math.floor(PAIRS_PER_BATCH / Math.max(1, memberIds.length)));
      const batches = [];
      for (let i = 0; i < objectIds.length; i += per) batches.push(ctx.runQuery(ACT_INPUTS, { gameId, memberIds, objectIds: objectIds.slice(i, i + per) }));
      // Each seat's view of the others (W2 #517): their rules and value functions, for the host's othersAfter.
      // Values in this game (decision 24): the uniqueness correction at the game's object count, as the commit values.
      const scope = scopeOf(snap);
      const ruleOf = (r: Snapshot["seats"][number]["rule"]) => ({ family: r.family, params: r.params as Record<string, unknown>, tieBreaker: r.tieBreaker });
      // A seat's defence goal (v1, restored; call 1), as the host values it beside the rule: the commit's signed bits.
      // One per seat a tick, shared by every host that values that seat.
      const weight = penaltyWeightOf(snap);
      const defences = new Map(snap.seats.map(seat => {
        const d = seat.defence, r = d ? valueRecord(d.ruleKey) : null;
        return [seat.memberId, d && r ? { defence: { family: d.family, params: d.params, values: { knots: r.knots, tail: r.tail }, mean: penaltyMean(d.ruleKey), weight } } : {}] as const;
      }));
      const defenceOf = (memberId: string) => defences.get(memberId)!;
      const othersOf = new Map(snap.seats.map(seat => [seat.memberId, snap.seats.flatMap(o => {
        if (o.memberId === seat.memberId) return [];
        const vf = valueFnIn(o.rule.ruleKey, scope);
        if (vf) return [{ rule: ruleOf(o.rule), values: vf, ...defenceOf(o.memberId) }];
        // A rule scored by the dynamic measure has no table: the host values it by its energy (energy.md).
        return knownFamily(o.rule.family)?.dynamic ? [{ rule: ruleOf(o.rule) }] : [];
      })]));
      const told = new Map<string, ActInput>();
      for (const rows of await Promise.all(batches)) for (const { memberId, objectId, ...input } of rows) told.set(`${memberId}:${objectId}`, input);
      const acts = [];
      for (const [i, number] of picks.entries()) {
        // Only agents whose language's sandbox has booted act (readiness.ts): nobody waits for a boot.
        const agent = pickByEnergy(acting, a => balance.get(a.agentId)!, r);
        if (!agent) break;
        const s = states.get(number);
        if (!s) continue;
        const seat = snap.seats.find(x => x.memberId === agent.memberId);
        if (!seat) continue;
        // The act's seed (spec §9.3: `act:<n>` from the game seed), as the 64-bit integer the sandbox takes.
        const seed = hash64(`${snap.seed}:act:${snap.acts + i}`).toString(), energy = balance.get(agent.agentId)!;
        const sandbox = await sandboxFor(ctx, agent.language);
        // `offer.object` is the line's number, the one every read and the app show ("leave line 4 alone").
        // What the agent may know of its owner's stake in the line (W2's worth/recent/contested), as of the last commit.
        // Its own value now is measured afresh for this act (actInputs sends it exact; recorded as the agent read it).
        const reads = actReadings(noise, agent.memberId, seed);
        const exact = told.get(`${agent.memberId}:${s.objectId}`) ?? { history: [] };
        // Its income (W2: a starter climbs within what it earns), recorded with the act so a replay budgets alike.
        const income = agentIncome(econ.powerPerSecond, agent.share);
        const input = { ...(exact.value ? { ...exact, value: reads.value(exact.value) } : exact), income };
        // The seat's value function (decision 23), as the deal recorded it by ruleKey: replay re-derives it from the bundle.
        const vf = valueFnIn(seat.rule.ruleKey, scope);
        const lv = locking ? lockView.get(number)! : null;
        const seenLocks = lv ? { world, nextLock: lv.next, live: lv.live.map(lockSeen) } : null;
        const { record } = await runAct(sandbox, {
          type: typeOf(snap.variant), variant, state: decode(local.get(number) ?? s.state, snap.variant),
          rule: ruleOf(seat.rule),
          program: { language: agent.language, source: agent.source }, seed, energy, object: number, liveObjects,
          ...input, ...(vf ? { values: vf, ...defenceOf(seat.memberId) } : {}), others: othersOf.get(seat.memberId)!,
          // Any held state, the object's own included: v1's uniqueness, "a transformation onto any existing value
          // (including the object's own) fails entirely".
          occupied: e => holder.has(e), disclosed: reads.disclosed,
          // The commit clause (v1's option, off by default; call 34): an onlyIfBetter plan commits only if it raises the
          // owner's points as othersAfter discloses them (runAct decides it).
          ...(snap.settings.commitClause ? { commitClause: true } : {}),
          ...(lv ? { locks: { world, live: lv.live, nextLock: lv.next, rates, run: lockRun!, programBits: predicateBits } } : {}),
          // The room's per-act compute limits (v1's stepBudget and interactionComputeMs); else the sandbox's defaults.
          ...(snap.settings.stepBudget !== undefined || snap.settings.interactionComputeMs !== undefined ? { limits: {
            ...(snap.settings.stepBudget !== undefined ? { stepBudget: snap.settings.stepBudget } : {}),
            ...(snap.settings.interactionComputeMs !== undefined ? { wallMs: snap.settings.interactionComputeMs } : {}),
          } } : {}),
        });
        // The credit rule (docs/energy-model.md §7.2): a change that would leave the agent owing more than its capacity
        // does not commit and pays only its reads; a change that does not change the state is not a change.
        const capacity = energyCapacity(agentIncome(econ.powerPerSecond, agent.share), econ.fullChargeSeconds);
        const changed = record.outcome === "committed" && record.after !== record.before;
        const verdict = !changed ? (record.outcome === "committed" ? "skipped" : record.outcome)
          : affordable(energy, record.charge, actCredit(capacity)) ? "committed" : "unaffordable";
        balance.set(agent.agentId, energy - (verdict === "unaffordable" ? readCharge(record.readBits) : record.charge + (record.lockSpend ?? 0)));
        if (locking && record.locks?.length && verdict !== "unaffordable") {
          const lv = lockView.get(number)!;
          // As the commit will apply them (no program runs; a skip's changes need no check).
          const c = commitLocks({ locks: lv.live, done: record.locks, checked: null, world, nextLock: lv.next });
          if (!isInvalid(c)) lockView.set(number, { live: c.locks, next: lv.next + record.locks.filter(d => d.op === "create").length });
        }
        if (verdict === "committed") {
          const was = local.get(number) ?? s.state;
          if (holder.get(was) === s.objectId) holder.delete(was);
          holder.set(record.after, s.objectId);
          local.set(number, record.after);
        }
        // The locks the act saw, recorded with its inputs so a replay re-executes it exactly.
        const seenInput = seenLocks ? { lockSeen: seenLocks } : {};
        acts.push({
          n: snap.acts + i, verdict, agentId: agent.agentId, memberId: agent.memberId, objectId: s.objectId, number, version: s.version,
          seed, energy, liveObjects, programVersion: agent.version, record, input: { ...input, ...seenInput },
        });
      }
      await ctx.runMutation(COMMIT, { gameId, leaseId, world, now, born, acts: chainVersions(acts), picks: picks.length });
    } catch (e) {
      await ctx.runMutation(FAILED, { gameId, leaseId, error: String((e as Error)?.stack ?? e).slice(0, 2000) });
    }
  },
});

/** Acts on the same object within one tick chain: each later act saw the earlier one's result (version + 1). */
function chainVersions<T extends { objectId: string; version: number; verdict: string }>(acts: T[]): T[] {
  const bumped = new Map<string, number>();
  return acts.map(a => {
    const version = a.version + (bumped.get(a.objectId) ?? 0);
    if (a.verdict === "committed") bumped.set(a.objectId, (bumped.get(a.objectId) ?? 0) + 1);
    return { ...a, version };
  });
}
