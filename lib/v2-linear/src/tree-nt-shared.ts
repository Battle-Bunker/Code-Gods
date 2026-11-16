/**
 * The number-theory tree families (tree-nt-*.ts; docs/engine-v2/tree-families/): what they share. Each is a tuple rule in
 * the owner's shape (design-principles.md principle 3b): (1) a size or level of the NEAREST target to a reading of the
 * line, (2) how close the reading is to that target, (3+) one or more further layers, each read in another representation
 * of the same line and defined by that target. Every family declares at least three alternative third layers and its
 * `chains`: the layer lists a rule can be dealt with (any length). UNDEALT: in no preset, with no value file.
 *
 * Parameters come from a large set (the owner, 16 November: "we want large sets as parameters not a finite number of
 * discrete options"): a family's `space` draws one, reads a typed-in one and says how many there are; `dealable` is a
 * short sample of it (hand-picked first, then seeded draws), so every consumer of a family's parameter list keeps working.
 */
import { Qn, q, ref, rng, type ElementRef, type ElementValue, type ParamSpace, type Q, type RuleFamily } from "@workspace/v2-core";
import { allUndefined, family, num, type Ctx, type L, type Shape } from "./layers.ts";
import { lineParams, type LineState } from "./line.ts";
import { isPrime } from "./numbers.ts";

// ---------------------------------------------------------------- parameter spaces

export type TreeNtFamily<P> = RuleFamily<LineState, P> & { readonly valuation: "tree"; readonly space: ParamSpace<P>; readonly chains: readonly string[] };

/** A whole number typed in a field, within [lo, hi], or why not. */
export function wholeField(text: string | undefined, name: string, lo: number, hi: number): number | { invalid: string } {
  const t = (text ?? "").trim().replace("−", "-");
  if (!/^-?\d{1,6}$/.test(t)) return { invalid: `${name}: a whole number from ${lo} to ${hi}` };
  const n = Number(t);
  return n < lo || n > hi ? { invalid: `${name}: a whole number from ${lo} to ${hi}` } : n;
}
/** A fraction typed in a field ("3/2", "-1/3", "2"), in lowest terms, or why not. */
export function fractionField(text: string | undefined, name: string): Q | { invalid: string } {
  const t = (text ?? "").trim().replace("−", "-");
  const m = /^(-?\d{1,6})(?:\s*\/\s*(\d{1,6}))?$/.exec(t);
  if (!m || (m[2] !== undefined && Number(m[2]) === 0)) return { invalid: `${name}: a fraction such as 3/2` };
  return q(BigInt(m[1]!), BigInt(m[2] ?? "1"));
}
/** `featured` first, then seeded draws, without repeats: a family's short dealable sample. */
export function sampleOf<P>(id: string, space: ParamSpace<P>, featured: readonly P[], n = 8): P[] {
  const out: P[] = [], seen = new Set<string>();
  const add = (p: P) => { const k = space.label(p); if (!seen.has(k)) { seen.add(k); out.push(p); } };
  featured.forEach(add);
  const r = rng(`tree-nt:${id}`);
  for (let i = 0; out.length < n && i < 200; i++) add(space.draw(r));
  return out;
}

// ---------------------------------------------------------------- numbers

/** The distance from x to the nearest of start, start ± step, start ± 2·step, … (step > 0). */
export function toStep(x: Q, start: Q, step: Q): Q {
  const y = Qn.sub(x, start), f = Qn.floor(Qn.div(y, step)), lo = Qn.sub(y, Qn.mul(step, q(f))), hi = Qn.sub(step, lo);
  return Qn.cmp(lo, hi) <= 0 ? lo : hi;
}
/** A fraction as a 12-year-old writes it: "16 1/7" for 113/7, "3" for 3, "2/5" for 2/5. */
export function mixed(x: Q): string {
  const a = Qn.abs(x), w = Qn.floor(a), r = Qn.sub(a, q(w)), s = Qn.sign(x) < 0 ? "-" : "";
  if (Qn.isZero(r)) return `${s}${w}`;
  return w === 0n ? `${s}${Qn.toWire(r)}` : `${s}${w} ${Qn.toWire(r)}`;
}
/** Whether a positive whole number's decimal digits end with `suffix`. */
export const endsWith = (n: bigint, suffix: string): boolean => n > 0n && n.toString().endsWith(suffix);

