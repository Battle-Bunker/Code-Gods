/**
 * Grid components (carriers) and their class instances. Frozen tables: persisted objects, utility
 * descriptors and calibration tables index them, so a change needs a new component id
 * (test/components.lock.json guards them).
 *
 * Indices match lib/grid-lab/gridlab/core.py exactly:
 *   symbols  digit sets: index = digit value; cards: index = suit * 13 + rank,
 *            rank 0..12 = A,2..10,J,Q,K and suit 0..3 = ♠ ♥ ♦ ♣ (codes "AS", "TH", "KC", ...)
 *   colours  spectral (rainbow) order: ryb = R Y B, rgb = R G B, rgby = R Y G B, rainbow6 = R O Y G B V
 *
 * ryb (red, yellow, blue) is the three-colour set new rooms are offered; rgb stays valid (stored rooms, setups and
 * calibration tables name it) but is no longer offered (GRID_LEGACY_COLOUR_SETS).
 */

export const GRID_SIZES = [3, 4, 5, 6, 7] as const;
export const GRID_SYMBOL_SETS = ["base10", "base12", "base16", "cards"] as const;
export const GRID_COLOUR_SETS = ["ryb", "rgb", "rgby", "rainbow6"] as const;
/** Colour sets that stay valid for stored rooms but are no longer offered for new ones. */
export const GRID_LEGACY_COLOUR_SETS: readonly GridColourSet[] = Object.freeze(["rgb"]);
export type GridSymbolSet = (typeof GRID_SYMBOL_SETS)[number];
export type GridColourSet = (typeof GRID_COLOUR_SETS)[number];

export interface SymbolComponent {
  id: GridSymbolSet;
  label: string;
  emoji: string;
  /** Plain-language description of the symbols, for room settings. */
  kid: string;
  count: number;
  /** Wire code per index: fixed width within a set (1 for digits, 2 for cards). */
  codes: readonly string[];
  /** Display glyph per index ("7", "B", "10♥"). */
  glyphs: readonly string[];
  /** Readable name per index ("seven", "eleven", "ten of hearts"). */
  names: readonly string[];
  /** Valued: points a symbol is worth: digits their value, cards A=1 .. K=13. */
  values: readonly number[];
  /** Ranked: position in counting order (cards: by rank, suit ignored). */
  ranks: readonly number[];
  rankCount: number;
  /** Numeral: positional base (digit sets only). */
  base?: number;
  /** Suited: suit index per symbol, and the suits' names and glyphs (cards only). */
  suits?: readonly number[];
  suitNames?: readonly string[];
  suitGlyphs?: readonly string[];
  /** Faced: J, Q, K (cards only). */
  faces?: readonly boolean[];
  /** Capability classes this component has instances of (no closure needed: declared complete). */
  classes: readonly string[];
}

export interface ColourComponent {
  id: GridColourSet;
  label: string;
  emoji: string;
  kid: string;
  count: number;
  /** Wire letter per index. */
  letters: readonly string[];
  names: readonly string[];
  /** Display colour per index. Chosen for distinct lightness; always pair with the letter or pattern. */
  css: readonly string[];
  /** Text colour that contrasts with each css colour (WCAG AA at small sizes). */
  ink: readonly string[];
  /** Colour-blind pattern id per index (lib/object-views draws them). */
  patterns: readonly string[];
  /** Spectral: position in rainbow order (the identity: indices are in spectral order). */
  hues: readonly number[];
  /** Mixable: unordered parent pairs and their child, by index [a, b, child] with a < b. */
  mixes: readonly (readonly [number, number, number])[];
  classes: readonly string[];
}

