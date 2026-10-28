/**
 * Kid-readable one-liners for mutator calls: ports of each Grid Lab mutator's `text_fn`
 * (lib/grid-lab/gridlab/mutators.py), word for word, for transformation feeds.
 */
import { SYMBOL_COMPONENTS, SUIT_GLYPHS } from "@workspace/game-core";
import type { GridEnv } from "./env.ts";

type TextFn = (p: any, env: GridEnv) => string;

const RANK_GLYPHS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const OF_LAYER: Record<string, string> = { both: "", colour: "the colours of ", symbol: "the symbols of " };
const LAYER_WORD: Record<string, string> = { both: "cells", colour: "colours", symbol: "symbols" };
const D4_TEXT: Record<string, string> = {
  rot90: "a quarter turn anticlockwise", rot180: "a half turn", rot270: "a quarter turn clockwise",
  flipH: "a left-right flip", flipV: "an upside-down flip", transpose: "a flip across the main diagonal",
  antitranspose: "a flip across the other diagonal",
};

const cn = (env: GridEnv, k: number) => env.colourNames[k];
const sym = (env: GridEnv, s: number) => SYMBOL_COMPONENTS[env.args.symbols].glyphs[s];
const rankText = (env: GridEnv, r: number) => (env.cards ? RANK_GLYPHS[r] : sym(env, r));
const plural = (k: number) => (k > 1 ? "s" : "");

/** mutators.region_text. */
export function regionText(p: any, env: GridEnv, star = "the line where it is most common"): string {
  const N = env.N, v = p.region;
  switch (p.kind) {
    case "cell": return `the cell at row ${v[0] + 1}, column ${v[1] + 1}`;
    case "line": return `${v[0] === 0 ? "row" : "column"} ${v[1] + 1}`;
    case "line*": return star;
    case "diag": return v === 0 ? "the main diagonal" : "the other diagonal";
    case "block": return `the ${v[2]}x${v[2]} square at row ${v[0] + 1}, column ${v[1] + 1}`;
    case "ring":
      if (N % 2 === 1 && v === (N - 1) / 2) return "the centre cell";
      return v === 0 ? "the outer edge" : `ring ${v + 1} in from the edge`;
    case "core": return "everything off the edge";
    default: return "the whole grid";
  }
}

const lineText = (p: any, env: GridEnv) => regionText({ kind: "line", region: p.line }, env);
const most = (what: string) => `the row or column with the most ${what}`;

