/**
 * Colour science for the display palettes (pure, framework-free, unit tested under Node): WCAG 2 contrast, CIE Lab
 * and the CIEDE2000 colour difference, OKLab / OKLCH, and colour-vision-deficiency simulation (Machado, Oliveira and
 * Fernandes 2009, severity 1.0, in linear sRGB: the model the dataviz palette validator is calibrated to).
 *
 * Also S-CIELAB (Zhang and Wandell 1996), the spatial extension of CIELAB, for colours seen as thin strokes.
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
/** Linear-light sRGB (clamped) → #rrggbb. */
export const hexOfLinear = (rgb: Rgb): string =>
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

// --- small-field colour: S-CIELAB (Zhang and Wandell 1996) ------------------------------------------------------
// CIELAB and CIEDE2000 describe large uniform patches. A digit's stroke is a stripe a few arcminutes wide, and the
// eye's spatial resolution differs per opponent channel: luminance is resolved finely, red–green less so, and
// blue–yellow (the S cones) worst of all, which is small-field tritanopia. S-CIELAB models this by converting to
// Poirson–Wandell opponent channels, blurring each with its own sum of Gaussians (spreads in degrees of visual angle),
// and converting back to CIELAB. For a stripe of width w on a page, the colour seen inside the stripe is the page
// plus, per channel, the share of the stripe's difference that survives the blur (stripeRetention).

/** Abramowitz and Stegun 7.1.26 (absolute error ≤ 1.5e-7). */
export function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x < 0 ? -y : y;
}
/**
 * The mean, across a stripe `w` degrees wide, of that stripe blurred by the normalised Gaussian exp(−x²/s²) (`s` in
 * degrees): (s/w)·∫₀^{w/s} erf(u) du, in closed form. 1 for a wide stripe, toward 0 for a thin one.
 */
export function stripeRetention(w: number, s: number): number {
  const r = w / s;
  return r < 1e-9 ? 0 : (r * erf(r) + (Math.exp(-r * r) - 1) / Math.sqrt(Math.PI)) / r;
}
/** S-CIELAB's filters per opponent channel: [spread in degrees, weight] (Zhang and Wandell's reference scielab.m). */
export const SCIELAB_FILTERS: Readonly<Record<"lum" | "rg" | "by", readonly (readonly [number, number])[]>> = Object.freeze({
  lum: [[0.05, 1.00327], [0.225, 0.114416], [7.0, -0.117686]],
  rg: [[0.0685, 0.616725], [0.826, 0.383275]],
  by: [[0.0920, 0.567885], [0.6451, 0.432115]],
});
const RGB_XYZ: readonly Rgb[] = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]];
const XYZ_OPP: readonly Rgb[] = [[0.279, 0.72, -0.107], [-0.449, 0.29, -0.077], [0.086, -0.59, 0.501]];
type M3 = readonly Rgb[];
const mul = (A: M3, B: M3): Rgb[] => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]) as Rgb);
const apply = (A: M3, v: Rgb): Rgb => A.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) as Rgb;
function inverse(m: M3): Rgb[] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [[A, -(b * i - c * h), b * f - c * e], [B, a * i - c * g, -(a * f - c * d)], [C, -(a * h - b * g), a * e - b * d]]
    .map(r => r.map(x => x / det) as Rgb);
}
const RGB_OPP = mul(XYZ_OPP, RGB_XYZ), OPP_RGB = inverse(RGB_OPP);
/** Poirson–Wandell opponent channels [luminance, red–green, blue–yellow] of a colour (linear, from XYZ with white Y 1). */
export const opponentOf = (hex: string, vision: Vision = "normal"): Rgb => apply(RGB_OPP, simulateLinear(hex, vision));
/** The share of each opponent channel's signal that a stripe `strokeDeg` degrees wide keeps after S-CIELAB's blur. */
export function channelRetention(strokeDeg: number): Rgb {
  const k = (f: readonly (readonly [number, number])[]) => f.reduce((sum, [s, w]) => sum + w * stripeRetention(strokeDeg, s), 0);
  return [k(SCIELAB_FILTERS.lum), k(SCIELAB_FILTERS.rg), k(SCIELAB_FILTERS.by)];
}
/**
 * CIELAB of a stroke of colour `hex`, `strokeDeg` degrees wide, on `page`, as seen (S-CIELAB) with `vision`: the
 * colour deficiency is simulated first (in the cones), then the spatial blur (in the opponent pathways).
 */
export function smallFieldLab(hex: string, page: string, strokeDeg: number, vision: Vision = "normal"): Rgb {
  const k = channelRetention(strokeDeg), c = opponentOf(hex, vision), p = opponentOf(page, vision);
  return labOfLinear(apply(OPP_RGB, [0, 1, 2].map(i => p[i] + k[i] * (c[i] - p[i])) as Rgb));
}
/** CIEDE2000 between two strokes on `page` at `strokeDeg`, as seen with `vision`: the small-field colour difference. */
export const deltaE2000Small = (a: string, b: string, page: string, strokeDeg: number, vision: Vision = "normal"): number =>
  deltaE2000Lab(smallFieldLab(a, page, strokeDeg, vision), smallFieldLab(b, page, strokeDeg, vision));

// --- palette summaries ------------------------------------------------------------------------------------------
/** The small-field view of a palette: the smallest pairwise small-field CIEDE2000 per eye, and the smallest ΔL*. */
export interface SmallFieldMetrics { normal: number; deutan: number; protan: number; tritan: number; minDeltaL: number }
export function smallFieldMetrics(colours: readonly string[], page: string, strokeDeg: number): SmallFieldMetrics {
  const m: SmallFieldMetrics = { normal: Infinity, deutan: Infinity, protan: Infinity, tritan: Infinity, minDeltaL: Infinity };
  for (let i = 0; i < colours.length; i++) for (let j = i + 1; j < colours.length; j++) {
    for (const v of ["normal", "deutan", "protan", "tritan"] as const) m[v] = Math.min(m[v], deltaE2000Small(colours[i], colours[j], page, strokeDeg, v));
    m.minDeltaL = Math.min(m.minDeltaL, Math.abs(labOf(colours[i])[0] - labOf(colours[j])[0]));
  }
  return m;
}
