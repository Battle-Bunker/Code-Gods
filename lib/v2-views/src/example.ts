/**
 * The goal card's worked example (integration plan §5.7; coordinator, from real games: Square Area showed y = 8x − 1,
 * area 1/16, "nearest square 0 = 0²"). A typical, legible line or board, chosen by a rule from the family's own
 * contributors, never hand-written per family:
 * - every number the rule reads is whole and modest (no "≈", no fraction, under 100 in size);
 * - every reference is a real one (not 0: a square of side 0, the whole number 0);
 * - the main part has room to improve (not already perfect), so the card shows what better would be;
 * - the tie-breaker visibly counts (2 or more);
 * - and, among the most legible, the middling bits: typical, neither hopeless nor the best on offer.
 * A seeded walk from the type's origin supplies the candidates, so the same rule always gets the same example.
 */
import { energyOf, evaluateObject, rng, walkStep, type ObjectType, type Score } from "@workspace/v2-core";
import type { RuleRef } from "./annotate.ts";
import { contributors } from "./contributors.ts";
import { fmtBits, fmtNum } from "./format.ts";
import { chipRep, repText } from "./rep-view.tsx";

const WALK = 4000;
/** Distinct scoring states the walk collects before it stops. */
const KEEP = 240;
const FRACTION = /[½⅓¼⅕⅙⅐⅛⅑⅒⅔⅖¾⅗⅜⅘⅚⅝⅞]|\/|≈/;

/** How far a state is from a fully legible example: 0 is legible; each failed criterion adds to it. */
export function legibility<S, P>(rule: RuleRef<S, P>, state: S): number {
  const c = contributors(rule, state);
  if (c.utility === null) return Infinity;
  let bad = 0;
  for (const p of c.parts) {
    for (const s of p.source) {
      if (!s.value) continue;
      if (FRACTION.test(s.text)) bad += 2;
      if (Math.abs(Number(s.value.n) / Number(s.value.d)) >= 100) bad += 1;
    }
    if (p.reference && (p.reference.value === 0 || FRACTION.test(p.reference.text))) bad += 3;
  }
  const [main, tie] = c.parts;
  if (main && main.sense === "min" && /^(on |exactly)/.test(main.distance ?? "")) bad += 1;
  if (tie) {
    const v = Number(tie.valueText.replace(/,/g, ""));
    if (!Number.isFinite(v) || v < 2) bad += 2;
  }
  return bad;
}

export function workedExample<S, P>(rule: RuleRef<S, P>, value?: ((u: Score) => number) | null): S {
  const { type, family, params, variant, tieBreaker } = rule;
  const own = family.examples?.(params, variant)[0];
  if (own !== undefined) return own;
  const r = rng("worked-example", family.id, JSON.stringify(params), tieBreaker ?? "");
  const seen = new Set<string>();
  const found: { state: S; bad: number; bits: number }[] = [];
  let s = (type as ObjectType<S>).origin(variant);
  for (let i = 0; i < WALK && found.length < KEEP; i++) {
    s = walkStep(type, variant, s, r);
    const k = type.encode(s);
    if (seen.has(k)) continue;
    seen.add(k);
    const score = evaluateObject(type, family, params, s, variant, tieBreaker).score;
    if (score === null) continue;
    const bits = value ? value(score) : 0;
    if (value && bits <= 0) continue;
    found.push({ state: s, bad: legibility(rule, s), bits });
  }
  if (!found.length) return type.origin(variant);
  // The most legible; among them, the one with the middling bits.
  const best = Math.min(...found.map(f => f.bad));
  const pool = found.filter(f => f.bad === best).sort((a, b) => a.bits - b.bits);
  return pool[Math.floor(pool.length / 2)]!.state;
}

/** One row of "What is each level worth?": a level of the rule's utility, a state at it, and that state's energy. */
export interface LadderRow { readonly u: number; readonly text: string; readonly bits: number }
/** A rung of the ladder before its energy is measured. */
export interface Rung<S> { readonly state: S; readonly u: number }

/** The utility steps above the example's at which the ladder looks for a rung. */
const STEPS = [2, 4, 8, 16, 32];

/**
 * The goal card's ladder (coordinator, 17 Nov: the old "How rare is each rule score?" said "rare" of a table the energy
 * measure no longer has): the worked example, then, for each step above its utility, the rule's own candidate with the
 * least utility at or above it. Each rung's energy is measured separately (`ladderRow`): it is the real estimate, so a
 * row is true of that state, not of every state at that level (energy depends on size too).
 */
export function ladderRungs<S, P>(rule: RuleRef<S, P>, from: S): Rung<S>[] {
  const dyn = rule.family.dynamic;
  if (!dyn) return [];
  const u = (s: S) => { const v = dyn.u(s, rule.params); return Number.isFinite(v) ? v : -Infinity; };
  const u0 = u(from), base = Number.isFinite(u0) ? u0 : 0, seen = new Set<string>([rule.type.encode(from)]);
  const out: Rung<S>[] = Number.isFinite(u0) ? [{ state: from, u: u0 }] : [];
  for (const step of STEPS) {
    const level = base + step;
    const cands = (dyn.candidates?.(from, level, rule.params) ?? []).filter(t => u(t) >= level - 1e-9);
    const t = cands.sort((a, b) => u(a) - u(b))[0];
    if (t === undefined || seen.has(rule.type.encode(t))) continue;
    seen.add(rule.type.encode(t));
    out.push({ state: t, u: u(t) });
  }
  return out;
}

/** One rung's row: its utility, the state as a player writes it, and its energy (the live estimator, a fixed seed). */
export function ladderRow<S, P>(rule: RuleRef<S, P>, rung: Rung<S>): LadderRow {
  const { type, family, params, variant } = rule;
  const bits = energyOf(type, family, params, rung.state, variant, { seed: `ladder:${type.encode(rung.state)}` }).energy;
  const written = repText(type, rung.state, chipRep(type, rung.state));
  return { u: rung.u, bits, text: `${fmtNum(rung.u)}: ${written} is worth ${fmtBits(bits)}` };
}

/** v1's 🎲 Randomise: a state a short random walk from the origin away, one per seed. */
export function randomExample<S, P>(rule: RuleRef<S, P>, seed: number): S {
  const { type, variant } = rule;
  const r = rng("random-example", String(seed));
  let s = (type as ObjectType<S>).origin(variant);
  for (let i = 0, n = 20 + (seed % 40); i < n; i++) s = walkStep(type, variant, s, r);
  return s;
}
