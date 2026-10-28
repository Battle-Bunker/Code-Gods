// Generates the per-GridType TypeScript declarations for Grid agents from grid/prelude.d.ts, and
// exposes the trusted prelude sources. Pure functions of the GridType; results are cached.
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
export const PRELUDE_JS = read("prelude.js");
export const PRELUDE_PY = read("prelude.py");
const TEMPLATE = read("prelude.d.ts");

const PALETTES = { rgb: ["red", "green", "blue"], rgby: ["red", "yellow", "green", "blue"],
  rainbow6: ["red", "orange", "yellow", "green", "blue", "violet"] };
const MUTATOR_IDS = ["swap_cells", "shift_line", "reverse_line", "swap_lines", "turn_block", "turn_grid",
  "sort_line", "mirror_fold", "paint", "recolour", "swap_colours", "hue_turn", "pattern_line", "motif",
  "majority_line", "write", "step_rank", "write_ramp", "swap_symbols", "flatten", "paint_by_key", "stamp",
  "tally", "blend", "suit_swap", "suit_set"];

/** Mutator ids available in a GridType, in Grid Lab's order. */
export function gridMutators({ gridSymbols, gridColours }) {
  const cards = gridSymbols === "cards", mixable = gridColours !== "rgb";
  return MUTATOR_IDS.filter(m => !(m === "tally" && cards) && !(m === "blend" && !mixable)
    && !((m === "suit_swap" || m === "suit_set") && !cards));
}

const cache = new Map();
export function gridDeclarations(settings) {
  const key = `${settings.gridSize},${settings.gridSymbols},${settings.gridColours}`;
  if (cache.has(key)) return cache.get(key);
  const caps = new Set([settings.gridSymbols === "cards" ? "cards" : "digits"]);
  if (settings.gridColours !== "rgb") caps.add("mixable");
  const out = [];
  let keep = true;
  for (const line of TEMPLATE.split("\n")) {
    const directive = /^\/\/#(if|endif)\s*(\w*)\s*$/.exec(line);
    if (directive) { keep = directive[1] === "endif" || caps.has(directive[2]); continue; }
    if (keep) out.push(line);
  }
  const text = out.join("\n")
    .replace("__COLOUR_NAMES__", PALETTES[settings.gridColours].map(n => JSON.stringify(n)).join(" | "))
    .replace("__MUTATOR_IDS__", gridMutators(settings).map(n => JSON.stringify(n)).join(" | "));
  cache.set(key, text);
  return text;
}
