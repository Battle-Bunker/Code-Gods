/** `object.*`: reads of an object (free for a human; `bits` is what an agent pays), quotes and scores (reads.ts). */
import { defineOp, inGame, seated } from "./define";
import { ask, hostFor, objectIn } from "../reads.ts";
import { decode, encode, penaltyWeightOf, scopeOf, typeOf, valueOf } from "../world.ts";
import { elementValue, representation } from "@workspace/v2-core";
import { text as equationText } from "@workspace/v2-views/equation-text";
import { disclosed, measured } from "../disclose.ts";
import { knownOf, lookPrice, paysToRead, readPriceWeightOf, readsKnowledge, tell } from "../knowledge.ts";
import { OpFailure } from "@workspace/v2-affordances";
import { pay } from "../agents.ts";
import { knownFamily } from "../deal.ts";
import { appendEvent } from "../loop.ts";
import { quoteOthers } from "../play.ts";

/** At most this many objects one look covers (a game's objects; v1 paged larger boards). */
const MAX_LOOK = 400;
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

async function myRuleRow(ctx: QueryCtx, gameId: Id<"v2Games">, memberId: Id<"v2Members">) {
  return await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).unique();
}

export const { op: read, as: readAs } = defineOp("object.read", "query", async (env, a) => {
  const { game, member } = inGame(env);
  const { state } = await objectIn(env.ctx, game, a.objectId, member._id);
  const r = ask(await hostFor(env.ctx, game, member, state), { op: "view", rep: a.rep, site: a.site ?? 0 });
  // An equation as a person writes it, by the views' one writer ("y = −x + 12", never "−1x" or "+ 0").
  const type = typeOf(game.variant), s = decode(state, game.variant);
  const scene = representation(type, r.rep).layout(s, r.site);
  const text = scene.kind === "equation" ? equationText(scene as never, ref => elementValue(type, s, ref, r.site), r.rep) : null;
  return { rep: r.rep, site: r.site, elements: r.elements, bits: r.bits, text };
});

export const { op: element, as: elementAs } = defineOp("object.element", "query", async (env, a) => {
  const { game, member } = inGame(env);
  const { state } = await objectIn(env.ctx, game, a.objectId, member._id);
  const ref = { rep: a.rep, name: a.name, ...(a.args ? { args: a.args } : {}), ...(a.site !== undefined ? { site: a.site } : {}) };
  const r = ask(await hostFor(env.ctx, game, member, state), { op: "element", ref });
  return { ref: `${a.rep}.${a.name}`, value: r.value, bits: r.bits };
});

export const { op: quote, as: quoteAs } = defineOp("object.quote", "query", async (env, a) => {
  const { game, member, player } = seated(env);
  const { state } = await objectIn(env.ctx, game, a.objectId, member._id);
  const host = await hostFor(env.ctx, game, member, state, player.energy);
  const calls = a.calls.map(c => ({ mutator: c.mutator, site: c.site ?? 0, args: c.args }));
  const q = ask(host, { op: "quote", calls });
  const priced = host.price(calls);
  let after: { score: (string | null)[] | null; terms: unknown; bits?: number } | null = null;
  if (priced.valid) {
    const terms = ask(await hostFor(env.ctx, game, member, encode(priced.result, game.variant)), { op: "myScore" }).terms;
    const rule = await myRuleRow(env.ctx, game._id, member._id);
    if (rule) {
      // With a defence goal (v1, restored; call 1) the quote says the bits the commit would pay, the penalty taken off.
      const v = valueOf(priced.result, game.variant, rule, scopeOf(game).objects, rule.defence, penaltyWeightOf(game));
      after = { score: v.score, terms, ...(rule.defence ? { bits: v.rarityBits } : {}) };
    }
  }
  return { valid: q.valid, ...(q.reason ? { reason: q.reason } : {}), bits: q.bits, total: q.total, charge: q.charge, after: after as never };
});

export const { op: score, as: scoreAs } = defineOp("object.score", "query", async (env, a) => {
  const { game, member } = seated(env);
  const { object, state } = await objectIn(env.ctx, game, a.objectId, member._id);
  const s = ask(await hostFor(env.ctx, game, member, state), { op: "myScore" });
  // Paid observation (knowledge.ts): the value as the player was last told it.
  if (readsKnowledge(game, member._id)) {
    const k = await knownOf(env.ctx, object._id, member._id);
    return { score: k?.score ?? null, terms: s.terms, number: object.number, bits: k?.rarityBits ?? 0, points: k?.points ?? 0 };
  }
  const value = await env.ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", object._id).eq("memberId", member._id)).unique();
  // The utility and its bits as the commit valued them (decision 23); the terms are the host's.
  return { score: value?.score ?? null, terms: s.terms, number: object.number, bits: value?.rarityBits ?? 0, points: value ? disclosed(game, value).points : 0 };
});