/**
 * The primes ending with `suffix` (and not skipped) around x: the nearest (the smaller on a tie), the next one above it,
 * and the next one below it (null when there is none). Exact; the search upward always ends (numbers.ts isSuffix).
 */
export function suffixPrimesNear(x: Q, suffix: string, skip: (p: bigint) => boolean = () => false): { at: bigint; up: bigint; down: bigint | null } {
  const M = 10n ** BigInt(suffix.length), sv = BigInt(suffix);
  const ok = (n: bigint) => endsWith(n, suffix) && isPrime(n) && !skip(n);
  const above = (from: bigint) => { let n = from; while (!ok(n)) n += M; return n; };
  const below = (from: bigint) => { for (let n = from; n > 0n; n -= M) if (ok(n)) return n; return null; };
  const k = Qn.floor(Qn.div(Qn.sub(x, q(sv)), q(M)));
  const base = sv + (k < 0n ? 0n : k) * M;   // the candidate at or below x (the first candidate when x is below them all)
  const lo = Qn.cmp(q(base), x) <= 0 ? below(base) : null, hi = above(Qn.cmp(q(base), x) <= 0 ? base + M : base);
  const at = lo !== null && Qn.cmp(Qn.sub(x, q(lo)), Qn.sub(q(hi), x)) <= 0 ? lo : hi;
  return { at, up: at === hi ? above(hi + M) : hi, down: at === hi ? lo : below(lo! - M) };
}

// ---------------------------------------------------------------- the family builder

export const NOTHING = { undefined: "nothing to read" } as const;
/** What a tree family reads of the line: the reading's size, where it was read, and the line's gradient and y-intercept. */
export interface TreeReading {
  readonly x: Q;
  readonly from: readonly ElementRef[];
  /** The reading's sign before its size was taken (reflections keep a score: targets are marked on the reading's own side). */
  readonly sign: number;
  readonly m: Q | null;
  readonly c: Q | null;
  /** A flat line read by its height instead of a crossing it does not have. */
  readonly flat?: boolean;
}
export interface Target {
  /** The primary: bigger is better. */
  readonly level: Q;
  /** The target itself, on the reading's scale. */
  readonly at: Q;
  /** The main term's label ("the target nearest the crossing 16 is 113/7"). */
  readonly why: string;
  /** Neighbouring targets to mark beside it (the next one up, the next one down). */
  readonly near: readonly Q[];
}
/** A further layer: it records its own term and its marks (its reading's focus, its working as a note). */
export interface Further<P, T extends Target> { readonly layer: L<P>; evaluate(ctx: Ctx, r: TreeReading, t: T, p: P): void }

export const lineMC = (ctx: Ctx) => ({ m: num(ctx.read(ref("si", "m"))), c: num(ctx.read(ref("si", "c"))) });
/**
 * The x-crossing's size, as Prime Landing (tuple) reads it: a flat line never crosses the x-axis and reads its height
 * instead (the coordinator's call, 16 Nov: a tilt to flat is then not a knock to nothing). Only y = 0 itself reads nothing.
 */
