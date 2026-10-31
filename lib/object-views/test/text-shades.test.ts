/**
 * The text shades of the "digits" grid renderer: every colour letter's glyph colour must read on the apps' page,
 * card, popover and muted backgrounds (WCAG AA, 4.5:1), and the six shades of one scheme must stay apart from each
 * other (CIE76 ΔE ≥ 25, and at least 25° of Lab hue, so red, orange and yellow never collide). The CSS custom
 * properties in both apps' index.css must carry exactly these values.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { COLOUR_LETTERS } from "@workspace/game-types";
import { TEXT_SHADES, contrastRatio, deltaE76, labHue, labOf, textShadeVar } from "../src/grid-display.ts";

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
const relativeDark = (hex: string) => labOf(hex)[0] < 50;

test("hand-checked colour science: hsl, Lab and CIE76", () => {
  assert.equal(hslHex(40, 33, 94), "#f5f1eb");
  assert.equal(hslHex(0, 100, 50), "#ff0000");
  const [L, a, b] = labOf("#ffffff");
  assert.ok(Math.abs(L - 100) < 0.01 && Math.abs(a) < 0.01 && Math.abs(b) < 0.01, "white is L*100, a*0, b*0");
  assert.ok(Math.abs(labOf("#000000")[0]) < 0.01);
  // sRGB red is about L*53.2, a*80.1, b*67.2 (standard D65 tables).
  const red = labOf("#ff0000");
  assert.ok(Math.abs(red[0] - 53.24) < 0.1 && Math.abs(red[1] - 80.09) < 0.2 && Math.abs(red[2] - 67.2) < 0.2, red.join(","));
  assert.ok(Math.abs(deltaE76("#000000", "#ffffff") - 100) < 0.01);
  assert.ok(Math.abs(labHue("#ff0000") - 40) < 1, "red's Lab hue is about 40°");
});

test("every shade reads on every page, card, popover and muted background of its scheme (≥ 4.5:1)", () => {
  const bg = backgrounds();
  assert.ok(bg.light.size >= 8 && bg.dark.size >= 4, "both apps' light surfaces and the engine UI's dark ones are checked");
  for (const scheme of ["light", "dark"] as const) {
    for (const [letter, shade] of Object.entries(TEXT_SHADES[scheme])) {
      for (const [where, hex] of bg[scheme]) {
        const ratio = contrastRatio(shade, hex);
        assert.ok(ratio >= 4.5, `${scheme} ${letter} ${shade} on ${where} ${hex} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test("the shades of a scheme are mutually distinguishable (ΔE76 ≥ 25, hue ≥ 25° apart)", () => {
  for (const scheme of ["light", "dark"] as const) {
    const entries = Object.entries(TEXT_SHADES[scheme]);
    assert.deepEqual(entries.map(([l]) => l).sort(), Object.keys(COLOUR_LETTERS).sort(), `${scheme}: one shade per colour letter`);
    for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
      const [la, a] = entries[i], [lb, b] = entries[j];
      const d = deltaE76(a, b);
      assert.ok(d >= 25, `${scheme} ${la}/${lb}: ΔE ${d.toFixed(1)}`);
      const dh = Math.abs(labHue(a) - labHue(b)), sep = Math.min(dh, 360 - dh);
      assert.ok(sep >= 25, `${scheme} ${la}/${lb}: hue ${sep.toFixed(0)}° apart`);
    }
  }
  // Yellow on a light page is a dark gold (L* well under 50), not a washed-out yellow.
  assert.ok(labOf(TEXT_SHADES.light.Y)[0] < 50);
});

test("both apps define the shades as --cg-ink-* (light under :root; the engine UI's real dark theme under .dark)", () => {
  for (const app of APPS) {
    const source = css(app);
    const root = block(source, ":root"), dark = block(source, ".dark");
    const darkIsDark = relativeDark(hslToken(dark, "background"));
    for (const [letter, hex] of Object.entries(TEXT_SHADES.light)) {
      assert.equal(token(root, `cg-ink-${letter}`)?.toLowerCase(), hex, `${app} :root --cg-ink-${letter}`);
      // A `.dark` that keeps a light page (the player client's paper) inherits the light shades from :root.
      const got = token(dark, `cg-ink-${letter}`)?.toLowerCase() ?? (darkIsDark ? undefined : hex);
      assert.equal(got, darkIsDark ? TEXT_SHADES.dark[letter] : hex, `${app} .dark --cg-ink-${letter}`);
    }
    // Neither app's page follows the OS colour scheme, so dark shades keyed to it would put light text on a light page.
    for (const media of source.matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?)\n\}/g)) {
      if (/--cg-ink-/.test(media[1])) assert.match(media[1], /--background:/, `${app}: dark shades follow the OS only where the page does`);
    }
  }
});

test("a glyph's colour is the custom property with the light shade as fallback", () => {
  assert.equal(textShadeVar("R"), `var(--cg-ink-R, ${TEXT_SHADES.light.R})`);
  assert.equal(textShadeVar("?"), "currentColor");
});
