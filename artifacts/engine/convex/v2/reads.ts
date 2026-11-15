/**
 * A human's reads of an object (spec §3.1, §6.2): the same answers an agent pays for, through the same engine host
 * (lib/v2-agents EngineHost), free for the human; each carries `bits`, what an agent would pay. A seated reader is
 * answered under their own rule (a score, a quote's score after); a spectator's reads need no rule.
 */
import { knownOf, readsKnowledge } from "./knowledge.ts";
import { OpFailure } from "@workspace/v2-affordances";
import { EngineHost } from "@workspace/v2-agents/pure";
import { rng, whichBits } from "@workspace/v2-core";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { decode, typeOf, variantOf } from "./world.ts";

export async function objectIn(ctx: QueryCtx, game: Doc<"v2Games">, objectId: string, memberId?: Id<"v2Members">) {
  const id = ctx.db.normalizeId("v2Objects", objectId);
  const object = id ? await ctx.db.get(id) : null;
  if (!object || object.gameId !== game._id) throw new OpFailure(`No object ${objectId} in this game.`, "objects.list");
  // Paid observation (knowledge.ts): a seated player reads the object as they were last told it.
  if (memberId && readsKnowledge(game, memberId)) {
    const k = await knownOf(ctx, object._id, memberId);
    if (k) return { object, state: k.state };
  }
  const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", object._id)).unique())!;
  return { object, state: st.state };
}

/** The engine host on an object's state under the reader's rule (or any dealt rule, for a reader without one). */
export async function hostFor(ctx: QueryCtx, game: Doc<"v2Games">, member: Doc<"v2Members"> | null, wire: string, energy = 0) {
  const own = member && await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", member._id)).unique();
  const rule = own ?? await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id)).first();
  if (!rule) throw new OpFailure("No rule has been dealt in this game yet.");
  return new EngineHost({ type: typeOf(game.variant), variant: variantOf(game.variant), state: decode(wire, game.variant), rule: { family: rule.family, params: rule.params, tieBreaker: rule.tieBreaker }, energy });
}

/** Asks the host, as an agent would, and returns its answer (a host refusal is the caller's mistake). */
export function ask(host: EngineHost<unknown>, request: Record<string, unknown>): any {
  const reply = host.handle(request as never, { hostCallsLeft: 64 } as never);
  if (!reply.ok) throw new OpFailure(reply.error);
  return reply.result;
}

/** A representation's mutators: id, the views it belongs to, its arguments' names and code, its base "which" bits. */
export function mutatorsOf(rep: string, variantId: string) {
  const variant = variantOf(variantId), type = typeOf(variantId);
  if (!type.representations.some(r => r.id === rep)) throw new OpFailure(`No representation ${rep}.`, `One of: ${type.representations.map(r => r.id).join(", ")}.`);
  return type.mutators.filter(m => m.reps.includes(rep) && variant.mutators.includes(m.id)).map(m => {
    const code = m.args(variant);
    // Every argument value up to 12 bits (cheapest first), as on the wire: a sample of one call would show one shape only.
    let combos = code.enumerate ? [...code.enumerate(12)].map(a => code.encode(a)) : [];
    if (!combos.length) {
      const r = rng("arg-names", m.id);
      for (let i = 0; i < 256 && !combos.length; i++) { const a = code.sample(r); if (a !== null) combos = [code.encode(a)]; }
    }
    const domain = (variant.params as { argDomain?: string }).argDomain === "Q" ? "rational" : "integer";
    // A named argument (a cell, a line, a box, an axis) is a choice, a number the variant's number domain, an argument that
    // takes either both; one a move's other shape leaves out is optional (a fold: x0 and s, or mirror).
    const isNumber = (w: string) => /^-?\d+(\/\d+)?$/.test(w);
    const names = [...new Set(combos.flatMap(c => Object.keys(c)))];
    const codeOf = (name: string) => {
      const ws = combos.filter(c => name in c).map(c => c[name]!);
      const nums = ws.some(isNumber), words = ws.some(w => !isNumber(w));
      const kind = nums && words ? `${domain} or choice` : nums ? domain : ws.every(w => /^[\w-]+$/.test(w)) ? "choice" : "line a,b,c";
      return combos.every(c => name in c) ? kind : `${kind}, optional`;
    };
    // Each argument said for a person, from the mutator's own help (the same words What if shows).
    const help = m.argHelp?.(variant) ?? {};
    return { id: m.id, reps: [...m.reps], args: names.map(name => ({ name, code: codeOf(name), ...help[name] })), baseBits: whichBits(variant, m.id), effect: m.title };
  });
}
