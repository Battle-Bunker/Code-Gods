/** `rule.*`: the caller's private rule, its ladder and a level's rarity. */
import { OpFailure } from "@workspace/v2-affordances";
import { defineOp, seated } from "./define";

async function myRule(env: Parameters<typeof seated>[0]) {
  const { game, member } = seated(env);
  const r = await env.ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", member._id)).unique();
  if (!r) throw new OpFailure("Your rule has not been dealt yet.");
  return r;
}
const rungs = (r: { ladder: { level: number; label: string; rarityBits: number; layer?: string }[] }) =>
  r.ladder.map(({ level, label, rarityBits, layer }) => ({ level, label, rarityBits, ...(layer ? { layer } : {}) }));

export const { op: explain, as: explainAs } = defineOp("rule.explain", "query", async env => {
  const r = await myRule(env);
  return {
    family: r.family, params: r.params ?? {}, layers: r.layers, card: r.card, depends: r.depends, ladder: rungs(r),
    wonByBid: r.handicap !== undefined ? { handicap: r.handicap } : null,
  };
});

export const { op: ladder, as: ladderAs } = defineOp("rule.ladder", "query", async env => ({ rungs: rungs(await myRule(env)) }));

export const { op: rarity, as: rarityAs } = defineOp("rule.rarity", "query", async (env, a) => {
  const r = await myRule(env);
  const rung = r.ladder.find(x => x.level === a.level);
  if (!rung) throw new OpFailure(`Your rule has levels 0 to ${r.ladder.length - 1}.`);
  return { level: rung.level, rarityBits: rung.rarityBits };
});
