/**
 * Contributors (docs/engine-v2/annotations-design.md §2): each layer of the dealt rule (main part, tie-breaker) as the
 * chain of quantities it was computed from, read only from the rule's own evaluation (no second source):
 * - the source: the elements the layer's term was read from (the y-intercept 25, the area 24½);
 * - the reference: what a distance is measured to, from the candidate mark the rule places on that term (the prime
 *   23, the square 25, the whole number −2, the treasure 37);
 * - the distance, said with its direction ("2 above 23", "on 23"), or a size's value;
 * - a ruler: the value on a magnified number line among the reference and its kind's natural values (primes,
 *   squares, whole numbers), or a size among its natural values. Owner decision 23: no steps and no thresholds.
 * Pure; no React.
 */
import {
  elementDecl, elementValue, evaluateObject, Qn, q, refKey, type ElementRef, type Evaluation, type Layer, type Mark, type Q, type Score, type Undef,
} from "@workspace/v2-core";
import type { RuleRef } from "./annotate.ts";
import { fmtQ, isUndef } from "./format.ts";

export type Role = "main" | "tb";

export interface Source {
  readonly ref: ElementRef;
  /** "y-intercept", "y when x is 2" (a parameter's letter replaced by its value). */
  readonly label: string;
  readonly value: Q | null;
  readonly text: string;
}

export interface RulerData {
  readonly value: number;
  readonly valueText: string;
  /** Marks on the ruler: the reference (strong) and its kind's neighbours. */
  readonly refs: readonly { readonly at: number; readonly label: string; readonly strong?: boolean }[];
}

export interface Contributor {
  readonly role: Role;
  /** "main part" / "tie-breaker". */
  readonly name: string;
  /** The layer's title in player words, parameters replaced by their values: "y(2) close to 37". */
  readonly title: string;
  /** What the rule wants, in a child's words: the layer's own sentence for the dealt parameters. */
  readonly wants: string;
  readonly sense: "min" | "max";
  readonly aim: string;
  readonly term: string;
  readonly value: Q | Undef;
  readonly valueText: string;
  readonly source: readonly Source[];
  readonly reference: { readonly ref: ElementRef; readonly value: number; readonly text: string } | null;
  /** "2 above 23", "on 23", "off by ⅓" (a distance); null for a size. */
  readonly distance: string | null;
  readonly ruler: RulerData | null;
  /** One sentence, for the card and a screen reader. */
  readonly sentence: string;
  /**
   * What each unit the part adds up contributes, from the rule's own notes on its sources ("row 1: 5 short"), in the
   * sources' order; empty when the part is one number.
   */
  readonly units: readonly { readonly label: string; readonly text: string }[];
}

export interface Contributors {
  readonly evaluation: Evaluation;
  /** The rule's utility of this state (decision 23): what the value function prices. */
  readonly utility: Score;
  readonly parts: readonly Contributor[];
  /** Why the line does not score, when it does not. */
  readonly worst: string | null;
}

const N = (x: Q) => Number(x.n) / Number(x.d);
/** A sentence's first letter capitalised, unless it is a mathematical letter ("y-intercept", "x(4)", "m = 3"). */
const cap = (s: string) => (!s || /^[a-z](?![a-z])/.test(s) ? s : s[0]!.toUpperCase() + s.slice(1));

/** A number as a child reads it: exact with a small bottom number, else "≈ 6.00"; whole numbers from 10,000 grouped. */
export function readable(x: Q): string {
  if (x.d > 16n) return `≈ ${(Math.round(N(x) * 100) / 100).toFixed(2).replace("-", "−")}`;
  const t = fmtQ(x);
  return x.d === 1n && (x.n >= 10000n || x.n <= -10000n) ? t.replace(/\d+/, d => Number(d).toLocaleString("en-US")) : t;
}
const readableN = (v: number) => {
  for (let d = 1; d <= 16; d++) { const n = Math.round(v * d); if (Math.abs(n - v * d) < 1e-9) return readable(q(n, d)); }
  return `≈ ${(Math.round(v * 100) / 100).toFixed(2).replace("-", "−")}`;
};

