/**
 * A table: a whole game in memory, for comparing players rather than rules. Every seat has one agent acting on shared
 * lines with a store that refills each round; a model-backed seat also takes a turn every few rounds, through the
 * affordance directory's assistant tools (the same tool names, inputs and result shapes as the server's AI seat), here
 * answered from the table's own state. Chat is public; rules stay secret, as in a real game.
 *
 * It reports, per seat, points gained (spec §8: π_i = n_i · Σ_{j≠i} n_j per line, from the committed artefacts), the
 * energy its gains cost that another seat then took back, messages, proposals and replaced programs; per table, deals
 * proposed, accepted and kept (a heuristic read of the chat, see `deals`).
 */
import { affordanceForTool, assistantTools, type AffordanceContext } from "@workspace/v2-affordances";
import { aiSeatSystemPrompt, runAssistant, type Budget, type ChatProvider, type RunResult } from "@workspace/v2-ai";
import { hashHex, rng, ruleLayers, scoreToWire, type ObjectType, type Variant } from "@workspace/v2-core";
import type { Sandbox } from "@workspace/v2-sandbox";
import { runAct, type ActRecord, type Program } from "./act.ts";
import { births } from "./births.ts";
import { check } from "./check.ts";
import { valuer, type HarnessPlayer } from "./harness.ts";
import { EngineHost } from "./host.ts";
import type { Sandboxes } from "./sandboxes.ts";
import { summonBits } from "./summon.ts";

export type SeatKind = "naive" | "starter" | "model";
export interface TableSeat {
  readonly name: string;
  readonly kind: SeatKind;
  readonly rule: HarnessPlayer["rule"];
  /** The agent the seat starts with (a model seat may replace it). */
  readonly program: Program;
}
export interface TableModel {
  /** One provider for every model seat, or one per seat (by name). */
  readonly provider: ChatProvider | ((seat: string) => ChatProvider);
  /** Shared by every model seat at the table (and across tables, if the caller passes the same one). */
  readonly budget: Budget;
  /** Model calls per turn (the server's AI seat: 6). */
  readonly maxSteps?: number;
  /** A model turn every this many rounds (default 2). */
  readonly every?: number;
}
export interface TableInput<S> {
  readonly type: ObjectType<S>;
  readonly variant: Variant;
  readonly seats: readonly TableSeat[];
  readonly lines: number;
  readonly seed: string;
  readonly rounds: number;
  /** Acts per seat per round. */
  readonly acts: number;
  /** Each seat's starting store, and what it gains each round. */
  readonly energy: number;
  readonly income: number;
  readonly model?: TableModel;
  /** Called after each model turn (for logs). */
  readonly onTurn?: (seat: string, round: number, run: RunResult) => void;
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
  readonly spent: number;
  readonly messages: number;
  readonly proposals: number;
  readonly replaced: number;
  readonly toolCalls: number;
  readonly failedToolCalls: number;
}
export interface Deal { readonly by: number; readonly with: number; readonly lines: readonly number[]; readonly round: number; readonly kept: boolean; readonly text: string; readonly reply: string }
export interface TableReport {
  readonly seats: readonly SeatReport[];
  readonly chat: readonly { readonly from: string; readonly text: string; readonly round: number }[];
  readonly deals: readonly Deal[];
  readonly usd: number;
}

/** The tools a table answers (server tools an AI seat is offered, less summoning more agents and the room's admin). */
export const TABLE_TOOLS = [
  "game.get", "game.standings", "rule.explain", "rule.ladder", "objects.list", "object.read", "object.score", "moves.list",
  "chat.send", "chat.list", "agents.list", "agent.programs", "agent.check", "agent.replace",
] as const;

