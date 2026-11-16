/**
 * A game's variant and object type, and its states' wire form: pure, and without valuing anything, so a module that
 * only reads or writes states (knowledge.ts, playState.ts) does not load valuation (test/unit/v2-values-load.test.ts).
 * world.ts re-exports these.
 */
import type { ObjectType } from "@workspace/v2-core";
import { findVariant } from "@workspace/v2-valuation";

export const variantOf = (id: string) => findVariant(id).variant;
/** The object type a variant belongs to (lines, grids): every state, birth and host of a game goes through it. */
export const typeOf = (variantId: string): ObjectType<unknown> => findVariant(variantId).type as ObjectType<unknown>;
export const decode = (wire: string, variantId: string): unknown => typeOf(variantId).decode(wire);
export const encode = (state: unknown, variantId: string): string => typeOf(variantId).encode(state);
