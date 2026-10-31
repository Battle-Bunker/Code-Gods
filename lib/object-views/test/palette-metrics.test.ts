/**
 * The payoff's colour coding (src/dimensions.ts): "yours" and "others" read as text on every surface of their scheme,
 * stay apart from each other and from the score ramp's strong end for normal vision and under protanopia and
 * deuteranopia (the dataviz method, all pairs: CVD ΔE ≥ 8, normal ≥ 15), and sit away from every digit shade's hue;
 * the ramp runs muted → strong in one hue; relative strength is clamped; both apps carry the tokens.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { GRID_COLOUR_SETS } from "@workspace/game-types";
import { DIMENSION_COLOURS, SCORE_RAMP, dimensionVar, rampHex, rampVar, relativeStrength } from "../src/dimensions.ts";
import { DIGIT_SHADES } from "../src/grid-display.ts";
import { contrastRatio, deltaEOk, oklchOf } from "../src/colour-science.ts";

// The surfaces the dimension colours sit on (both apps' light :root and the engine UI's dark .dark; text-shades.test.ts
// reads the same values from the CSS).
const LIGHT = ["#f5f1eb", "#faf9f4", "#e8e2d9", "#f6f4ee", "#fcfbf8", "#ebe7e0"];
const DARK = ["#11131d", "#171927", "#212331"];

for (const [scheme, surfaces] of [["light", LIGHT], ["dark", DARK]] as const) {
  test(`${scheme}: yours and others read as text on every surface (≥ 4.5:1)`, () => {
    for (const [d, hex] of Object.entries(DIMENSION_COLOURS[scheme])) for (const s of surfaces) {
      assert.ok(contrastRatio(hex, s) >= 4.5, `${d} ${hex} on ${s}: ${contrastRatio(hex, s).toFixed(2)}`);
    }
  });

  test(`${scheme}: yours, others and the ramp's strong end are apart for every eye (all pairs)`, () => {
    const { yours, others } = DIMENSION_COLOURS[scheme];
    const trio = [yours, others, SCORE_RAMP[scheme].high];
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const [a, b] = [trio[i], trio[j]];
      assert.ok(deltaEOk(a, b) >= 15, `${a}/${b} normal ${deltaEOk(a, b).toFixed(1)}`);
      for (const v of ["protan", "deutan"] as const) assert.ok(deltaEOk(a, b, v) >= 8, `${a}/${b} ${v} ${deltaEOk(a, b, v).toFixed(1)}`);
    }
  });

  test(`${scheme}: the dimension colours' hues sit away from every digit shade's hue (≥ 15° OKLCH)`, () => {
    for (const [d, hex] of Object.entries(DIMENSION_COLOURS[scheme])) {
      const h = oklchOf(hex)[2];
      for (const set of GRID_COLOUR_SETS) for (const [l, shade] of Object.entries(DIGIT_SHADES[set][scheme])) {
        const dh = Math.abs(h - oklchOf(shade)[2]), sep = Math.min(dh, 360 - dh);
        assert.ok(sep >= 15, `${d} ${hex} vs ${set} ${l} ${shade}: ${sep.toFixed(1)}°`);
      }
    }
  });

  test(`${scheme}: the ramp is one hue, muted at low strength and strong at high`, () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map(t => oklchOf(rampHex(t, scheme)));
    assert.equal(rampHex(0, scheme), SCORE_RAMP[scheme].low);
    assert.equal(rampHex(1, scheme), SCORE_RAMP[scheme].high);
    const surface = oklchOf(surfaces[0])[0];
    // Monotone lightness, moving away from the surface: the strong end contrasts most.
    for (let i = 1; i < steps.length; i++) {
      assert.ok(Math.abs(steps[i][0] - surface) > Math.abs(steps[i - 1][0] - surface), `step ${i} moves away from the surface`);
    }
    assert.ok(steps[4][1] > steps[0][1], "more chroma at the strong end");
    const hues = steps.map(s => s[2]);
    assert.ok(Math.max(...hues) - Math.min(...hues) < 8, `one hue: ${hues.map(h => h.toFixed(0)).join(", ")}`);
    assert.ok(contrastRatio(SCORE_RAMP[scheme].high, surfaces[0]) >= 3, "the strong end reads as a mark (≥ 3:1)");
  });
}

test("relative strength: the payoff over the best shown, 0 for losses and nothing, clamped to 1", () => {
  assert.equal(relativeStrength(50, 100), 0.5);
  assert.equal(relativeStrength(100, 100), 1);
  assert.equal(relativeStrength(150, 100), 1);
  assert.equal(relativeStrength(-5, 100), 0);
  assert.equal(relativeStrength(5, 0), 0);
  assert.equal(relativeStrength(Number.NaN, 10), 0);
  assert.equal(rampHex(Number.NaN), SCORE_RAMP.light.low);
  assert.equal(rampHex(7), SCORE_RAMP.light.high);
});

test("CSS: the theme-following forms fall back to the light colours", () => {
  assert.equal(dimensionVar("yours"), `var(--cg-yours, ${DIMENSION_COLOURS.light.yours})`);
  assert.equal(dimensionVar("others"), `var(--cg-others, ${DIMENSION_COLOURS.light.others})`);
  assert.match(rampVar(0.5), /var\(--cg-ramp-high, #9a6005\) 50%, var\(--cg-ramp-low, #e2c5a0\)/);
  assert.match(rampVar(2), / 100%,/);
});

test("both apps carry the tokens (light under :root; the engine UI's dark theme under .dark)", () => {
  const block = (src: string, sel: string) => { const at = src.search(new RegExp(`(^|\\n)\\${sel}\\s*\\{`)); const o = src.indexOf("{", at); return src.slice(o + 1, src.indexOf("}", o)); };
  const tok = (decls: string, name: string) => decls.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim().toLowerCase();
  for (const app of ["player-web", "code-gods"]) {
    const src = readFileSync(new URL(`../../../artifacts/${app}/src/index.css`, import.meta.url), "utf8");
    const root = block(src, ":root");
    assert.equal(tok(root, "cg-yours"), DIMENSION_COLOURS.light.yours, `${app} --cg-yours`);
    assert.equal(tok(root, "cg-others"), DIMENSION_COLOURS.light.others, `${app} --cg-others`);
    assert.equal(tok(root, "cg-ramp-low"), SCORE_RAMP.light.low, `${app} --cg-ramp-low`);
    assert.equal(tok(root, "cg-ramp-high"), SCORE_RAMP.light.high, `${app} --cg-ramp-high`);
  }
  const dark = block(readFileSync(new URL("../../../artifacts/code-gods/src/index.css", import.meta.url), "utf8"), ".dark");
  assert.equal(tok(dark, "cg-yours"), DIMENSION_COLOURS.dark.yours);
  assert.equal(tok(dark, "cg-others"), DIMENSION_COLOURS.dark.others);
  assert.equal(tok(dark, "cg-ramp-low"), SCORE_RAMP.dark.low);
  assert.equal(tok(dark, "cg-ramp-high"), SCORE_RAMP.dark.high);
});
