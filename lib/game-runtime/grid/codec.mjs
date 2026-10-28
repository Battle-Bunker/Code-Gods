// Trusted host-side Grid checks for the runtime package (no guest code runs here).
//
// Mirrors the strict decode rules of lib/game-core/src/grid.ts (the package does not depend on
// game-core): rows joined by "/", cells by ",", each cell a fixed-width symbol code followed by a
// colour letter. Only the canonical encoding is accepted. python/domain.py has the same rules.

export const GRID_SIZES = Object.freeze([3, 4, 5, 6, 7]);
export const GRID_SYMBOL_SETS = Object.freeze(["base10", "base12", "base16", "cards"]);
export const GRID_COLOUR_SETS = Object.freeze(["rgb", "rgby", "rainbow6"]);
/** Output cap for a Grid agent's JSON call list (stringMaxLength does not apply to Grid). */
export const GRID_OUTPUT_MAX = 8192;
export const GRID_MAX_CALLS = 8;

const DIGITS = "0123456789ABCDEF";
const CARD_CODES = Object.freeze(Array.from({ length: 52 }, (_, i) => "A23456789TJQK"[i % 13] + "SHDC"[Math.floor(i / 13)]));
const SYMBOL_CODES = Object.freeze({
  base10: new Set(DIGITS.slice(0, 10)), base12: new Set(DIGITS.slice(0, 12)),
  base16: new Set(DIGITS), cards: new Set(CARD_CODES),
});
const COLOUR_LETTERS = Object.freeze({ rgb: new Set("RGB"), rgby: new Set("RYGB"), rainbow6: new Set("ROYGBV") });

export function isGridSettings(settings) {
  return GRID_SIZES.includes(settings?.gridSize) && GRID_SYMBOL_SETS.includes(settings?.gridSymbols)
    && GRID_COLOUR_SETS.includes(settings?.gridColours);
}

/** Longest canonical encoding: N² cells of (code + letter), plus N²-1 separators. */
export function gridMaxLength(size, symbols) {
  return size * size * ((symbols === "cards" ? 2 : 1) + 2) - 1;
}

/** Strict canonical-grid check for a GridType given as runtime settings. */
export function isGridValue(text, { gridSize: n, gridSymbols, gridColours }) {
  if (typeof text !== "string" || text.length > gridMaxLength(n, gridSymbols)) return false;
  const codes = SYMBOL_CODES[gridSymbols], letters = COLOUR_LETTERS[gridColours];
  const rows = text.split("/");
  if (rows.length !== n) return false;
  for (const row of rows) {
    const cells = row.split(",");
    if (cells.length !== n) return false;
    for (const cell of cells) {
      if (!codes.has(cell.slice(0, -1)) || !letters.has(cell.slice(-1))) return false;
    }
  }
  return true;
}

/** Shape check of a Grid agent's output: [{"m": id, "p": {...}}] with at most 8 calls. */
export function isGridOutput(text) {
  if (typeof text !== "string" || text.length > GRID_OUTPUT_MAX || /[^\x20-\x7e]/u.test(text)) return false;
  let calls;
  try { calls = JSON.parse(text); } catch { return false; }
  if (!Array.isArray(calls) || calls.length > GRID_MAX_CALLS) return false;
  return calls.every(call => call !== null && typeof call === "object" && !Array.isArray(call)
    && Object.keys(call).sort().join() === "m,p" && typeof call.m === "string" && /^[a-z_]{1,32}$/.test(call.m)
    && call.p !== null && typeof call.p === "object" && !Array.isArray(call.p));
}
