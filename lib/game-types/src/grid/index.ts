/**
 * The Grid object type: an N×N square of cells, each a (symbol, colour) pair. Grid(size, symbols,
 * colours) is a type constructor; Grid(5,base10,rgby) is an instantiation, never a "room".
 */
import { CLASSES, closure, resolve } from "../constraints.ts";
import { assemblePrelude, availableOf, memo, offerKey } from "../prelude.ts";
import type { Codec, Instantiation, InstanceInfo, ObjectTypeDef, ParamSchema, PreludeParts, Rng, TypeArgs } from "../types.ts";
import { draw } from "../util.ts";
import {
  DEFAULT_COST_MODEL, closedUnderComposition, effectWork, generatorOf, locationBits, layerSize, numberLayerKind, siteWork,
  type CostModel, type CostRow, type Family, type Layer,
} from "../structure/index.ts";
import { decodeGrid, encodeGrid, gridMaxLength, gridTypeKey, type GridTypeArgs, type GridValue } from "./codec.ts";
import {
  COLOUR_COMPONENTS, GRID_COLOUR_SETS, GRID_SIZES, GRID_SYMBOL_SETS, SYMBOL_COMPONENTS,
  type GridColourSet, type GridSymbolSet,
} from "./components.ts";
import { GRID_MUTATORS } from "./mutators.ts";
import { gridPrelude } from "./prelude.ts";

export * from "./components.ts";
export * from "./codec.ts";

const option = (x: { id: string; label: string; emoji: string; kid: string }) => ({ id: x.id, label: x.label, emoji: x.emoji, kid: x.kid });

const PARAMS: readonly ParamSchema[] = Object.freeze([
  { kind: "int", id: "size", label: "Size", min: GRID_SIZES[0], max: GRID_SIZES[GRID_SIZES.length - 1], presets: GRID_SIZES,
    question: "How big is each board?", meaning: "Each object is a square board with this many cells on a side.",
    consequence: "A bigger board allows more rules and makes each object harder to read at a glance." },
  { kind: "component", id: "symbols", label: "Symbols", slot: "symbols", options: GRID_SYMBOL_SETS.map(id => option(SYMBOL_COMPONENTS[id])),
    question: "What can each cell show?", meaning: "The set of symbols that cells can show and that rules can count.",
    consequence: "Playing cards add suits and face cards, which unlock more rules and make objects harder to read." },
  { kind: "component", id: "colours", label: "Colours", slot: "colours", options: GRID_COLOUR_SETS.map(id => option(COLOUR_COMPONENTS[id])),
    question: "Which colours can cells have?", meaning: "The set of colours that cells can have, some of which mix into others.",
    consequence: "More colours unlock more colour rules and mixing moves." },
]);

/** The Grid parameters of an instantiation. */
export function gridArgs(inst: Instantiation): GridTypeArgs {
  if (inst.objectType !== "Grid") throw new Error(`${inst.key} is not a Grid`);
  return inst.args as unknown as GridTypeArgs;
}

const cache = new Map<string, Instantiation>();
function instantiate(raw: TypeArgs): Instantiation {
  const args = { ...GRID.defaults, ...raw };
  const extra = Object.keys(args).filter(k => !PARAMS.some(p => p.id === k));
  if (extra.length) throw new Error(`Unknown Grid parameter ${extra[0]}`);
  const { size, symbols, colours } = args;
  if (!(GRID_SIZES as readonly unknown[]).includes(size)) throw new Error(`Grid size must be one of ${GRID_SIZES.join(", ")}`);
  if (!(GRID_SYMBOL_SETS as readonly unknown[]).includes(symbols)) throw new Error(`Unknown symbol set ${String(symbols)}`);
  if (!(GRID_COLOUR_SETS as readonly unknown[]).includes(colours)) throw new Error(`Unknown colour set ${String(colours)}`);
  const t: GridTypeArgs = { size: size as number, symbols: symbols as GridSymbolSet, colours: colours as GridColourSet };
  const key = gridTypeKey(t);
  let inst = cache.get(key);
  if (inst) return inst;
  const s = SYMBOL_COMPONENTS[t.symbols], c = COLOUR_COMPONENTS[t.colours];
  const terms: Record<string, number> = {
    "size": t.size, "cells": t.size * t.size,
    "symbols.count": s.count, "symbols.maxValue": Math.max(...s.values), "ranks.count": s.rankCount,
    "colours.count": c.count, "mixes.count": c.mixes.length,
    ...(s.base !== undefined ? { "symbols.base": s.base } : {}),
    ...(s.suits ? { "suits.count": s.suitNames!.length } : {}),
    ...(s.faces ? { "faces.count": new Set(s.ranks.filter((_, i) => s.faces![i])).size } : {}),
  };
  inst = Object.freeze({
    objectType: "Grid", args: Object.freeze({ ...t }), key, terms: Object.freeze(terms),
    classes: Object.freeze(closure([...s.classes, ...c.classes])),
  });
  cache.set(key, inst);
  return inst;
}

