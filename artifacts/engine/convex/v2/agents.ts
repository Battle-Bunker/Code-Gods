/**
 * A player's agents (spec §6.1, docs/energy-model.md §6–§7): summoning pays the program's summon price from the
 * player's own store and gives the agent a share of the player's power; energy moves with power (`movePower`), so a
 * re-allocation loses nothing; replacing or putting back a program pays the new program's price; destroying returns
 * the share. Mutation-level helpers used by the operations (ops/agent.ts, ops/power.ts) and by practice partners.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { hashHex } from "@workspace/v2-core";
import { startersFor, summonBits } from "@workspace/v2-agents/pure";
import {
  agentIncome, defaultShare, energyCapacity, firstAgentShare, floorShare, movePower, roundShare, settle, settleOwn, spend, type Account,
} from "@workspace/v2-economy";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { appendEvent, clockOf, powerTerms } from "./loop.ts";
import { MAX_AGENTS } from "./play.ts";

type Language = "typescript" | "python";

const ownOf = (p: Doc<"v2Players">): Account => ({ balance: p.energy, settledWorldSeconds: p.settledAt });

async function energyRow(ctx: MutationCtx, agentId: Id<"v2Agents">) {
  return (await ctx.db.query("v2AgentEnergy").withIndex("by_agent", q => q.eq("agentId", agentId)).unique())!;
}

/** An agent's account settled to `world` at its current share. */
function settledAgent(game: Doc<"v2Games">, agent: Doc<"v2Agents">, e: Doc<"v2AgentEnergy">, world: number): Account {
  const income = agentIncome(game.settings.economy.powerPerSecond, agent.share);
  return settle({ balance: e.energy, settledWorldSeconds: e.settledAt }, Math.max(world, e.settledAt), income, energyCapacity(income, game.settings.economy.fullChargeSeconds));
}

/** Pays `price` from the player's own store settled to now, or refuses (a store never goes below zero for a summon). */
function pay(game: Doc<"v2Games">, player: Doc<"v2Players">, world: number, price: number): Account {
  const own = settleOwn(ownOf(player), Math.max(world, player.settledAt), powerTerms(game, player));
  if (own.balance < price) {
    throw new OpFailure(`That program costs ${Math.round(price * 10) / 10} ⚡; you have ${Math.round(own.balance * 10) / 10}.`, "Energy accrues while the game runs; a shorter program costs less.");
  }
  return spend(own, price);
}

/** The summon price of a program, in energy. */
export const priceOf = (language: Language, source: string) => summonBits(language, source).energy;

export async function summonAgent(ctx: MutationCtx, game: Doc<"v2Games">, player: Doc<"v2Players">,
  a: { language: Language; source: string; name?: string; share?: number }): Promise<{ agentId: Id<"v2Agents">; price: number }> {
  if (game.phase === "ended") throw new OpFailure("The game is over.");
  if (player.agents >= MAX_AGENTS) throw new OpFailure(`You have ${MAX_AGENTS} agents, the most a player may have.`, "agent.destroy");
  const world = (await clockOf(ctx, game._id)).worldSeconds, price = priceOf(a.language, a.source);
  const share = roundShare(a.share ?? defaultShare(player.allocated));
  if (share <= 0 || player.allocated + share > 1 + 1e-9) throw new OpFailure(`You have ${roundShare(1 - player.allocated)} of your power left to give.`, "power.allocate");
  const own = pay(game, player, world, price);
  const whole = player.power * game.settings.economy.fullChargeSeconds;
  const moved = movePower({ balance: 0, settledWorldSeconds: world }, own, 0, share, 1 - player.allocated, whole);
  const sourceHash = hashHex(a.source), now = Date.now();
  const agentId = await ctx.db.insert("v2Agents", {
    gameId: game._id, memberId: player.memberId, name: a.name ?? `Agent ${player.agents + 1}`, language: a.language, sourceHash,
    version: 0, share, createdAt: now, source: a.source,
  });
  await ctx.db.insert("v2AgentEnergy", { agentId, gameId: game._id, energy: moved.agent.balance, acts: 0, skips: 0, failures: 0, spend: 0, pointsGained: 0, settledAt: world });
  await ctx.db.insert("v2AgentPrograms", { agentId, version: 0, language: a.language, source: a.source, sourceHash, price, summonedAt: now, acts: 0, pointsGained: 0 });
  await ctx.db.patch(player._id, { energy: moved.own.balance, settledAt: world, allocated: roundShare(player.allocated + share), agents: player.agents + 1 });
  await appendEvent(ctx, game._id, "command", { kind: "summon", memberId: player.memberId, agentId, language: a.language, sourceHash, version: 0, price, share, worldSeconds: world });
  return { agentId, price };
}

/** The caller's own live agent, or a refusal. */
export async function ownAgent(ctx: MutationCtx, player: Doc<"v2Players">, agentId: string): Promise<Doc<"v2Agents">> {
  const id = ctx.db.normalizeId("v2Agents", agentId);
  const agent = id ? await ctx.db.get(id) : null;
  if (!agent || agent.memberId !== player.memberId || agent.gameId !== player.gameId) throw new OpFailure("That agent is not yours.");
  if (agent.destroyedAt !== undefined) throw new OpFailure("That agent was destroyed.");
  return agent;
}

