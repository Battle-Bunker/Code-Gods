/** The key a rule's value function is stored and looked up under (values/, convex/v2/values.gen.ts). */
import { canonicalJson, hashHex, type ObjectType, type Variant } from "@workspace/v2-core";

export function ruleKey(type: ObjectType<unknown>, variant: Variant, familyId: string, params: unknown, tieBreaker: string): string {
  return `${type.id}@${type.version}/${variant.id}#${hashHex(canonicalJson(variant))}/${familyId}/${canonicalJson(params)}/tb=${tieBreaker}`;
}
