/**
 * From an evaluation to what a card shows (integration plan §3.1; owner decision 23): one part per score component
 * (main part, tie-breaker) as a contributor (contributors.ts: its source, reference, distance and ruler), the marks
 * that cite it, the worked computation, the object's utility and, given the rule's value function, its bits. No steps,
 * no ladders. Pure; no React.
 *
 * Never disagreeing: every number here is a recorded term or an element the rule read. Nothing is recomputed.
 */
import {
  elementDecl, elementValue, evaluateObject, refKey, representation, type ElementRef, type Evaluation, type Mark,
  type ObjectEvaluation, type ObjectType, type RuleFamily, type Score, type Term, type TieBreaker, type Undef, type Variant,
} from "@workspace/v2-core";
import { contributorsOf, type Contributor } from "./contributors.ts";
import { fmtTermValue, fmtValue, isUndef } from "./format.ts";
import { markTerm, nounOf } from "./refs.ts";
import { rendererFor } from "./scene.ts";

export interface RuleRef<S, P> {
  readonly type: ObjectType<S>;
  readonly family: RuleFamily<S, P>;
  readonly params: P;
  readonly variant: Variant;
  /** The dealt tie-breaker (default: the family's first; null: the main layer alone). */
  readonly tieBreaker?: TieBreaker;
}

/** A part of the dealt rule (main part, tie-breaker): its contributor (contributors.ts) and the marks that are its own. */
export interface Part extends Contributor {
  /** A tie-breaker's marks are those labelled with its term; the main part has every other mark. */
  readonly marks: readonly Mark[];
}

export interface SiteAnnotation {
  readonly site: number;
  readonly evaluation: Evaluation;
  readonly parts: readonly Part[];
  /** The worked computation: the elements read (static ones), then the terms, as "label = value" lines. */
  readonly working: readonly string[];
}

export interface Annotation {
  /** The game's noun for the object ("line", "grid"): every sentence about it uses this word. */
  readonly noun: string;
  readonly score: Score;
  /** The rule's utility of the object (owner decision 23): what its value function prices. */
  readonly utility: Score;
  /** The object's rarity in bits for this rule, when the caller passed the rule's value function. */
  readonly bits: number | null;
  /** WORST: the reason (an undefined term's sentence). */
  readonly worst: string | null;
  readonly sites: readonly SiteAnnotation[];
}

const PART_NAMES = ["main part", "tie-breaker", "second tie-breaker", "third tie-breaker"];
export const partName = (i: number): string => PART_NAMES[i] ?? `tie-breaker ${i}`;

/** The terms the family scored, in order (WORST still names them: the undefined one is among them). */
function components(e: Evaluation): { term: Term; sense: "max" | "min" }[] {
  const byId = new Map(e.terms.map(t => [t.id, t]));
  return e.components.map(c => ({ term: byId.get(c.term)!, sense: c.sense }));
}


function annotateSite<S, P>(rule: RuleRef<S, P>, e: Evaluation, site: number, state: S): SiteAnnotation {
  const comps = components(e);
  const cs = contributorsOf(rule, state, e, site);
  const parts: Part[] = cs.map((c, i) => ({
    ...c,
    // A tie-breaker owns the marks labelled with its term; the main part owns the rest (the picture of the rule).
    marks: i === 0 ? e.marks.filter(m => !comps.slice(1).some(t => markTerm(m) === t.term.id)) : e.marks.filter(m => markTerm(m) === c.term),
  }));
  const working: string[] = [];
  // A rule that reads most of a representation's coordinates (every cell of a board) gets that representation in one
  // line ("the board: 3 1 1 3 / …"), not one line per coordinate.
  const coords = new Map<string, Set<string>>();
  for (const r of e.reads) {
    let role;
    try { role = elementDecl(rule.type, r).role; } catch { continue; }
    if (role === "coordinate") coords.set(r.rep, (coords.get(r.rep) ?? new Set()).add(refKey(r)));
  }
  const whole = new Set([...coords].filter(([, ks]) => ks.size >= WHOLE_REP).map(([rep]) => rep));
  for (const rep of whole) working.push(`${representation(rule.type, rep).title}: ${sceneText(rule.type, state, rep, site)}`);
  for (const r of e.reads) {
    let decl;
    try { decl = elementDecl(rule.type, r); } catch { continue; }
    if (decl.role === "dynamic" && decl.kind !== "number") continue; // drawn, not computed with
    if (decl.role === "coordinate" && whole.has(r.rep)) continue;
    const v = fmtValue(elementValue(rule.type, state, r, site));
    working.push(`${decl.label}${argText(r)} = ${v}`);
  }
  for (const t of e.terms) working.push(`${t.label} = ${fmtTermValue(t.value)}`);
  return { site, evaluation: e, parts, working };
}

/** Coordinates read from one representation at or past which the working writes the representation whole. */
const WHOLE_REP = 9;

/** A representation's plain text by its scene's renderer (registered by render/register.ts), or its values in a row. */
function sceneText<S>(type: ObjectType<S>, state: S, rep: string, site: number): string {
  const r = representation(type, rep);
  const values = (x: ElementRef) => elementValue(type, state, x, site);
  const renderer = rendererFor(r.scene);
  if (renderer) return renderer.text(r.layout(state, site), values, rep);
  return r.elements.filter(d => d.role === "coordinate").map(d => fmtValue(values({ rep, name: d.name }))).join(" ");
}

const argText = (r: ElementRef) => (r.args && Object.keys(r.args).length ? ` (${Object.entries(r.args).map(([k, v]) => `${k} = ${v.replace("-", "−")}`).join(", ")})` : "");

export interface AnnotateOptions {
  /** The rule's value function (bits of a utility), built once with v2-valuation's valueLookup from the rule's record. */
  readonly value?: (utility: Score) => number;
}

/** Annotate a rule's evaluation of a state. The evaluation is v2-core's; this only arranges it. */
export function annotate<S, P>(rule: RuleRef<S, P>, state: S, opts: AnnotateOptions = {}): Annotation {
  const ev: ObjectEvaluation = evaluateObject(rule.type, rule.family, rule.params, state, rule.variant, rule.tieBreaker);
  return annotateEvaluation(rule, state, ev, opts);
}

export function annotateEvaluation<S, P>(rule: RuleRef<S, P>, state: S, ev: ObjectEvaluation, opts: AnnotateOptions = {}): Annotation {
  const sites = ev.sites.map((e, i) => annotateSite(rule, e, i, state));
  let worst: string | null = null;
  if (ev.score === null && ev.sites.length === 1) {
    const u = ev.sites.flatMap(e => e.terms).find(t => isUndef(t.value));
    worst = u ? (u.value as Undef).undefined : `this rule does not score this ${nounOf(rule.type)}`;
  }
  // The object's score; a multi-site object has none yet (per-line bits summed comes next), and one site's never stands for it.
  const utility = ev.score;
  const bits = opts.value && ev.sites.length === 1 ? opts.value(utility) : null;
  return { noun: nounOf(rule.type), score: ev.score, utility, bits, worst, sites };
}