export function crossingOrHeight(ctx: Ctx): TreeReading | { none: ElementValue; from: ElementRef } {
  const xr = ref("crossing", "x0"), xv = ctx.read(xr), x = num(xv), mc = lineMC(ctx);
  if (x !== null) return { x: Qn.abs(x), sign: Qn.sign(x) < 0 ? -1 : 1, ...mc, from: [xr] };
  if (mc.m !== null && mc.c !== null && Qn.sign(mc.m) === 0 && Qn.sign(mc.c) !== 0) return { x: Qn.abs(mc.c), sign: Qn.sign(mc.c), flat: true, ...mc, from: [ref("si", "c")] };
  return { none: xv, from: xr };
}
/** Record a further layer's term, then its marks: its reading's focus and one note with its working. */
export function further(ctx: Ctx, id: string, value: Q | null, working: string, at: ElementRef, from: readonly ElementRef[]): void {
  ctx.term(id, working, value === null ? NOTHING : value, from);
  ctx.mark({ kind: "focus", ref: at, term: id });
  ctx.mark({ kind: "note", ref: at, term: id, text: working });
}
/** Every layer list a family with these further layers offers: closeness alone, with each third, and with each ordered pair. */
export function chainsOf(ids: readonly string[]): string[] {
  return ["closeness", ...ids.map(a => `closeness>${a}`), ...ids.flatMap(a => ids.filter(b => b !== a).map(b => `closeness>${a}>${b}`))];
}

export function treeFamily<P extends object, T extends Target>(o: {
  id: string; title: string; depends: string[]; rep: string;
  space: ParamSpace<P>; featured: readonly P[];
  main: (p: P) => string; mainTitle: string;
  close: (p: P) => string; closeTitle: string;
  read: (ctx: Ctx, p: P) => TreeReading | { none: ElementValue; from: ElementRef };
  /** The target nearest the reading's size x (the whole reading too, for a ruler that depends on the line). */
  nearest: (x: Q, p: P, r: TreeReading) => T;
  /** The second layer's distance, when it is not |reading − target| (the digit families: the gap between the first digits that differ). */
  closeness?: (x: Q, t: T) => { d: Q; why: string };
  /** Where the reading and a target are drawn (the annotation contract, #960): the measure's start, a target's element. */
  /** null: the reading has no point on the plane to draw (a sum, an area): its working is a note on the reading. */
  draw: (r: TreeReading, p: P) => { from: ElementRef; target: (at: Q) => ElementRef } | null;
  thirds: readonly Further<P, T>[];
}): TreeNtFamily<P> {
  const shape: Shape<P> = {
    main: { id: "target", title: o.mainTitle, rep: o.rep, sense: "max", sentence: o.main },
    tieBreakers: [{ id: "closeness", title: o.closeTitle, rep: o.rep, sense: "min", sentence: o.close } as L<P>, ...o.thirds.map(t => t.layer)],
  };
  const sample = sampleOf(o.id, o.space, o.featured);
  const f = family<P>(o.id, o.title, o.depends, shape, v => (lineParams(v).domain === "Q" ? sample : []), (ctx, p) => {
    const r = o.read(ctx, p);
    if ("none" in r) return allUndefined(ctx, shape, r.none, r.from);
    const t = o.nearest(r.x, p, r);
    ctx.term("target", t.why, t.level, r.from);
    const own = o.closeness?.(r.x, t), d = own ? own.d : Qn.abs(Qn.sub(r.x, t.at));
    ctx.term("closeness", own ? own.why : Qn.isZero(d) ? `on ${mixed(t.at)}` : `${mixed(d)} from ${mixed(t.at)}`, d, r.from);
    // Marks, each with its layer's term; a mark on a view outside depends is drawn, never read or charged (#1022).
    const cite = (x: ElementRef) => { if (o.depends.includes(x.rep)) ctx.read(x); return x; };
    const mk = o.draw(r, p), signed = (v: Q) => (r.sign < 0 ? Qn.neg(v) : v);
    ctx.mark({ kind: "focus", ref: r.from[0]!, term: "target" });
    if (mk) {
      const tgt = cite(mk.target(signed(t.at)));
      ctx.mark({ kind: "candidate", ref: tgt, term: "target" });
      for (const n of t.near) ctx.mark({ kind: "candidate", ref: cite(mk.target(signed(n))), term: "target" });
      ctx.mark({ kind: "measure", from: cite(mk.from), to: tgt, term: "closeness" });
    } else ctx.mark({ kind: "note", ref: r.from[0]!, term: "closeness", text: `${mixed(r.x)}: the target is ${mixed(t.at)}` });
    for (const th of o.thirds) th.evaluate(ctx, r, t, p);
  });
  return { ...f, valuation: "tree" as const, space: o.space, chains: chainsOf(o.thirds.map(t => t.layer.id)) };
}

