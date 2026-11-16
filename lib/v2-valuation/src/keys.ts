/** The key a rule's value function is stored and looked up under (values/, convex/v2/valuesIndex.gen.ts). */
import { canonicalJson, hashHex, type ObjectType, type Variant } from "@workspace/v2-core";

export function ruleKey(type: ObjectType<unknown>, variant: Variant, familyId: string, params: unknown, tieBreaker: string): string {
  variant = valuesVariant(type, variant);
  return `${type.id}@${type.version}/${variant.id}#${valuesHash(variant)}/${familyId}/${canonicalJson(params)}/tb=${tieBreaker}`;
}

/**
 * What a value function depends on: the object type and the variant's params (the law π ∝ 2^−φ). Not its menu
 * (mutators, which code, birth mix): a change of menu keeps every stored value and its key (the coordinator, 15 Nov).
 */
export function valuesHash(variant: Variant): string {
  return hashHex(canonicalJson({ objectType: variant.objectType, params: variant.params }));
}

/** The variant whose value functions `variant` uses: itself, or the one it names in valuesOf (same type and params). */
export function valuesVariant(type: ObjectType<unknown>, variant: Variant): Variant {
  if (!variant.valuesOf) return variant;
  const v = type.variants.find(x => x.id === variant.valuesOf);
  if (!v) throw new Error(`${variant.id} takes its values from ${variant.valuesOf}, which ${type.id} does not have`);
  if (canonicalJson(v.params) !== canonicalJson(variant.params)) throw new Error(`${variant.id} cannot share ${v.id}'s values: their params differ`);
  return v;
}
