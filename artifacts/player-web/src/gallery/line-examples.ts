/**
 * Example lines for the line galleries (v2.tsx, rules-mirror.tsx): the hand-picked lines per family, and for a family
 * nobody curated, lines met on a seeded walk.
 */
import { evaluateObject, q, rng, walkStep, type Q, type RuleFamily, type Score, type TieBreaker } from "@workspace/v2-core";
import { fromMC, lineType, normalise, type Line, type LineState } from "@workspace/v2-linear";
import { pickExamples } from "./pick-examples";
import { variantOf as configuredVariant } from "../sdk/object-types.ts";
const lineQ = configuredVariant("line-q");

export const mc = (m: number | Q, c: number | Q): LineState =>
  ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
export const abc = (a: number, b: number, c: number): LineState => ({ lines: [normalise(BigInt(a), BigInt(b), BigInt(c)) as Line] });

export type LineFamily = RuleFamily<LineState, any>;

/** Hand-picked lines per family: one at the top, one near, one far, one the rule cannot score. */
export const CURATED: Readonly<Record<string, { params?: unknown; lines: readonly LineState[] }>> = {
  "empty-tank-demo": { lines: [mc(-3, 10), mc(-3, 9), mc(-2, 7), mc(2, -6)] },
  "whole-crossing": { lines: [mc(3, -7), mc(-2, 5), mc(4, -12), mc(0, 4)] },
  "divisibility-ladder": { lines: [mc(6, 6), mc(7, 60), mc(2, 1), mc(3, 0)] },
  "prime-gradient": { lines: [mc(4, -3), mc(5, 1), mc(q(5, 2), 1), abc(1, 0, -3)] },
  "triangle-area": { params: { A: 8 }, lines: [mc(-1, 4), mc(2, -6), mc(-3, 10), mc(3, 0)] },
  "m-meets-c": { lines: [mc(1, 5), mc(3, 3), mc(-2, 1), mc(q(1, 2), -1)] },
  "crossing-check": { params: { k: 1, q: 4 }, lines: [mc(2, 1), mc(1, 2), mc(-1, 5), mc(0, 4)] },
};

/**
 * Lines from a seeded walk on line-q: the best, a middling and a low one by bits (`value`; by score without one), and
 * one the rule cannot score if the walk met one.
 */
export function autoLines(family: LineFamily, params: unknown, value: ((u: Score) => number) | undefined, tieBreaker?: TieBreaker): LineState[] {
  const r = rng(`gallery:${family.id}`);
  const met: { state: LineState; score: Score }[] = [];
  let worst: LineState | null = null;
  let s = mc(1, 1);
  for (let i = 0; i < 3000; i++) {
    s = walkStep(lineType, lineQ, s, r);
    const score = evaluateObject(lineType, family, params, s, lineQ, tieBreaker).score;
    if (score === null) worst ??= s; else met.push({ state: s, score });
  }
  const lines = [...pickExamples(met, value), ...(worst ? [worst] : [])];
  return lines.length ? lines : [mc(1, 1)];
}
