/**
 * Rule evaluation (spec §4.2): the score and the annotation come from the same recorded terms. A score component is
 * a recorded term's value; a mark may cite only elements read and terms recorded in the same evaluation.
 */
import type {
  ElementDecl, ElementRef, ElementValue, EvalContext, Evaluation, Mark, ObjectType, Representation, RuleFamily,
  Layer, Rung, Score, ScoreComponent, Term, TermId, TieBreaker, Undef, Variant,
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

// ---------------------------------------------------------------- scores and ladders

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

/** Whether a score meets a rung's threshold, compared on the threshold's components. */
export function meets(score: Score, threshold: Score): boolean {
  if (threshold === null) return true;
  if (score === null) return false;
  for (let i = 0; i < threshold.length; i++) {
    if (i >= score.length) return false;
    const c = cmpComponent(score[i]!, threshold[i]!);
    if (c !== 0) return c > 0;
  }
  return true;
}

/** The index of the highest rung met. Rung 0 must be WORST (everything). */
export function levelOf(score: Score, rungs: readonly Rung[]): number {
  if (rungs.length === 0 || rungs[0]!.score !== null) throw new Error("A ladder starts with the WORST rung");
  if (rungs.some(r => r.main !== undefined)) return jointLevelOf(score, rungs);
  let level = 0;
  for (let i = 1; i < rungs.length; i++) if (meets(score, rungs[i]!.score)) level = i;
  return level;
}

/**
 * The level on a joint ladder: the pair (main level, tie-breaker level) in lexicographic order. The main level is the
 * number of main thresholds met; at that main level the tie-breaker's rungs count; every rung of a lower main level is
 * met. Rungs are listed in that order, so the level is the last rung met.
 */
function jointLevelOf(score: Score, rungs: readonly Rung[]): number {
  if (score === null) return 0;
  let main = 0;
  for (const r of rungs) if (r.layer === 0 && r.score && cmpComponent(score[0] ?? null, r.score[0]!) >= 0) main = Math.max(main, r.main!);
  let level = 0;
  for (let i = 1; i < rungs.length; i++) {
    const r = rungs[i]!;
    const ok = r.layer === 0 ? r.main! <= main
      : r.main! < main || (r.main === main && score.length > 1 && cmpComponent(score[1] ?? null, r.score![1]!) >= 0);
    if (ok) level = i;
  }
  return level;
}

export function scoreToWire(s: Score): (string | null)[] | null {
  return s === null ? null : s.map(x => (x === null ? null : toWire(x)));
}
export function scoreFromWire(w: readonly (string | null)[] | null): Score {
  return w === null ? null : w.map(x => (x === null ? null : parse(x)));
}

/**
 * The layers of a dealt rule: the main layer, then the chosen tie-breaker. `undefined` means the family's first
 * tie-breaker (or none); `null` means the main layer alone.
 */
export function ruleLayers<P>(family: RuleFamily<any, P>, tieBreaker?: TieBreaker): readonly Layer<P>[] {
  const id = tieBreaker === undefined ? (family.tieBreakers[0]?.id ?? null) : tieBreaker;
  if (id === null) return [family.main];
  const tb = family.tieBreakers.find(t => t.id === id);
  if (!tb) throw new Error(`${family.id} has no tie-breaker ${id}`);
  return [family.main, tb];
}

/** The id a dealt rule's key records: the chosen tie-breaker, or "none". */
export function tieBreakerId(family: RuleFamily<any, any>, tieBreaker?: TieBreaker): string {
  const ls = ruleLayers(family, tieBreaker);
  return ls.length > 1 ? ls[1]!.id : "none";
}

function layerRungs<P>(layer: Layer<P>, params: P, variant: Variant, prefix: readonly Q[], index: number): Rung[] {
  const ts = layer.thresholds(params, variant);
  if (ts.length === 0) throw new Error(`layer ${layer.id} has no thresholds`);
  return ts.map(t => ({ score: [...prefix, layer.sense === "max" ? t : neg(t)], label: layer.rungLabel(t, params), layer: index }));
}
const topOf = <P,>(layer: Layer<P>, params: P, variant: Variant): Q => {
  const ts = layer.thresholds(params, variant);
  const t = ts[ts.length - 1]!;
  return layer.sense === "max" ? t : neg(t);
};

/** How many of the tie-breaker's rungs a main level below the top keeps: evenly spaced, to keep calibration tractable. */
export const COARSE_TIE_RUNGS = 3;

/**
 * The ladder of one line (spec §4.4). One layer: rung 0 is everything, then the main layer's thresholds. With a
 * tie-breaker the ladder is joint: the pairs (main level, tie-breaker level) in lexicographic order, so a better
 * tie-breaker raises a line's level at every main level, by a little low on the ladder and by more near the top. At the
 * main layer's top the tie-breaker has all its rungs; below the top, COARSE_TIE_RUNGS of them, evenly spaced.
 */
export function ruleLadder<P>(family: RuleFamily<any, P>, params: P, variant: Variant, tieBreaker?: TieBreaker): readonly Rung[] {
  const layers = ruleLayers(family, tieBreaker);
  const main = layers[0]!;
  const mainRungs = layerRungs(main, params, variant, [], 0);
  if (layers.length === 1) return [{ score: null, label: "anything", layer: -1 }, ...mainRungs];
  if (layers.length > 2) throw new Error(`${family.id}: a dealt rule has a main layer and at most one tie-breaker (owner decision 14)`);
  const tie = layers[1]!;
  const tieTs = tie.thresholds(params, variant);
  const coarse = tieTs.length <= COARSE_TIE_RUNGS ? tieTs
    : Array.from({ length: COARSE_TIE_RUNGS }, (_, k) => tieTs[Math.floor(((k + 1) * tieTs.length) / (COARSE_TIE_RUNGS + 1))]!);
  const tieScore = (t: Q) => (tie.sense === "max" ? t : neg(t));
  const rungs: Rung[] = [{ score: null, label: "anything", layer: -1, main: 0 }];
  const n = mainRungs.length;
  for (let i = 0; i <= n; i++) {
    if (i > 0) rungs.push({ ...mainRungs[i - 1]!, main: i });
    const mainScore = i > 0 ? mainRungs[i - 1]!.score![0]! : null;
    const mainLabel = i > 0 ? mainRungs[i - 1]!.label : "anything";
    for (const t of i === n ? tieTs : coarse) {
      rungs.push({ score: [mainScore, tieScore(t)], label: `${mainLabel}; ${tie.rungLabel(t, params)}`, layer: 1, main: i });
    }
  }
  return rungs;
}

/** One single-component ladder per layer of the dealt rule: what a card shows as "main part: step 5 of 8". */
export function layerLadders<P>(family: RuleFamily<any, P>, params: P, variant: Variant, tieBreaker?: TieBreaker): readonly (readonly Rung[])[] {
  return ruleLayers(family, tieBreaker).map((layer, j) => [{ score: null, label: "anything", layer: -1 }, ...layerRungs(layer, params, variant, [], j)]);
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
 * Evaluate a rule on one site of a state. The score is made of the layers' terms, in ladder order: an undefined
 * primary makes it WORST; an undefined later layer ranks last in its own component; every layer but the last dealt one
 * saturates at its top.
 */
export function evaluateSite<S, P>(type: ObjectType<S>, family: RuleFamily<S, P>, params: P, state: S, variant: Variant, site = 0, tieBreaker?: TieBreaker): Evaluation {
  const layers = ruleLayers(family, tieBreaker);
  const sites = type.sites(state, variant);
  const ctx = new Context<S>(type, family as RuleFamily<S, unknown>, state, site, variant, sites);
  family.evaluate(ctx, params);
  for (const l of [family.main, ...family.tieBreakers]) if (!ctx.terms.has(l.id)) throw new Error(`${family.id} did not record layer ${l.id}`);
  const score: (Q | null)[] = [];
  const components: ScoreComponent[] = [];
  let worst = false;
  layers.forEach((layer, j) => {
    const t = ctx.terms.get(layer.id)!;
    components.push({ term: layer.id, sense: layer.sense });
    if (isUndef(t.value)) { if (j === 0) worst = true; score.push(null); return; }
    let c = layer.sense === "max" ? t.value : neg(t.value);
    // The main layer saturates at its top when a tie-breaker follows: beyond its top it only opens the tie-breaker, so
    // a state past it must not outrank, or skip the rungs of, the tie-breaker.
    if (j < layers.length - 1) {
      const top = topOf(layer, params, variant);
      if (cmp(c, top) > 0) c = top;
    }
    score.push(c);
  });
  return { score: worst ? null : score, components, terms: [...ctx.terms.values()], marks: ctx.marks, reads: [...ctx.reads.values()] };
}

export interface ObjectEvaluation {
  readonly score: Score;
  /** One evaluation per site (line). */
  readonly sites: readonly Evaluation[];
}

/**
 * Evaluate a rule on a whole object (spec §4.2, §12.6). One site: that site's score. Several: the sum of the sites'
 * levels on the line ladder, then the sites' primary components, best first. Its ladder is `objectLadder`.
 */
export function evaluateObject<S, P>(type: ObjectType<S>, family: RuleFamily<S, P>, params: P, state: S, variant: Variant, tieBreaker?: TieBreaker): ObjectEvaluation {
  const k = type.sites(state, variant);
  const sites = Array.from({ length: k }, (_, i) => evaluateSite(type, family, params, state, variant, i, tieBreaker));
  if (k === 1) return { score: sites[0]!.score, sites };
  const ladder = ruleLadder(family, params, variant, tieBreaker);
  let total = 0n;
  for (const e of sites) total += BigInt(levelOf(e.score, ladder));
  const ranked = sites.map(e => e.score).sort((a, b) => compareScores(b, a));
  const tail: (Q | null)[] = [];
  for (const s of ranked) if (s !== null) tail.push(s[0]!);
  return { score: [{ n: total, d: 1n }, ...tail], sites };
}

/**
 * The ladder an object's score is calibrated and looked up on: the line ladder when the object has one site; with k
 * sites, every total of per-line levels from 1 to k × (the line ladder's top).
 */
export function objectLadder<S, P>(type: ObjectType<S>, family: RuleFamily<S, P>, params: P, variant: Variant, tieBreaker?: TieBreaker): readonly Rung[] {
  const ladder = ruleLadder(family, params, variant, tieBreaker);
  const k = type.sites(type.origin(variant), variant);
  if (k === 1) return ladder;
  const top = ladder.length - 1;
  return [{ score: null, label: "anything", layer: -1 }, ...Array.from({ length: k * top }, (_, i) => ({
    score: [{ n: BigInt(i + 1), d: 1n }], label: `${i + 1} of ${k * top} steps over the ${k} lines`, layer: 0,
  }))];
}