const PROPOSAL = /\b(deal|if you|i'?ll|i will|let'?s|agree|leave|keep|won'?t|in return|swap|trade)\b/i;
const ACCEPT = /\b(deal|yes|agreed?|ok(ay)?|sure|sounds good|accept(ed)?|happy to|works for me)\b/i;
const REFUSE = /\b(no deal|not a deal|can'?t agree|won'?t agree|decline|no thanks)\b/i;
/** The line numbers a message names: "line 4", "lines 2, 7 and 9". */
const linesIn = (text: string) => [...text.matchAll(/\blines?\s*#?\s*(\d+(?:\s*(?:,|and|&|or)\s*#?\s*\d+)*)/gi)].flatMap(m => m[1]!.match(/\d+/g)!.map(Number));
/** A reply that only asks back ("…instead. Deal?") is a counter-offer, not an acceptance. */
const accepts = (text: string) => ACCEPT.test(text.replace(/\bdeal\s*\?/gi, "")) && !REFUSE.test(text);

export async function runTable<S>(boxes: Sandboxes, input: TableInput<S>): Promise<TableReport> {
  const { type, variant, seats } = input;
  const r = rng("table", input.seed);
  const checks = rng("table-checks", input.seed);   // apart from r, so a model's checks never change what agents are offered
  let lines = births(type, variant, input.seed, input.lines);
  const vals = seats.map(s => valuer(type, variant, s.rule));
  const bitsAll = (s: S) => vals.map(v => v.bits(s));
  const pointsOf = (s: S) => { const n = bitsAll(s); const t = n.reduce((a, b) => a + b, 0); return n.map(x => x * (t - x)); };
  let points = lines.map(pointsOf);
  const startPoints = points.map(p => p.slice());
  const energy = seats.map(() => input.energy);
  const programs = seats.map(s => s.program);
  const programsOf = seats.map(s => [s.program]);
  const versions = seats.map(() => 0), acts = seats.map(() => 0), spent = seats.map(() => 0);
  const sandboxOf = new Map<string, Sandbox>();
  const sandbox = async (language: Program["language"]) => {
    if (!sandboxOf.has(language)) sandboxOf.set(language, await boxes.get(language));
    return sandboxOf.get(language)!;
  };
  const log: { seq: number; object: number; by: number; before: number[]; after: number[]; record: ActRecord; round: number }[] = [];
  const gains = lines.map(() => new Map<number, { charge: number; pointsAfter: number }>());
  const reversal = seats.map(() => 0);
  const chat: { from: string; by: number; text: string; round: number }[] = [];
  const stats = seats.map(() => ({ messages: 0, replaced: 0, toolCalls: 0, failedToolCalls: 0 }));
  let usd = 0;

  async function act(i: number, round: number) {
    const object = r.below(lines.length);
    const n = bitsAll(lines[object]!), total = n.reduce((a, b) => a + b, 0);
    const history = log.filter(m => m.object === object && (m.by === i || m.before[i] !== m.after[i])).slice(-8)
      .map(m => ({ mine: m.by === i, pointsBefore: m.before[i]!, pointsAfter: m.after[i]! }));
    const { record, state } = await runAct(await sandbox(programs[i]!.language), {
      type, variant, state: lines[object]!, rule: seats[i]!.rule, program: programs[i]!,
      seed: BigInt(`0x${hashHex(`${input.seed}:${round}:${i}:${acts[i]}`).slice(0, 15)}`),
      energy: energy[i]!, object, liveObjects: lines.length,
      value: { mine: n[i]!, others: total - n[i]!, points: n[i]! * (total - n[i]!) }, history, rungs: vals[i]!.rungs,
    });
    acts[i]!++;
    energy[i]! -= record.charge; spent[i]! += record.charge;
    if (record.outcome !== "committed") return;
    lines = lines.map((l, j) => (j === object ? state : l));
    const before = points[object]!, after = pointsOf(state);
    points[object] = after;
    log.push({ seq: log.length, object, by: i, before, after, record, round });
    for (let q = 0; q < seats.length; q++) {
      const g = gains[object]!.get(q);
      if (q !== i && g && after[q]! < g.pointsAfter) { reversal[q]! += g.charge; gains[object]!.delete(q); }
    }
    if (after[i]! > before[i]!) gains[object]!.set(i, { charge: record.charge, pointsAfter: after[i]! }); else gains[object]!.delete(i);
  }

  // ------------------------------------------------------------ a model seat's tools, answered from the table

  const memberId = (i: number) => `m${i}`, agentId = (i: number) => `a${i}`;
  const total = (i: number) => points.reduce((t, p) => t + p[i]!, 0);
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

  function context(i: number): AffordanceContext {
    return {
      context: "live", principal: { signedIn: true, member: true, seated: true, owner: false, admin: false }, grant: "act",
      room: { players: seats.length, minPlayers: 2 }, game: { phase: "live", energy: energy[i]!, pauseUsed: true, agents: 1 },
    };
  }

  async function perform(i: number, round: number, name: string, raw: Record<string, unknown>): Promise<unknown> {
    const a = affordanceForTool(name);
    if (!a || !(TABLE_TOOLS as readonly string[]).includes(a.id)) throw new Error(`${name} is not available here.`);
    const parsed = a.params.safeParse(raw);   // as the server's runOp: defaults applied, bad arguments refused
    if (!parsed.success) throw new Error(`Invalid arguments for ${name}: ${parsed.error.issues.map(x => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
    const args = parsed.data as Record<string, unknown>;
    const seat = seats[i]!, v = vals[i]!, family = type.families.find(f => f.id === seat.rule.family)!;
    const result = await (async (): Promise<unknown> => {
      switch (a.id) {
        case "game.get": return {
          gameId: "table", phase: "live", worldSeconds: round * 20, endsAt: input.rounds * 20, preset: "table", variant: variant.id,
          roster: seats.map((s, j) => ({ memberId: memberId(j), name: s.name })),
          me: { energy: energy[i]!, power: input.income, ready: true, pauseUsed: true },
        };
        case "game.standings": {
          const rows = seats.map((s, j) => ({ memberId: memberId(j), name: s.name, points: total(j), handicap: 0, net: total(j) })).sort((x, y) => y.net - x.net);
          return { rows: rows.map((row, k) => ({ ...row, rank: k + 1 })) };
        }
        case "rule.explain": return {
          family: family.id, params: seat.rule.params, layers: ruleLayers(family, seat.rule.tieBreaker).map(l => l.title),
          card: family.card(seat.rule.params, seat.rule.tieBreaker), depends: [...((family as { depends?: readonly string[] }).depends ?? [])],
          ladder: v.rungs.map((g, k) => ({ level: k, label: v.labels[k] ?? String(k), rarityBits: g.bits })), wonByBid: null,
        };
        case "rule.ladder": return { rungs: v.rungs.map((g, k) => ({ level: k, label: v.labels[k] ?? String(k), rarityBits: g.bits })) };
        case "objects.list": {
          const lastMove = lines.map(() => -1);
          for (const m of log) lastMove[m.object] = m.seq;
          const rows = lines.map((s, j) => ({ objectId: String(j), level: v.level(s), points: points[j]![i]!, recent: lastMove[j]! }));
          const key = args.sort === "level" ? "level" : args.sort === "recent" ? "recent" : "points";
          rows.sort((x, y) => y[key] - x[key]);
          return pageOf(rows.map(({ recent: _r, ...row }) => row), args);
        }
        case "object.read": {
          const j = objectArg(args);
          const host = new EngineHost({ type, variant, state: lines[j]!, rule: seat.rule, energy: 0 });
          const reply = host.handle({ op: "view", rep: String(args.rep ?? "si"), site: Number(args.site ?? 0) }, { hostCallsLeft: 10 });
          if (!reply.ok) throw new Error(reply.error);
          return reply.result;
        }
        case "object.score": {
          const j = objectArg(args), s = lines[j]!;
          const score = v.scoreOf(s);
          return { score: score === null ? null : scoreToWire(score), level: v.level(s), top: Math.max(0, v.rungs.length - 1), terms: [], rarityBits: v.bits(s), points: points[j]![i]! };
        }
        case "moves.list": {
          const rows = log.filter(m => m.by === i || m.before[i] !== m.after[i]).reverse().map(m => ({
            seq: m.seq, objectId: String(m.object), agentId: m.by === i ? agentId(i) : null, mine: m.by === i,
            calls: m.record.calls.map(c => ({ mutator: c.mutator, args: c.args, ...(c.site ? { site: c.site } : {}) })),
            pointsBefore: m.before[i]!, pointsAfter: m.after[i]!, charge: m.by === i ? m.record.charge : null,
          }));
          return pageOf(rows, args);
        }
        case "chat.send": {
          const text = String(args.text ?? "").trim().slice(0, 500);
          if (!text) throw new Error("A message needs some text.");
          chat.push({ from: seat.name, by: i, text, round }); stats[i]!.messages++;
          return { ok: true };
        }
        case "chat.list": return pageOf(chat.slice().reverse().map(m => ({ from: m.from, text: m.text, at: m.round * 20 })), args);
        case "agents.list": return { agents: [{ agentId: agentId(i), name: `${seat.name}'s agent`, language: programs[i]!.language === "python" ? "python" : "typescript", share: 1, energy: energy[i]!, acts: acts[i]!, version: versions[i]! }] };
        case "agent.programs": {
          if (args.agentId !== agentId(i)) throw new Error(`You have one agent, ${agentId(i)}.`);
          return { versions: programsOf[i]!.map((p, k) => ({ version: k, language: p.language === "python" ? "python" : "typescript", source: p.source, acts: 0 })).reverse() };
        }
        case "agent.check": {
          const program = { language: args.language as Program["language"], source: String(args.source ?? "") };
          const samples = [0, 1, 2, 3].map(() => { const j = checks.below(lines.length); return { objectId: String(j), state: lines[j]! }; });
          const rep = await check(await sandbox(program.language), { type, variant, rule: seat.rule, program, samples, energy: energy[i]! });
          return { verdict: rep.verdict, summary: rep.summary, price: rep.price, sample: rep.sample };
        }
        case "agent.replace": {
          if (args.agentId !== agentId(i)) throw new Error(`You have one agent, ${agentId(i)}.`);
          const program = { language: args.language as Program["language"], source: String(args.source ?? "") };
          const price = summonBits(program.language, program.source).energy;
          if (price > energy[i]!) throw new Error(`Replacing costs ${price.toFixed(1)} ⚡ and you have ${energy[i]!.toFixed(1)} ⚡.`);
          energy[i]! -= price; spent[i]! += price; programs[i] = program; programsOf[i]!.push(program); versions[i]!++; stats[i]!.replaced++;
          return { version: versions[i]!, price };
        }
        default: throw new Error(`${name} is not available here.`);
      }
    })();
    return a.result.parse(result);
  }

  async function modelTurn(i: number, round: number, k: number, of: number) {
    const m = input.model!, seat = seats[i]!, family = type.families.find(f => f.id === seat.rule.family)!;
    const tools = assistantTools(context(i)).filter(t => (TABLE_TOOLS as readonly string[]).includes(affordanceForTool(t.name)?.id ?? ""));
    const briefing = `Turn ${k + 1} of ${of}. The game is live at ${round * 20} s. You have ${Math.round(energy[i]!)} ⚡ in your own store and 1 agent(s). Act, then stop.`;
    const run = await runAssistant({
      provider: typeof m.provider === "function" ? m.provider(seat.name) : m.provider, system: aiSeatSystemPrompt({ name: seat.name, rule: family.card(seat.rule.params, seat.rule.tieBreaker), affordances: tools }),
      messages: [{ role: "user", content: briefing }], tools, maxSteps: m.maxSteps ?? 6, budget: m.budget,
      perform: (name, args) => perform(i, round, name, args),
    });
    usd += run.usd;
    stats[i]!.toolCalls += run.toolCalls.length;
    stats[i]!.failedToolCalls += run.toolCalls.filter(c => !c.ok).length;
    input.onTurn?.(seat.name, round, run);
  }

  // ------------------------------------------------------------ the game

  const every = input.model?.every ?? 2, turns = Math.ceil(input.rounds / every);
  for (let round = 0; round < input.rounds; round++) {
    if (input.model && round % every === 0) {
      for (const [i, s] of seats.entries()) if (s.kind === "model") await modelTurn(i, round, round / every, turns);
    }
    for (let k = 0; k < input.acts; k++) for (let i = 0; i < seats.length; i++) if (energy[i]! > 0) await act(i, round);
    for (let i = 0; i < seats.length; i++) energy[i]! += input.income;
  }

  const found = deals(chat, log, 2 * every);
  const proposed = found.proposals.map(k => chat[k]!.by);
  return {
    seats: seats.map((s, i) => ({
      seat: s.name, kind: s.kind, rule: `${s.rule.family}/${s.rule.tieBreaker}`,
      start: startPoints.reduce((t, p) => t + p[i]!, 0), end: total(i), gained: total(i) - startPoints.reduce((t, p) => t + p[i]!, 0),
      reversalEnergy: reversal[i]!, spent: spent[i]!, messages: stats[i]!.messages,
      proposals: proposed.filter(by => by === i).length,
      replaced: stats[i]!.replaced, toolCalls: stats[i]!.toolCalls, failedToolCalls: stats[i]!.failedToolCalls,
    })),
    chat: chat.map(({ from, text, round }) => ({ from, text, round })),
    deals: found.deals, usd,
  };
}

/**
 * Proposals and deals read from the chat (indexes into it), a heuristic: a proposal is a message naming at least one line ("line 4") with offer words
 * (deal, if you, I'll, leave, keep…); it is accepted by the first later message from another seat with agreement words
 * (deal, yes, ok, agreed…; "Deal?" alone asks back) and no refusal, within `window` rounds (two model turns). A deal is kept when, from its acceptance
 * to the end, neither side made a move on a named line that lowered the other's points there.
 */
export function deals(
  chat: readonly { by: number; text: string; round: number }[],
  log: readonly { object: number; by: number; before: readonly number[]; after: readonly number[]; round: number }[],
  window = 4,
): { deals: Deal[]; proposals: number[] } {
  const out: Deal[] = [], proposals: number[] = [];
  const taken = new Set<number>();
  chat.forEach((m, k) => {
    const named = linesIn(m.text);
    if (taken.has(k) || !named.length || !PROPOSAL.test(m.text) || REFUSE.test(m.text)) return;   // an acceptance is not a proposal of its own
    proposals.push(k);
    const reply = chat.slice(k + 1).find((x, d) => !taken.has(k + 1 + d) && x.by !== m.by && x.round <= m.round + window && accepts(x.text)
      && (linesIn(x.text).length === 0 || linesIn(x.text).some(l => named.includes(l))));
    if (!reply) return;
    taken.add(chat.indexOf(reply));
    const broken = log.some(e => e.round >= reply.round && named.includes(e.object)
      && ((e.by === m.by && e.after[reply.by]! < e.before[reply.by]!) || (e.by === reply.by && e.after[m.by]! < e.before[m.by]!)));
    out.push({ by: m.by, with: reply.by, lines: named, round: reply.round, kept: !broken, text: m.text, reply: reply.text });
  });
  return { deals: out, proposals };
}
