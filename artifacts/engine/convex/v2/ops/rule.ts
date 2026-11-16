/** `rule.*`: the caller's private rule and what its scores are worth (its value function, owner decision 23). */
import { OpFailure } from "@workspace/v2-affordances";
import { scoreFromWire } from "@workspace/v2-core";
import { valueRecord, worthOf } from "../values";
import { scopeOf } from "../world";
import { dealablePool, familyOf } from "../deal";
import { presetOf } from "../presets";
import { callerOf, defineOp, inGame, seated } from "./define";
import { makeFunctionReference } from "convex/server";
import { fitGame, fitRefusal, observations, FIT_MAX_OBSERVATIONS, type FitContext, type FitRow } from "../fit";

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
    defence: r.defence ? { family: r.defence.family, params: (r.defence.params ?? {}) as Record<string, unknown>, card: r.defence.card } : null,
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

type FitCtx = { refused: string } | FitContext;
const FIT_CTX = makeFunctionReference<"query", { userId: string; scope: unknown }, FitCtx>("v2/boardAt:fitContext");
type Chunk = { refused: string } | { rows: FitRow[]; cursor: string | null };
const CHUNK = makeFunctionReference<"query", { userId: string; scope: unknown; cursor: string | null }, Chunk>("v2/boardAt:logChunk");
/** Log pages a fit reads at most, newest first (100 rows each; FIT_MAX_OBSERVATIONS bounds what it keeps). */
const FIT_PAGES = 10;

/**
 * Which rules the others hold (v1's fit_utility_mixture; owner-decisions call 36), from the others' summed bits the
 * caller has seen: a posterior over sets of rules, each family's chance, and the least-squares spectrum. Lines with
 * noise σ ≥ 8 only (fit.ts). A one-shot action: it reads the caller's log pages, never a subscription.
 */
export const { op: fit, as: fitAs } = defineOp("rule.fit", "action", async (env, a) => {
  const c = callerOf(env);
  const g: FitCtx = await env.ctx.runQuery(FIT_CTX, { userId: c.userId!, scope: c.scope });
  if ("refused" in g) throw new OpFailure(g.refused);
  const why = fitRefusal(g);
  if (why) throw new OpFailure(why);
  const rows: FitRow[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < FIT_PAGES; pages++) {
    const chunk: Chunk = await env.ctx.runQuery(CHUNK, { userId: c.userId!, scope: c.scope, cursor });
    if ("refused" in chunk) throw new OpFailure(chunk.refused);
    rows.push(...chunk.rows);
    if (chunk.cursor === null || observations(rows).length >= FIT_MAX_OBSERVATIONS) break;
    cursor = chunk.cursor;
  }
  if (observations(rows).length === 0) throw new OpFailure("Nothing to fit yet: no object has shown you the others' bits.");
  return fitGame(g, rows, { hints: a.hints, exclude: a.exclude, top: a.top });
});
