/** `object.*`: reads of an object (free for a human; `bits` is what an agent pays), quotes and scores (reads.ts). */
import { defineOp, inGame, seated } from "./define";
import { ask, hostFor, objectIn } from "../reads.ts";
import { encode } from "../world.ts";

export const { op: read, as: readAs } = defineOp("object.read", "query", async (env, a) => {
  const { game, member } = inGame(env);
  const { state } = await objectIn(env.ctx, game, a.objectId);
  const r = ask(await hostFor(env.ctx, game, member, state), { op: "view", rep: a.rep, site: a.site ?? 0 });
  return { rep: r.rep, site: r.site, elements: r.elements, bits: r.bits };
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
  const after = priced.valid ? ask(await hostFor(env.ctx, game, member, encode(priced.result as never)), { op: "myScore" }) : null;
  return { valid: q.valid, ...(q.reason ? { reason: q.reason } : {}), bits: q.bits, total: q.total, charge: q.charge,
    after: after ? { score: after.score, level: after.level, top: after.top, terms: after.terms } : null };
});

export const { op: score, as: scoreAs } = defineOp("object.score", "query", async (env, a) => {
  const { game, member } = seated(env);
  const { object, state } = await objectIn(env.ctx, game, a.objectId);
  const s = ask(await hostFor(env.ctx, game, member, state), { op: "myScore" });
  const value = await env.ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", object._id).eq("memberId", member._id)).unique();
  return { score: s.score, level: s.level, top: s.top, terms: s.terms, rarityBits: value?.rarityBits ?? 0, points: value?.points ?? 0 };
});
