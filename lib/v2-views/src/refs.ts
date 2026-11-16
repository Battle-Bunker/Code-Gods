/** Element refs as the views use them: which marks belong to a representation, and what an element means. */
import { elementDecl, refKey, representation, type ElementRef, type Mark, type ObjectType } from "@workspace/v2-core";

/** The game's own noun for an object of this type ("line", "grid"), never "object" (ux-lessons 2.5). */
export const nounOf = <S>(type: ObjectType<S>): string => type.id;

/** Every element ref a mark cites. */
export function markRefs(m: Mark): readonly ElementRef[] {
  return m.kind === "measure" ? [m.from, m.to] : [m.ref];
}

/** The term a mark is labelled with, if any. */
export function markTerm(m: Mark): string | undefined {
  return m.term;
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

/**
 * Projection by meaning (docs/engine-v2/annotations-design.md §4.2): the elements of the given representations that
 * mean what `r` means, with its arguments carried over by position (si.c → cart.yInt; table.y(x=2) →
 * cart.pointAtX(q=2); crossing.x0 → cart.xInt). Elements without a meaning project nowhere.
 */
export function projectRef<S>(type: ObjectType<S>, r: ElementRef, reps: readonly string[]): ElementRef[] {
  let meaning: string | undefined;
  try { meaning = elementDecl(type, r).meaning; } catch { return []; }
  if (!meaning) return [];
  const args = r.args ? Object.values(r.args) : [];
  const out: ElementRef[] = [];
  for (const id of reps) {
    if (id === r.rep) continue;
    let rep;
    try { rep = representation(type, id); } catch { continue; }
    for (const el of rep.elements) {
      if (el.meaning !== meaning || (el.params?.length ?? 0) !== args.length) continue;
      const a = el.params?.length ? Object.fromEntries(el.params.map((p, i) => [p.name, args[i]!])) : undefined;
      out.push({ rep: id, name: el.name, ...(a ? { args: a } : {}), ...(r.site !== undefined ? { site: r.site } : {}) });
    }
  }
  return out;
}