const DIGITS = "0123456789ABCDEF";
const DIGIT_NAMES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
export const RANK_CODES = "A23456789TJQK";
export const RANK_GLYPHS = Object.freeze(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);
const RANK_NAMES = ["ace", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king"];
export const SUIT_CODES = "SHDC";
export const SUIT_GLYPHS = Object.freeze(["♠", "♥", "♦", "♣"] as const);
export const SUIT_NAMES = Object.freeze(["spades", "hearts", "diamonds", "clubs"] as const);

const deep = <T>(x: T): T => {
  if (x && typeof x === "object") { Object.values(x).forEach(deep); Object.freeze(x); }
  return x;
};

function digits(id: GridSymbolSet, count: number, label: string, emoji: string, kid: string): SymbolComponent {
  const range = Array.from({ length: count }, (_, i) => i);
  return deep({
    id, label, emoji, kid, count,
    codes: range.map(i => DIGITS[i]),
    glyphs: range.map(i => DIGITS[i]),
    names: range.map(i => DIGIT_NAMES[i]),
    values: range, ranks: range, rankCount: count, base: count,
    classes: ["Valued", "Ranked", "Numeral"],
  });
}

const cardIndices = Array.from({ length: 52 }, (_, i) => i);
export const SYMBOL_COMPONENTS: Readonly<Record<GridSymbolSet, SymbolComponent>> = deep({
  base10: digits("base10", 10, "Digits 0–9", "🔢", "Ordinary digits, 0 to 9"),
  base12: digits("base12", 12, "Base 12 (0–B)", "🕛", "Digits 0 to 9, then A = 10 and B = 11"),
  base16: digits("base16", 16, "Hex (0–F)", "🧮", "Digits 0 to 9, then A to F (10 to 15)"),
  cards: {
    id: "cards" as const, label: "Playing cards", emoji: "🃏", kid: "A full deck: ace to king in four suits", count: 52,
    codes: cardIndices.map(i => RANK_CODES[i % 13] + SUIT_CODES[Math.floor(i / 13)]),
    glyphs: cardIndices.map(i => RANK_GLYPHS[i % 13] + SUIT_GLYPHS[Math.floor(i / 13)]),
    names: cardIndices.map(i => `${RANK_NAMES[i % 13]} of ${SUIT_NAMES[Math.floor(i / 13)]}`),
    values: cardIndices.map(i => (i % 13) + 1),
    ranks: cardIndices.map(i => i % 13), rankCount: 13,
    suits: cardIndices.map(i => Math.floor(i / 13)), suitNames: [...SUIT_NAMES], suitGlyphs: [...SUIT_GLYPHS],
    faces: cardIndices.map(i => i % 13 >= 10),
    classes: ["Valued", "Ranked", "Suited", "Faced"],
  },
});

const PALETTE: Record<string, { letter: string; css: string; ink: string; pattern: string }> = {
  red: { letter: "R", css: "#d7263d", ink: "#ffffff", pattern: "diagonal-up" },
  orange: { letter: "O", css: "#f28c28", ink: "#1a1a1a", pattern: "dots" },
  yellow: { letter: "Y", css: "#f5d000", ink: "#1a1a1a", pattern: "horizontal" },
  green: { letter: "G", css: "#2e9e44", ink: "#1a1a1a", pattern: "grid" },
  blue: { letter: "B", css: "#2667c9", ink: "#ffffff", pattern: "vertical" },
  violet: { letter: "V", css: "#7b3fb8", ink: "#ffffff", pattern: "cross" },
};

function colours(id: GridColourSet, names: string[], mixes: [string, string, string][], wheel: boolean,
  label: string, emoji: string, kid: string): ColourComponent {
  const ix = (n: string) => names.indexOf(n);
  return deep({
    id, label, emoji, kid, count: names.length,
    letters: names.map(n => PALETTE[n].letter),
    names,
    css: names.map(n => PALETTE[n].css),
    ink: names.map(n => PALETTE[n].ink),
    patterns: names.map(n => PALETTE[n].pattern),
    hues: names.map((_, i) => i),
    mixes: mixes.map(([a, b, c]) => [Math.min(ix(a), ix(b)), Math.max(ix(a), ix(b)), ix(c)] as const),
    classes: ["Spectral", ...(wheel ? ["Wheel"] : []), ...(mixes.length ? ["Mixable"] : [])],
  });
}

export const COLOUR_COMPONENTS: Readonly<Record<GridColourSet, ColourComponent>> = deep({
  ryb: colours("ryb", ["red", "yellow", "blue"], [], false, "Red, yellow, blue", "🟥🟨🟦", "Three colours"),
  rgb: colours("rgb", ["red", "green", "blue"], [], false, "Red, green, blue", "🟥🟩🟦", "Three colours"),
  rgby: colours("rgby", ["red", "yellow", "green", "blue"], [["yellow", "blue", "green"]], false,
    "Red, yellow, green, blue", "🟥🟨🟩🟦", "Four colours; yellow and blue mix to green"),
  rainbow6: colours("rainbow6", ["red", "orange", "yellow", "green", "blue", "violet"],
    [["red", "yellow", "orange"], ["yellow", "blue", "green"], ["red", "blue", "violet"]], true,
    "Rainbow (6 colours)", "🌈", "Six colours round the rainbow; paints mix"),
});

/** Every colour letter any set uses, with its display colour (for decoding without settings). */
export const COLOUR_LETTERS: Readonly<Record<string, { name: string; css: string; ink: string; pattern: string }>> = deep(
  Object.fromEntries(Object.entries(PALETTE).map(([name, p]) => [p.letter, { name, css: p.css, ink: p.ink, pattern: p.pattern }])));

// --- class methods derived from the instance tables (host side; the guest gets the tables) ----------

/** Ranked step with wrap; cards keep their suit (K♥ +1 → A♥). */
export function stepSymbol(s: SymbolComponent, x: number, k = 1): number {
  const r = s.rankCount, rank = s.ranks[x], rest = x - rank;
  return rest + (((rank + k) % r) + r) % r;
}

/** Mixable: child colour index, or null. */
export function mixColours(c: ColourComponent, a: number, b: number): number | null {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return c.mixes.find(m => m[0] === lo && m[1] === hi)?.[2] ?? null;
}

/** Wheel: distance round the colour wheel. */
export function hueDistance(c: ColourComponent, a: number, b: number): number {
  const d = Math.abs(c.hues[a] - c.hues[b]);
  return Math.min(d, c.count - d);
}
