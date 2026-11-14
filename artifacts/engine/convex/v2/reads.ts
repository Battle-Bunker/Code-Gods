/**
 * A human's reads of an object (spec §3.1, §6.2): the same answers an agent pays for, through the same engine host
 * (lib/v2-agents EngineHost), free for the human; each carries `bits`, what an agent would pay. A seated reader is
 * answered under their own rule (a score, a quote's score after); a spectator's reads need no rule.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { EngineHost } from "@workspace/v2-agents/pure";
import { rng } from "@workspace/v2-core";
import { lineType } from "@workspace/v2-linear";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { decode, variantOf } from "./world.ts";

export async function objectIn(ctx: QueryCtx, game: Doc<"v2Games">, objectId: string) {
  const id = ctx.db.normalizeId("v2Objects", objectId);
  const object = id ? await ctx.db.get(id) : null;
  if (!object || object.gameId !== game._id) throw new OpFailure(`No object ${objectId} in this game.`, "objects.list");
  const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", object._id)).unique())!;
  return { object, state: st.state };
}

/** The engine host on an object's state under the reader's rule (or any dealt rule, for a reader without one). */
export async function hostFor(ctx: QueryCtx, game: Doc<"v2Games">, member: Doc<"v2Members"> | null, wire: string, energy = 0) {
  const own = member && await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", member._id)).unique();
  const rule = own ?? await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id)).first();
  if (!rule) throw new OpFailure("No rule has been dealt in this game yet.");
  return new EngineHost({ type: lineType, variant: variantOf(game.variant), state: decode(wire), rule: { family: rule.family, params: rule.params, tieBreaker: rule.tieBreaker }, energy });
}

/** Asks the host, as an agent would, and returns its answer (a host refusal is the caller's mistake). */
export function ask(host: EngineHost<unknown>, request: Record<string, unknown>): any {
  const reply = host.handle(request as never, { hostCallsLeft: 64 } as never);
  if (!reply.ok) throw new OpFailure(reply.error);
  return reply.result;
}

/** A representation's mutators: id, the views it belongs to, its arguments' names and code, its base "which" bits. */
export function mutatorsOf(rep: string, variantId: string) {
  const variant = variantOf(variantId);
  if (!lineType.representations.some(r => r.id === rep)) throw new OpFailure(`No representation ${rep}.`, `One of: ${lineType.representations.map(r => r.id).join(", ")}.`);
  const which = Math.log2(variant.mutators.length);
  return lineType.mutators.filter(m => m.reps.includes(rep) && variant.mutators.includes(m.id)).map(m => {
    const code = m.args(variant), r = rng("arg-names", m.id);
    let names: string[] = [];
    for (let i = 0; i < 256 && names.length === 0; i++) { const a = code.sample(r); if (a !== null) names = Object.keys(code.encode(a)); }
    const domain = (variant.params as { argDomain?: string }).argDomain === "Q" ? "rational" : "integer";
    return { id: m.id, reps: [...m.reps], args: names.map(name => ({ name, code: domain })), baseBits: which, effect: m.title };
  });
}
