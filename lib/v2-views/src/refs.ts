/** Element refs as the views use them: which marks belong to a representation, and what an element means. */
import { elementDecl, refKey, type ElementRef, type Mark, type ObjectType } from "@workspace/v2-core";

/** Every element ref a mark cites. */
export function markRefs(m: Mark): readonly ElementRef[] {
  return m.kind === "measure" ? [m.from, m.to] : [m.ref];
}

/** The term a mark is labelled with, if any. */
export function markTerm(m: Mark): string | undefined {
  return m.kind === "measure" ? m.term : m.kind === "candidate" ? m.term : undefined;
}

/** The marks a representation draws: those whose refs all belong to it (a measure needs both ends in it). */
export function marksForRep(rep: string, marks: readonly Mark[]): readonly Mark[] {
  return marks.filter(m => markRefs(m).every(r => r.rep === rep));
}

/** A stable key for an element on one site: "si.m", "mach.out(q=3)" (the site prefix only with several lines). */
export const elKey = (r: ElementRef, multiSite = false): string => refKey(r, multiSite);

/**
 * What an element means across representations (spec §3, §11.3): `meaning` plus its arguments, so `si.y(q=2)` and
 * `mach.out(q=2)` share "valueAt(q=2)". Elements without a meaning mean only themselves.
 */
export function meaningKey<S>(type: ObjectType<S>, r: ElementRef): string {
  let meaning: string | undefined;
  try { meaning = elementDecl(type, r).meaning; } catch { meaning = undefined; }
  if (!meaning) return `@${refKey(r)}`;
  const args = r.args ? Object.values(r.args) : [];
  return args.length ? `${meaning}(${args.join(",")})` : meaning;
}