const codec = memo((inst): Codec<GridValue> => {
  const t = gridArgs(inst), maxLength = gridMaxLength(t);
  const isValid = (wire: unknown): wire is string => {
    if (typeof wire !== "string" || wire.length > maxLength) return false;
    try { return encodeGrid(decodeGrid(wire, t), t) === wire; } catch { return false; }
  };
  return Object.freeze({
    maxLength,
    decode(wire: unknown) {
      if (typeof wire !== "string") throw new Error(`Not a grid of type ${inst.key}`);
      const g = decodeGrid(wire, t);
      if (encodeGrid(g, t) !== wire) throw new Error(`Not the canonical encoding of a ${inst.key} grid`);
      return g;
    },
    encode: (g: GridValue) => encodeGrid(g, t),
    isValid,
    assert(wire: unknown): asserts wire is string {
      if (!isValid(wire)) throw new Error(`Not a grid of type ${inst.key}`);
    },
  });
});

/** The prior μ: every cell independent and uniform over symbols × colours. */
export function spawnGrid(inst: Instantiation, rng: Rng): GridValue {
  const t = gridArgs(inst), n = t.size, S = SYMBOL_COMPONENTS[t.symbols].count, C = COLOUR_COMPONENTS[t.colours].count;
  const sym = new Uint8Array(n * n), col = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) { sym[i] = draw(rng, S); col[i] = draw(rng, C); }
  return { size: n, sym, col };
}

/**
 * One symmetric proposal, uniform over four moves: resample a cell, resample a symbol, resample a
 * colour, swap two distinct cells. Each move's kernel is symmetric (resampling ignores the old value;
 * a swap is an involution chosen with the same probability from either side), so μ is invariant under
 * "accept iff u stays ≥ level". Never mutates its input.
 */
export function proposeGrid(g: GridValue, inst: Instantiation, rng: Rng): GridValue {
  const t = gridArgs(inst), cells = t.size * t.size;
  const S = SYMBOL_COMPONENTS[t.symbols].count, C = COLOUR_COMPONENTS[t.colours].count;
  const sym = g.sym.slice(), col = g.col.slice(), i = draw(rng, cells);
  switch (draw(rng, 4)) {
    case 0: sym[i] = draw(rng, S); col[i] = draw(rng, C); break;
    case 1: sym[i] = draw(rng, S); break;
    case 2: col[i] = draw(rng, C); break;
    default: {
      const j = (i + 1 + draw(rng, cells - 1)) % cells;
      [sym[i], sym[j]] = [sym[j], sym[i]];
      [col[i], col[j]] = [col[j], col[i]];
    }
  }
  return { size: g.size, sym, col };
}

function layerBits(inst: Instantiation): Record<string, number> {
  const t = gridArgs(inst), cells = t.size * t.size;
  return { symbol: cells * Math.log2(SYMBOL_COMPONENTS[t.symbols].count), colour: cells * Math.log2(COLOUR_COMPONENTS[t.colours].count) };
}

/**
 * Grid's generator families under a cost model (structure/index.ts; docs/energy-model.md §4.1). Every cell is a site of
 * each family. A layer with one value (a mono board's colour) is no family: there is nothing to move.
 *   set-v1:       "symbol" (the whole symbol set, overwritten) and "colour" (overwritten).
 *   the others:   "rank" (the counting order: digits 0–9, cards A–K; a slider, or a dial under dial-v1), "suit" (cards
 *                 only, categorical) and "colour" (categorical).
 */