/**
 * A look (knowledge.ts, decision 35): one object, or every object, at its full read's price times the game's weight,
 * from the caller's own store; the caller is told it as it is now, each value a fresh measurement (decision 32).
 */
export const { op: look, as: lookAs } = defineOp("object.look", "mutation", async (env, a) => {
  const { game, member, player } = seated(env);
  if (!paysToRead(game)) throw new OpFailure("Reading is free in this game: every object shows as it is.");
  if (game.phase === "planning") throw new OpFailure("The world has not started: there is nothing to look at yet.");
  if (game.phase === "ended") throw new OpFailure("The game is over: every object is open.");
  const clock = (await env.ctx.db.query("v2Clocks").withIndex("by_game", q => q.eq("gameId", game._id)).unique())!;
  // A retired line (turnover) is not looked at: it no longer changes. Looking at every line reads the live ones.
  const objects = a.objectId ? [(await objectIn(env.ctx, game, a.objectId)).object]
    : await env.ctx.db.query("v2Objects").withIndex("by_game_live", q => q.eq("gameId", game._id).eq("retiredAt", undefined)).take(MAX_LOOK);
  if (objects.some(o => o.retiredAt !== undefined)) throw new OpFailure("That line has retired: it no longer changes, so there is nothing new to see.");
  const seen = [];
  for (const o of objects) {
    const st = (await env.ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", o._id)).unique())!;
    const value = (await env.ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", o._id).eq("memberId", member._id)).unique())!;
    seen.push({ o, st, value });
  }
  const price = seen.reduce((t, s) => t + lookPrice(game.variant, s.st.state, readPriceWeightOf(game)), 0);
  const paid = await pay(env.ctx, game, player, clock.worldSeconds, price, seen.length === 1 ? "That look" : `Looking at all ${seen.length}`);
  await env.ctx.db.patch(player._id, { energy: paid.balance, settledAt: paid.settledWorldSeconds });
  // A rule valued by the dynamic measure is estimated afresh at each look (the owner, 16 Nov: "Every time a player
  // queries an object we can calculate energies again as a natural noise function"); the stored row is the commit's.
  const rule = await myRuleRow(env.ctx, game._id, member._id), fresh = rule && knownFamily(rule.family)?.dynamic ? rule : null;
  for (const { o, st, value } of seen) {
    const own = fresh ? { ...value, bound: undefined, ...valueOf(decode(st.state, game.variant), game.variant, fresh, scopeOf(game).objects) } : value;
    await tell(env.ctx, game, member._id, { objectId: o._id, number: o.number, state: st.state, version: st.version, score: own.score, rarityBits: own.rarityBits, bound: own.bound, ...measured(game, own) }, clock.worldSeconds);   // each look measures afresh (decision 32)
  }
  await appendEvent(env.ctx, game._id, "command", { kind: "look", memberId: member._id, objects: seen.map(s => s.o._id), price, worldSeconds: clock.worldSeconds });
  return { looked: seen.length, price };
});

/**
 * A What if quote (coordinator's call 33): the others' sum after each candidate move, from the state the caller knows,
 * one look's price per candidate from the caller's own store (free where the game reads free), each a fresh blurred
 * reading (decision 32), never exact while the game runs.
 */
export const { op: whatIf, as: whatIfAs } = defineOp("object.whatIf", "mutation", async (env, a) => {
  const { game, member, player } = seated(env);
  if (game.phase !== "live" && game.phase !== "paused") throw new OpFailure("A What if quote is for a running game.");
  const { object } = await objectIn(env.ctx, game, a.objectId);
  if (object.retiredAt !== undefined) throw new OpFailure("That line has retired: no move can be made on it.");
  const state = (await env.ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", object._id)).unique())!;
  const clock = await env.ctx.db.query("v2Clocks").withIndex("by_game", q => q.eq("gameId", game._id)).unique();
  const world = clock?.worldSeconds ?? 0;
  const quoted = await quoteOthers(env.ctx, game, member._id, object, state, a.calls.map(c => ({ ...c, site: c.site ?? 0 })), crypto.randomUUID());
  const price = paysToRead(game) ? a.calls.length * lookPrice(game.variant, state.state, readPriceWeightOf(game)) : 0;
  if (price > 0) {
    const paid = await pay(env.ctx, game, player, world, price, a.calls.length === 1 ? "That quote" : `Quoting ${a.calls.length} moves`);
    await env.ctx.db.patch(player._id, { energy: paid.balance, settledAt: paid.settledWorldSeconds });
  }
  // The record (a seeded fixture game has no engine, so no record).
  if (await env.ctx.db.query("v2Engine").withIndex("by_game", q => q.eq("gameId", game._id)).unique()) await appendEvent(env.ctx, game._id, "command", { kind: "quote", memberId: member._id, objectId: object._id, candidates: a.calls.length, price, worldSeconds: world });
  return { ...quoted, price };
});
