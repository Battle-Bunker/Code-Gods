/** @jsxRuntime automatic */
/**
 * Every equation a player reads goes through the one renderer (render/equation.tsx), drawn or as text, and is written
 * as a person would: no "1x", "−1x", "0x", "+ 0", "+ −" or "− −" (playtest round 10: "y = −1x + 12", "y = 59x + 0").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q, type Q } from "@workspace/v2-core";
import { fromMC, lineType, normalise, type LineState, lineQ } from "@workspace/v2-linear";
import { chipRep, ObjectChip, repText, RepView } from "../src/index.ts";

const mc = (m: Q, c: Q): LineState => ({ lines: [fromMC(m, c)] });
const abc = (a: bigint, b: bigint, c: bigint): LineState => ({ lines: [normalise(a, b, c) as never] });
const text = (h: string) => h.replace(/<\/div>/g, " | ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const BAD = /(^|[^\d⁄₀-₉⁰-⁹.,])1 ?[xy]\b|−1 ?[xy]\b|(^|[^\d⁄₀-₉⁰-⁹.,])0 ?[xy]\b|\+ 0(?![\d.,⁄])|[+−] [+−]|\+ −|− −/;

const LINES: [string, LineState][] = [];
for (const m of [q(-1), q(1), q(0), q(59), q(2, 3), q(-1, 2)]) for (const c of [q(0), q(12), q(-3), q(1, 3)]) LINES.push([`m=${m.n}/${m.d} c=${c.n}/${c.d}`, mc(m, c)]);
LINES.push(["x = 3", abc(1n, 0n, -3n)], ["x = −2", abc(1n, 0n, 2n)], ["x = 0", abc(1n, 0n, 0n)], ["3x = 7", abc(3n, 0n, -7n)]);
const EQUATIONS = lineType.representations.filter(r => r.scene === "equation").map(r => r.id);

test("every equation view, drawn compact or expanded, and every chip and text: no 1x, −1x, 0x, + 0, + −", () => {
  for (const [name, s] of LINES) {
    const chip = text(renderToStaticMarkup(<ObjectChip type={lineType} state={s} />));
    assert.doesNotMatch(chip, BAD, `${name} chip: ${chip}`);
    for (const rep of EQUATIONS) {
      const t = repText(lineType, s, rep);
      assert.doesNotMatch(t, BAD, `${name} ${rep} text: ${t}`);
      for (const size of ["compact", "expanded"] as const) {
        const h = text(renderToStaticMarkup(<RepView type={lineType} state={s} rep={rep} size={size} />));
        assert.doesNotMatch(h, BAD, `${name} ${rep} ${size}: ${h}`);
      }
    }
  }
});

test("the reported lines read as a person writes them", () => {
  assert.equal(repText(lineType, mc(q(-1), q(12)), "si"), "y = −x + 12");
  assert.equal(repText(lineType, mc(q(59), q(0)), "si"), "y = 59x");
  assert.match(text(renderToStaticMarkup(<RepView type={lineType} state={mc(q(59), q(0))} rep="si" size="compact" />)), /^y = 59 ?x[ |]*$/);
  assert.match(text(renderToStaticMarkup(<RepView type={lineType} state={mc(q(0), q(0))} rep="si" size="compact" />)), /^y = 0[ |]*$/);
});

test("a vertical line's chip says what it is: x = 3, never x − 3 = 0", () => {
  const v = abc(1n, 0n, -3n);
  assert.equal(text(renderToStaticMarkup(<ObjectChip type={lineType} state={v} />)), "x = 3");
  assert.equal(text(renderToStaticMarkup(<ObjectChip type={lineType} state={abc(3n, 0n, -7n)} />)), "x = 2⅓");
  assert.equal(repText(lineType, v, chipRep(lineType, v)), "x = 3");
});

test("a vertical line in a view that cannot show it: the view names it (x = 3) before saying why, and the compact face says what would make it score", async () => {
  const { CompactFace } = await import("../src/index.ts");
  // Prime Gradient reads only the gradient, which a vertical line lacks (Prime Landing now reads its x-axis landing).
  const { primeHug, lineQ } = await import("@workspace/v2-linear");
  const v = abc(1n, 0n, -3n);
  const si = text(renderToStaticMarkup(<RepView type={lineType} state={v} rep="si" size="compact" />));
  assert.match(si, /^x = 3\b.*a vertical line has no gradient or y-intercept/, si);
  const rule = { type: lineType, family: primeHug, params: primeHug.dealable(lineQ)[0], variant: lineQ, tieBreaker: null } as never;
  const face = text(renderToStaticMarkup(<CompactFace rule={rule} state={v} toScore />));
  assert.match(face, /x = 3/, face);
  assert.match(face, /not scoring/, face);
  assert.match(face, /To score: .+/, face);
});

test("the act log names a vertical line too: x = 3 → y = 3, never its reason sentence", async () => {
  const { MoveLine } = await import("../src/index.ts");
  const { multiples, lineQ } = await import("@workspace/v2-linear");
  const rule = { type: lineType, family: multiples, params: multiples.dealable(lineQ)[0], variant: lineQ, tieBreaker: null } as never;
  const t = text(renderToStaticMarkup(<MoveLine rule={rule} before={abc(1n, 0n, -3n)} after={mc(q(0), q(3))} who="Your agent" what="reflect in y = x" />));
  assert.match(t, /x = 3 → y = 3/, t);
  assert.doesNotMatch(t, /vertical line has no gradient or y-intercept →/, t);
});

test("one form per place (playtest round 12): a three-digit denominator is exact; beyond it a decimal, and the equation says ≈", () => {
  assert.equal(repText(lineType, mc(q(497, 162), q(1, 108)), "si"), "y = 3¹¹⁄₁₆₂x + ¹⁄₁₀₈");
  const far = repText(lineType, mc(q(3001, 1000), q(1)), "si");
  assert.equal(far, "y ≈ 3.00x + 1");
  assert.doesNotMatch(far, /=/);
});

test("a long equation in a compact face is set smaller, never pushed past the card's edge (playtest round 12)", () => {
  const html = renderToStaticMarkup(<RepView type={lineType} state={mc(q(497, 162), q(1, 108))} rep="si" size="compact" />);
  const size = /class="v2v-eq-line"[^>]*style="font-size:(\d+)px"/.exec(html);
  assert.ok(size && Number(size[1]) < 21, html.slice(0, 300));
});
