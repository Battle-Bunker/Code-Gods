/**
 * A player's agents (spec §6.1, docs/energy-model.md §6–§7): summoning pays the program's summon price from the
 * player's own store and gives the agent a share of the player's power; energy moves with power (`movePower`), so a
 * re-allocation loses nothing; replacing or putting back a program pays the new program's price; destroying returns
 * the share. Mutation-level helpers used by the operations (ops/agent.ts, ops/power.ts) and by practice partners.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { hashHex } from "@workspace/v2-core";
import { startersFor } from "@workspace/v2-agents/pure";
import { editPriceOf, priceOf } from "./pricing";
export { editPriceOf, priceOf };
import {
  agentIncome, defaultShare, energyCapacity, firstAgentShare, floorShare, movePower, ownIncome, roundShare, settle, settleOwn, spend, type Account,
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
/** The least share a "pay now" split leaves an agent (it keeps running, on very little power). */
const PAY_NOW_MIN_SHARE = 0.001;

/**
 * Pays `price` from the player's own store settled to now, or refuses (a store never goes below zero for a summon).
 * The refusal carries its numbers (`data`) so a surface can offer the fix: the price, the store now, its income and
 * capacity, the seconds until it can pay at the current split (null when it never can: the price is above the store's
 * capacity, or it earns nothing), and `payNow`, the agents' shares that would pay at once (power.allocate moves the
 * energy an agent holds above its new capacity into the store), or null when no split would.
 */
export async function pay(ctx: MutationCtx, game: Doc<"v2Games">, player: Doc<"v2Players">, world: number, price: number, what = "That program"): Promise<Account> {
  const terms = powerTerms(game, player);
  const own = settleOwn(ownOf(player), Math.max(world, player.settledAt), terms);
  if (own.balance >= price) return spend(own, price);
  const perSecond = ownIncome(terms.powerPerSecond, terms.allocated), capacity = energyCapacity(perSecond, terms.fullChargeSeconds);
  const secondsToPay = perSecond > 0 && capacity >= price ? (price - own.balance) / perSecond : null;
  const payNow = await payNowShares(ctx, game, player, world, price - own.balance);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  throw new OpFailure(`${what} costs ${r1(price)} ⚡; you have ${r1(own.balance)}.`,
    payNow ? "Pull power back from your agents to pay now (power.allocate with the shares in data.payNow), or wait while energy accrues; a shorter program costs less."
      : "Energy accrues while the game runs; a shorter program costs less.",
    { price, store: own.balance, perSecond, capacity, secondsToPay, payNow: payNow ? { shares: payNow } : null });
}

/**
 * The fewest agents' shares to lower so that the energy they hold above their new capacities covers `need`: the agent
 * holding most first, each lowered only as far as needed (never below PAY_NOW_MIN_SHARE); null when even that falls short.
 */
