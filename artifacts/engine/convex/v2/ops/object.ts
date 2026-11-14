/** `object.*`: reads of an object (free for a human; `bits` is what an agent pays), quotes and scores (reads.ts). */
import { defineOp, inGame, seated } from "./define";
import { ask, hostFor, objectIn } from "../reads.ts";
import { decode, encode, scopeOf, typeOf, valueOf } from "../world.ts";
import { elementValue, representation } from "@workspace/v2-core";
import { equationText } from "@workspace/v2-views/equation-text";
import { disclosed } from "../disclose.ts";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

async function myRuleRow(ctx: QueryCtx, gameId: Id<"v2Games">, memberId: Id<"v2Members">) {
  return await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).unique();
}

export const { op: read, as: readAs } = defineOp("object.read", "query", async (env, a) => {
  const { game, member } = inGame(env);
  const { state } = await objectIn(env.ctx, game, a.objectId);
  const r = ask(await hostFor(env.ctx, game, member, state), { op: "view", rep: a.rep, site: a.site ?? 0 });
  // An equation as a person writes it, by the views' one writer ("y = −x + 12", never "−1x" or "+ 0").
  const type = typeOf(game.variant), s = decode(state, game.variant);
  const scene = representation(type, r.rep).layout(s, r.site);
  const text = scene.kind === "equation" ? equationText(scene as never, ref => elementValue(type, s, ref, r.site), r.rep) : null;
  return { rep: r.rep, site: r.site, elements: r.elements, bits: r.bits, text };
});

export const { op: element, as: elementAs } = defineOp("object.element", "query", async (env, a) => {
  const { game, member } = inGame(env);
  const { state } = await objectIn(env.ctx, game, a.objectId);
  const ref = { rep: a.rep, name: a.name, ...(a.args ? { args: a.args } : {}), ...(a.site !== undefined ? { site: a.site } : {}) };
  const r = ask(await hostFor(env.ctx, game, member, state), { op: "element", ref });
  return { ref: `${a.rep}.${a.name}`, value: r.value, bits: r.bits };
});

export const { op: quote, as: quoteAs } = defineOp("object.quote", "query", async (env, a) => {
  const { game, member, player } = seated(env);
  const { state } = await objectIn(env.ctx, game, a.objectId);
  const host = await hostFor(env.ctx, game, member, state, player.energy);
  const calls = a.calls.map(c => ({ mutator: c.mutator, site: c.site ?? 0, args: c.args }));
  const q = ask(host, { op: "quote", calls });
  const priced = host.price(calls);
  let after: { score: (string | null)[] | null; terms: unknown } | null = null;
  if (priced.valid) {
    const terms = ask(await hostFor(env.ctx, game, member, encode(priced.result, game.variant)), { op: "myScore" }).terms;
    const rule = await myRuleRow(env.ctx, game._id, member._id);
    if (rule) after = { score: valueOf(priced.result, game.variant, rule, scopeOf(game).objects).score, terms };
  }
  return { valid: q.valid, ...(q.reason ? { reason: q.reason } : {}), bits: q.bits, total: q.total, charge: q.charge, after: after as never };
});

export const { op: score, as: scoreAs } = defineOp("object.score", "query", async (env, a) => {
  const { game, member } = seated(env);
  const { object, state } = await objectIn(env.ctx, game, a.objectId);
  const s = ask(await hostFor(env.ctx, game, member, state), { op: "myScore" });
  const value = await env.ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", object._id).eq("memberId", member._id)).unique();
  // The utility and its bits as the commit valued them (decision 23); the terms are the host's.
  return { score: value?.score ?? null, terms: s.terms, number: object.number, bits: value?.rarityBits ?? 0, points: value ? disclosed(game, value).points : 0 };
});