export const TEXT: Readonly<Record<string, TextFn>> = Object.freeze({
  swap_cells: (p, e) => `swap ${OF_LAYER[p.layer] || "the "}cells at (${p.pair[0][0] + 1},${p.pair[0][1] + 1}) and (${p.pair[1][0] + 1},${p.pair[1][1] + 1})`,
  shift_line: (p, e) => `slide ${OF_LAYER[p.layer]}${lineText(p, e)} ${p.k} step${plural(p.k)} ${p.line[0] === 0 ? "right" : "down"}, wrapping round`,
  reverse_line: (p, e) => `reverse ${OF_LAYER[p.layer]}${lineText(p, e)}`,
  swap_lines: (p) => `swap ${p.axis === 0 ? "rows" : "columns"} ${p.pair[0] + 1} and ${p.pair[1] + 1}`,
  turn_block: (p, e) => `give ${regionText(p, e)} ${D4_TEXT[p.move]}`,
  turn_grid: (p) => `give the whole grid ${D4_TEXT[p.move]}`,
  sort_line: (p, e) => `sort ${lineText(p, e)} ${p.dir > 0 ? "smallest" : "biggest"} first`,
  mirror_fold: (p, e) => {
    const w = LAYER_WORD[p.layer];
    if (p.kind === "line") {
      const half = p.side === 0 ? "first half onto the second" : "second half onto the first";
      return `make ${lineText(p, e)} a palindrome: mirror its ${half} (${w})`;
    }
    return `mirror the whole grid ${p.side} (${w})`;
  },
  paint: (p, e) => `paint ${regionText(p, e, most(cn(e, p.colour)))} ${cn(e, p.colour)}`,
  recolour: (p, e) => `turn every ${cn(e, p.pair[0])} cell in ${regionText(p, e, most(cn(e, p.pair[1])))} ${cn(e, p.pair[1])}`,
  swap_colours: (p, e) => `swap ${cn(e, p.pair[0])} and ${cn(e, p.pair[1])} in ${regionText(p, e)}`,
  hue_turn: (p, e) => `move every colour in ${regionText(p, e)} ${p.k} step${plural(p.k)} along the rainbow`,
  pattern_line: (p, e) => {
    const where = lineText(p, e);
    if (p.pattern === "ramp") {
      return `paint ${where} as a rainbow starting ${cn(e, p.start)}, ${p.dir > 0 ? "forwards" : "backwards"} along the rainbow`;
    }
    return `paint ${where} ${cn(e, p.pair[0])}, ${cn(e, p.pair[1])}, ${cn(e, p.pair[0])}, ... alternating`;
  },
  motif: (p, e) => {
    const back = p.dir > 0 ? "" : ", going backwards";
    if (p.style === "stripes") {
      return `paint the whole grid in rainbow ${p.axis === 0 ? "stripes across" : "stripes down"} starting ${cn(e, p.start)}${back}`;
    }
    if (p.style === "checker") return `paint the whole grid as a ${cn(e, p.pair[0])}/${cn(e, p.pair[1])} chessboard`;
    return `paint the whole grid in diagonal rainbow stripes starting ${cn(e, p.start)}${back}`;
  },
  majority_line: (p, e) => `make ${regionText(p, e, "the row or column that is closest to one colour")} all its most common colour`,
  write: (p, e) => `write ${sym(e, p.symbol)} in ${p.kind === "cell" ? "" : "every cell of "}${regionText(p, e, most(sym(e, p.symbol) + "s"))}`,
  step_rank: (p, e) => `count every number in ${regionText(p, e)} on by ${p.k}`,
  write_ramp: (p, e) => `write a counting run in ${lineText(p, e)} starting at ${rankText(e, p.start)}, counting ${p.dir > 0 ? "up" : "down"}`,
  swap_symbols: (p, e) => `swap ${rankText(e, p.pair[0])}s and ${rankText(e, p.pair[1])}s in ${regionText(p, e)}`,
  flatten: (p, e) => `in ${regionText(p, e)}, every number except the highest drops to the lowest one there`,
  paint_by_key: (p, e) => {
    const where = regionText(p, e);
    if (p.key === "parity") return `in ${where}, paint even numbers ${cn(e, p.pair[0])} and odd numbers ${cn(e, p.pair[1])}`;
    if (p.key === "mod") return `in ${where}, paint each cell by its number (colour = number + ${p.shift}, round the rainbow)`;
    return `in ${where}, paint hearts and diamonds ${cn(e, p.pair[0])} and spades and clubs ${cn(e, p.pair[1])}`;
  },
  stamp: (p, e) => `stamp ${sym(e, p.symbol)} on every ${cn(e, p.colour)} cell in ${regionText(p, e)}`,
  tally: (p, e) => `treat ${cn(e, p.colour)} cells as mines: every other cell in ${regionText(p, e)} shows how many mines touch it`,
  blend: (p, e) => `in ${regionText(p, e)}, every cell touching both ${cn(e, p.recipe[0])} and ${cn(e, p.recipe[1])} turns ${cn(e, p.recipe[2])}`,
  suit_swap: (p, e) => `swap ${SUIT_GLYPHS[p.pair[0]]} and ${SUIT_GLYPHS[p.pair[1]]} in ${regionText(p, e)}`,
  suit_set: (p, e) => `make every card in ${regionText(p, e)} a ${SUIT_GLYPHS[p.suit]}`,
} satisfies Record<string, TextFn>);