export function gridFamilies(inst: Instantiation, model: CostModel = DEFAULT_COST_MODEL): readonly Family<GridValue>[] {
  const key = `${inst.key}|${model}`;
  let fams = familiesCache.get(key);
  if (fams) return fams;
  const t = gridArgs(inst), sites = t.size * t.size, s = SYMBOL_COMPONENTS[t.symbols], C = COLOUR_COMPONENTS[t.colours].count;
  const suits = s.suitNames?.length ?? 1;
  const R = s.rankCount;
  type Site = [string, Layer, (v: GridValue, i: number) => number, (v: GridValue, i: number, x: number) => void];
  const layers: Site[] = model === "set-v1"
    ? [["symbol", { kind: "categorical", n: s.count }, (v, i) => v.sym[i], (v, i, x) => { v.sym[i] = x; }],
      ["colour", { kind: "categorical", n: C }, (v, i) => v.col[i], (v, i, x) => { v.col[i] = x; }]]
    : [["rank", { kind: numberLayerKind(model), n: R }, (v, i) => s.ranks[v.sym[i]], (v, i, x) => { v.sym[i] += x - s.ranks[v.sym[i]]; }],
      ["suit", { kind: "categorical", n: suits }, (v, i) => (v.sym[i] - s.ranks[v.sym[i]]) / R, (v, i, x) => { v.sym[i] = x * R + s.ranks[v.sym[i]]; }],
      ["colour", { kind: "categorical", n: C }, (v, i) => v.col[i], (v, i, x) => { v.col[i] = x; }]];
  const open = layers.flatMap(([id, layer, get, set]) => {
    const generator = generatorOf(layer, model);
    return generator ? [{ id, generator, sites, get, set }] : [];
  });
  // A layer with several generators (multiply-v1's numbers) is priced by its cheapest route, not its cheapest step.
  fams = Object.freeze(open.map(f => Object.freeze(f.generator.id !== "any" ? f
    : { ...f, generator: closedUnderComposition(f.generator, locationBits(f, open.length)) })));
  familiesCache.set(key, fams);
  return fams;
}
const familiesCache = new Map<string, readonly Family<GridValue>[]>();
/**
 * The information cost w of Grid's elementary mutators under set-v1 (docs/energy-model.md §4.1): set one cell's colour,
 * or its symbol. The op-choice bits are log2 of how many families the type has (2: 1 bit), log2 N² the cell, log2 C (S)
 * the new value, and log2 C (S) the value it overwrites (pointwise erasure). A mono board (one colour) has no colour to
 * set, so its only elementary op is "set a symbol": naming it costs 0 bits, and `colour` is Infinity (no such op).
 */
export const gridElementaryCosts = memo((inst: Instantiation): { colour: number; symbol: number } => {
  const fams = gridFamilies(inst, "set-v1"), w = (id: string) => {
    const f = fams.find(x => x.id === id);
    return f ? siteWork(f, fams.length, 0, 1) : Infinity;
  };
  return { colour: w("colour"), symbol: w("symbol") };
});

/**
 * W of one Grid call: its net effect, priced site by site (structure/index.ts effectWork), whatever mutator did it.
 * Under set-v1 that is w_colour per cell whose colour changed plus w_symbol per cell whose symbol changed; under
 * distance-v1 a digit pays for how far it moved, and a colour (or suit) for having changed.
 */
function callWork(a: GridValue, b: GridValue, _call: unknown, inst: Instantiation, model: CostModel = DEFAULT_COST_MODEL): number {
  return effectWork(gridFamilies(inst, model), a, b);
}

/** Grid's cost table under a model: one row per kind of one-cell move (the texts that explain change cost). */
export function gridCostTable(inst: Instantiation, model: CostModel = DEFAULT_COST_MODEL): readonly CostRow[] {
  const fams = gridFamilies(inst, model), rows: CostRow[] = [];
  for (const f of fams) {
    const g = f.generator, n = layerSize(g.layer), what = f.id === "rank" ? "number" : f.id, where = locationBits(f, fams.length);
    if (g.id === "set") rows.push({ move: `change a cell's ${what}`, work: siteWork(f, fams.length, 0, 1) });
    else if (g.id === "any") {
      // Several generators on one layer: one row per argument (its own price; a cell pays its cheapest route).
      for (const x of g.args) {
        if (x.label.startsWith("-")) continue;
        rows.push({ move: x.label.startsWith("+") ? `add ${x.label.slice(1)} to a cell's ${what} (or take it away)` : `multiply a cell's ${what} by ${x.label.slice(1)}`, work: where + x.bits + x.erased });
      }
    } else for (let k = 1; k < n; k++) {
      if (g.distance(0, k) < k) break; // a dial: the far half repeats the near half
      rows.push({ move: `move a cell's ${what} by ${k}`, work: siteWork(f, fams.length, 0, k) });
    }
  }
  return rows;
}

