/** The viewer's agents: checking, summoning, replacing and destroying them, and splitting power (spec §6.1). */
import { z } from "zod/v4";
import { affordance, id, language, none, obj, ok, requestId, source } from "../define.ts";
import { IN_GAME, type AffordanceContext, type Availability } from "../types.ts";

const energyCheck = (ctx: AffordanceContext): Availability =>
  ctx.game?.energy !== undefined && ctx.game.energy <= 0
    ? { ok: false, reason: "You have no energy left; it accrues over time." } : { ok: true };
const hasAgents = (ctx: AffordanceContext): Availability =>
  ctx.game?.agents === 0 ? { ok: false, reason: "You have no agents yet.", fix: "agent.summon" } : { ok: true };

const agentRow = z.object({
  agentId: id, name: z.string(), language, share: z.number(), energy: z.number().describe("Below 0 is debt: an agent may borrow up to one full store of energy to finish a change; its own income repays the debt within a full-charge time, and while it owes it gets no new opportunities. If you lower its power or remove it, the debt moves with the power to your own store."), acts: z.number().int(), version: z.number().int(),
});
const checkReport = z.object({
  verdict: z.enum(["works", "warns", "fails", "rejected"]), summary: z.string(), price: z.number().describe("The summon price in energy."),
  editPrice: z.number().nullable().describe("With agentId: what agent.replace with this program would cost, only the change (the full price if the language changes); else null."),
  sample: z.array(z.object({ objectId: id, outcome: z.enum(["committed", "skipped", "failed"]), reason: z.string().optional() })),
});

