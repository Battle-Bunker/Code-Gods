/** `rule.*`: the caller's private rule and what its scores are worth (its value function, owner decision 23). */
import { OpFailure } from "@workspace/v2-affordances";
import { scoreFromWire } from "@workspace/v2-core";
import { valueRecord, worthOf } from "../values";
import { scopeOf } from "../world";
import { dealablePool, familyOf } from "../deal";
import { presetOf } from "../presets";
import { defineOp, inGame, seated } from "./define";

async function myRule(env: Parameters<typeof seated>[0]) {
  const { game, member } = seated(env);
  const r = await env.ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", member._id)).unique();
  if (!r) throw new OpFailure("Your rule has not been dealt yet.");
  return Object.assign(r, { scope: scopeOf(game) });
}

export const { op: explain, as: explainAs } = defineOp("rule.explain", "query", async env => {
  const r = await myRule(env);
  return {
    family: r.family, params: r.params ?? {}, layers: r.layers, card: r.card, depends: r.depends,
    wonByBid: r.handicap !== undefined ? { handicap: r.handicap } : null,
  };
});

/** The value function's knots, worst to best: what each score the rule can reach is worth in this game (decision 24). */
export const { op: values, as: valuesAs } = defineOp("rule.values", "query", async env => {
  const r = await myRule(env), vf = valueRecord(r.ruleKey);
  if (!vf) throw new OpFailure("Your rule has no value function on this deployment.");
  return { points: vf.knots.map(k => ({ score: k.u, bits: worthOf(r.ruleKey, scoreFromWire(k.u), r.scope).bits })) };
});

/** What one score is worth under the caller's rule: bits and their interval (hi is Infinity past the last knot). */
export const { op: worth, as: worthAs } = defineOp("rule.worth", "query", async (env, a) => {
  const r = await myRule(env), w = worthOf(r.ruleKey, scoreFromWire(a.score), r.scope);
  return { bits: w.bits, lo: w.lo, hi: Number.isFinite(w.hi) ? w.hi : null };
});

/**
 * Every rule the game's dealer could deal (v1's list_utility_candidates; the coordinator's call restoring the rival-
 * inference reads): the preset's dealable pool, each with the card its holder reads. Public: it never says who holds
 * which. No reads beyond the game's own record (the pool is the preset's, in code).
 */
export const { op: candidates, as: candidatesAs } = defineOp("rule.candidates", "query", async env => {
  const { game } = inGame(env);
  return {
    rules: dealablePool(presetOf(game.preset)).map(r => ({
      family: r.family, params: (r.params ?? {}) as Record<string, unknown>, tieBreaker: r.tieBreaker,
      card: familyOf(r.family).card(r.params, r.tieBreaker as never),
    })),
  };
});