/** Replace a rule's parameter letters by their dealt values ("y(k) close to T" → "y(2) close to 37"). */
export function withParams(text: string, params: unknown): string {
  let t = text;
  for (const [k, v] of Object.entries((params ?? {}) as Record<string, unknown>)) {
    if (typeof v !== "number" && typeof v !== "string") continue;
    t = t.replace(new RegExp(`(^|[^A-Za-z])${k}(?![A-Za-z])`, "g"), (_, pre: string) => `${pre}${v}`);
  }
  return t;
}

/** An element's label with its own parameters replaced by their arguments ("y when x is k" at x = 2 → "y when x is 2"). */
function labelOf<S>(rule: RuleRef<S, unknown>, r: ElementRef): string {
  let label: string;
  let meaning: string | undefined;
  try { const d = elementDecl(rule.type, r); label = d.label; meaning = d.meaning; } catch { return r.name; }
  // The value at an input is said the way a class writes it: "y(2)".
  const arg = r.args ? Object.values(r.args)[0] : undefined;
  if (meaning === "valueAt" && arg !== undefined) return `y(${fmtQ(Qn.parse(arg))})`;
  for (const [k, v] of Object.entries(r.args ?? {})) label = label.replace(new RegExp(`(^|[^A-Za-z])${k}(?![A-Za-z])`, "g"), (_, pre: string) => `${pre}${fmtQ(Qn.parse(v))}`);
  return label.replace(/\s*\(.*\)$/, "");
}

const primesNear = (lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let n = Math.max(2, Math.ceil(lo)); n <= hi; n++) {
    let p = n > 1;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; }
    if (p) out.push(n);
  }
  return out;
};

