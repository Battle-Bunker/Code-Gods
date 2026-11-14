/** The key a rule's value function is stored and looked up under (values/, convex/v2/values.gen.ts). */
import { canonicalJson, hashHex, type ObjectType, type Variant } from "@workspace/v2-core";

export function ruleKey(type: ObjectType<unknown>, variant: Variant, familyId: string, params: unknown, tieBreaker: string): string {
  variant = valuesVariant(type, variant);
  return `${type.id}@${type.version}/${variant.id}#${hashHex(canonicalJson(variant))}/${familyId}/${canonicalJson(params)}/tb=${tieBreaker}`;
}

/** The variant whose value functions `variant` uses: itself, or the one it names in valuesOf (same type and params). */
export function valuesVariant(type: ObjectType<unknown>, variant: Variant): Variant {
  if (!variant.valuesOf) return variant;
  const v = type.variants.find(x => x.id === variant.valuesOf);
  if (!v) throw new Error(`${variant.id} takes its values from ${variant.valuesOf}, which ${type.id} does not have`);
  if (canonicalJson(v.params) !== canonicalJson(variant.params)) throw new Error(`${variant.id} cannot share ${v.id}'s values: their params differ`);
  return v;
}
