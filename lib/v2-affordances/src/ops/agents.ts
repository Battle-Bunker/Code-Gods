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
  agentId: id, name: z.string(), language, share: z.number(), energy: z.number(), acts: z.number().int(), version: z.number().int(),
});
const checkReport = z.object({
  verdict: z.enum(["works", "warns", "fails", "rejected"]), summary: z.string(), price: z.number().describe("The summon price in energy."),
  sample: z.array(z.object({ objectId: id, outcome: z.enum(["committed", "skipped", "failed"]), reason: z.string().optional() })),
});

export const agentOps = [
  affordance({
    id: "agents.list", title: "List my agents", group: "agents", scope: "game",
    description: "The caller's agents (≤ 20): name, language, power share, energy, acts and current program version.",
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
    description: "Runs a program once on sample objects in the sandbox without spending energy: whether it compiles, what it does, and what summoning it would cost. Always check before summoning.",
    tooltip: "Try your code without spending energy.", keywords: ["validate", "test", "dry run", "check code"],
    params: obj({ language, source }), result: checkReport,
    contexts: IN_GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
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
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "energy", confirm: "summary", runs: "server", available: energyCheck,
  }),
  affordance({
    id: "agent.replace", title: "Replace an agent's code", group: "agents", scope: "game",
    description: "Pays the new program's summon price and swaps it into an existing agent, keeping its power share and energy.",
    tooltip: "Give an agent new code.", keywords: ["replace", "update code", "edit agent", "redeploy"],
    params: obj({ agentId: id, language, source, requestId: requestId.optional() }), result: z.object({ version: z.number().int(), price: z.number() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "energy", confirm: "summary", runs: "server",
    available: ctx => { const a = hasAgents(ctx); return a.ok ? energyCheck(ctx) : a; },
  }),
  affordance({
    id: "agent.putBack", title: "Put back an earlier version", group: "agents", scope: "game",
    description: "Replaces an agent's program with one of its earlier versions, at that version's summon price.",
    tooltip: "Go back to an earlier version.", keywords: ["revert", "undo", "put back", "rollback"],
    params: obj({ agentId: id, version: z.number().int().min(0), requestId: requestId.optional() }), result: z.object({ version: z.number().int(), price: z.number() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "energy", confirm: "summary", runs: "server",
    available: ctx => { const a = hasAgents(ctx); return a.ok ? energyCheck(ctx) : a; },
  }),
  affordance({
    id: "agent.destroy", title: "Destroy an agent", group: "agents", scope: "game",
    description: "Stops an agent for good. Its energy is lost and its power share returns to the caller's other agents.",
    tooltip: "Stop an agent permanently.", keywords: ["destroy", "kill", "delete agent", "stop agent"],
    params: obj({ agentId: id, requestId: requestId.optional() }), result: ok,
    contexts: IN_GAME, caller: "seated", effect: "destructive", confirm: "modal", runs: "server", available: hasAgents,
  }),
  affordance({
    id: "power.allocate", title: "Split power between agents", group: "agents", scope: "game",
    description: "Sets each agent's share of the caller's power (shares are normalised to sum to 1). Power sets how fast each agent's energy accrues.",
    tooltip: "Decide which agents get more power.", keywords: ["power", "shares", "allocate", "split"],
    params: obj({ shares: z.record(id, z.number().min(0)).describe("agentId → share"), requestId: requestId.optional() }), result: ok,
    contexts: IN_GAME, caller: "seated", effect: "write", confirm: "none", runs: "server", available: hasAgents,
  }),
] as const;
