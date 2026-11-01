/**
 * Re-derives the digits renderer's shades per colour SET (rgb, rgby, rainbow6) and scheme (light, dark):
 *
 *   node --experimental-strip-types lib/object-views/scripts/derive-palettes.ts
 *
 * What it optimises, and why (the full rationale is in src/grid-display.ts above DIGIT_SHADES):
 *
 * - The viewing condition, not a large patch. Each candidate is judged as a digit stroke (DIGIT_TYPE at
 *   VIEW_PX_PER_DEGREE) seen through S-CIELAB's spatial filters (Zhang and Wandell 1996) on the scheme's page. At
 *   that size the eye keeps about a third of a luminance difference, a sixth of a red–green one and an eighth of a
 *   blue–yellow one (small-field tritanopia), so the optimiser is pushed to separate colours in lightness and along
 *   red–green, not along blue–yellow alone.
 * - Every eye: the objective is the smallest small-field CIEDE2000 over all pairs for normal vision, plus the smallest
 *   for a tritanope (Machado 2009), plus the smallest under deuteranopia or protanopia; each deficiency is simulated
 *   before the spatial filter. The tritan term is not only for the rare tritanope: the central ~20 arcmin of the
 *   fovea has no S cones (foveal tritanopia, Willmer and Wright 1945), and a fixated digit falls inside it, which is
 *   why a blue and a green of one lightness merge for everybody.
 * - Names: each colour stays in its SHADE_WINDOWS box (OKLCH hue, lightness and a chroma floor) so it reads as its
 *   name: orange light enough not to read as brown, red a deep red, blue a blue rather than an indigo, yellow a gold.
 * - Legibility: every shade reaches MIN_CONTRAST on every surface of its scheme in both apps' index.css (light: WCAG
 *   large-text 3:1, because DIGIT_TYPE is 14 pt bold; dark: 4.5:1, which also makes the shades readable tile fills
 *   under TILE_INK).
 * - Blue and green: they must differ in L* by at least BLUE_GREEN_MIN_DL, so the pair never relies on blue–yellow.
 *
 * Search: the candidates are an OKLCH grid inside each window; coordinate ascent from seeded restarts
 * (deterministic). It prints the winners and their metrics; copy them into DIGIT_SHADES (src/grid-display.ts) and both
 * apps' --cg-ink-* tokens. test/text-shades.test.ts holds the floors.
 */
import { readFileSync } from "node:fs";
import { COLOUR_COMPONENTS, GRID_COLOUR_SETS } from "@workspace/game-types";
import {
  BLUE_GREEN_MIN_DL, BLUE_GREEN_MIN_TRITAN, MIN_CONTRAST, PAGE, SHADE_WINDOWS, TILE_INK, digitStrokeDeg, type ShadeScheme,
} from "../src/grid-display.ts";
import { contrastRatio, deltaE2000Lab, hexOfOklch, labOf, oklchOf, smallFieldLab, smallFieldMetrics, type Rgb, type Vision } from "../src/colour-science.ts";

