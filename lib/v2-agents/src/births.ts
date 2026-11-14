/** Newborn objects (spec §2.4): a seeded walk from the origin, a sample every `birthMixSteps` steps after a burn-in. */
import { rng, walkStep, type ObjectType, type Variant } from "@workspace/v2-core";

export function births<S>(type: ObjectType<S>, variant: Variant, seed: string, count: number): S[] {
  const r = rng("births", seed);
  let s = type.origin(variant);
  const out: S[] = [];
  for (let i = 0; i < variant.birthMixSteps * 4; i++) s = walkStep(type, variant, s, r);   // burn-in
  while (out.length < count) {
    for (let i = 0; i < variant.birthMixSteps; i++) s = walkStep(type, variant, s, r);
    out.push(s);
  }
  return out;
}
