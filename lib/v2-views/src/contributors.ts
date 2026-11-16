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
  elementDecl, elementValue, evaluateObject, Qn, q, refKey, ruleLayers, type ElementRef, type Evaluation, type Layer, type Mark, type Q, type Score, type Undef,
} from "@workspace/v2-core";
import { partName, type RuleRef } from "./annotate.ts";
import { fmtQ, isUndef, readable, typesetNote } from "./format.ts";

export type Role = "main" | "tb";
/** A part's symbol by its depth, always beside its name: ● main part, ◆ secondary, ▲ third, ■ fourth preference. */
export const partGlyph = (i: number): string => ["●", "◆", "▲", "■"][i] ?? "•";

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
  /** The layer's place in the rule: 0 the main part, 1 the secondary preference, 2 the third, … (its name and symbol). */
  readonly depth: number;
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

const readableN = (v: number) => {
  for (let d = 1; d <= 100; d++) { const n = Math.round(v * d); if (Math.abs(n - v * d) < 1e-9) return readable(q(n, d)); }
  return `≈ ${(Math.round(v * 100) / 100).toFixed(2).replace("-", "−")}`;
};

/** Replace a rule's parameter letters by their dealt values ("y(k) close to T" → "y(2) close to 37"). */
export function withParams(text: string, params: unknown): string {
  let t = text;
  for (const [k, v] of Object.entries((params ?? {}) as Record<string, unknown>)) {
    if (typeof v !== "number" && typeof v !== "string") continue;
    // Only symbols ("k", "t", "q2") stand for a value in a title; a worded key ("meets", "digits", "side") is also an
    // English word there ("where the line meets y = x" read "where the line -1 y = x").
    if (k.length > 2) continue;
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

/** What the dealt rule asks of its reference (playtest round 15: a ruler for "a prime ending in 7" marked 2, 3, 5, 11). */
export interface RefFilter {
  /** The last digit a qualifying value ends in (the dealt `ends`). */
  readonly ends?: number;
  /** The side of 0 the qualifying values are on (a sign-mirrored rule: "minus a prime ending in 7"). */
  readonly sign?: 1 | -1;
}
/**
 * The filter a part's reference shows: the rule's own nearest qualifying value says which values qualify. The dealt
 * ending applies when the reference has it (a tie-breaker about prime factors keeps every prime); the sign is the
 * reference's own.
 */
export function refFilter(params: unknown, reference: number): RefFilter {
  const ends = typeof (params as { ends?: unknown } | null)?.ends === "number" ? (params as { ends: number }).ends : undefined;
  const sign = reference < 0 ? -1 : 1;
  const digitOk = ends !== undefined && Number.isInteger(reference) && Math.abs(reference) % 10 === ends;
  return { ...(digitOk ? { ends } : {}), sign };
}

/**
 * The natural values of a reference's kind between lo and hi (presentation only: the reference itself is the rule's),
 * those the dealt rule asks for: its ending, and on its side of 0 (negative primes for a mirrored rule).
 */
export function neighbours(kind: string, lo: number, hi: number, filter: RefFilter = {}): number[] {
  if (/prime/.test(kind)) {
    const mirrored = filter.sign === -1;
    const found = mirrored ? primesNear(-hi, -lo).map(p => -p) : primesNear(lo, hi);
    return found.filter(p => filter.ends === undefined || Math.abs(p) % 10 === filter.ends).sort((a, b) => a - b);
  }
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
  // A ladder family's main part on a rung is a level (Prime Landing's levels of digits, Smooth Intercept's of primes): its
  // number means little on its own, so the family's own words for the term are said instead ("on 75: 3 of the dealt
  // primes multiplied, level 2"). Off the ladder the distance (below 0) says it plainly.
  const valueText = isUndef(value) ? value.undefined : rule.family.keepsParams && role === "main" && term.label && Qn.sign(value) > 0 ? typesetNote(term.label) : readable(value);
  // "dealt" is our word for a rule's parameters, not a player's (round 29: "as big a dealt prime as possible").
  const title = withParams(layer.title, rule.params).replace(/\bdealt /g, "");
  const wants = withParams(layer.sentence(rule.params), rule.params).replace(/^(Tie-breaker|Secondary|Third|Then):\s*/, "");
  const aim = layer.sense === "min" ? "the closer, the better" : "the bigger, the better";

  // The reference: the candidate mark the rule placed on this term (the nearest, when several); else the far end of a
  // measure the rule drew for it (a closeness measured to the target the rule named: pool-plan v2's secondary).
  const termMeasures = e.marks.filter((m): m is Extract<Mark, { kind: "measure" }> => m.kind === "measure" && m.term === term.id);
  const cands = termCands.length ? termCands : termMeasures.map(m => ({ kind: "candidate" as const, ref: m.to, term: term.id }));
  const src = source.find(s => s.value)?.value ?? null;
  let reference: Contributor["reference"] = null;
  // Every value the rule marked for this term: the target and, when it names them, its neighbours (11, 31, 41).
  const marked: { ref: ElementRef; value: number }[] = [];
  for (const c of cands) {
    const v = refNumber(rule as RuleRef<S, unknown>, state, c, site);
    if (v === null) continue;
    marked.push({ ref: c.ref, value: v });
    if (!reference || (src && Math.abs(v - N(src)) < Math.abs(reference.value - N(src)))) reference = { ref: c.ref, value: v, text: readableN(v) };
  }
  // The rule's own notes on this layer (a third preference's working: "31 × ¹⁄₃₁ = 1").
  // Only a working on one element: notes on several elements are per-unit notes (a grid's "2 apart" on each pair), which
  // the board says beside each unit; joined into the card's sentence they made a paragraph.
  const layerMarks = e.marks.filter((m): m is Extract<Mark, { kind: "note" }> => m.kind === "note" && m.term === term.id && i > 0);
  const layerNotes = new Set(layerMarks.map(m => refKey({ ...m.ref, site: undefined }))).size === 1 ? layerMarks.map(m => typesetNote(m.text)) : [];

  let distance: string | null = null;
  let ruler: RulerData | null = null;
  const kind = title + " " + term.label;
  // A distance, or a ladder (a count or size read through a reference: Prime Landing's rungs): the source on a ruler
  // among the reference and its kind's qualifying neighbours.
  if (layer.sense === "max" && marked.length >= 2 && reference && src && !isUndef(value)) {
    // A target the rule chose among the values it marked (pool-plan v2's primary: the prime ending in 1 nearest the
    // y-intercept, with the next ones either side): what was read, the target it is nearest, and the next better one.
    const srcSource = source.find(s => s.value)!;
    const size = (v: number) => Math.abs(v);
    const up = marked.filter(m => size(m.value) > size(reference!.value)).sort((a, b) => size(a.value) - size(b.value))[0];
    distance = `${srcSource.label} ${srcSource.text} is nearest ${reference.text}${up ? `; next up ${readableN(up.value)}: ${readableN(size(up.value) - size(N(src)))} more` : ""}`;
    ruler = {
      value: N(src), valueText: `${srcSource.label} ${srcSource.text}`,
      refs: marked.map(m => ({ at: m.value, label: readableN(m.value), ...(m.value === reference!.value ? { strong: true } : {}) })),
    };
  } else if ((layer.sense === "min" || (reference && src)) && !isUndef(value)) {
    if (reference && src) {
      // The size is the rule's own term for a distance (what it scores), the gap from the reference for a ladder; only
      // the direction comes from the source and reference.
      const d = N(src) - reference.value;
      const on = layer.sense === "min" ? Qn.isZero(value) : d === 0;
      // A ladder's reading that counts as on its rung (its term above 0: Prime Landing's crossing rounding to the prime)
      // says so first; only a reading off every rung says how far off it is (round 24: "≈ 0.49 below 11" read as a miss).
      const onRung = !on && layer.sense === "max" && !!rule.family.keepsParams && Qn.sign(value) > 0;
      distance = on ? `on ${reference.text}`
        : onRung ? (Math.abs(d) <= 0.5 ? `rounds to ${reference.text}: on the rung` : `on the rung at ${reference.text}`)
        : `${layer.sense === "min" ? readable(Qn.abs(value)) : readableN(Math.abs(d))} ${d >= 0 ? "above" : "below"} ${reference.text}`;
      const lo = Math.min(N(src), reference.value), hi = Math.max(N(src), reference.value), span = Math.max(hi - lo, 2);
      // Wide enough to show several rungs either side when the dealt ending thins them out (11, 31, 41, 61, 71, …;
      // playtest round 19 asked for the next several rungs above and below).
      const filter = refFilter(rule.params, reference.value);
      const pad = Math.max(span, filter.ends === undefined ? 6 : 60);
      const near = neighbours(kind, lo - pad, hi + pad, filter).filter(x => x !== reference!.value);
      ruler = {
        value: N(src), valueText: (s => `${s.label} ${s.text}`)(source.find(s => s.value)!),
        refs: [{ at: reference.value, label: reference.text, strong: true }, ...near.map(x => ({ at: x, label: readableN(x) }))],
      };
    } else {
      // The rule's working on this layer first, when it gave one ("31 × ¹⁄₃₁ = 1: exactly").
      const how = Qn.isZero(value) ? "exactly" : `off by ${readable(value)}`;
      distance = layerNotes.length ? `${layerNotes.join("; ")}: ${how}` : how;
    }
  } else if (!isUndef(value) && rule.family.keepsParams && role === "main" && Qn.sign(value) <= 0 && src) {
    // A ladder's main part off every rung (round 29: "…as big a dealt prime as possible: −½"): the reading and, when the
    // rungs are numbers of a kind, how far it is from the nearest one, in the player's words; never the bare score.
    const at = N(src);
    if (/prime/.test(kind)) {
      // The rule's own side (a mirrored rule's rungs are negative), never the reading's sign.
      const filter = refFilter(rule.params, (rule.params as { side?: number } | null)?.side === -1 ? -1 : 1);
      const ends = (rule.params as { ends?: unknown } | null)?.ends;
      const near = (w: number) => neighbours("prime", at - w, at + w, { ...(typeof ends === "number" ? { ends } : {}), sign: filter.sign });
      let found: number[] = [];
      for (let w = 20; !found.length && w <= 20000; w *= 4) found = near(w);
      const rung = found.sort((x, y) => Math.abs(x - at) - Math.abs(y - at))[0];
      if (rung !== undefined) {
        const d = at - rung;
        distance = `${readableN(Math.abs(d))} ${d >= 0 ? "above" : "below"} ${readableN(rung)}, a prime${typeof ends === "number" ? ` ending in ${ends}` : ""}`;
      }
    }
    distance ??= "not on a rung yet";
  } else if (!isUndef(value)) {
    const v = N(value);
    const near = neighbours(/prime/.test(kind) ? "prime" : "whole", Math.max(0, v - 8), v + 14).filter(x => x !== v);
    ruler = { value: v, valueText: `${valueText}`, refs: [{ at: v, label: readable(value), strong: true }, ...near.map(x => ({ at: x, label: readableN(x) }))] };
  }

  // A layer with no reference says the rule's own working on it, when it gave one.
  if (!distance && layerNotes.length) distance = layerNotes.join("; ");

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
      if (note) return [{ label: labelOf(rule as RuleRef<S, unknown>, r), text: typesetNote(note.text) }];
      // A unit at its target carries the rule's focus mark instead of a note.
      const onTarget = e.marks.some(m => m.kind === "focus" && refKey({ ...m.ref, site: undefined }) === k);
      return onTarget ? [{ label: labelOf(rule as RuleRef<S, unknown>, r), text: "on target" }] : [];
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
      : `${cap(title)}: ${valueText}${distance && marked.length >= 2 ? ` (${distance})` : ""}. ${cap(aim)}.`;
  return {
    role, depth: i, name: partName(i), title, wants, sense: layer.sense, aim, term: term.id, value, valueText,
    source, reference, distance, ruler, sentence, units: named,
  };
}

/** The contributors of one site's evaluation (the parts of the dealt rule, in order). */
export function contributorsOf<S, P>(rule: RuleRef<S, P>, state: S, e: Evaluation, site = 0): Contributor[] {
  // Every dealt layer in order, at any depth ("a>b>c", #879): the main part, then each preference.
  const layers = ruleLayers(rule.family, rule.tieBreaker);
  const parts = layers.slice(0, e.components.length).map((l, i) => contributor(rule, state, e, i, l, site));
  // A tie-breaker that reads the main part's reference (the whole number the crossing is measured to) says so: the
  // number then carries the main part's target and the tie-breaker's input, and the line explains both.
  const ref = parts[0]?.reference;
  if (!ref) return parts;
  const k = refKey({ ...ref.ref, site: undefined });
  const of = ` (of ${ref.text}, the ${labelOf(rule as RuleRef<S, unknown>, ref.ref).replace(/^the /, "")} the main part is measured to)`;
  return parts.map((p, i) => (i > 0 && p.source.some(x => refKey({ ...x.ref, site: undefined }) === k)
    ? { ...p, sentence: p.sentence.replace(/^([^:]+): /, `$1${of}: `) }
    : p));
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
    // A quantity that does not exist on one side (a vertical line has no y-intercept) is "none" there: the reason
    // sentence belongs on the part's own card, not inside a change.
    const was = isUndef(p.value), is = isUndef(q.value);
    if (was || is) {
      const at = (c: Contributor) => (isUndef(c.value) ? "none" : c.sense === "min" ? c.distance?.replace(/^off by /, "") ?? c.valueText : c.valueText);
      if (!(was && is)) out.push(`${short}: ${at(p)} → ${at(q)}`);
      return;
    }
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
