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
import { evaluateObject, rng, walkStep, type ObjectType, type Score } from "@workspace/v2-core";
import type { RuleRef } from "./annotate.ts";
import { contributors } from "./contributors.ts";
import { chanceText, fmtBits, fmtQ } from "./format.ts";

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

/** One row of "How rare is each rule score?": a main-part value, the lowest score with it, and what that is worth. */
export interface ScaleRow { readonly main: string; readonly bits: number; readonly text: string }

/**
 * v1's "How rare is each rule score?" (owner, 15 November: a card tells a player their precise incentives, and points
 * are rarity): main-part values met on a walk through random states of the board, each the lowest score with that
 * value, spread from the everyday to the rarest found, rarer going down. Rarer scores than these are worth more still:
 * the value curves have no top.
 */
export function rarityScale<S, P>(rule: RuleRef<S, P>, value: ((u: Score) => number) | null | undefined, rows = 6): ScaleRow[] {
  if (!value) return [];
  const { type, family, params, variant, tieBreaker } = rule;
  const r = rng("rarity-scale", family.id, JSON.stringify(params), tieBreaker ?? "");
  const lowest = new Map<string, number>();
  let s = (type as ObjectType<S>).origin(variant);
  for (let i = 0; i < WALK; i++) {
    s = walkStep(type, variant, s, r);
    const score = evaluateObject(type, family, params, s, variant, tieBreaker).score;
    const main = score?.[0];
    if (!score || !main) continue;
    const bits = value(score);
    if (!Number.isFinite(bits)) continue;
    const key = fmtQ(main);
    const was = lowest.get(key);
    if (was === undefined || bits < was) lowest.set(key, bits);
  }
  // One row per distinct worth (two values worth the same say nothing new), then spread over the range found.
  const byBits = [...lowest].sort((a, b) => a[1] - b[1]).filter((x, i, all) => i === 0 || x[1] - all[i - 1]![1] > 1e-9);
  const pick = byBits.length <= rows ? byBits : Array.from({ length: rows }, (_, i) => byBits[Math.round((i * (byBits.length - 1)) / (rows - 1))]!);
  return [...new Map(pick.map(p => [p[0], p])).values()].map(([main, bits]) => ({ main, bits, text: `${main}: ${chanceText(bits)} by chance (${fmtBits(bits)})` }));
}
