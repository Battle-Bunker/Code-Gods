/**
 * A dealt rule is an ordered list of layers of any depth (owner decision 14; design-principles.md principle 3a): the
 * main layer, then its tie-breakers in order ("a>b": a, then b). The beginner presets deal depth 2; this proves depth 3
 * end to end on an undealt family (Exact Change, "big-bill>prime-coins"): the layers, the key, the card, the engine's
 * score, a value function and its lookup, and the shipped starter's own score in both languages.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { compareScores, evaluateSite, joinTieBreakers, q, Qn, ruleLayers, scoreToWire, tieBreakerId, tieBreakerIds } from "@workspace/v2-core";
import { exactChange, fromMC, lineQ, lineType, type LineState } from "@workspace/v2-linear";
import { lineValueFunction, ruleKey, valueLookup } from "@workspace/v2-valuation";
import { EngineHost, sandboxes, scoreSource } from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());
const TB = "big-bill>prime-coins", P = { ways: 6 };
const line = (m: number, c: number): LineState => ({ lines: [fromMC(q(m), q(c))] });

test("a depth-3 rule: its layers in order, its key, and its card", () => {
  assert.deepEqual(ruleLayers(exactChange, TB).map(l => l.id), ["change", "big-bill", "prime-coins"]);
  assert.deepEqual(tieBreakerIds(TB), ["big-bill", "prime-coins"]);
  assert.equal(joinTieBreakers(["big-bill", "prime-coins"]), TB);
  assert.equal(tieBreakerId(exactChange, TB), TB);
  assert.equal(tieBreakerId(exactChange, null), "none");
  assert.ok(ruleKey(lineType, lineQ, "exact-change", P, TB).endsWith(`/tb=${TB}`));
  assert.throws(() => ruleLayers(exactChange, "big-bill>big-bill"), /repeats/);
  assert.throws(() => ruleLayers(exactChange, "big-bill>nope"), /no tie-breaker nope/);
  const card = exactChange.card(P, TB);
  assert.match(card, /Secondary: The bill N should be as big as possible\. Third: Both coin values should be as close as possible to primes/);
});

test("a depth-3 score ranks by the main layer, then the first tie-breaker, then the second", () => {
  const s = line(-2, 12), e = evaluateSite(lineType, exactChange, P, s, lineQ, 0, TB);
  assert.equal(e.score!.length, 3);
  // The depth-2 score is its prefix: the third layer only breaks the second's ties.
  const two = evaluateSite(lineType, exactChange, P, s, lineQ, 0, "big-bill");
  assert.deepEqual(scoreToWire(e.score)!.slice(0, 2), scoreToWire(two.score));
  const a = [e.score![0]!, e.score![1]!, Qn.ZERO], b = [e.score![0]!, e.score![1]!, Qn.ONE];
  assert.equal(compareScores(a, b), -1);
});

test("a depth-3 value function is sampled over 3-part scores, and its lookup rises with the third part", () => {
  const vf = lineValueFunction(exactChange, P, lineQ, { tieBreaker: TB, config: { drawsPerTilt: 20_000 } });
  assert.equal(vf.tieBreaker, TB);
  const scored = vf.knots.filter(k => k.u !== null);   // a knot at WORST (null) has no parts
  assert.ok(scored.length > 10 && scored.every(k => k.u!.length === 3), "every scored knot is a 3-part score");
  const look = valueLookup(vf);
  // Two scores equal in the first two parts: the better third part is worth at least as much.
  const pairs = scored.slice(1).map((x, i) => [scored[i]!, x] as const).filter(([lo, hi]) => lo.u![0] === hi.u![0] && lo.u![1] === hi.u![1]);
  assert.ok(pairs.length > 0, "some knots differ only in the third part");
  const parse = (u: readonly (string | null)[]) => u.map(x => (x === null ? null : Qn.parse(x)));
  for (const [lo, hi] of pairs) assert.ok(look(parse(hi.u!)).bits >= look(parse(lo.u!)).bits);
});

test("the shipped starter scores a depth-3 rule as the engine does, in both languages", async () => {
  const lines = [line(-2, 12), line(-3, 12), line(-1, 7), line(-5, 30), line(2, 5)];
  const engine = lines.map(s => { const w = scoreToWire(evaluateSite(lineType, exactChange, P, s, lineQ, 0, TB).score); return w === null ? "worst" : w.map(x => x ?? "null").join(","); });
  const mc = lines.map(s => { const l = s.lines[0]!; return [`${-l.a}/${l.b}`, `${-l.c}/${l.b}`]; });
  for (const language of ["typescript", "python"] as const) {
    const probe = language === "python"
      ? `\nP = ${JSON.stringify(P)}\nPAIRS = ${JSON.stringify(mc)}\n\n\ndef agent(offer):\n    out = []\n    for m, c in PAIRS:\n        s = score(Fraction(m), Fraction(c), P, ${JSON.stringify(TB)})\n        out.append("worst" if s is None else ",".join("null" if x is None else str(Fraction(x)) for x in s))\n    return [move("probe", r=";".join(out))]\n`
      : `\nconst P = ${JSON.stringify(P)}, PAIRS = ${JSON.stringify(mc)};\nfunction agent(offer) {\n  return [move("probe", { r: PAIRS.map(([m, c]) => { const s = score(Q.from(m), Q.from(c), P, ${JSON.stringify(TB)}); return s === null ? "worst" : s.map(x => x === null ? "null" : Q.toString(x)).join(","); }).join(";") })];\n}\n`;
    const host = new EngineHost({ type: lineType, variant: lineQ, state: lines[0]!, rule: { family: "exact-change", params: P, tieBreaker: TB }, energy: 0 });
    const res = await (await boxes.get(language)).act({ source: scoreSource("exact-change", null, language) + probe, offer: { object: 0 }, seed: "1", host, limits: { stepBudget: 5_000_000, wallMs: 20_000 } });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    assert.deepEqual((JSON.parse(res.ok ? res.calls : "[]")[0].args.r as string).split(";"), engine, language);
  }
});
