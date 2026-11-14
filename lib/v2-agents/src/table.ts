/**
 * A table: a whole game in memory, for comparing players rather than rules. It runs the server's economy with the same
 * v2-economy functions as the tick (convex/v2/tick.ts, loop.ts, agents.ts): every tick's act opportunities go to agents
 * drawn by energy, agents and players accrue at their power share up to their capacity, a change commits only on
 * credit, summons pay the full program price from the player's own store at the first-agent share, edits pay the edit
 * price (owner decision 21), and power moves energy with it. A model-backed seat takes a turn every AI_TURN_SECONDS
 * through the affordance directory's assistant tools (the server AI seat's tool names, inputs and result shapes),
 * answered from the table's state. Chat is public; rules stay secret.
 *
 * Differences from the server: one process, no wall clock (world time advances a tick at a time), lines numbered from 0
 * (objectId and number are the index, which is the agent's offer.object), and replaces already pay the edit price.
 *
 * It reports, per seat, points gained (spec §8), the energy its gains cost that another seat then took back, what it
 * spent on acts, summons and edits, messages, proposals and tool calls; per table, deals read from the chat (`deals`).
 */
import { affordanceForTool, assistantTools, type AffordanceContext } from "@workspace/v2-affordances";
import { aiSeatSystemPrompt, commitmentBriefing, commitmentsOf, findDeals, runAssistant, type Budget, type ChatProvider, type RunResult } from "@workspace/v2-ai";
import { hashHex, Qn, rng, ruleLayers, scoreToWire, type ObjectType, type Variant } from "@workspace/v2-core";
import {
  actCredit, affordable, agentIncome, defaultShare, energyCapacity, firstAgentShare, LINES_BEGINNER_ECONOMY, movePower, newAccount,
  opportunities, pickByEnergy, readCharge, roundShare, settle, settleOwn, spend, type Account, type Economy,
} from "@workspace/v2-economy";
import type { Sandbox } from "@workspace/v2-sandbox";
import { runAct, type ActRecord, type Program } from "./act.ts";
import { births } from "./births.ts";
import { check } from "./check.ts";
import { valuer, type HarnessPlayer } from "./harness.ts";
import { EngineHost } from "./host.ts";
import type { Sandboxes } from "./sandboxes.ts";
import { editBits, summonBits } from "./summon.ts";

/** The server's cadences (convex/v2/loop.ts TICK_MS, convex/v2/aiTurn.ts AI_TURN_MS). */
export const TICK_SECONDS = 1.5, AI_TURN_SECONDS = 20;
const MAX_AGENTS = 20;

export type SeatKind = "naive" | "starter" | "model";
export interface TableSeat {
  readonly name: string;
  readonly kind: SeatKind;
  readonly rule: HarnessPlayer["rule"];
  /** The agent the seat summons at the start, at the first-agent share (as practice partners do). */
  readonly program: Program;
}
export interface TableModel {
  /** One provider for every model seat, or one per seat (by name). */
  readonly provider: ChatProvider | ((seat: string) => ChatProvider);
  /** Shared by every model seat at the table (and across tables, if the caller passes the same one). */
  readonly budget: Budget;
  /** Model calls per turn (the server's AI seat: 6). */
  readonly maxSteps?: number;
}
export interface TableInput<S> {
  readonly type: ObjectType<S>;
  readonly variant: Variant;
  readonly seats: readonly TableSeat[];
  /** Lines at the start (the beginner preset: 24). */
  readonly lines: number;
  readonly seed: string;
  /** World seconds (the beginner preset: 300). */
  readonly seconds: number;
  /** Default: the beginner economy (64 power, 30 s to full, 600 ⚡ to start, 25 opportunities a second). */
  readonly economy?: Economy;
  /** Default 0.1, the beginner preset's. */
  readonly birthsPerSecond?: number;
  /** Owner decision 24: no two objects in the same state. A move whose result another object already holds is refused
   *  (the act pays its reads only). */
  readonly unique?: boolean;
  readonly model?: TableModel;
  /** Called after each model turn (for logs). */
  readonly onTurn?: (seat: string, at: number, run: RunResult) => void;
}

