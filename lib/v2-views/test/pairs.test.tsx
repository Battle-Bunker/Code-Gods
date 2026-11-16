/** @jsxRuntime automatic */
/**
 * The two-line system (lib/v2-pair) through every view: each representation drawn, compact and expanded, on random pairs
 * and on the awkward ones (an upright line, a flat line, parallel lines), its words written as a person writes them, and
 * the faces of every pair rule on them. One writer for every equation (round 10): no "1x", "+ 0", "+ −".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { rng, walkStep } from "@workspace/v2-core";
import { canonicalPair, pairQ, pairType, type PairState } from "@workspace/v2-pair";
import { normalise, type Line } from "@workspace/v2-linear";
import { CompactFace, ExpandedFace, ObjectChip, RepView, repText, type RuleRef } from "../src/index.ts";

const L = (a: bigint, b: bigint, c: bigint) => normalise(a, b, c) as Line;
const pair = (p: Line, r: Line) => canonicalPair([p, r], pairQ) as PairState;
const BAD = /(^|[^\d⁄₀-₉⁰-⁹.,])1 ?[xy]\b|−1 ?[xy]\b|(^|[^\d⁄₀-₉⁰-⁹.,])0 ?[xy]\b|\+ 0(?![\d.,⁄])|[+−] [+−]|\+ −|− −|NaN|undefined|\[object/;
const text = (h: string) => h.replace(/<\/span><span>/g, " | ").replace(/<\/(div|p|li|h4|section)>/g, " | ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

const STATES: [string, PairState][] = [
  ["crossing at (2, 1)", pair(L(1n, 1n, -3n), L(1n, -1n, -1n))],
  ["an upright line", pair(L(1n, 0n, -3n), L(2n, -1n, 1n))],
  ["a flat line", pair(L(0n, 1n, 2n), L(1n, 1n, -5n))],
  ["parallel lines", pair(L(2n, -1n, 1n), L(2n, -1n, -4n))],
];
{
  const r = rng(5);
  let s = STATES[0]![1];
  for (let i = 0; i < 240; i++) { s = walkStep(pairType, pairQ, s, r) as PairState; if (i % 20 === 19) STATES.push([`walk ${i}`, s]); }
}

test("every pair view, compact and expanded, on every pair: drawn, and written as a person writes it", () => {
  for (const [name, s] of STATES) {
    for (const rep of pairType.representations) {
      for (const size of ["compact", "expanded"] as const) {
        const html = renderToStaticMarkup(<RepView type={pairType} state={s} rep={rep.id} size={size} />);
        assert.doesNotMatch(text(html), BAD, `${name} · ${rep.id} · ${size}: ${text(html)}`);
      }
      if (rep.scene === "equation") assert.doesNotMatch(repText(pairType, s, rep.id), BAD, `${name} · ${rep.id}`);
    }
    assert.doesNotMatch(text(renderToStaticMarkup(<ObjectChip type={pairType} state={s} />)), BAD, `${name}: chip`);
  }
});

test("a system's equations are given, said with 'and'; an upright line is named in si", () => {
  const [, s] = STATES[0]!;
  const eqs = repText(pairType, s, "eqs");
  assert.match(eqs, / and /, eqs);
  assert.doesNotMatch(eqs, /, so /, eqs);
  assert.match(repText(pairType, STATES[1]![1], "si"), /upright: x = 3/);
});

test("the faces of every pair rule on every pair: no throw, clean words, the two lines in their own colours", () => {
  for (const family of pairType.families) {
    for (const params of family.dealable(pairQ).slice(0, 2)) {
      const rule = { type: pairType, family, params, variant: pairQ } as RuleRef<PairState, unknown>;
      for (const [name, s] of STATES.slice(0, 8)) {
        const c = renderToStaticMarkup(<CompactFace rule={rule} state={s} />);
        assert.doesNotMatch(text(c), BAD, `${family.id} · ${name}: compact`);
        const e = renderToStaticMarkup(<ExpandedFace rule={rule} state={s} improvement={false} />);
        assert.doesNotMatch(text(e), BAD, `${family.id} · ${name}: expanded: ${BAD.exec(text(e))?.[0]} in …${text(e).slice(Math.max(0, (BAD.exec(text(e))?.index ?? 0) - 60), (BAD.exec(text(e))?.index ?? 0) + 40)}…`);
        if (family.main.rep === "pair") assert.match(c, /data-line="2"/, `${family.id} · ${name}: line 2 coloured`);
      }
    }
  }
});

test("written as a person writes it: a negative divisor bracketed, a repeated reason said once, the chip says both equations", () => {
  const [, s] = STATES[0]!;
  const solve = repText(pairType, s, "solve");
  assert.doesNotMatch(solve, /÷ −/, solve);
  assert.match(solve, /÷ \(−\d+\)|÷ \d+/, solve);
  const parallel = repText(pairType, STATES[3]![1], "solve");
  assert.equal(parallel.match(/never cross/g)?.length, 1, parallel);
  const chip = text(renderToStaticMarkup(<ObjectChip type={pairType} state={s} />));
  assert.match(chip, /=.* and .*=/, chip);
});