const preludes = new Map<string, PreludeParts>();
function prelude(inst: Instantiation, model: CostModel = DEFAULT_COST_MODEL): PreludeParts {
  const key = `${inst.key}|${offerKey(GRID_MUTATORS, model)}`;
  let parts = preludes.get(key);
  if (!parts) {
    const t = gridArgs(inst);
    parts = assemblePrelude(inst, gridPrelude(t.size, SYMBOL_COMPONENTS[t.symbols], COLOUR_COMPONENTS[t.colours], inst.classes), GRID_MUTATORS, model);
    preludes.set(key, parts);
  }
  return parts;
}

/** Display tables for renderers (both UIs) and the manifest. */
export function gridDisplay(inst: Instantiation) {
  const t = gridArgs(inst), s = SYMBOL_COMPONENTS[t.symbols], c = COLOUR_COMPONENTS[t.colours];
  return {
    size: t.size,
    symbols: {
      id: s.id, label: s.label, emoji: s.emoji, count: s.count, codes: s.codes, glyphs: s.glyphs, names: s.names, values: s.values,
      ...(s.suits ? { suits: s.suits.map(u => s.suitNames![u]), suitGlyphs: s.suits.map(u => s.suitGlyphs![u]) } : {}),
      ...(s.faces ? { pictures: s.faces } : {}),
    },
    colours: {
      id: c.id, label: c.label, emoji: c.emoji, count: c.count, letters: c.letters, names: c.names, css: c.css, ink: c.ink,
      patterns: c.patterns, mixes: c.mixes.map(([a, b, m]) => [c.names[a], c.names[b], c.names[m]]),
    },
  };
}

const infos = new Map<string, InstanceInfo>();
function describe(inst: Instantiation, model: CostModel = DEFAULT_COST_MODEL): InstanceInfo {
  const key = `${inst.key}|${offerKey(GRID_MUTATORS, model)}`, known = infos.get(key);
  if (known) return known;
  const t = gridArgs(inst), s = SYMBOL_COMPONENTS[t.symbols], c = COLOUR_COMPONENTS[t.colours];
  const badges = resolve(inst.classes.map(id => ({ has: id })), inst);
  const info: InstanceInfo = Object.freeze({
    objectType: "Grid", args: inst.args, key: inst.key,
    label: `Grid ${t.size}×${t.size} · ${s.label} · ${c.label}`,
    badges: badges.ok ? badges.badges : [],
    terms: inst.terms,
    display: gridDisplay(inst),
    codec: { format: "grid-ascii-v1", maxLength: gridMaxLength(t) },
    mutators: availableOf(GRID_MUTATORS, inst, model).map(m => ({ id: m.id, name: m.name, emoji: m.emoji, summary: m.summary })),
    helpers: prelude(inst, model).helpers,
  });
  infos.set(key, info);
  return info;
}

export const GRID: ObjectTypeDef<GridValue> = Object.freeze({
  id: "Grid", label: "Grid", emoji: "🟥", kid: "A square board of cells, each with a symbol on it (and a colour, unless it is numbers only)",
  params: PARAMS,
  // Beginner board (archive/engine-v1:lib/grid-lab/docs/explore/gridtypes.md); bigger boards via the settings presets.
  defaults: Object.freeze({ size: 4, symbols: "base10", colours: "rgb" }),
  classes: CLASSES.filter(c => c.slot === "symbols" || c.slot === "colours"),
  instantiate,
  representatives: () => GRID_SIZES.flatMap(size => GRID_SYMBOL_SETS.flatMap(symbols => GRID_COLOUR_SETS.map(colours => ({ size, symbols, colours })))),
  codec,
  spawn: spawnGrid,
  propose: proposeGrid,
  callWork,
  // Multiply is modulo 10, on the digits 0–9; every other model fits every Grid.
  supportsCostModel: (inst: Instantiation, model: CostModel) => model !== "multiply-v1" || inst.terms["symbols.base"] === 10,
  costTable: gridCostTable,
  layerBits,
  // A getter, so mutator modules may import grid helpers without an evaluation-order cycle.
  get mutators() { return GRID_MUTATORS; },
  prelude,
  describe,
});