/** A unit's short name, from its element's label: "row 1's total" → "row 1", "the top-left box's pairs" → "the top-left box". */
function unitLabel(label: string): string {
  const m = /\b(row \d+|column \d+|the [a-z-]+ (box|half|square|pair)|square \d+)\b/.exec(label);
  return m ? m[1]! : label.replace(/'s .*$/, "");
}

/** The natural values of a reference's kind near v (presentation only: the reference itself is the rule's). */
function neighbours(kind: string, lo: number, hi: number): number[] {
  if (/prime/.test(kind)) return primesNear(lo, hi);
  if (/square/.test(kind)) {
    const out: number[] = [];
    for (let r = Math.max(0, Math.floor(Math.sqrt(Math.max(0, lo)))); r * r <= hi; r++) if (r * r >= lo) out.push(r * r);
    return out;
  }
  const out: number[] = [];
  if (hi - lo <= 24) for (let n = Math.ceil(lo); n <= hi; n++) out.push(n);
  return out;
}

/** What a candidate mark refers to, as a number: its own value when a number, or its coordinate on an axis. */
function refNumber<S>(rule: RuleRef<S, unknown>, state: S, m: Extract<Mark, { kind: "candidate" }>, site: number): number | null {
  try {
    const v = elementValue(rule.type, state, m.ref, site);
    if (v.kind === "number") return N(v.q);
  } catch { /* fall through to the argument */ }
  // A mark on an axis refers to its coordinate there; any other candidate (a point, a ghost line) is not a number.
  const a = m.ref.args?.x ?? m.ref.args?.y;
  return a !== undefined ? N(Qn.parse(a)) : null;
}

function contributor<S, P>(rule: RuleRef<S, P>, state: S, e: Evaluation, i: number, layer: Layer<P>, site: number): Contributor {
  const comp = e.components[i]!;
  const term = e.terms.find(t => t.id === comp.term)!;
  const role: Role = i === 0 ? "main" : "tb";
  // The reference's axis, when it is a mark on an axis: a point source is then read along that axis (an x-intercept
  // against minute 3 is its x).
  const axisOf = (m: Extract<Mark, { kind: "candidate" }>) => (m.ref.args && "x" in m.ref.args ? "x" : m.ref.args && "y" in m.ref.args ? "y" : null);
  const termCands = e.marks.filter((m): m is Extract<Mark, { kind: "candidate" }> => m.kind === "candidate" && m.term === term.id);
  const axis = termCands.map(axisOf).find(a => a !== null) ?? null;
  // A term read from its own reference too (the crossing and its nearest whole number) says the reference once, as the
  // reference, not again among its sources.
  const isRef = (r: ElementRef) => termCands.some(c => refKey({ ...c.ref, site: undefined }) === refKey({ ...r, site: undefined }));
  const from = term.from.length > 1 && term.from.some(r => !isRef(r)) ? term.from.filter(r => !isRef(r)) : term.from;
  const source: Source[] = from.map(r => {
    let v: Q | null = null;
    try {
      const ev = elementValue(rule.type, state, r, site);
      if (ev.kind === "number") v = ev.q;
      else if (ev.kind === "point" && axis) v = axis === "x" ? ev.x : ev.y;
    } catch { v = null; }
    return { ref: r, label: labelOf(rule as RuleRef<S, unknown>, r), value: v, text: v ? readable(v) : "" };
  });
  const value = term.value;
  const valueText = isUndef(value) ? value.undefined : readable(value);
  const title = withParams(layer.title, rule.params);
  const wants = withParams(layer.sentence(rule.params), rule.params).replace(/^Tie-breaker: /, "");
  const aim = layer.sense === "min" ? "the closer, the better" : "the bigger, the better";

  // The reference: the candidate mark the rule placed on this term (the nearest, when several).
  const cands = termCands;
  const src = source.find(s => s.value)?.value ?? null;
  let reference: Contributor["reference"] = null;
  for (const c of cands) {
    const v = refNumber(rule as RuleRef<S, unknown>, state, c, site);
    if (v === null) continue;
    if (!reference || (src && Math.abs(v - N(src)) < Math.abs(reference.value - N(src)))) reference = { ref: c.ref, value: v, text: readableN(v) };
  }

  let distance: string | null = null;
  let ruler: RulerData | null = null;
  const kind = title + " " + term.label;
  if (layer.sense === "min" && !isUndef(value)) {
    if (reference && src) {
      // The size is the rule's own term (what it scores); only the direction comes from the source and reference.
      const d = N(src) - reference.value;
      distance = Qn.isZero(value) ? `on ${reference.text}` : `${readable(Qn.abs(value))} ${d >= 0 ? "above" : "below"} ${reference.text}`;
      const lo = Math.min(N(src), reference.value), hi = Math.max(N(src), reference.value), span = Math.max(hi - lo, 2);
      const pad = Math.max(span, 6), near = neighbours(kind, lo - pad, hi + pad).filter(x => x !== reference!.value);
      ruler = {
        value: N(src), valueText: (s => `${s.label} ${s.text}`)(source.find(s => s.value)!),
        refs: [{ at: reference.value, label: reference.text, strong: true }, ...near.map(x => ({ at: x, label: readableN(x) }))],
      };
    } else {
      distance = Qn.isZero(value) ? "exactly" : `off by ${readable(value)}`;
    }
  } else if (!isUndef(value)) {
    const v = N(value);
    const near = neighbours(/prime/.test(kind) ? "prime" : "whole", Math.max(0, v - 8), v + 14).filter(x => x !== v);
    ruler = { value: v, valueText: `${valueText}`, refs: [{ at: v, label: readable(value), strong: true }, ...near.map(x => ({ at: x, label: readableN(x) }))] };
  }

  // A sum of distances with no single reference (a grid's rows from 18) sits on a ruler from 0, which is perfect.
  if (layer.sense === "min" && !isUndef(value) && !ruler) {
    const v = N(value);
    ruler = { value: v, valueText: distance ?? valueText, refs: [{ at: 0, label: "0", strong: true }, ...neighbours("whole", 1, Math.max(v, 4)).filter(x => x !== v).map(x => ({ at: x, label: readableN(x) }))] };
  }

  // The units the part adds up, each with the rule's own note on it (the board's "5 short" on row 1's total).
  const units = from.length > 1
    ? from.flatMap(r => {
      const k = refKey({ ...r, site: undefined });
      const note = e.marks.find((m): m is Extract<Mark, { kind: "note" }> => m.kind === "note" && refKey({ ...m.ref, site: undefined }) === k);
      return note ? [{ label: labelOf(rule as RuleRef<S, unknown>, r), text: note.text }] : [];
    })
    : [];
  // Listed by short names ("row 1") only where they tell the units apart; units that would need their full labels
  // (a pair, a 2×2 square) are left to the board, which draws each note beside its own cells.
  const shortNames = units.map(u => unitLabel(u.label));
  const named = new Set(shortNames).size === shortNames.length ? units.map((u, i) => ({ ...u, label: shortNames[i]! })) : [];

  // A part made of many elements (sixteen cells) is said by its term's own label, not element by element.
  const what = source.length > 3 ? term.label : source.filter(s => s.value).map(s => `${s.label} ${s.text}`).join(", ");
  const sentence = isUndef(value)
    ? cap(value.undefined)
    : layer.sense === "min"
      ? `${cap(what || title)}${distance ? `: ${distance}` : source.length > 3 ? `: ${valueText}` : ""}. ${cap(aim)}.`
      : `${cap(title)}: ${valueText}. ${cap(aim)}.`;
  return {
    role, name: role === "main" ? "main part" : "tie-breaker", title, wants, sense: layer.sense, aim, term: term.id, value, valueText,
    source, reference, distance, ruler, sentence, units: named,
  };
}

/** The contributors of one site's evaluation (the parts of the dealt rule, in order). */
export function contributorsOf<S, P>(rule: RuleRef<S, P>, state: S, e: Evaluation, site = 0): Contributor[] {
  const tb = rule.tieBreaker === undefined ? rule.family.tieBreakers[0] : rule.family.tieBreakers.find(t => t.id === rule.tieBreaker);
  const layers = [rule.family.main, ...(tb ? [tb] : [])];
  return layers.slice(0, e.components.length).map((l, i) => contributor(rule, state, e, i, l, site));
}

/** The contributors of a rule on one line of a state. */
export function contributors<S, P>(rule: RuleRef<S, P>, state: S, site = 0): Contributors {
  const ev = evaluateObject(rule.type, rule.family, rule.params, state, rule.variant, rule.tieBreaker);
  const e = ev.sites[site]!;
  const parts = contributorsOf(rule, state, e, site);
  const u = e.terms.find(t => isUndef(t.value));
  return { evaluation: e, utility: ev.score, parts, worst: e.score === null ? (u ? (u.value as Undef).undefined : "this rule does not score this line") : null };
}

/**
 * What a change did to the rule's quantities, part by part: a distance part's source ("y-intercept 25 → 24 (on 23)"),
 * a size part's value ("prime 23 → 29").
 */
export function changesBetween(was: readonly Contributor[], now: readonly Contributor[]): string[] {
  const out: string[] = [];
  was.forEach((p, i) => {
    const q = now[i];
    if (!q) return;
    const a = p.source.find(s => s.value), b = q.source.find(s => s.value && s.label === a?.label);
    const short = p.title.replace(/^(the|that) /, "");
    // A part that adds up several units (a grid's rows) changes as a whole: "every row adds up to 18: off by 32 → 30".
    if (p.sense === "min" && (p.units.length > 0 || !p.reference)) {
      if (p.valueText !== q.valueText) out.push(`${short}: ${p.distance ?? p.valueText} → ${q.distance?.replace(/^off by /, "") ?? q.valueText}`);
      return;
    }
    if (p.sense === "min" && a && b && a.text !== b.text) out.push(`${a.label} ${a.text} → ${b.text}${q.distance?.startsWith("on ") ? ` (${q.distance})` : ""}`);
    else if (p.sense === "max" && p.valueText !== q.valueText) out.push(`${p.title.replace(/^(the|that) /, "")} ${p.valueText} → ${q.valueText}`);
  });
  return out;
}