export const agentOps = [
  affordance({
    id: "agents.list", title: "List my agents", group: "agents", scope: "game",
    description: "The caller's agents (≤ 20): name, language, power share, energy, acts and current program version. Energy below 0 is debt: an agent may borrow up to one full store of energy to finish a change; its own income repays the debt within a full-charge time, and while it owes it gets no new opportunities. If you lower its power or remove it, the debt moves with the power to your own store.",
    tooltip: "Your agents and their energy.", keywords: ["agents", "my agents", "bots"],
    params: none, result: z.object({ agents: z.array(agentRow) }),
    contexts: [...IN_GAME, "ended"], caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "agent.programs", title: "List an agent's versions", group: "agents", scope: "game",
    description: "Every program an agent has run (≤ 20), newest first, with its source and the acts it made. Use a version with agent.putBack.",
    tooltip: "Earlier versions of this agent.", keywords: ["versions", "history", "previous code"],
    params: obj({ agentId: id }),
    result: z.object({ versions: z.array(z.object({ version: z.number().int(), language, source: z.string(), acts: z.number().int() })) }),
    contexts: [...IN_GAME, "ended"], caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "agent.check", title: "Check an agent's code", group: "agents", scope: "game",
    description: "Runs a program once on sample objects in the sandbox without spending energy: whether it compiles, what it does, what summoning it would cost and, given one of your agents, what replacing that agent's program with it would cost (only the change). Always check before summoning or replacing.",
    tooltip: "Try your code without spending energy.", keywords: ["validate", "test", "dry run", "check code", "edit price"],
    params: obj({ language, source, agentId: id.optional().describe("One of your agents: also quote the edit price of replacing its program with this one.") }), result: checkReport,
    contexts: IN_GAME, caller: "seated", effect: "read", confirm: "none", runs: "server", action: true,
  }),
  affordance({
    id: "agent.summon", title: "Summon an agent", group: "agents", scope: "game",
    description: "Pays the program's summon price in energy and starts a new agent with a share of the caller's power. Check it first with agent.check.",
    tooltip: "Spend energy to start a new agent.", keywords: ["summon", "deploy", "new agent", "launch"],
    params: obj({
      language, source, name: z.string().min(1).max(40).optional(),
      share: z.number().min(0).max(1).optional().describe("Fraction of power for the new agent; omit for an equal split."),
      requestId: requestId.optional(),
    }),
    result: z.object({ agentId: id, price: z.number() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "energy", confirm: "summary", runs: "server", action: true, available: energyCheck,
  }),
  affordance({
    id: "agent.replace", title: "Replace an agent's code", group: "agents", scope: "game",
    description: "Pays the new program's summon price and swaps it into an existing agent, keeping its power share and energy.",
    tooltip: "Give an agent new code.", keywords: ["replace", "update code", "edit agent", "redeploy"],
    params: obj({ agentId: id, language, source, requestId: requestId.optional() }), result: z.object({ version: z.number().int(), price: z.number() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "energy", confirm: "summary", runs: "server", action: true,
    available: ctx => { const a = hasAgents(ctx); return a.ok ? energyCheck(ctx) : a; },
  }),
  affordance({
    id: "agent.leaveAlone", title: "Leave objects alone", group: "agents", scope: "game",
    description: "Sets the numbers of the objects (lines, grids) an agent leaves alone, to honour a deal made in chat: only its "
      + "code's leave-alone list (LEAVE) changes, priced as that small edit. An empty list lets it work on every object again.",
    tooltip: "Keep an agent off some objects.", keywords: ["leave alone", "deal", "skip", "promise", "don't touch", "LEAVE"],
    params: obj({ agentId: id, numbers: z.array(z.number().int().positive()).max(64).describe("The objects' numbers, e.g. [3, 19]; [] for none."), requestId: requestId.optional() }),
    result: z.object({ version: z.number().int(), price: z.number() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "energy", confirm: "summary", runs: "server", action: true,
    available: ctx => { const a = hasAgents(ctx); return a.ok ? energyCheck(ctx) : a; },
  }),
  affordance({
    id: "agent.hold", title: "Settle and hold objects", group: "agents", scope: "game",
    description: "Sets where an agent settles objects and holds them (a deal that pays: every player agrees where a line or board "
      + "should be): its code's TARGET (a line's y = mx + c as {m, c}, a board's 16 digits row by row) and SETTLE (the objects' "
      + "numbers; [] means every object). Only those two lines change, priced as that edit. target null stops holding.",
    tooltip: "Settle some objects at an agreed state and keep them there.", keywords: ["hold", "settle", "target", "deal", "agree", "keep it here"],
    params: obj({
      agentId: id,
      numbers: z.array(z.number().int().positive()).max(64).describe("The objects' numbers, e.g. [3, 19]; [] for every object."),
      target: z.union([z.object({ m: z.number().int(), c: z.number().int() }), z.string().regex(/^\d{16}$/), z.null()])
        .describe("A line's {m, c} for y = mx + c, a board's 16 digits row by row, or null to stop holding."),
      requestId: requestId.optional(),
    }),
    result: z.object({ version: z.number().int(), price: z.number() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "energy", confirm: "summary", runs: "server", action: true,
    available: ctx => { const a = hasAgents(ctx); return a.ok ? energyCheck(ctx) : a; },
  }),
  affordance({
    id: "agent.putBack", title: "Put back an earlier version", group: "agents", scope: "game",
    description: "Replaces an agent's program with one of its earlier versions, at that version's summon price.",
    tooltip: "Go back to an earlier version.", keywords: ["revert", "undo", "put back", "rollback"],
    params: obj({ agentId: id, version: z.number().int().min(0), requestId: requestId.optional() }), result: z.object({ version: z.number().int(), price: z.number() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "energy", confirm: "summary", runs: "server", action: true,
    available: ctx => { const a = hasAgents(ctx); return a.ok ? energyCheck(ctx) : a; },
  }),
  affordance({
    id: "agent.destroy", title: "Destroy an agent", group: "agents", scope: "game",
    description: "Stops an agent for good. The energy it holds comes back to the caller's own store, and its power share returns to the caller.",
    tooltip: "Stop an agent for good; the ⚡ it holds come back to you.", keywords: ["destroy", "kill", "delete agent", "stop agent"],
    params: obj({ agentId: id, requestId: requestId.optional() }), result: ok,
    contexts: IN_GAME, caller: "seated", effect: "destructive", confirm: "modal", runs: "server", available: hasAgents,
  }),
  affordance({
    id: "power.allocate", title: "Split power between agents", group: "agents", scope: "game",
    description: "Sets the named agents' shares of the caller's power, each a fraction of the whole (0 < share ≤ 1); agents not named keep theirs, and all shares together are at most 1. The power no agent holds feeds the caller's own store, so lowering shares fills the store faster (to pay for a summon or an edit) and raising them again moves the energy back. Energy moves with power. Power sets how fast each account accrues.",
    tooltip: "Decide which agents get more power, and how much you keep.", keywords: ["power", "shares", "allocate", "split", "keep power", "fund"],
    params: obj({ shares: z.record(id, z.number().gt(0).max(1)).describe("agentId → its fraction of your power (absolute; the rest stays yours)"), requestId: requestId.optional() }), result: ok,
    contexts: IN_GAME, caller: "seated", effect: "write", confirm: "none", runs: "server", available: hasAgents,
  }),
] as const;
