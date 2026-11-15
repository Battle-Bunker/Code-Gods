/**
 * Rule evaluation (spec §4.2): the score and the annotation come from the same recorded terms. A score component is
 * a recorded term's value; a mark may cite only elements read and terms recorded in the same evaluation.
 */
import type {
  ElementDecl, ElementRef, ElementValue, EvalContext, Evaluation, Mark, ObjectType, Representation, RuleFamily,
  Layer, Score, ScoreComponent, Term, TermId, TieBreaker, Undef, Variant,
} from "./contracts.ts";
import { cmp, from, neg, parse, toWire, type Q } from "./q.ts";

// ---------------------------------------------------------------- refs

/** Build a ref; arguments may be given as Q, integers or wire strings. */
export function ref(rep: string, name: string, args?: Readonly<Record<string, Q | number | bigint | string>>, site?: number): ElementRef {
  const out: { rep: string; name: string; site?: number; args?: Record<string, string> } = { rep, name };
  if (site !== undefined) out.site = site;
  if (args) {
    const a: Record<string, string> = {};
    for (const k of Object.keys(args).sort()) a[k] = toWire(from(args[k]!));
    out.args = a;
  }
  return out;
}

/** "si.m", "mach.out(q=3)", "L2:cart.yInt" (site 1; the prefix only when the object has several sites). */
export function refKey(r: ElementRef, multiSite = false): string {
  const args = r.args && Object.keys(r.args).length
    ? `(${Object.keys(r.args).sort().map(k => `${k}=${r.args![k]}`).join(",")})` : "";
  const site = multiSite && r.site !== undefined ? `L${r.site + 1}:` : "";
  return `${site}${r.rep}.${r.name}${args}`;
}

const repIndex = new WeakMap<ObjectType<any>, Map<string, { rep: Representation<any>; els: Map<string, ElementDecl<any>> }>>();
function index<S>(type: ObjectType<S>) {
  let ix = repIndex.get(type);
  if (!ix) {
    ix = new Map();
    for (const rep of type.representations) {
      const els = new Map<string, ElementDecl<S>>();
      for (const e of rep.elements) {
        if (els.has(e.name)) throw new Error(`Duplicate element ${rep.id}.${e.name}`);
        els.set(e.name, e);
      }
      if (ix.has(rep.id)) throw new Error(`Duplicate representation ${rep.id}`);
      ix.set(rep.id, { rep, els });
    }
    repIndex.set(type, ix);
  }
  return ix;
}

export function representation<S>(type: ObjectType<S>, id: string): Representation<S> {
  const r = index(type).get(id);
  if (!r) throw new Error(`Unknown representation ${id}`);
  return r.rep;
}

export function elementDecl<S>(type: ObjectType<S>, r: ElementRef): ElementDecl<S> {
  const e = index(type).get(r.rep)?.els.get(r.name);
  if (!e) throw new Error(`Unknown element ${refKey(r)}`);
  return e;
}

/** The value of one element (no recording; for views and queries). */
export function elementValue<S>(type: ObjectType<S>, state: S, r: ElementRef, site = 0): ElementValue {
  const decl = elementDecl(type, r);
  const wantParams = (decl.params ?? []).map(p => p.name).sort();
  const given = Object.keys(r.args ?? {}).sort();
  if (wantParams.join() !== given.join()) throw new Error(`${refKey(r)} takes arguments (${wantParams.join(", ")})`);
  const args: Record<string, Q> = {};
  for (const k of given) {
    const v = parse(r.args![k]!);
    const p = decl.params!.find(x => x.name === k)!;
    if (p.domain === "Z" && v.d !== 1n) throw new Error(`${refKey(r)}: ${k} must be a whole number`);
    args[k] = v;
  }
  return decl.value(state, r.site ?? site, args);
}

// ---------------------------------------------------------------- scores

/** null components rank last in their component. */
function cmpComponent(a: Q | null, b: Q | null): -1 | 0 | 1 {
  if (a === null) return b === null ? 0 : -1;
  if (b === null) return 1;
  return cmp(a, b);
}

/** Lexicographic; null (WORST) is below everything; on unequal lengths the common prefix decides, then the longer wins. */
export function compareScores(a: Score, b: Score): -1 | 0 | 1 {
  if (a === null) return b === null ? 0 : -1;
  if (b === null) return 1;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = cmpComponent(a[i]!, b[i]!);
    if (c !== 0) return c;
  }
  return a.length === b.length ? 0 : a.length > b.length ? 1 : -1;
}

