/** `rule.*`: the caller's private rule and what its scores are worth (its value function, owner decision 23). */
import { OpFailure } from "@workspace/v2-affordances";
import { scoreFromWire } from "@workspace/v2-core";
import { curveOf, valueRecord, worthOf } from "../values";
import { defineOp, seated } from "./define";

async function myRule(env: Parameters<typeof seated>[0]) {
  const { game, member } = seated(env);
  const r = await env.ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", member._id)).unique();
  if (!r) throw new OpFailure("Your rule has not been dealt yet.");
  return r;
}

export const { op: explain, as: explainAs } = defineOp("rule.explain", "query", async env => {
  const r = await myRule(env);
  return {
    family: r.family, params: r.params ?? {}, layers: r.layers, card: r.card, depends: r.depends,
    wonByBid: r.handicap !== undefined ? { handicap: r.handicap } : null,
  };
});

/** The value function's knots, worst to best: what each score the rule can reach is worth. */
export const { op: values, as: valuesAs } = defineOp("rule.values", "query", async env => {
  const vf = valueRecord((await myRule(env)).ruleKey);
  if (!vf) throw new OpFailure("Your rule has no value function on this deployment.");
  return { points: curveOf(vf) };
});

/** What one score is worth under the caller's rule: bits and their interval (hi is Infinity past the last knot). */
export const { op: worth, as: worthAs } = defineOp("rule.worth", "query", async (env, a) => {
  const w = worthOf((await myRule(env)).ruleKey, scoreFromWire(a.score));
  return { bits: w.bits, lo: w.lo, hi: Number.isFinite(w.hi) ? w.hi : null };
});
