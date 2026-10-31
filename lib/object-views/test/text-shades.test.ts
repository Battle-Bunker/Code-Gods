/**
 * The display shades of the Grid renderers, per colour SET (rgb, rgby, rainbow6) and scheme: every shade reads on the
 * apps' page, card, popover and muted backgrounds of its scheme (WCAG AA, 4.5:1); the shades of one set stay apart
 * for normal vision (CIEDE2000) and under protanopia, deuteranopia and tritanopia (OKLab ΔE×100, Machado 2009; the
 * dataviz method's target is 8, its floor 6 with a secondary cue, which the letter and pattern cues are); each stays
 * inside the hue window where it reads as its name. The CSS custom properties in both apps' index.css must carry
 * exactly these values.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { COLOUR_COMPONENTS, GRID_COLOUR_SETS, type GridColourSet } from "@workspace/game-types";
import {
  DIGIT_SHADES, NAME_HUES, TEXT_SHADES, TILE_INK, contrastRatio, deltaE76, gridModel, labHue, labOf, textShadeToken, textShadeVar,
} from "../src/grid-display.ts";
import { deltaE2000, deltaE2000Lab, deltaEOk, oklchOf, paletteMetrics, simulateHex } from "../src/colour-science.ts";

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
 * Floors per set and scheme: [min CIEDE2000, min OKLab ΔE×100 under protanopia/deuteranopia, under tritanopia]. Each
 * is above what the previous, per-letter shades reached (rgb light 42.9 / 6.9 / 5.0, rgby 25.5 / 4.3 / 5.0, rainbow6
 * 19.9 / 2.2 / 5.0; dark rgb 42.3 / 4.2 / 6.4, rgby 28.4 / 4.2 / 6.4, rainbow6 26.3 / 3.0 / 6.4), so a regression to
 * them fails.
 */
const FLOORS: Record<GridColourSet, Record<"light" | "dark", [number, number, number]>> = {
  rgb: { light: [48, 8.5, 8.5], dark: [52, 22, 22] },
  rgby: { light: [31, 6.5, 7.5], dark: [42, 14, 17] },
  rainbow6: { light: [22.5, 5, 7.5], dark: [30, 10.5, 11] },
};

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

test("every set has one shade per colour letter in both schemes, inside its name's hue window", () => {
  for (const set of GRID_COLOUR_SETS) {
    const { letters, names } = COLOUR_COMPONENTS[set];
    for (const scheme of ["light", "dark"] as const) {
      assert.deepEqual(Object.keys(DIGIT_SHADES[set][scheme]).sort(), [...letters].sort(), `${set} ${scheme} letters`);
      letters.forEach((l, i) => {
        const [, C, h] = oklchOf(DIGIT_SHADES[set][scheme][l]);
        const [lo, hi] = NAME_HUES[names[i]];
        assert.ok(h >= lo - 0.5 && h <= hi + 0.5, `${set} ${scheme} ${names[i]} hue ${h.toFixed(1)} outside ${lo}–${hi}`);
        assert.ok(C >= 0.095, `${set} ${scheme} ${names[i]} chroma ${C.toFixed(3)}: reads grey`);
      });
    }
  }
  assert.equal(TEXT_SHADES, DIGIT_SHADES.rainbow6, "an unknown set uses rainbow6's shades, which name every letter");
});

test("every shade reads on every page, card, popover and muted background of its scheme (≥ 4.5:1)", () => {
  const bg = backgrounds();
  assert.ok(bg.light.size >= 8 && bg.dark.size >= 4, "both apps' light surfaces and the engine UI's dark ones are checked");
  for (const set of GRID_COLOUR_SETS) for (const scheme of ["light", "dark"] as const) {
    for (const [letter, shade] of Object.entries(DIGIT_SHADES[set][scheme])) for (const [where, hex] of bg[scheme]) {
      const ratio = contrastRatio(shade, hex);
      assert.ok(ratio >= 4.5, `${set} ${scheme} ${letter} ${shade} on ${where} ${hex} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("the shades of each set are far apart for normal vision and under protanopia, deuteranopia and tritanopia", () => {
  const bg = backgrounds();
  for (const set of GRID_COLOUR_SETS) for (const scheme of ["light", "dark"] as const) {
    const m = paletteMetrics(shadesOf(set, scheme), [...bg[scheme].values()]);
    const [dE, cvd, tritan] = FLOORS[set][scheme];
    const where = `${set} ${scheme}`;
    assert.ok(m.minDeltaE2000 >= dE, `${where}: min ΔE2000 ${m.minDeltaE2000.toFixed(1)} < ${dE}`);
    assert.ok(Math.min(m.minProtan, m.minDeutan) >= cvd, `${where}: min CVD ΔE ${Math.min(m.minProtan, m.minDeutan).toFixed(1)} < ${cvd}`);
    assert.ok(m.minTritan >= tritan, `${where}: min tritan ΔE ${m.minTritan.toFixed(1)} < ${tritan}`);
  }
  // The owner's complaint: blue and green were the hardest pair. In the three-colour set they are now far apart even
  // for a small-field (tritan) eye, where the old #147137 / #1d5bbd sat at 5.0, under the dataviz floor of 6.
  assert.ok(deltaEOk("#147137", "#1d5bbd", "tritan") < 5.5);
  assert.ok(deltaEOk(DIGIT_SHADES.rgb.light.G, DIGIT_SHADES.rgb.light.B, "tritan") >= 8.5);
  assert.ok(deltaE2000(DIGIT_SHADES.rgb.light.G, DIGIT_SHADES.rgb.light.B) > deltaE2000("#147137", "#1d5bbd"));
  // Yellow on a light page is a dark gold (L* well under 50), not a washed-out yellow.
  assert.ok(labOf(DIGIT_SHADES.rainbow6.light.Y)[0] < 50 && labOf(DIGIT_SHADES.rgby.light.Y)[0] < 50);
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
