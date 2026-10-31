/**
 * Colour science for the display palettes (pure, framework-free, unit tested under Node): WCAG 2 contrast, CIE Lab
 * and the CIEDE2000 colour difference, OKLab / OKLCH, and colour-vision-deficiency simulation (Machado, Oliveira and
 * Fernandes 2009, severity 1.0, in linear sRGB: the model the dataviz palette validator is calibrated to).
 *
 * The digit palettes (grid-display.ts) and the objects panel's dimension colours and score ramp are derived and
 * checked with these (scripts/derive-palettes.ts re-derives them; test/text-shades.test.ts and
 * test/palette-metrics.test.ts hold them to their floors).
 */

export type Rgb = [number, number, number];

export function hexRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(x => x + x).join("") : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}
const srgbLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const linearSrgb = (c: number): number => {
  const x = Math.max(0, Math.min(1, c));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};
export const linearOf = (hex: string): Rgb => hexRgb(hex).map(srgbLinear) as Rgb;
const hexOfLinear = (rgb: Rgb): string =>
  `#${rgb.map(c => Math.round(linearSrgb(c) * 255).toString(16).padStart(2, "0")).join("")}`;

// --- WCAG 2.x ---------------------------------------------------------------------------------------------------
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// --- CIE L*a*b* (D65), CIE76 and CIEDE2000 ------------------------------------------------------------------------
function labOfLinear([r, g, b]: Rgb): Rgb {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
export const labOf = (hex: string): Rgb => labOfLinear(linearOf(hex));

/** Euclidean distance in Lab. */
export function deltaE76(a: string, b: string): number {
  const [p, q] = [labOf(a), labOf(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
/** Hue angle in degrees (0–360) in Lab's a*b* plane. */
export function labHue(hex: string): number {
  const [, a, b] = labOf(hex);
  return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
}

/** CIEDE2000 between two Lab colours (Sharma, Wu and Dalal 2005; kL = kC = kH = 1). About 1 is just noticeable. */
export function deltaE2000Lab([L1, a1, b1]: Rgb, [L2, a2, b2]: Rgb): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = hue(b1, a1p), h2p = hue(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) hbp = Math.abs(h1p - h2p) <= 180 ? hbp / 2 : (hbp + (hbp < 360 ? 360 : -360)) / 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}
export const deltaE2000 = (a: string, b: string): number => deltaE2000Lab(labOf(a), labOf(b));

// --- OKLab / OKLCH ----------------------------------------------------------------------------------------------
function oklabOfLinear([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}
export const oklabOf = (hex: string): Rgb => oklabOfLinear(linearOf(hex));
/** OKLCH: lightness 0..1, chroma, hue in degrees. */
export function oklchOf(hex: string): Rgb {
  const [L, a, b] = oklabOf(hex);
  return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360];
}
/** The sRGB hex of an OKLCH colour, or null when it falls outside the sRGB gamut. */
export function hexOfOklch(L: number, C: number, h: number): string | null {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const rgb: Rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return rgb.every(c => c >= -1e-4 && c <= 1 + 1e-4) ? hexOfLinear(rgb) : null;
}

// --- colour-vision deficiency -------------------------------------------------------------------------------------
export type Vision = "normal" | "protan" | "deutan" | "tritan";
const MACHADO: Readonly<Record<Exclude<Vision, "normal">, readonly Rgb[]>> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  // Also a stand-in for small-field tritanopia: in glyphs a few pixels tall the eye barely resolves blue–yellow.
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
/** Linear sRGB as seen with a (full) protanopia, deuteranopia or tritanopia. */
export function simulateLinear(hex: string, vision: Vision): Rgb {
  const rgb = linearOf(hex);
  if (vision === "normal") return rgb;
  const M = MACHADO[vision];
  return M.map(row => Math.max(0, Math.min(1, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]))) as Rgb;
}
/** A colour as seen with a deficiency, as hex. */
export const simulateHex = (hex: string, vision: Vision): string => hexOfLinear(simulateLinear(hex, vision));
/** OKLab distance ×100 as seen with `vision` (the dataviz validator's ΔE: target ≥ 8, floor 6 with secondary cues). */
export function deltaEOk(a: string, b: string, vision: Vision = "normal"): number {
  const p = oklabOfLinear(simulateLinear(a, vision)), q = oklabOfLinear(simulateLinear(b, vision));
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
/** CIEDE2000 as seen with `vision`. */
export const deltaE2000Seen = (a: string, b: string, vision: Vision): number =>
  deltaE2000Lab(labOfLinear(simulateLinear(a, vision)), labOfLinear(simulateLinear(b, vision)));

// --- palette summaries --------------------------------------------------------------------------------------------
export interface PaletteMetrics {
  /** Smallest pairwise CIEDE2000, normal vision. */
  minDeltaE2000: number;
  /** Smallest pairwise OKLab ΔE×100 under protanopia, deuteranopia and tritanopia (small-field: digit-size text). */
  minProtan: number;
  minDeutan: number;
  minTritan: number;
  /** Smallest WCAG contrast of any colour against any of the surfaces. */
  minContrast: number;
  /** The closest pair (normal vision). */
  closest: [number, number];
}
export function paletteMetrics(colours: readonly string[], surfaces: readonly string[]): PaletteMetrics {
  let minDeltaE2000 = Infinity, minProtan = Infinity, minDeutan = Infinity, minTritan = Infinity, closest: [number, number] = [0, 0];
  for (let i = 0; i < colours.length; i++) for (let j = i + 1; j < colours.length; j++) {
    const d = deltaE2000(colours[i], colours[j]);
    if (d < minDeltaE2000) { minDeltaE2000 = d; closest = [i, j]; }
    minProtan = Math.min(minProtan, deltaEOk(colours[i], colours[j], "protan"));
    minDeutan = Math.min(minDeutan, deltaEOk(colours[i], colours[j], "deutan"));
    minTritan = Math.min(minTritan, deltaEOk(colours[i], colours[j], "tritan"));
  }
  let minContrast = Infinity;
  for (const c of colours) for (const s of surfaces) minContrast = Math.min(minContrast, contrastRatio(c, s));
  return { minDeltaE2000, minProtan, minDeutan, minTritan, minContrast, closest };
}
