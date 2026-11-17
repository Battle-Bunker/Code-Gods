/**
 * A game's variant and object type, and its states' wire form: pure, and without valuing anything, so a module that
 * only reads or writes states (knowledge.ts, playState.ts) does not load valuation (test/unit/v2-values-load.test.ts).
 * world.ts re-exports these.
 */
import { withPhysics, type ObjectType, type Variant } from "@workspace/v2-core";
import { physicsForVariant } from "@workspace/v2-economy";
import { findVariant } from "@workspace/v2-valuation";

const withSettings = new Map<string, Variant>();
/** A game's variant with its configuration's physics settings (gravity, estimator starts, newborn sizes). */
export const variantOf = (id: string): Variant => {
  let v = withSettings.get(id);
  if (!v) {
    const base = findVariant(id).variant, physics = physicsForVariant(id);
    v = physics ? withPhysics(base, physics) : base;
    withSettings.set(id, v);
  }
  return v;
};
/** The object type a variant belongs to (lines, grids): every state, birth and host of a game goes through it. */
export const typeOf = (variantId: string): ObjectType<unknown> => findVariant(variantId).type as ObjectType<unknown>;
export const decode = (wire: string, variantId: string): unknown => typeOf(variantId).decode(wire);
export const encode = (state: unknown, variantId: string): string => typeOf(variantId).encode(state);
