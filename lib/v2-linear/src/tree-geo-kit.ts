/**
 * What the geometry tree families (tree-geo-*.ts) share. Each is a tuple family in the owner's shape (design-principles.md
 * principle 3b): (1) the size of the target nearest a reading of the line, bigger is better; (2) how close the reading is
 * to it; (3) one of several alternative third parts, each defined by that same target and read in another
 * representation. A dealt rule is a chain "closeness>‹third›".
 *
 * Their parameter sets are too large to list (owner, 16 November: "large sets as parameters not a finite number of
 * discrete options"), so each family carries a `space`: a draw, a type-in parser and a size, with a filter under which
 * a target exists for every member. `dealable` returns a short showcase of the space (what the galleries list).
 */
import { Qn, q, type ElementRef, type Invalid, type Q, type Rng, type RuleFamily } from "@workspace/v2-core";
import type { LineState } from "./line.ts";
import { family, type Ctx, type Shape } from "./layers.ts";

/** A family's whole parameter space. */
export interface ParamSpace<P> {
  /** How many parameter sets `draw` can return. `parse` may accept more (any member that passes the filter). */
  readonly size: number;
  /** In words: what may be drawn and what may be typed. */
  readonly says: string;
  draw(rng: Rng): P;
  /** A typed parameter set ("d = 2, u = 3, v = 4", or the numbers alone in that order), or why it is not in the space. */
  parse(text: string): P | Invalid;
  /** How a parameter set is written; `parse` reads it back. */
  format(p: P): string;
}
export type GeoFamily<P> = RuleFamily<LineState, P> & { readonly valuation: "tree"; readonly space: ParamSpace<P> };

/** A space of whole-number fields: `check` returns why a set is outside it, or null. */
export function wholeSpace<P extends Record<string, number>>(o: { fields: readonly (keyof P & string)[]; size: number; says: string; draw(rng: Rng): P; check(p: P): string | null }): ParamSpace<P> {
  const format = (p: P) => o.fields.map(f => `${f} = ${p[f]}`).join(", ");
  return {
    size: o.size, says: o.says, format,
    draw: rng => { const p = o.draw(rng), why = o.check(p); if (why) throw new Error(`drew ${format(p)}: ${why}`); return p; },
    parse(text) {
      const named = [...text.matchAll(/([A-Za-z]\w*)\s*=\s*([-−]?\d{1,9})(?!\d)/g)];
      const bare = named.length ? [] : [...text.matchAll(/[-−]?\d{1,9}/g)].map(m => m[0]);
      const out: Record<string, number> = {};
      if (named.length) for (const m of named) out[m[1]!] = Number(m[2]!.replace("−", "-"));
      else o.fields.forEach((f, i) => { if (bare[i] !== undefined) out[f] = Number(bare[i]!.replace("−", "-")); });
      const missing = o.fields.filter(f => out[f] === undefined), extra = Object.keys(out).filter(k => !o.fields.includes(k));
      if (missing.length || extra.length || bare.length > o.fields.length) return { invalid: `write ${o.fields.map(f => `${f} = …`).join(", ")}` };
      const p = Object.fromEntries(o.fields.map(f => [f, out[f]!])) as P;
      const why = o.check(p);
      return why ? { invalid: why } : p;
    },
  };
}

/** A geometry tree family: valued down its tree, undealt, with its parameter space. */
export function geoFamily<P extends object>(o: { id: string; title: string; depends: string[]; shape: Shape<P>; showcase: P[]; space: ParamSpace<P>; evaluate: (ctx: Ctx, p: P) => void }): GeoFamily<P> {
  return { ...family<P>(o.id, o.title, o.depends, o.shape, o.showcase, o.evaluate), valuation: "tree", space: o.space };
}

export const gcdN = (a: number, b: number): number => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
/** A fraction as a card writes it: "3/5", "2". */
export const frac = (n: number | bigint, d: number | bigint = 1): string => Qn.toWire(q(BigInt(n), BigInt(d)));
/** The first few of a ladder, for a card: "1/2, 1, 3/2, …". */
export const firstFew = (at: (n: number) => Q, count = 4): string => `${Array.from({ length: count }, (_, i) => Qn.toWire(at(i + 1))).join(", ")}, …`;

/**
 * The rung nearest x on a ladder at(1) < at(2) < … without end (the higher on a tie). Every x has one: below the first
 * rung it is the first.
 */
export function nearestRung(x: Q, at: (n: bigint) => Q): { n: bigint; at: Q; next: Q } {
  let lo = 1n, hi = 2n;
  if (Qn.cmp(at(1n), x) >= 0) return { n: 1n, at: at(1n), next: at(2n) };
  while (Qn.cmp(at(hi), x) <= 0) { lo = hi; hi *= 2n; }
  while (hi - lo > 1n) { const mid = (lo + hi) / 2n; if (Qn.cmp(at(mid), x) <= 0) lo = mid; else hi = mid; }
  // at(lo) ≤ x < at(lo + 1)
  const below = at(lo), above = at(lo + 1n);
  return Qn.cmp(Qn.sub(above, x), Qn.sub(x, below)) <= 0 ? { n: lo + 1n, at: above, next: at(lo + 2n) } : { n: lo, at: below, next: above };
}
export const dist = (a: Q, b: Q): Q => Qn.abs(Qn.sub(a, b));
export const W = Qn.toWire;
/**
 * A mark's element: one in a representation the family depends on is read first (the engine's rule); one outside is
 * drawn from the state the player already holds, never read or charged (#1022).
 */
export const citer = (ctx: Ctx, depends: readonly string[]) => (r: ElementRef): ElementRef => { if (depends.includes(r.rep)) ctx.read(r); return r; };