// ---------------------------------------------------------------- shared by the later tree families

/** A reading computed from the gradient and the y-intercept (read in y = mx + c): null where the line has none. */
export function siReading(ctx: Ctx, of: (m: Q, c: Q) => Q | null, why: string): TreeReading | { none: ElementValue; from: ElementRef } {
  const mr = ref("si", "m"), cr = ref("si", "c"), mv = ctx.read(mr), cv = ctx.read(cr), m = num(mv), c = num(cv);
  if (m === null || c === null) return { none: m === null ? mv : cv, from: m === null ? mr : cr };
  const x = of(m, c);
  if (x === null) return { none: { kind: "undefined", reason: why }, from: mr };
  return { x: Qn.abs(x), sign: Qn.sign(x) < 0 ? -1 : 1, m, c, from: [mr, cr] };
}
/** The y-intercept's size as a reading (a vertical line has none). */
export function interceptReading(ctx: Ctx): TreeReading | { none: ElementValue; from: ElementRef } {
  const cr = ref("si", "c"), cv = ctx.read(cr), c = num(cv);
  if (c === null) return { none: cv, from: cr };
  return { x: Qn.abs(c), sign: Qn.sign(c) < 0 ? -1 : 1, m: num(ctx.read(ref("si", "m"))), c, from: [cr] };
}
/** The x-crossing of y = mx + c (null for a flat line). */
export const crossingOf = (m: Q, c: Q): Q | null => (Qn.sign(m) === 0 ? null : Qn.neg(Qn.div(c, m)));
/** |log2(|x|)| as an exact rational to a millionth: how many doublings x is from 1 (null for 0). */
export function doublingsFrom1(x: Q): Q | null {
  if (Qn.sign(x) === 0) return null;
  const lb = (b: bigint) => { const L = b.toString(2).length; return L <= 1000 ? Math.log2(Number(b)) : (L - 53) + Math.log2(Number(b >> BigInt(L - 53))); };
  const a = Qn.abs(x), v = Math.abs(lb(a.n) - lb(a.d));
  return q(BigInt(Math.round(v * 1e6)), 1_000_000n);
}
/**
 * The rung nearest x on an increasing ladder at(1) < at(2) < … without end (the higher on a tie), with its neighbours;
 * `skip` leaves rungs out (at least one of every two consecutive rungs must be kept).
 */
export function nearestOn(x: Q, at: (n: bigint) => Q, skip: (n: bigint) => boolean = () => false): { n: bigint; at: Q; up: Q; down: Q | null } {
  let lo = 1n, hi = 2n;
  if (Qn.cmp(at(1n), x) > 0) hi = 1n, lo = 0n;
  else { while (Qn.cmp(at(hi), x) <= 0) { lo = hi; hi *= 2n; } while (hi - lo > 1n) { const mid = (lo + hi) / 2n; if (Qn.cmp(at(mid), x) <= 0) lo = mid; else hi = mid; } }
  // at(lo) ≤ x < at(hi = lo + 1); step outward past skipped rungs.
  let a = lo, b = lo + 1n;
  while (a >= 1n && skip(a)) a--;
  while (skip(b)) b++;
  const pick = a < 1n || Qn.cmp(Qn.sub(at(b), x), Qn.sub(x, at(a))) <= 0 ? b : a;
  let up = pick + 1n; while (skip(up)) up++;
  let down: bigint | null = pick - 1n; while (down >= 1n && skip(down)) down--;
  return { n: pick, at: at(pick), up: at(up), down: down >= 1n ? at(down) : null };
}
