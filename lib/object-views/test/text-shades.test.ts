/**
 * The display shades of the Grid renderers, per colour SET (rgb, rgby, rainbow6) and scheme, held to requirements
 * that model how the digits are actually seen (see grid-display.ts above DIGIT_SHADES):
 *
 * - legible: the digits are WCAG large text (14 pt bold or more), so every light shade reaches 3:1 on every light
 *   page, card, popover and muted surface of both apps; dark shades reach 4.5:1 on the dark surfaces and under the
 *   tile glyph;
 * - distinguishable as a digit stroke at a distance: the smallest pairwise S-CIELAB CIEDE2000 (src/colour-science.ts)
 *   at DIGIT_TYPE seen at VIEW_PX_PER_DEGREE, for normal vision, with the fovea's tritanopia, and under deuteranopia
 *   and protanopia, stays above each set's floor;
 * - blue and green differ in L* by at least BLUE_GREEN_MIN_DL;
 * - each shade sits in the OKLCH box where it reads as its name (SHADE_WINDOWS).
 *
 * The CSS custom properties in both apps' index.css must carry exactly these values.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { COLOUR_COMPONENTS, GRID_COLOUR_SETS, type GridColourSet } from "@workspace/game-types";
import {
  BLUE_GREEN_MIN_DL, BLUE_GREEN_MIN_TRITAN, DIGIT_SHADES, DIGIT_TYPE, MIN_CONTRAST, PAGE, SHADE_WINDOWS, TEXT_SHADES, TILE_INK, contrastRatio, deltaE76,
  digitStrokeDeg, gridModel, labHue, labOf, textShadeToken, textShadeVar,
} from "../src/grid-display.ts";
import { deltaE2000, deltaE2000Lab, deltaEOk, oklchOf, simulateHex, smallFieldMetrics } from "../src/colour-science.ts";

const css = (app: string) => readFileSync(new URL(`../../../artifacts/${app}/src/index.css`, import.meta.url), "utf8");
const APPS = ["player-web", "code-gods"] as const;

/** `hsl(H S% L%)` → #rrggbb (CSS Color 4). */
function hslHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}
/** The declarations of the first rule whose selector is exactly `selector`. */
function block(source: string, selector: string): string {
  const at = source.search(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`));
  assert.ok(at >= 0, `no ${selector} rule`);
  const open = source.indexOf("{", at);
  return source.slice(open + 1, source.indexOf("}", open));
}
const token = (decls: string, name: string): string | undefined => decls.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
const hslToken = (decls: string, name: string): string => {
  const v = token(decls, name);
  assert.ok(v, `--${name} missing`);
  const [h, s, l] = v.split(/\s+/).map(x => parseFloat(x));
  return hslHex(h, s, l);
};
const SURFACES = ["background", "card", "popover", "muted"];
const relativeDark = (hex: string) => labOf(hex)[0] < 50;

/** Every background each scheme's shades sit on, from the CSS itself. The player client's `.dark` is its light paper. */
function backgrounds(): { light: Map<string, string>; dark: Map<string, string> } {
  const light = new Map<string, string>(), dark = new Map<string, string>();
  for (const app of APPS) {
    const source = css(app);
    for (const s of SURFACES) light.set(`${app} :root --${s}`, hslToken(block(source, ":root"), s));
    const darkBlock = block(source, ".dark");
    const scheme = relativeDark(hslToken(darkBlock, "background")) ? dark : light;
    for (const s of SURFACES) scheme.set(`${app} .dark --${s}`, hslToken(darkBlock, s));
  }
  return { light, dark };
}
const shadesOf = (set: GridColourSet, scheme: "light" | "dark") => COLOUR_COMPONENTS[set].letters.map(l => DIGIT_SHADES[set][scheme][l]);

/**
 * Floors per set and scheme on the smallest pairwise small-field CIEDE2000 (S-CIELAB at DIGIT_TYPE, 60 px per degree):
 * [normal vision, foveal tritanopia, worst of deuteranopia and protanopia]. The shades before this derivation (PR #88:
 * 12 px semibold, every shade at 4.5:1) reached, light: rgb 1.8 / 1.1 / 1.0, rgby 0.8 / 0.6 / 0.6, rainbow6 0.7 / 0.6 /
 * 0.2 (blue and green 1.1 and 0.7 for the tritan eye), so a regression to them fails.
 */
const FLOORS: Record<GridColourSet, Record<"light" | "dark", [number, number, number]>> = {
  rgb: { light: [7, 2.9, 3.4], dark: [24, 24, 20] },
  rgby: { light: [2.2, 2.2, 0.95], dark: [14, 13, 10.5] },
  rainbow6: { light: [1.85, 1.7, 1.05], dark: [11, 12.5, 5.4] },
};
const PR88 = {
  rgb: ["#bb061e", "#06641a", "#0555e7"], rgby: ["#9e0a1e", "#806000", "#0a5c1c", "#0555e7"],
  rainbow6: ["#c20d39", "#773a0e", "#695f01", "#1d7242", "#0555e7", "#aa01bc"],
} as const;

test("hand-checked colour science: hsl, Lab, CIE76, CIEDE2000 and CVD simulation", () => {
  assert.equal(hslHex(40, 33, 94), "#f5f1eb");
  assert.equal(hslHex(0, 100, 50), "#ff0000");
  const [L, a, b] = labOf("#ffffff");
  assert.ok(Math.abs(L - 100) < 0.01 && Math.abs(a) < 0.01 && Math.abs(b) < 0.01, "white is L*100, a*0, b*0");
  const red = labOf("#ff0000");
  assert.ok(Math.abs(red[0] - 53.24) < 0.1 && Math.abs(red[1] - 80.09) < 0.2 && Math.abs(red[2] - 67.2) < 0.2, red.join(","));
  assert.ok(Math.abs(deltaE76("#000000", "#ffffff") - 100) < 0.01);
  assert.ok(Math.abs(labHue("#ff0000") - 40) < 1, "red's Lab hue is about 40°");
  // Sharma, Wu and Dalal (2005), table 1: pairs 1, 3 and 7.
  assert.ok(Math.abs(deltaE2000Lab([50, 2.6772, -79.7751], [50, 0, -82.7485]) - 2.0425) < 1e-4);
  assert.ok(Math.abs(deltaE2000Lab([50, 2.8361, -74.02], [50, 0, -82.7485]) - 3.4412) < 1e-4);
  assert.ok(Math.abs(deltaE2000Lab([50, 0, 0], [50, -1, 2]) - 2.3669) < 1e-4);
  assert.ok(Math.abs(deltaE2000("#000000", "#ffffff") - 100) < 0.01);
  // OKLCH of pure red (Ottosson's reference: L 0.628, C 0.258, h 29.2).
  const [oL, oC, oh] = oklchOf("#ff0000");
  assert.ok(Math.abs(oL - 0.628) < 0.002 && Math.abs(oC - 0.258) < 0.002 && Math.abs(oh - 29.2) < 0.3, `${oL} ${oC} ${oh}`);
  // Machado's matrices keep greys grey, and a red and a green of equal luminance collapse for a deuteranope.
  for (const v of ["protan", "deutan", "tritan"] as const) assert.ok(deltaEOk("#808080", simulateHex("#808080", v)) < 1, `${v} grey`);
  assert.ok(deltaEOk("#d33f2b", "#4b8a1a", "deutan") < deltaEOk("#d33f2b", "#4b8a1a") / 4);
});

test("every set has one shade per colour letter in both schemes, inside its name's OKLCH box", () => {
  for (const set of GRID_COLOUR_SETS) {
    const { letters, names } = COLOUR_COMPONENTS[set];
    for (const scheme of ["light", "dark"] as const) {
      assert.deepEqual(Object.keys(DIGIT_SHADES[set][scheme]).sort(), [...letters].sort(), `${set} ${scheme} letters`);
      letters.forEach((l, i) => {
        const [L, C, h] = oklchOf(DIGIT_SHADES[set][scheme][l]);
        const w = SHADE_WINDOWS[scheme][names[i]], where = `${set} ${scheme} ${names[i]} ${DIGIT_SHADES[set][scheme][l]}`;
        // Hex rounding moves a grid point by up to about 1° of hue and 0.005 of lightness.
        assert.ok(h >= w.hue[0] - 1 && h <= w.hue[1] + 1, `${where}: hue ${h.toFixed(1)} outside ${w.hue.join("–")}`);
        assert.ok(L >= w.L[0] - 0.006 && L <= w.L[1] + 0.006, `${where}: lightness ${L.toFixed(3)} outside ${w.L.join("–")}`);
        assert.ok(C >= w.minChroma - 0.005, `${where}: chroma ${C.toFixed(3)} under ${w.minChroma}`);
      });
    }
  }
  assert.equal(TEXT_SHADES, DIGIT_SHADES.rainbow6, "an unknown set uses rainbow6's shades, which name every letter");
});

test("the owner's names: orange is orange not brown, red darker than the old crimson, blue a blue", () => {
  // Orange vs brown is lightness: the old #773a0e (OKLCH L 0.42) read as brown; every light orange is now ≥ 0.62.
  assert.ok(oklchOf("#773a0e")[0] < 0.45 && SHADE_WINDOWS.light.orange.L[0] >= 0.62);
  // Red a little darker than #c20d39 (L* 41), still a red (L* ≥ 33, not a maroon).
  for (const set of GRID_COLOUR_SETS) {
    const L = labOf(DIGIT_SHADES[set].light.R)[0];
    assert.ok(L < labOf("#c20d39")[0] && L >= 33, `${set} light red L* ${L.toFixed(1)}`);
  }
  // Blue is not an indigo that reads near-black: no bluer-violet than pure #0000ff (OKLCH hue 264), and lighter than
  // the rejected #2900df (OKLCH L 0.42).
  assert.ok(Math.abs(oklchOf("#0000ff")[2] - 264) < 0.5 && SHADE_WINDOWS.light.blue.hue[1] <= 264);
  assert.ok(SHADE_WINDOWS.light.blue.L[0] > oklchOf("#2900df")[0] + 0.03);
});

test("the digits are WCAG large text, so light shades need 3:1; dark shades and tiles keep 4.5:1", () => {
  // 14 pt bold: 14 × 4/3 = 18.67 CSS px at weight 700 or more.
  assert.ok(DIGIT_TYPE.px >= 14 * 4 / 3 && DIGIT_TYPE.weight >= 700, "DIGIT_TYPE is large text");
  assert.equal(MIN_CONTRAST.light, 3);
  assert.equal(MIN_CONTRAST.dark, 4.5);
  const bg = backgrounds();
  assert.ok(bg.light.size >= 8 && bg.dark.size >= 4, "both apps' light surfaces and the engine UI's dark ones are checked");
  for (const set of GRID_COLOUR_SETS) for (const scheme of ["light", "dark"] as const) {
    for (const [letter, shade] of Object.entries(DIGIT_SHADES[set][scheme])) for (const [where, hex] of bg[scheme]) {
      const ratio = contrastRatio(shade, hex);
      assert.ok(ratio >= MIN_CONTRAST[scheme], `${set} ${scheme} ${letter} ${shade} on ${where} ${hex} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("each set stays apart as a small, distant digit stroke for every eye (small-field CIEDE2000 floors)", () => {
  const stroke = digitStrokeDeg();
  // A 19 px bold stem (0.115 em) at 60 px per degree is 0.036°, about 2 arcminutes.
  assert.ok(Math.abs(stroke - 19 * 0.115 / 60) < 1e-9);
  for (const set of GRID_COLOUR_SETS) for (const scheme of ["light", "dark"] as const) {
    const m = smallFieldMetrics(shadesOf(set, scheme), PAGE[scheme], stroke);
    const [n, t, cvd] = FLOORS[set][scheme], where = `${set} ${scheme}`;
    assert.ok(m.normal >= n, `${where}: normal ${m.normal.toFixed(2)} < ${n}`);
    assert.ok(m.tritan >= t, `${where}: foveal tritan ${m.tritan.toFixed(2)} < ${t}`);
    assert.ok(Math.min(m.deutan, m.protan) >= cvd, `${where}: deutan/protan ${Math.min(m.deutan, m.protan).toFixed(2)} < ${cvd}`);
  }
  // The floors exclude the shades they replace, even had those been drawn at the new size.
  for (const set of GRID_COLOUR_SETS) {
    const old = smallFieldMetrics(PR88[set], PAGE.light, stroke), [n, t, cvd] = FLOORS[set].light;
    assert.ok(old.normal < n || old.tritan < t || Math.min(old.deutan, old.protan) < cvd, `${set}: the PR #88 shades would pass`);
  }
});

test("blue and green never rely on blue–yellow: they differ in L* by at least BLUE_GREEN_MIN_DL", () => {
  assert.ok(BLUE_GREEN_MIN_DL >= 15);
  for (const set of GRID_COLOUR_SETS) for (const scheme of ["light", "dark"] as const) {
    const { G, B } = DIGIT_SHADES[set][scheme], dL = Math.abs(labOf(G)[0] - labOf(B)[0]);
    assert.ok(dL >= BLUE_GREEN_MIN_DL, `${set} ${scheme} green ${G} / blue ${B}: ΔL* ${dL.toFixed(1)}`);
  }
  // The pair the owner could not tell apart. PR #88's greens and blues sat within 8 L* of each other, and as fixated
  // strokes the tritan fovea kept almost nothing between them, even drawn at the new size; now every pair keeps at
  // least BLUE_GREEN_MIN_TRITAN.
  const stroke = digitStrokeDeg();
  const tritan = (g: string, b: string) => smallFieldMetrics([g, b], PAGE.light, stroke).tritan;
  for (const g of ["#06641a", "#0a5c1c", "#1d7242"]) assert.ok(tritan(g, "#0555e7") < 2.2 && Math.abs(labOf(g)[0] - labOf("#0555e7")[0]) < 9, g);
  assert.ok(BLUE_GREEN_MIN_TRITAN >= 3);
  for (const set of GRID_COLOUR_SETS) for (const scheme of ["light", "dark"] as const) {
    const { G, B } = DIGIT_SHADES[set][scheme];
    const t = smallFieldMetrics([G, B], PAGE[scheme], stroke).tritan;
    assert.ok(t >= BLUE_GREEN_MIN_TRITAN, `${set} ${scheme} green ${G} / blue ${B}: foveal tritan ${t.toFixed(2)}`);
  }
});

test("tile fills are the set's bright shades with a dark glyph that reads on each (≥ 4.5:1)", () => {
  for (const set of GRID_COLOUR_SETS) for (const [letter, fill] of Object.entries(DIGIT_SHADES[set].dark)) {
    assert.ok(contrastRatio(TILE_INK, fill) >= 4.5, `${set} ${letter} tile`);
  }
  const m = gridModel("7R,3G,0B/1R,2R,9B/4G,4G,8R", { size: 3, symbols: "base10", colours: "rgb" });
  assert.ok(m, "a strict rgb grid");
  assert.equal(m!.colours, "rgb");
  assert.deepEqual(m!.rows[0].map(c => [c.css, c.ink]), (["R", "G", "B"] as const).map(l => [DIGIT_SHADES.rgb.dark[l], TILE_INK]));
  assert.equal(m!.strict, true);
  assert.equal(gridModel("7R,3G,0B/1R,2R,9B/4G,4G,8R")!.colours, undefined, "no settings, no set");
});

test("the small-field model judges the shades on the apps' real pages", () => {
  // The player client's page (both its themes keep the paper) and the engine UI's dark page.
  assert.equal(hslToken(block(css("player-web"), ":root"), "background"), PAGE.light);
  assert.equal(hslToken(block(css("code-gods"), ".dark"), "background"), PAGE.dark);
});

test("both apps define the shades as --cg-ink-* (light under :root; the engine UI's real dark theme under .dark)", () => {
  for (const app of APPS) {
    const source = css(app);
    const root = block(source, ":root"), dark = block(source, ".dark");
    const darkIsDark = relativeDark(hslToken(dark, "background"));
    for (const set of GRID_COLOUR_SETS) for (const [letter, hex] of Object.entries(DIGIT_SHADES[set].light)) {
      const name = textShadeToken(letter, set).slice(2);
      assert.equal(token(root, name)?.toLowerCase(), hex, `${app} :root --${name}`);
      // A `.dark` that keeps a light page (the player client's paper) inherits the light shades from :root.
      const got = token(dark, name)?.toLowerCase() ?? (darkIsDark ? undefined : hex);
      assert.equal(got, darkIsDark ? DIGIT_SHADES[set].dark[letter] : hex, `${app} .dark --${name}`);
    }
    // Neither app's page follows the OS colour scheme, so dark shades keyed to it would put light text on a light page.
    for (const media of source.matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?)\n\}/g)) {
      if (/--cg-ink-/.test(media[1])) assert.match(media[1], /--background:/, `${app}: dark shades follow the OS only where the page does`);
    }
  }
});

test("a glyph's colour is its set's custom property with the light shade as fallback", () => {
  assert.equal(textShadeVar("R"), `var(--cg-ink-R, ${DIGIT_SHADES.rainbow6.light.R})`);
  assert.equal(textShadeVar("R", "rainbow6"), `var(--cg-ink-R, ${DIGIT_SHADES.rainbow6.light.R})`);
  assert.equal(textShadeVar("G", "rgb"), `var(--cg-ink-rgb-G, ${DIGIT_SHADES.rgb.light.G})`);
  assert.equal(textShadeVar("Y", "rgby"), `var(--cg-ink-rgby-Y, ${DIGIT_SHADES.rgby.light.Y})`);
  assert.equal(textShadeVar("?"), "currentColor");
  assert.equal(textShadeVar("O", "rgb"), `var(--cg-ink-O, ${DIGIT_SHADES.rainbow6.light.O})`, "a letter outside the set: the unknown-set shade, like its tile");
});