export function scoreToWire(s: Score): (string | null)[] | null {
  return s === null ? null : s.map(x => (x === null ? null : toWire(x)));
}
export function scoreFromWire(w: readonly (string | null)[] | null): Score {
  return w === null ? null : w.map(x => (x === null ? null : parse(x)));
}

/** The separator of an ordered list of tie-breakers in a TieBreaker ("a>b": a, then b). */
export const TIE_SEP = ">";
/** A dealt rule's tie-breaker ids in order ([] for null; undefined stays undefined: the family's first). */
export function tieBreakerIds(tieBreaker: TieBreaker | undefined): readonly string[] | undefined {
  return tieBreaker === undefined ? undefined : tieBreaker === null ? [] : tieBreaker.split(TIE_SEP);
}
/** An ordered list of tie-breaker ids as a TieBreaker (null when empty). */
export const joinTieBreakers = (ids: readonly string[]): TieBreaker => (ids.length ? ids.join(TIE_SEP) : null);

/**
 * The layers of a dealt rule: the main layer, then its tie-breakers in order (any depth). `undefined` means the family's
 * first tie-breaker (or none); `null` means the main layer alone.
 */
export function ruleLayers<P>(family: RuleFamily<any, P>, tieBreaker?: TieBreaker): readonly Layer<P>[] {
  const ids = tieBreakerIds(tieBreaker) ?? (family.tieBreakers[0] ? [family.tieBreakers[0].id] : []);
  if (new Set(ids).size !== ids.length) throw new Error(`${family.id}: tie-breaker ${tieBreaker} repeats a layer`);
  return [family.main, ...ids.map(id => {
    const tb = family.tieBreakers.find(t => t.id === id);
    if (!tb) throw new Error(`${family.id} has no tie-breaker ${id}`);
    return tb;
  })];
}

/**
 * A goal card for a dealt rule: the main layer's sentence, then each tie-breaker's in order ("Tie-breaker: …", then
 * "Then: …" for a tertiary and deeper). Shared by the line, grid and pair families.
 */
export function cardText<P>(main: { sentence(p: P): string }, tieBreakers: readonly { id: string; sentence(p: P): string }[], p: P, tieBreaker: TieBreaker): string {
  // An id the family does not have adds nothing (the main layer's own id, e.g.), as the cards always did.
  const ts = (tieBreakerIds(tieBreaker) ?? []).flatMap(id => tieBreakers.filter(x => x.id === id));
  const parts = ts.map((t, i) => `${i === 0 ? "Tie-breaker" : "Then"}: ${t.sentence(p)}`);
  return [main.sentence(p), ...parts].join(" ");
}

/** The tie-breakers a family deals on a variant (Layer.dealtOn), in the family's order. */
export function tieBreakersOn<P>(family: RuleFamily<any, P>, variant: Variant): readonly Layer<P>[] {
  return family.tieBreakers.filter(t => t.dealtOn?.(variant) ?? true);
}

/** The id a dealt rule's key records: its tie-breakers in order joined by ">", or "none". */
export function tieBreakerId(family: RuleFamily<any, any>, tieBreaker?: TieBreaker): string {
  const ls = ruleLayers(family, tieBreaker);
  return ls.length > 1 ? ls.slice(1).map(l => l.id).join(TIE_SEP) : "none";
}

// ---------------------------------------------------------------- evaluation

const isUndef = (v: Q | Undef): v is Undef => typeof (v as Undef).undefined === "string";