const css = (app: string) => readFileSync(new URL(`../../../artifacts/${app}/src/index.css`, import.meta.url), "utf8");
function block(source: string, selector: string): string {
  const at = source.search(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`));
  const open = source.indexOf("{", at);
  return source.slice(open + 1, source.indexOf("}", open));
}
function hslHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}
const tok = (decls: string, name: string) => {
  const [h, s, l] = decls.match(new RegExp(`--${name}:\\s*([^;]+);`))![1].trim().split(/\s+/).map(parseFloat);
  return hslHex(h, s, l);
};
/** Every page, card, popover and muted surface of each scheme in both apps (the player client's `.dark` is light). */
export function surfaces(): { light: string[]; dark: string[] } {
  const light = new Set<string>(), dark = new Set<string>();
  for (const app of ["player-web", "code-gods"]) {
    const src = css(app);
    for (const s of ["background", "card", "popover", "muted"]) light.add(tok(block(src, ":root"), s));
    const d = block(src, ".dark");
    const into = labOf(tok(d, "background"))[0] < 50 ? dark : light;
    for (const s of ["background", "card", "popover", "muted"]) into.add(tok(d, s));
  }
  return { light: [...light], dark: [...dark] };
}

const VISIONS: readonly Vision[] = ["normal", "tritan", "deutan", "protan"];
interface Candidate { hex: string; chroma: number; L: number; seen: Rgb[] }

/** Every OKLCH grid point inside the name's window that is in gamut and legible on all `bg`. */
export function candidates(name: string, scheme: ShadeScheme, bg: readonly string[]): Candidate[] {
  const w = SHADE_WINDOWS[scheme][name], out = new Map<string, Candidate>(), stroke = digitStrokeDeg();
  const legible = (hex: string) => bg.every(s => contrastRatio(hex, s) >= MIN_CONTRAST[scheme]) &&
    (scheme === "light" || contrastRatio(hex, TILE_INK) >= 4.5);
  for (let h = w.hue[0]; h <= w.hue[1] + 1e-9; h += 2) for (let L = w.L[0]; L <= w.L[1] + 1e-9; L += 0.01) {
    for (let C = w.minChroma; C <= 0.4; C += 0.01) {
      const hex = hexOfOklch(L, C, h);
      if (!hex) break;
      if (!out.has(hex) && legible(hex)) {
        out.set(hex, { hex, chroma: C, L: labOf(hex)[0], seen: VISIONS.map(v => smallFieldLab(hex, PAGE[scheme], stroke, v)) });
      }
    }
  }
  return [...out.values()];
}

/** [normal, foveal tritan, worst of deutan/protan] small-field ΔE2000 for a pair. */
const pair = (a: Candidate, b: Candidate): [number, number, number] => {
  const d = a.seen.map((s, v) => deltaE2000Lab(s, b.seen[v]));
  return [d[0], d[1], Math.min(d[2], d[3])];
};
/**
 * The objective: the smallest small-field ΔE2000 for normal vision, plus the smallest with the fovea's tritanopia
 * (every viewer, when fixating a digit), plus the smallest under deuteranopia or protanopia.
 */
function score(cur: readonly Candidate[], names: readonly string[]): number {
  let n = Infinity, t = Infinity, c = Infinity;
  for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) {
    const [x, y, z] = pair(cur[i], cur[j]);
    if (isBlueGreen(names[i], names[j]) && (Math.abs(cur[i].L - cur[j].L) < BLUE_GREEN_MIN_DL || y < BLUE_GREEN_MIN_TRITAN)) return -Infinity;
    n = Math.min(n, x); t = Math.min(t, y); c = Math.min(c, z);
  }
  return n + t + c;
}
const isBlueGreen = (a: string, b: string) => (a === "blue" && b === "green") || (a === "green" && b === "blue");

export function derive(names: readonly string[], scheme: ShadeScheme, bg: readonly string[]): string[] {
  const pools = names.map(n => candidates(n, scheme, bg));
  for (const [i, p] of pools.entries()) if (!p.length) throw new Error(`${scheme} ${names[i]}: no legible candidate`);
  let seed = 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let best: Candidate[] = [], bestScore = -Infinity;
  for (let restart = 0; restart < 24; restart++) {
    const cur = pools.map(p => p[Math.floor(rand() * p.length)]);
    let s = score(cur, names), improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < cur.length; i++) for (const c of pools[i]) {
        const keep = cur[i];
        cur[i] = c;
        const t = score(cur, names);
        // Ties go to the more vivid shade.
        if (t > s + 1e-6 || (Math.abs(t - s) <= 1e-6 && c.chroma > keep.chroma + 1e-9)) { s = t; improved = true; } else cur[i] = keep;
      }
    }
    if (s > bestScore) { bestScore = s; best = cur.slice(); }
  }
  return best.map(c => c.hex);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bg = surfaces();
  console.log("surfaces", bg, "stroke", digitStrokeDeg().toFixed(4), "deg");
  for (const set of GRID_COLOUR_SETS) for (const scheme of ["light", "dark"] as const) {
    const { names, letters } = COLOUR_COMPONENTS[set];
    const cols = derive(names, scheme, bg[scheme]);
    const m = smallFieldMetrics(cols, PAGE[scheme], digitStrokeDeg());
    console.log(set, scheme, `small-field ΔE2000 normal ${m.normal.toFixed(1)} deutan ${m.deutan.toFixed(1)} protan ${m.protan.toFixed(1)} tritan ${m.tritan.toFixed(1)}, min ΔL* ${m.minDeltaL.toFixed(1)}`);
    console.log("   ", JSON.stringify(Object.fromEntries(letters.map((l, i) => [l, cols[i]]))));
    console.log("   ", names.map((n, i) => {
      const [L, C, h] = oklchOf(cols[i]);
      return `${n} L*${labOf(cols[i])[0].toFixed(0)} oklch(${L.toFixed(2)} ${C.toFixed(2)} ${h.toFixed(0)})`;
    }).join(", "));
  }
}
