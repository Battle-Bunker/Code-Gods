/**
 * From an evaluation to what a card shows (integration plan §3.1): one part per score component (main part,
 * tie-breakers), each on its own ladder, the marks that cite it, the object's level on the rule's ladder, the worked
 * computation, and (in improve.ts) the nearest improvement. Pure; no React.
 *
 * Never disagreeing: every number here is a recorded term or an element the rule read. Nothing is recomputed.
 */
import {
  elementDecl, elementValue, evaluateObject, representation, layerLadders, levelOf, objectLadder, type ElementRef, type Evaluation, type Mark,
  type ObjectEvaluation, type ObjectType, type Q, type RuleFamily, type Rung, type Score, type Term, type TieBreaker, type Undef,
  type Variant,
} from "@workspace/v2-core";
import { fmtQ, fmtTermValue, fmtValue, isUndef } from "./format.ts";
import { markTerm } from "./refs.ts";
import { rendererFor } from "./scene.ts";

export interface RuleRef<S, P> {
  readonly type: ObjectType<S>;
  readonly family: RuleFamily<S, P>;
  readonly params: P;
  readonly variant: Variant;
  /** The dealt tie-breaker (default: the family's first; null: the main layer alone). */
  readonly tieBreaker?: TieBreaker;
}

export interface Part {
  /** "main part", "tie-breaker", "second tie-breaker" (ux-lessons 2.6). */
  readonly name: string;
  readonly term: string;
  /** The term's own label: "distance from the gradient to the nearest prime". */
  readonly label: string;
  readonly value: Q | Undef;
  readonly sense: "max" | "min";
  /** The step this part reached on its own ladder, or null when it has none. */
  readonly rung: number | null;
  /** The number of steps above "anything" on that ladder (the top step's index). */
  readonly rungs: number | null;
  /** The label of the step reached ("a prime within 1"), when on a ladder and above step 0. */
  readonly rungLabel: string | null;
  /** The next step's label, when not at the top. */
  readonly nextLabel: string | null;
  /** "Distance from the gradient to the nearest prime: 1" or the undefined sentence. */
  readonly sentence: string;
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
  /** The object's level on the rule's (object) ladder, and the top level. */
  readonly level: number;
  readonly top: number;
  readonly ladder: readonly Rung[];
  /** Rarity in bits of the level reached and of the next, when the caller passed the rule's rung rarities. */
  readonly rarity: number | null;
  readonly nextRarity: number | null;
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

/** Each component's own ladder: one per layer of the dealt rule (v2-core's layerLadders), aligned with the components. */
export function partLadders<S, P>(rule: RuleRef<S, P>, count: number): readonly (readonly Rung[] | null)[] {
  const ls = layerLadders(rule.family, rule.params, rule.variant, rule.tieBreaker);
  return Array.from({ length: count }, (_, i) => ls[i] ?? null);
}

const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

function annotateSite<S, P>(rule: RuleRef<S, P>, e: Evaluation, site: number, state: S): SiteAnnotation {
  const comps = components(e);
  const ladders = partLadders(rule, comps.length);
  const parts: Part[] = comps.map((c, i) => {
    const ladder = ladders[i] ?? null;
    const value = c.term.value;
    let rung: number | null = null, rungs: number | null = null, rungLabel: string | null = null, nextLabel: string | null = null;
    if (ladder) {
      rungs = ladder.length - 1;
      rung = isUndef(value) ? 0 : levelOf([c.sense === "max" ? value : { n: -value.n, d: value.d }], ladder);
      rungLabel = rung > 0 ? ladder[rung]!.label : null;
      nextLabel = rung < rungs ? ladder[rung + 1]!.label : null;
    }
    // A tie-breaker owns the marks labelled with its term; the main part owns the rest (the picture of the rule).
    const marks = i === 0
      ? e.marks.filter(m => !comps.slice(1).some(t => markTerm(m) === t.term.id))
      : e.marks.filter(m => markTerm(m) === c.term.id);
    const sentence = isUndef(value) ? capital(value.undefined) : `${capital(c.term.label)}: ${fmtQ(value)}`;
    return { name: partName(i), term: c.term.id, label: c.term.label, value, sense: c.sense, rung, rungs, rungLabel, nextLabel, sentence, marks };
  });
  const working: string[] = [];
  // A rule that reads most of a representation's coordinates (every cell of a board) gets that representation in one
  // line ("the board: 3 1 1 3 / …"), not one line per coordinate.
  const coords = new Map<string, number>();
  for (const r of e.reads) {
    try { if (elementDecl(rule.type, r).role === "coordinate") coords.set(r.rep, (coords.get(r.rep) ?? 0) + 1); } catch { /* unknown: skipped below */ }
  }
  const whole = new Set([...coords].filter(([, n]) => n >= WHOLE_REP).map(([rep]) => rep));
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
  /** Rarity in bits per rung of the object ladder (from the rule's artefact, v2Rules), index = level. */
  readonly rarities?: readonly number[];
}

/** Annotate a rule's evaluation of a state. The evaluation is v2-core's; this only arranges it. */
export function annotate<S, P>(rule: RuleRef<S, P>, state: S, opts: AnnotateOptions = {}): Annotation {
  const ev: ObjectEvaluation = evaluateObject(rule.type, rule.family, rule.params, state, rule.variant, rule.tieBreaker);
  return annotateEvaluation(rule, state, ev, opts);
}

export function annotateEvaluation<S, P>(rule: RuleRef<S, P>, state: S, ev: ObjectEvaluation, opts: AnnotateOptions = {}): Annotation {
  const ladder = objectLadder(rule.type, rule.family, rule.params, rule.variant, rule.tieBreaker);
  const level = levelOf(ev.score, ladder);
  const top = ladder.length - 1;
  const sites = ev.sites.map((e, i) => annotateSite(rule, e, i, state));
  let worst: string | null = null;
  if (ev.score === null) {
    const u = ev.sites.flatMap(e => e.terms).find(t => isUndef(t.value));
    worst = u ? (u.value as Undef).undefined : "this rule does not score this state";
  }
  const r = opts.rarities;
  return {
    noun: rule.type.id, score: ev.score, level, top, ladder,
    rarity: r?.[level] ?? null, nextRarity: level < top ? r?.[level + 1] ?? null : null,
    worst, sites,
  };
}