export interface SeatReport {
  readonly seat: string;
  readonly kind: SeatKind;
  readonly rule: string;
  readonly start: number;
  readonly end: number;
  readonly gained: number;
  /** Energy the seat's gains cost that another seat's move then took back. */
  readonly reversalEnergy: number;
  /** Energy spent on acts, on summons and on edits. */
  readonly spent: { readonly acts: number; readonly summons: number; readonly edits: number };
  readonly acts: number;
  /** Of the seat's acts in the last 60 world seconds, the share that changed nothing (stalled: no move worth making). */
  readonly lateIdleShare: number;
  /** Moves refused because another object already held the result (input.unique). */
  readonly refused: number;
  readonly messages: number;
  readonly proposals: number;
  readonly summoned: number;
  readonly replaced: number;
  readonly allocations: number;
  readonly toolCalls: number;
  readonly failedToolCalls: number;
  /** The seat's commitments at the end: enacted in its agents' code, still pending, or retracted in chat. */
  readonly commitments: { readonly enacted: number; readonly pending: number; readonly retracted: number };
}
export interface Deal { readonly by: number; readonly with: number; readonly lines: readonly number[]; readonly at: number; readonly kept: boolean; readonly text: string; readonly reply: string }
export interface TableReport {
  readonly seats: readonly SeatReport[];
  readonly chat: readonly { readonly from: string; readonly text: string; readonly at: number }[];
  readonly deals: readonly Deal[];
  readonly usd: number;
  /** Objects on the table at the end (the starting lines plus births). */
  readonly objects: number;
}

/** The tools a table answers: the server tools an AI seat is offered, less the room's admin. */
export const TABLE_TOOLS = [
  "game.get", "game.standings", "rule.explain", "rule.values", "rule.worth", "objects.list", "object.read", "object.score", "moves.list",
  "chat.send", "chat.list", "agents.list", "agent.programs", "agent.check", "agent.summon", "agent.replace", "power.allocate",
] as const;

interface Agent { id: string; seat: number; name: string; share: number; acc: Account; program: Program; programs: Program[]; acts: number }

const OCCUPIED = "another object is already in that state";