async function payNowShares(ctx: MutationCtx, game: Doc<"v2Games">, player: Doc<"v2Players">, world: number, need: number): Promise<Record<string, number> | null> {
  const whole = player.power * game.settings.economy.fullChargeSeconds;
  if (!(whole > 0)) return null;
  const agents = (await ctx.db.query("v2Agents").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", player.memberId)).take(MAX_AGENTS))
    .filter(a => a.destroyedAt === undefined);
  const held = await Promise.all(agents.map(async a => ({ a, balance: settledAgent(game, a, await energyRow(ctx, a._id), world).balance })));
  held.sort((x, y) => y.balance - x.balance);
  const shares: Record<string, number> = {};
  for (const { a, balance } of held) {
    if (need <= 0) break;
    const most = balance - PAY_NOW_MIN_SHARE * whole;   // what this agent can release at the least share
    if (most <= 0 || a.share <= PAY_NOW_MIN_SHARE) continue;
    const to = need >= most ? PAY_NOW_MIN_SHARE : Math.max(PAY_NOW_MIN_SHARE, floorShare((balance - need) / whole));
    if (to >= a.share) continue;
    shares[a._id] = to;
    need -= balance - to * whole;
  }
  return need <= 1e-9 ? shares : null;
}

export async function summonAgent(ctx: MutationCtx, game: Doc<"v2Games">, player: Doc<"v2Players">,
  a: { language: Language; source: string; name?: string; share?: number }): Promise<{ agentId: Id<"v2Agents">; price: number }> {
  if (game.phase === "ended") throw new OpFailure("The game is over.");
  if (player.agents >= MAX_AGENTS) throw new OpFailure(`You have ${MAX_AGENTS} agents, the most a player may have.`, "agent.destroy");
  const world = (await clockOf(ctx, game._id)).worldSeconds, price = priceOf(a.language, a.source);
  const share = roundShare(a.share ?? defaultShare(player.allocated));
  if (share <= 0 || player.allocated + share > 1 + 1e-9) throw new OpFailure(`You have ${roundShare(1 - player.allocated)} of your power left to give.`, "power.allocate");
  const own = await pay(ctx, game, player, world, price);
  const whole = player.power * game.settings.economy.fullChargeSeconds;
  const moved = movePower({ balance: 0, settledWorldSeconds: world }, own, 0, share, 1 - player.allocated, whole);
  const sourceHash = hashHex(a.source), now = Date.now();
  const name = a.name ?? `Agent ${player.agents + 1}`;
  const agentId = await ctx.db.insert("v2Agents", {
    gameId: game._id, memberId: player.memberId, name, language: a.language, sourceHash,
    version: 0, share, createdAt: now, source: a.source,
  });
  await ctx.db.insert("v2AgentEnergy", { agentId, gameId: game._id, energy: moved.agent.balance, acts: 0, skips: 0, failures: 0, spend: 0, pointsGained: 0, settledAt: world });
  await ctx.db.insert("v2AgentPrograms", { agentId, version: 0, language: a.language, source: a.source, sourceHash, price, summonedAt: now, acts: 0, pointsGained: 0 });
  await ctx.db.patch(player._id, { energy: moved.own.balance, settledAt: world, allocated: roundShare(player.allocated + share), agents: player.agents + 1 });
  // The agent's name, so a replay calls it what the live game did (round 10: "Agent 1" for "Simple").
  await appendEvent(ctx, game._id, "command", { kind: "summon", memberId: player.memberId, agentId, name, language: a.language, sourceHash, version: 0, price, share, worldSeconds: world });
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

/** Swaps a new program into an agent (a replace, or an earlier version put back), paying only for the change. */
export async function reprogram(ctx: MutationCtx, game: Doc<"v2Games">, player: Doc<"v2Players">, agent: Doc<"v2Agents">,
  a: { language: Language; source: string; kind: "replace" | "putBack"; from?: number }): Promise<{ version: number; price: number }> {
  const world = (await clockOf(ctx, game._id)).worldSeconds, price = editPriceOf(agent, a.language, a.source);
  const own = await pay(ctx, game, player, world, price);
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
 * Sets the named agents' shares to the fractions of the player's power given (absolute); agents not named keep theirs,
 * and all together are at most the player's whole power. What no agent holds feeds the player's own store, so a
 * player can pull power back to pay for a summon or an edit and give it out again. Energy moves with power
 * (`movePower`); decreases go first, so energy leaving one agent can reach another. Stopping one is `agent.destroy`.
 */
export async function allocatePower(ctx: MutationCtx, game: Doc<"v2Games">, player: Doc<"v2Players">, shares: Record<string, number>) {
  if (Object.values(shares).some(x => !(x > 0) || x > 1)) throw new OpFailure("Every agent you name needs a share above 0 and at most all of your power.", "agent.destroy");
  const named: Doc<"v2Agents">[] = [];
  for (const id of Object.keys(shares)) named.push(await ownAgent(ctx, player, id));
  const others = (await ctx.db.query("v2Agents").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", player.memberId)).take(MAX_AGENTS))
    .filter(a => a.destroyedAt === undefined && !named.some(n => n._id === a._id));
  const agents = named.map(agent => ({ agent, to: floorShare(shares[agent._id]!) }));
  if (agents.some(x => x.to <= 0)) throw new OpFailure("That share rounds to nothing; give each agent you name at least 0.1% of your power.", "agent.destroy");
  const total = others.reduce((t, a) => t + a.share, 0) + agents.reduce((t, x) => t + x.to, 0);
  if (total > 1 + 1e-9) throw new OpFailure(`Those shares come to ${Math.round(total * 100)}% of your power with your other agents'; at most 100%.`, "power.allocate");
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
    const starters = startersFor(rule.family, language, rule.tieBreaker).map(s => ({ s, price: priceOf(language, s.source) }));
    // The Simple starter; in a room whose starting energy is too low for it, the dearest one that fits; else none.
    const fits = starters.filter(x => x.price <= p.energy).sort((x, y) => y.price - x.price);
    const pick = fits.find(x => x.s.kind === "simple") ?? fits[0];
    if (!pick) continue;
    const need = Math.max(...starters.map(x => x.price));
    const share = firstAgentShare({ allocated: 0, powerPerSecond: p.power, fullChargeSeconds: game.settings.economy.fullChargeSeconds, need }) ?? defaultShare(0);
    await summonAgent(ctx, game, p, { language, source: pick.s.source, name: pick.s.title, share });
  }
}