class Context<S> implements EvalContext<S> {
  readonly reads = new Map<string, ElementRef>();
  readonly terms = new Map<TermId, Term>();
  readonly marks: Mark[] = [];
  readonly type: ObjectType<S>; readonly family: RuleFamily<S, unknown>; readonly state: S;
  readonly site: number; readonly variant: Variant; readonly sites: number;
  constructor(type: ObjectType<S>, family: RuleFamily<S, unknown>, state: S, site: number, variant: Variant, sites: number) {
    this.type = type; this.family = family; this.state = state; this.site = site; this.variant = variant; this.sites = sites;
  }
  private norm(r: ElementRef): ElementRef {
    return r.site === undefined ? { ...r, site: this.site } : r;
  }
  read(r: ElementRef): ElementValue {
    if (!this.family.depends.includes(r.rep)) throw new Error(`${this.family.id} reads ${r.rep}, which is not in its depends`);
    const n = this.norm(r);
    if (n.site! < 0 || n.site! >= this.sites) throw new Error(`${refKey(n)}: no such line`);
    this.reads.set(refKey(n, true), n);
    return elementValue(this.type, this.state, n, this.site);
  }
  private known(r: ElementRef): void {
    if (!this.reads.has(refKey(this.norm(r), true))) throw new Error(`${this.family.id} cites ${refKey(r)} without reading it`);
  }
  term(id: TermId, label: string, value: Q | Undef, fromRefs: readonly ElementRef[]): TermId {
    if (this.terms.has(id)) throw new Error(`${this.family.id}: term ${id} recorded twice`);
    for (const r of fromRefs) this.known(r);
    this.terms.set(id, { id, label, value, from: fromRefs.map(r => this.norm(r)) });
    return id;
  }
  mark(m: Mark): void {
    switch (m.kind) {
      case "focus": case "note": this.known(m.ref); break;
      case "candidate": this.known(m.ref); if (m.term !== undefined && !this.terms.has(m.term)) throw new Error(`mark cites unrecorded term ${m.term}`); break;
      case "measure":
        this.known(m.from); this.known(m.to);
        if (!this.terms.has(m.term)) throw new Error(`mark cites unrecorded term ${m.term}`);
        break;
    }
    this.marks.push(m.kind === "measure" ? { ...m, from: this.norm(m.from), to: this.norm(m.to) } : { ...m, ref: this.norm(m.ref) } as Mark);
  }
}

/**
 * Evaluate a rule on one site of a state. The score is made of the layers' terms (scoreOf): an undefined primary makes
 * it WORST; an undefined later layer ranks last in its own component.
 */
export function evaluateSite<S, P>(type: ObjectType<S>, family: RuleFamily<S, P>, params: P, state: S, variant: Variant, site = 0, tieBreaker?: TieBreaker): Evaluation {
  const sites = type.sites(state, variant);
  const ctx = new Context<S>(type, family as RuleFamily<S, unknown>, state, site, variant, sites);
  family.evaluate(ctx, params);
  for (const l of [family.main, ...family.tieBreakers]) if (!ctx.terms.has(l.id)) throw new Error(`${family.id} did not record layer ${l.id}`);
  const { score, components } = scoreOf(family, tieBreaker, id => ctx.terms.get(id)!.value);
  return { score, components, terms: [...ctx.terms.values()], marks: ctx.marks, reads: [...ctx.reads.values()] };
}

/**
 * A dealt rule's score from its layers' term values (by layer id): the utilities of the main layer, then the dealt
 * tie-breaker, each negated for "min", compared lexicographically with no saturation (owner decision 23); an undefined
 * main layer makes it WORST. evaluateSite makes every score this way, and exact sums that know a rule's terms use it too.
 */
export function scoreOf<P>(family: RuleFamily<any, P>, tieBreaker: TieBreaker | undefined,
  value: (layerId: string) => Q | Undef): { score: Score; components: ScoreComponent[] } {
  const layers = ruleLayers(family, tieBreaker);
  const score: (Q | null)[] = [];
  const components: ScoreComponent[] = [];
  let worst = false;
  layers.forEach((layer, j) => {
    const v = value(layer.id);
    components.push({ term: layer.id, sense: layer.sense });
    if (isUndef(v)) { if (j === 0) worst = true; score.push(null); return; }
    score.push(layer.sense === "max" ? v : neg(v));
  });
  return { score: worst ? null : score, components };
}

export interface ObjectEvaluation {
  /**
   * One site: that site's score. Several sites (line-z4): null for now. Per-line bits summed is the provisional plan for
   * a multi-line object's value, and it comes next.
   */
  readonly score: Score;
  /** One evaluation per site (line). */
  readonly sites: readonly Evaluation[];
}

/** Evaluate a rule on a whole object (spec §4.2, §12.6): every site, and the object's score (ObjectEvaluation.score). */
export function evaluateObject<S, P>(type: ObjectType<S>, family: RuleFamily<S, P>, params: P, state: S, variant: Variant, tieBreaker?: TieBreaker): ObjectEvaluation {
  const k = type.sites(state, variant);
  const sites = Array.from({ length: k }, (_, i) => evaluateSite(type, family, params, state, variant, i, tieBreaker));
  return { score: k === 1 ? sites[0]!.score : null, sites };
}