export async function runTable<S>(boxes: Sandboxes, input: TableInput<S>): Promise<TableReport> {
  const { type, variant, seats } = input;
  const econ = input.economy ?? LINES_BEGINNER_ECONOMY;
  const P = econ.powerPerSecond, T = econ.fullChargeSeconds, whole = P * T;
  const r = rng("table", input.seed);
  const checks = rng("table-checks", input.seed);   // apart from r, so a model's checks never change what agents are offered
  let lines = births(type, variant, input.seed, input.lines);
  const vals = seats.map(s => valuer(type, variant, s.rule));
  const bitsAll = (s: S) => vals.map(v => v.bits(s));
  const pointsOf = (s: S) => { const n = bitsAll(s); const t = n.reduce((a, b) => a + b, 0); return n.map(x => x * (t - x)); };
  let points = lines.map(pointsOf);
  let startTotals = seats.map((_, i) => points.reduce((t, p) => t + p[i]!, 0));
  const sandboxOf = new Map<string, Sandbox>();
  const sandbox = async (language: Program["language"]) => {
    if (!sandboxOf.has(language)) sandboxOf.set(language, await boxes.get(language));
    return sandboxOf.get(language)!;
  };
  const log: { seq: number; object: number; by: number; agentId: string; before: number[]; after: number[]; record: ActRecord; charge: number; at: number }[] = [];
  const byLine = new Map<number, typeof log>();   // each line's moves, for the history an act sees
  const gains = new Map<number, Map<number, { charge: number; pointsAfter: number }>>();
  const reversal = seats.map(() => 0);
  const chat: { from: string; by: number; text: string; at: number }[] = [];
  const stats = seats.map(() => ({ messages: 0, summoned: 0, replaced: 0, allocations: 0, toolCalls: 0, failedToolCalls: 0, acts: 0, spentActs: 0, spentSummons: 0, spentEdits: 0, lateActs: 0, lateIdle: 0, refused: 0 }));
  const players = seats.map(() => ({ own: newAccount(0, econ.startingEnergy), allocated: 0 }));
  const agents: Agent[] = [];
  let usd = 0, world = 0, actN = 0;

  // ------------------------------------------------------------ the economy (convex/v2/agents.ts, with absolute shares)

  const settledAgent = (a: Agent) => { const inc = agentIncome(P, a.share); return settle(a.acc, Math.max(world, a.acc.settledWorldSeconds), inc, energyCapacity(inc, T)); };
  const settledOwn = (i: number) => settleOwn(players[i]!.own, world, { powerPerSecond: P, allocated: players[i]!.allocated, fullChargeSeconds: T });
  const mine = (i: number) => agents.filter(a => a.seat === i);
  function pay(i: number, price: number, kind: "summons" | "edits") {
    const own = settledOwn(i);
    if (own.balance < price) throw new Error(`That costs ${Math.round(price * 10) / 10} ⚡; you have ${Math.round(own.balance * 10) / 10} in your own store. Move power from your agents to your store first (power.allocate), then pay.`);
    players[i]!.own = spend(own, price);
    stats[i]![kind === "summons" ? "spentSummons" : "spentEdits"] += price;
  }
  function summon(i: number, program: Program, share?: number, name?: string) {
    const p = players[i]!;
    if (mine(i).length >= MAX_AGENTS) throw new Error(`You have ${MAX_AGENTS} agents, the most a player may have.`);
    const price = summonBits(program.language, program.source).energy;
    const s = roundShare(share ?? defaultShare(p.allocated));
    if (s <= 0 || p.allocated + s > 1 + 1e-9) throw new Error(`You have ${roundShare(1 - p.allocated)} of your power left to give.`);
    pay(i, price, "summons");
    const moved = movePower(newAccount(world, 0), p.own, 0, s, 1 - p.allocated, whole);
    const a: Agent = { id: `a${i}-${mine(i).length}`, seat: i, name: name ?? `${seats[i]!.name}'s agent ${mine(i).length + 1}`, share: s, acc: moved.agent, program, programs: [program], acts: 0 };
    agents.push(a);
    p.own = moved.own; p.allocated = roundShare(p.allocated + s); stats[i]!.summoned++;
    return { agentId: a.id, price };
  }
  /** Sets each named agent's share to the fraction of the player's power given; the rest stays with the player. */
  function allocate(i: number, shares: Record<string, number>) {
    const p = players[i]!;
    const named = Object.keys(shares).map(id => { const a = mine(i).find(x => x.id === id); if (!a) throw new Error(`No agent ${id} of yours.`); return a; });
    const to = (a: Agent) => (a.id in shares ? roundShare(shares[a.id]!) : a.share);
    if (named.some(a => !(to(a) > 0))) throw new Error("Every agent you name needs a share of at least 0.001 (stopping one is agent.destroy).");
    const total = roundShare(mine(i).reduce((t, a) => t + to(a), 0));
    if (total > 1 + 1e-9) throw new Error(`Shares add up to ${total.toFixed(2)}; they may add up to at most 1 (your whole power).`);
    const order = named.map(a => ({ a, to: to(a) })).sort((x, y) => (x.to - x.a.share) - (y.to - y.a.share));   // decreases first
    for (const { a, to } of order) {
      if (to === a.share) continue;
      const own = settledOwn(i);
      const moved = movePower(settledAgent(a), own, a.share, to, 1 - p.allocated, whole);
      a.acc = moved.agent; p.own = moved.own; p.allocated = roundShare(p.allocated - a.share + to); a.share = to;
    }
    stats[i]!.allocations++;
  }

  // At the start, each seat summons its program at the first-agent share (as practice partners do).
  for (const [i, s] of seats.entries()) {
    const need = summonBits(s.program.language, s.program.source).energy;
    const share = firstAgentShare({ allocated: 0, powerPerSecond: P, fullChargeSeconds: T, need }) ?? defaultShare(0);
    summon(i, s.program, share, `${s.name}'s agent`);
  }
  for (const st of stats) { st.summoned = 0; st.spentSummons = 0; }   // the opening summon is everyone's; count what seats do after

  // ------------------------------------------------------------ one act (convex/v2/tick.ts)

  async function act(object: number) {
    const balance = new Map(agents.map(a => [a, settledAgent(a).balance]));
    const a = pickByEnergy(agents, x => balance.get(x)!, r);
    if (!a) return;
    const i = a.seat, energy = balance.get(a)!;
    const n = bitsAll(lines[object]!), total = n.reduce((x, y) => x + y, 0);
    const history = (byLine.get(object) ?? []).filter(m => m.by === i || m.before[i] !== m.after[i]).slice(-8)
      .map(m => ({ mine: m.by === i, pointsBefore: m.before[i]!, pointsAfter: m.after[i]! }));
    const { record, state } = await runAct(await sandbox(a.program.language), {
      type, variant, state: lines[object]!, rule: seats[i]!.rule, program: a.program,
      seed: BigInt(`0x${hashHex(`${input.seed}:act:${actN++}`).slice(0, 15)}`), energy, object, liveObjects: lines.length,
      value: { mine: n[i]!, others: total - n[i]!, points: n[i]! * (total - n[i]!) }, history, ...(vals[i]!.values ? { values: vals[i]!.values } : {}),
      others: seats.flatMap((s, j) => (j === i || !vals[j]!.values ? [] : [{ rule: s.rule, values: vals[j]!.values! }])),
      ...(input.unique ? { occupied: (e: string) => lines.some((l, j) => j !== object && type.encode(l) === e) } : {}),
    });
    const capacity = energyCapacity(agentIncome(P, a.share), T);
    const changed = record.outcome === "committed" && record.after !== record.before;
    const taken = changed && input.unique === true && lines.some((l, j) => j !== object && type.encode(l) === type.encode(state));
    if (taken || record.reason === OCCUPIED) stats[i]!.refused++;
    const verdict = !changed ? "other" : taken ? "refused" : affordable(energy, record.charge, actCredit(capacity)) ? "committed" : "unaffordable";
    const charge = verdict === "unaffordable" || verdict === "refused" ? readCharge(record.readBits) : record.charge;
    if (world >= input.seconds - 60) { stats[i]!.lateActs++; if (verdict !== "committed") stats[i]!.lateIdle++; }
    a.acc = { balance: energy - charge, settledWorldSeconds: world };
    a.acts++; stats[i]!.acts++; stats[i]!.spentActs += charge;
    if (verdict !== "committed") return;
    lines = lines.map((l, j) => (j === object ? state : l));
    const before = points[object]!, after = pointsOf(state);
    points[object] = after;
    const entry = { seq: log.length, object, by: i, agentId: a.id, before, after, record, charge, at: world };
    log.push(entry);
    byLine.set(object, [...(byLine.get(object) ?? []).slice(-31), entry]);
    const g = gains.get(object) ?? new Map<number, { charge: number; pointsAfter: number }>();
    gains.set(object, g);
    for (let q = 0; q < seats.length; q++) {
      const x = g.get(q);
      if (q !== i && x && after[q]! < x.pointsAfter) { reversal[q]! += x.charge; g.delete(q); }
    }
    if (after[i]! > before[i]!) g.set(i, { charge, pointsAfter: after[i]! }); else g.delete(i);
  }

  // ------------------------------------------------------------ a model seat's tools, answered from the table

  const memberId = (i: number) => `m${i}`;
  const totalOf = (i: number) => points.reduce((t, p) => t + p[i]!, 0);
  const pageOf = <T>(rows: T[], args: Record<string, unknown>) => {
    const from = Number(args.cursor ?? 0) || 0, limit = Number(args.limit ?? 20) || 20;
    const end = from + limit;
    return { page: rows.slice(from, end), nextCursor: end < rows.length ? String(end) : null };
  };
  const objectArg = (args: Record<string, unknown>) => {
    const j = Number(args.objectId);
    if (!Number.isInteger(j) || j < 0 || j >= lines.length) throw new Error(`No line ${String(args.objectId)}: lines are numbered 0 to ${lines.length - 1}.`);
    return j;
  };
  const agentArg = (i: number, args: Record<string, unknown>) => {
    const a = mine(i).find(x => x.id === args.agentId);
    if (!a) throw new Error(`No agent ${String(args.agentId)} of yours; yours: ${mine(i).map(x => x.id).join(", ")}.`);
    return a;
  };
  const lang = (l: Program["language"]) => (l === "python" ? "python" : "typescript");

  function context(i: number): AffordanceContext {
    return {
      context: "live", principal: { signedIn: true, member: true, seated: true, owner: false, admin: false }, grant: "act",
      room: { players: seats.length, minPlayers: 2 }, game: { phase: "live", energy: settledOwn(i).balance, pauseUsed: true, agents: mine(i).length },
    };
  }

  async function perform(i: number, name: string, raw: Record<string, unknown>): Promise<unknown> {
    const a = affordanceForTool(name);
    if (!a || !(TABLE_TOOLS as readonly string[]).includes(a.id)) throw new Error(`${name} is not available here.`);
    const parsed = a.params.safeParse(raw);   // as the server's runOp: defaults applied, bad arguments refused
    if (!parsed.success) throw new Error(`Invalid arguments for ${name}: ${parsed.error.issues.map(x => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
    const args = parsed.data as Record<string, unknown>;
    const seat = seats[i]!, v = vals[i]!, family = type.families.find(f => f.id === seat.rule.family)!;
    const result = await (async (): Promise<unknown> => {
      switch (a.id) {
        case "game.get": return {
          gameId: "table", phase: "live", worldSeconds: world, endsAt: input.seconds, preset: "table", variant: variant.id,
          roster: seats.map((s, j) => ({ memberId: memberId(j), name: s.name })),
          me: { energy: settledOwn(i).balance, power: P, ready: true, pauseUsed: true },
        };
        case "game.standings": {
          const rows = seats.map((s, j) => ({ memberId: memberId(j), name: s.name, points: totalOf(j), handicap: 0, net: totalOf(j) })).sort((x, y) => y.net - x.net);
          return { rows: rows.map((row, k) => ({ ...row, rank: k + 1 })) };
        }
        case "rule.explain": return {
          family: family.id, params: seat.rule.params, layers: ruleLayers(family, seat.rule.tieBreaker).map(l => l.title),
          card: family.card(seat.rule.params, seat.rule.tieBreaker), depends: [...((family as { depends?: readonly string[] }).depends ?? [])], wonByBid: null,
        };
        case "rule.values": return { points: (v.values?.knots ?? []).map(k => ({ score: k.u, bits: k.bits })) };
        case "rule.worth": {
          const w = v.worth(args.score === null ? null : (args.score as (string | null)[]).map(x => (x === null ? null : Qn.parse(x))));
          return { bits: w.bits, lo: w.lo, hi: Number.isFinite(w.hi) ? w.hi : null };
        }
        case "objects.list": {
          const lastMove = lines.map(() => -1);
          for (const m of log) lastMove[m.object] = m.seq;
          const rows = lines.map((s, j) => ({ objectId: String(j), number: j, bits: v.bits(s), points: points[j]![i]!, recent: lastMove[j]! }));
          const key = args.sort === "rarity" ? "bits" : args.sort === "recent" ? "recent" : "points";
          rows.sort((x, y) => y[key] - x[key]);
          return pageOf(rows.map(({ recent: _r, ...row }) => row), args);
        }
        case "object.read": {
          const j = objectArg(args);
          const host = new EngineHost({ type, variant, state: lines[j]!, rule: seat.rule, energy: 0 });
          const reply = host.handle({ op: "view", rep: String(args.rep ?? type.representations[0]!.id), site: Number(args.site ?? 0) }, { hostCallsLeft: 10 });
          if (!reply.ok) throw new Error(reply.error);
          return reply.result;
        }
        case "object.score": {
          const j = objectArg(args), s = lines[j]!;
          const score = v.scoreOf(s);
          return { score: score === null ? null : scoreToWire(score), number: j, terms: [], bits: v.bits(s), points: points[j]![i]! };
        }
        case "moves.list": {
          const rows = log.filter(m => m.by === i || m.before[i] !== m.after[i]).reverse().map(m => ({
            seq: m.seq, objectId: String(m.object), number: m.object, agentId: m.by === i ? m.agentId : null, mine: m.by === i,
            calls: m.record.calls.map(c => ({ mutator: c.mutator, args: c.args, ...(c.site ? { site: c.site } : {}) })),
            pointsBefore: m.before[i]!, pointsAfter: m.after[i]!, charge: m.by === i ? m.charge : null,
          }));
          return pageOf(rows, args);
        }
        case "chat.send": {
          const text = String(args.text ?? "").trim().slice(0, 500);
          if (!text) throw new Error("A message needs some text.");
          chat.push({ from: seat.name, by: i, text, at: world }); stats[i]!.messages++;
          return { ok: true };
        }
        case "chat.list": return pageOf(chat.slice().reverse().map(m => ({ from: m.from, text: m.text, at: m.at })), args);
        case "agents.list": return {
          agents: mine(i).map(x => ({ agentId: x.id, name: x.name, language: lang(x.program.language), share: x.share, energy: settledAgent(x).balance, acts: x.acts, version: x.programs.length - 1 })),
        };
        case "agent.programs": {
          const x = agentArg(i, args);
          return { versions: x.programs.map((p, k) => ({ version: k, language: lang(p.language), source: p.source, acts: 0 })).reverse() };
        }
        case "agent.check": {
          const program = { language: args.language as Program["language"], source: String(args.source ?? "") };
          const samples = [0, 1, 2, 3].map(() => { const j = checks.below(lines.length); return { objectId: String(j), state: lines[j]! }; });
          const rep = await check(await sandbox(program.language), { type, variant, rule: seat.rule, program, samples, energy: settledOwn(i).balance });
          // With agentId: what agent.replace with this program would cost (only the change, or the whole price in another language).
          const x = args.agentId === undefined ? null : agentArg(i, args);
          const editPrice = x === null ? null : program.language === x.program.language ? editBits(program.language, x.program.source, program.source).energy : rep.price;
          return { verdict: rep.verdict, summary: rep.summary, price: rep.price, editPrice, sample: rep.sample };
        }
        case "agent.summon": {
          const program = { language: args.language as Program["language"], source: String(args.source ?? "") };
          return summon(i, program, args.share as number | undefined, args.name as string | undefined);
        }
        case "agent.replace": {
          const x = agentArg(i, args);
          const program = { language: args.language as Program["language"], source: String(args.source ?? "") };
          const price = program.language === x.program.language ? editBits(program.language, x.program.source, program.source).energy : summonBits(program.language, program.source).energy;
          pay(i, price, "edits");
          x.program = program; x.programs.push(program); stats[i]!.replaced++;
          return { version: x.programs.length - 1, price };
        }
        case "power.allocate": { allocate(i, args.shares as Record<string, number>); return { ok: true }; }
        default: throw new Error(`${name} is not available here.`);
      }
    })();
    return a.result.parse(result);
  }

  /** A seat's commitments now: its deals in chat, checked against its agents' code and the moves (v2-ai commitments). */
  function ledger(i: number) {
    const name = (j: number) => seats[j]!.name;
    const rows = chat.map(m => ({ from: m.from, text: m.text, at: m.at }));
    const moves = log.map(m => ({ by: name(m.by), line: m.object, at: m.at, lowered: seats.map((_, j) => j).filter(j => m.after[j]! < m.before[j]!).map(name) }));
    return commitmentsOf(name(i), rows, moves, mine(i).map(a => a.program.source), 2 * AI_TURN_SECONDS);
  }

  async function modelTurn(i: number, k: number, of: number) {
    const m = input.model!, seat = seats[i]!, family = type.families.find(f => f.id === seat.rule.family)!;
    const tools = assistantTools(context(i)).filter(t => (TABLE_TOOLS as readonly string[]).includes(affordanceForTool(t.name)?.id ?? ""));
    const briefing = `Turn ${k + 1} of ${of}. The game is live at ${Math.round(world)} s. You have ${Math.round(settledOwn(i).balance)} ⚡ in your own store and ${mine(i).length} agent(s). Act, then stop.`
      + `\n\n${commitmentBriefing(ledger(i))}`;
    const run = await runAssistant({
      provider: typeof m.provider === "function" ? m.provider(seat.name) : m.provider, system: aiSeatSystemPrompt({ name: seat.name, rule: family.card(seat.rule.params, seat.rule.tieBreaker), affordances: tools }),
      messages: [{ role: "user", content: briefing }], tools, maxSteps: m.maxSteps ?? 6, budget: m.budget,
      perform: (name, args) => perform(i, name, args),
    });
    usd += run.usd;
    stats[i]!.toolCalls += run.toolCalls.length;
    stats[i]!.failedToolCalls += run.toolCalls.filter(c => !c.ok).length;
    input.onTurn?.(seat.name, world, run);
  }

  // ------------------------------------------------------------ the game

  const turns = Math.ceil(input.seconds / AI_TURN_SECONDS);
  let nextTurn = 0, k = 0;
  while (world < input.seconds - 1e-9) {
    if (input.model && world >= nextTurn) {
      for (const [i, s] of seats.entries()) if (s.kind === "model") await modelTurn(i, k, turns);
      k++; nextTurn += AI_TURN_SECONDS;
    }
    world = Math.min(input.seconds, world + TICK_SECONDS);
    for (let b = opportunities(input.birthsPerSecond ?? 0.1, TICK_SECONDS, r); b > 0; b--) {
      const born = births(type, variant, `${input.seed}:${lines.length + 1}`, 1)[0]!;
      lines = [...lines, born]; points = [...points, pointsOf(born)];
      startTotals = startTotals.map((t, i) => t + points.at(-1)![i]!);   // a newborn line's points are no one's gain
    }
    const offers = opportunities(econ.opportunitiesPerSecond, TICK_SECONDS, r);
    for (let o = 0; o < offers; o++) await act(r.below(lines.length));
  }

  const found = deals(chat, log, 2 * AI_TURN_SECONDS);
  const proposed = found.proposals.map(j => chat[j]!.by);
  return {
    seats: seats.map((s, i) => ({
      seat: s.name, kind: s.kind, rule: `${s.rule.family}/${s.rule.tieBreaker}`,
      start: startTotals[i]!, end: totalOf(i), gained: totalOf(i) - startTotals[i]!,
      lateIdleShare: stats[i]!.lateActs ? stats[i]!.lateIdle / stats[i]!.lateActs : 0,
      refused: stats[i]!.refused,
      reversalEnergy: reversal[i]!, spent: { acts: stats[i]!.spentActs, summons: stats[i]!.spentSummons, edits: stats[i]!.spentEdits },
      acts: stats[i]!.acts, messages: stats[i]!.messages, proposals: proposed.filter(by => by === i).length,
      summoned: stats[i]!.summoned, replaced: stats[i]!.replaced, allocations: stats[i]!.allocations,
      toolCalls: stats[i]!.toolCalls, failedToolCalls: stats[i]!.failedToolCalls,
      commitments: (l => ({ enacted: l.filter(c => c.status === "enacted").length, pending: l.filter(c => c.status === "pending").length, retracted: l.filter(c => c.status === "retracted").length }))(ledger(i)),
    })),
    chat: chat.map(({ from, text, at }) => ({ from, text, at })),
    deals: found.deals, usd, objects: lines.length,
  };
}

/**
 * Proposals and deals read from the chat by v2-ai's `findDeals` (the heuristic the seats' commitments use), with seats
 * as indexes. A deal is kept when, from its acceptance to the end, neither side made a move on a named line (any line, for
 * a deal over every line) that lowered the other's points there.
 */
export function deals(
  chat: readonly { by: number; text: string; at: number }[],
  log: readonly { object: number; by: number; before: readonly number[]; after: readonly number[]; at: number }[],
  window = 2 * AI_TURN_SECONDS,
): { deals: Deal[]; proposals: number[] } {
  const found = findDeals(chat.map(m => ({ from: String(m.by), text: m.text, at: m.at })), window);
  return {
    proposals: found.proposals,
    deals: found.deals.map(d => {
      const by = Number(d.proposer), w = Number(d.accepter);
      const broken = log.some(e => e.at >= d.at && (d.every || d.lines.includes(e.object))
        && ((e.by === by && e.after[w]! < e.before[w]!) || (e.by === w && e.after[by]! < e.before[by]!)));
      return { by, with: w, lines: d.lines, at: d.at, kept: !broken, text: d.proposal, reply: d.reply };
    }),
  };
}
