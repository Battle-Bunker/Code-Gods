/**
 * Re-derives the digits renderer's text shades per colour SET (ryb, rgb, rgby, rainbow6) and scheme (light, dark):
 *
 *   node --experimental-strip-types lib/object-views/scripts/derive-palettes.ts
 *
 * For each set it searches OKLCH (lightness in the scheme's band, vivid chroma, hue within the window where it still
 * reads as the colour's name, and for blue and yellow on light pages no darker than L_FLOOR) for the shades that maximise `objective`: the smallest pairwise CIEDE2000 (normal vision)
 * PLUS the smallest pairwise OKLab ΔE×100 under protanopia, deuteranopia and tritanopia (Machado 2009; tritanopia
 * stands in for small-field tritanopia at digit size), subject to WCAG 4.6:1 against every surface of the scheme in
 * both apps' index.css. Hill-climbing from seeded restarts: deterministic. It prints the
 * winners; copy them into DIGIT_SHADES (src/grid-display.ts) and both apps' --cg-ink-* tokens.
 */
import { readFileSync } from "node:fs";
import { COLOUR_COMPONENTS, GRID_COLOUR_SETS } from "@workspace/game-types";
import { nameHues } from "../src/grid-display.ts";
import { contrastRatio, deltaE2000, deltaEOk, hexOfOklch, labOf, oklchOf, paletteMetrics } from "../src/colour-science.ts";


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

let seed = 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

/** Lightness bands (OKLCH L) in which a text shade still reads as a colour rather than near-black or near-white. */
export const L_BANDS = { light: [0.42, 0.64], dark: [0.62, 0.9] } as const;
/** A shade must carry at least this chroma, and 60% of the most its lightness and hue allow in sRGB (vivid, not dusty). */
export const CHROMA_FLOOR = 0.1;
/** Past these lightnesses a hue stops reading as its name (a light red reads as pink). */
const L_CAP: Record<string, number> = { red: 0.72, violet: 0.74 };
/**
 * Below these lightnesses (light scheme) a hue stops reading as its name at digit size: a darker blue reads as navy or
 * near-black, a darker yellow as brown. Each sits just under the lightest shade that still passes 4.6:1 on the light
 * surfaces, so these colours stay as light as the contrast floor allows ("reads as its name" beats separation).
 */
export const L_FLOOR: Record<"light" | "dark", Record<string, number>> = { light: { blue: 0.49, yellow: 0.49 }, dark: {} };

const maxChroma = (L: number, h: number) => { let c = 0; while (hexOfOklch(L, c + 0.005, h)) c += 0.005; return c; };

interface Candidate { hex: string; chroma: number }
function candidates(name: string, scheme: "light" | "dark", bg: string[], [L0, L1]: readonly [number, number]): Candidate[] {
  const [h0, h1] = nameHues(name, scheme), floor = L_FLOOR[scheme][name] ?? 0, out = new Map<string, Candidate>();
  for (let h = h0; h <= h1; h += 2) for (let L = Math.max(L0, floor); L <= Math.min(L1, L_CAP[name] ?? 1) + 1e-9; L += 0.01) {
    const cMax = maxChroma(L, h);
    for (let C = Math.max(CHROMA_FLOOR, 0.6 * cMax); C <= cMax + 1e-9; C += 0.01) {
      const hex = hexOfOklch(L, C, h);
      if (hex && bg.every(s => contrastRatio(hex, s) >= 4.6)) out.set(hex, { hex, chroma: C });
    }
  }
  return [...out.values()];
}

/**
 * The objective: the smallest pairwise CIEDE2000 (normal vision) plus the smallest pairwise OKLab ΔE×100 under
 * protanopia, deuteranopia and tritanopia. Tritanopia stands in for small-field tritanopia: at digit size the eye
 * barely resolves the blue–yellow axis, which is why a blue and a green of one lightness collapse in small text.
 */
const VISIONS = ["protan", "deutan", "tritan"] as const;
const pairTerms = (a: string, b: string): [number, number] =>
  [deltaE2000(a, b), Math.min(...VISIONS.map(v => deltaEOk(a, b, v)))];
export function objective(cols: readonly string[]): number {
  let n = Infinity, c = Infinity;
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
    const [x, y] = pairTerms(cols[i], cols[j]); n = Math.min(n, x); c = Math.min(c, y);
  }
  return n + c;
}

export function derive(names: readonly string[], scheme: "light" | "dark", bg: string[]): string[] {
  const pools = names.map(n => candidates(n, scheme, bg, L_BANDS[scheme]));
  const n = names.length;
  let best: Candidate[] = [], bestScore = -1;
  for (let restart = 0; restart < 12; restart++) {
    const cur = pools.map(p => p[Math.floor(rand() * p.length)]);
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < n; i++) {
        let fN = Infinity, fC = Infinity;
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (a !== i && b !== i) {
          const [x, y] = pairTerms(cur[a].hex, cur[b].hex); fN = Math.min(fN, x); fC = Math.min(fC, y);
        }
        const withI = (c: Candidate) => {
          let mN = fN, mC = fC;
          for (let j = 0; j < n; j++) if (j !== i) { const [x, y] = pairTerms(c.hex, cur[j].hex); mN = Math.min(mN, x); mC = Math.min(mC, y); }
          return mN + mC;
        };
        let s = withI(cur[i]);
        for (const c of pools[i]) {
          const t = withI(c);
          if (t > s + 1e-6 || (Math.abs(t - s) <= 1e-6 && c.chroma > cur[i].chroma + 1e-9)) { cur[i] = c; s = t; improved = true; }
        }
      }
    }
    const s = objective(cur.map(c => c.hex));
    if (s > bestScore) { bestScore = s; best = cur.slice(); }
  }
  return best.map(c => c.hex);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bg = surfaces();
  console.log("surfaces", bg);
  for (const set of GRID_COLOUR_SETS) for (const scheme of ["light", "dark"] as const) {
    const names = COLOUR_COMPONENTS[set].names;
    const cols = derive(names, scheme, bg[scheme]);
    const m = paletteMetrics(cols, bg[scheme]);
    console.log(set, scheme, Object.fromEntries(COLOUR_COMPONENTS[set].letters.map((l, i) => [l, cols[i]])),
      `ΔE2000 ${m.minDeltaE2000.toFixed(1)} protan ${m.minProtan.toFixed(1)} deutan ${m.minDeutan.toFixed(1)} tritan ${m.minTritan.toFixed(1)} contrast ${m.minContrast.toFixed(2)}`,
      names.map((n, i) => `${n} h${oklchOf(cols[i])[2].toFixed(0)} L${oklchOf(cols[i])[0].toFixed(2)}`).join(" "));
  }
}
