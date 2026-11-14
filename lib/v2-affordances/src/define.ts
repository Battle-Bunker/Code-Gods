/** `affordance({...})`: declares one operation, keeping its id, params and result types for the generated surfaces. */
import { z } from "zod/v4";
import type { Affordance, Runs } from "./types.ts";

export function affordance<const Id extends string, I extends z.ZodObject, O extends z.ZodType, const R extends Runs>(a: Affordance<Id, I, O, R>): Affordance<Id, I, O, R> {
  return a;
}

// Shared parameter and result pieces. Rationals travel as strings "p/q" (spec §6.5).
export const obj = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
export const none = obj({});
export const ok = z.object({ ok: z.literal(true) });
export const id = z.string().min(1).max(128);
export const requestId = z.string().uuid()
  .describe("A fresh UUID per new intent; resend the identical call with the same id to retry: it is never applied twice.");
export const q = z.string().regex(/^-?\d+(\/[1-9]\d*)?$/).describe('An exact rational as "p/q" or an integer, e.g. "-3/4".');
export const rep = z.string().min(1).max(16).describe('A representation id of the object type, e.g. "si" (y = mx + c), "gen", "cart", "mach".');
export const site = z.number().int().min(0).max(7).optional().describe("Which line of a multi-line object (0 = the first); omit for one-line variants.");
export const language = z.enum(["python", "typescript"]);
export const source = z.string().min(1).max(16384).describe("Agent source defining agent(offer) and returning mutator calls (≤ 16 KiB).");
export const paging = {
  cursor: z.string().max(256).nullable().optional().describe("The nextCursor of the previous page; omit for the first page."),
  limit: z.number().int().min(1).max(100).default(20),
};
export const page = <T extends z.ZodType>(row: T) => z.object({ page: z.array(row), nextCursor: z.string().nullable() });

export const point = z.object({ x: q, y: q });
export const elementValue = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("number"), q }),
  z.object({ kind: z.literal("point"), x: q, y: q }),
  z.object({ kind: z.literal("segment"), from: point, to: point }),
  z.object({ kind: z.literal("symbol"), text: z.string() }),
  z.object({ kind: z.literal("undefined"), reason: z.string() }),
]);
export const call = obj({
  mutator: z.string().min(1).max(32).describe('A mutator id, e.g. "si.shift", "cart.pivot".'),
  args: z.record(z.string(), z.union([q, z.string().max(32)])).describe('Arguments by name: rationals as "p/q", choices as their name.'),
  site,
});
export const score = z.object({
  score: z.array(q.nullable()).nullable().describe("The rule score tuple (one entry per layer), compared lexicographically; null is WORST, a null entry an undefined layer."),
  level: z.number().int(), top: z.number().int(),
  terms: z.array(z.object({ id: z.string(), value: q.nullable() })),
});
export const rung = z.object({ level: z.number().int(), label: z.string(), rarityBits: z.number(), layer: z.string().optional().describe("The layer this rung belongs to.") });