/** Swaps a new program into an agent (a replace, or an earlier version put back), paying its summon price. */
export async function reprogram(ctx: MutationCtx, game: Doc<"v2Games">, player: Doc<"v2Players">, agent: Doc<"v2Agents">,
  a: { language: Language; source: string; kind: "replace" | "putBack"; from?: number }): Promise<{ version: number; price: number }> {
  const world = (await clockOf(ctx, game._id)).worldSeconds, price = priceOf(a.language, a.source);
  const own = pay(game, player, world, price);
  const version = agent.version + 1, sourceHash = hashHex(a.source);
  await ctx.db.patch(agent._id, { language: a.language, source: a.source, sourceHash, version });
  await ctx.db.insert("v2AgentPrograms", { agentId: agent._id, version, language: a.language, source: a.source, sourceHash, price, summonedAt: Date.now(), acts: 0, pointsGained: 0 });
  await ctx.db.patch(player._id, { energy: own.balance, settledAt: own.settledWorldSeconds });
  await appendEvent(ctx, game._id, "command", { kind: a.kind, memberId: player.memberId, agentId: agent._id, language: a.language, sourceHash, version, price, ...(a.from !== undefined ? { from: a.from } : {}), worldSeconds: world });
  return { version, price };
}

/** Moves an agent's share from its current value to `to` (0 destroys it), moving energy and debt with the power. */
async function reshare(ctx: MutationCtx, game: Doc<"v2Games">, player: Doc<"v2Players">, agent: Doc<"v2Agents">, to: number, world: number): Promise<Doc<"v2Players">> {
  const e = await energyRow(ctx, agent._id);
  const own = settleOwn(ownOf(player), Math.max(world, player.settledAt), powerTerms(game, player));
  const moved = movePower(settledAgent(game, agent, e, world), own, agent.share, to, 1 - player.allocated, player.power * game.settings.economy.fullChargeSeconds);
  await ctx.db.patch(e._id, { energy: moved.agent.balance, settledAt: world });
  await ctx.db.patch(agent._id, { share: to, ...(to === 0 ? { destroyedAt: Date.now() } : {}) });
  const next = { energy: moved.own.balance, settledAt: world, allocated: roundShare(player.allocated - agent.share + to), ...(to === 0 ? { agents: player.agents - 1 } : {}) };
  await ctx.db.patch(player._id, next);
  return { ...player, ...next };
}

export async function destroyAgent(ctx: MutationCtx, game: Doc<"v2Games">, player: Doc<"v2Players">, agent: Doc<"v2Agents">) {
  const world = (await clockOf(ctx, game._id)).worldSeconds;
  await reshare(ctx, game, player, agent, 0, world);
  await appendEvent(ctx, game._id, "command", { kind: "destroy", memberId: player.memberId, agentId: agent._id, worldSeconds: world });
}

/**
 * Sets the named agents' shares, in proportion to the numbers given, out of the power the agents not named leave
 * (all of it when every agent is named). Each named agent keeps some power: stopping one is `agent.destroy`.
 * Decreases go first, so energy leaving one agent can reach another.
 */
export async function allocatePower(ctx: MutationCtx, game: Doc<"v2Games">, player: Doc<"v2Players">, shares: Record<string, number>) {
  const total = Object.values(shares).reduce((s, x) => s + x, 0);
  if (Object.values(shares).some(x => !(x > 0))) throw new OpFailure("Every agent you name needs a share above 0.", "agent.destroy");
  const named: Doc<"v2Agents">[] = [];
  for (const id of Object.keys(shares)) named.push(await ownAgent(ctx, player, id));
  const others = (await ctx.db.query("v2Agents").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", player.memberId)).take(MAX_AGENTS))
    .filter(a => a.destroyedAt === undefined && !named.some(n => n._id === a._id));
  const room = 1 - others.reduce((t, a) => t + a.share, 0);
  if (!(room > 0)) throw new OpFailure("Your other agents hold all of your power.", "power.allocate");
  const agents = named.map(agent => ({ agent, to: floorShare(room * shares[agent._id]! / total) }));
  const world = (await clockOf(ctx, game._id)).worldSeconds;
  agents.sort((x, y) => (x.to - x.agent.share) - (y.to - y.agent.share));
  let p = player;
  for (const { agent, to } of agents) {
    const fresh = (await ctx.db.get(agent._id))!;
    if (fresh.share !== to) p = await reshare(ctx, game, p, fresh, to, world);
  }
  await appendEvent(ctx, game._id, "command", { kind: "allocate", memberId: player.memberId, shares: Object.fromEntries(agents.map(x => [x.agent._id, x.to])), worldSeconds: world });
}

/**
 * Practice partners (integration plan §1.2): each summons its rule's Simple starter once, at the first-agent share.
 * The first partner's is in TypeScript, the others' in Python, so both languages play in every practice game.
 */
export async function summonPracticePartners(ctx: MutationCtx, game: Doc<"v2Games">) {
  const players = await ctx.db.query("v2Players").withIndex("by_game", q => q.eq("gameId", game._id)).take(16);
  let k = 0;
  for (const p of players) {
    if (p.kind !== "practice") continue;
    const rule = (await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", p.memberId)).unique())!;
    const language: Language = k++ === 0 ? "typescript" : "python";
    const starters = startersFor(rule.family, language).map(s => ({ s, price: priceOf(language, s.source) }));
    // The Simple starter; in a room whose starting energy is too low for it, the dearest one that fits; else none.
    const fits = starters.filter(x => x.price <= p.energy).sort((x, y) => y.price - x.price);
    const pick = fits.find(x => x.s.kind === "simple") ?? fits[0];
    if (!pick) continue;
    const need = Math.max(...starters.map(x => x.price));
    const share = firstAgentShare({ allocated: 0, powerPerSecond: p.power, fullChargeSeconds: game.settings.economy.fullChargeSeconds, need }) ?? defaultShare(0);
    await summonAgent(ctx, game, p, { language, source: pick.s.source, name: pick.s.title, share });
  }
}
