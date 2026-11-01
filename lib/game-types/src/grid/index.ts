/**
 * The Grid object type: an N×N square of cells, each a (symbol, colour) pair. Grid(size, symbols,
 * colours) is a type constructor; Grid(5,base10,rgby) is an instantiation, never a "room".
 */
import { CLASSES, closure, resolve } from "../constraints.ts";
import { assemblePrelude, availableOf, memo } from "../prelude.ts";
import type { Codec, Instantiation, InstanceInfo, ObjectTypeDef, ParamSchema, Rng, TypeArgs } from "../types.ts";
import { draw } from "../util.ts";
import { decodeGrid, encodeGrid, gridMaxLength, gridTypeKey, type GridTypeArgs, type GridValue } from "./codec.ts";
import {
  COLOUR_COMPONENTS, GRID_COLOUR_SETS, GRID_LEGACY_COLOUR_SETS, GRID_SIZES, GRID_SYMBOL_SETS, SYMBOL_COMPONENTS,
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
  { kind: "component", id: "colours", label: "Colours", slot: "colours", options: GRID_COLOUR_SETS.filter(id => !GRID_LEGACY_COLOUR_SETS.includes(id)).map(id => option(COLOUR_COMPONENTS[id])),
    legacy: GRID_LEGACY_COLOUR_SETS.map(id => option(COLOUR_COMPONENTS[id])),
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

function changedBits(a: GridValue, b: GridValue, inst: Instantiation): Record<string, number> {
  const t = gridArgs(inst);
  let ds = 0, dc = 0;
  for (let i = 0; i < a.sym.length; i++) { if (a.sym[i] !== b.sym[i]) ds++; if (a.col[i] !== b.col[i]) dc++; }
  return { symbol: ds * Math.log2(SYMBOL_COMPONENTS[t.symbols].count), colour: dc * Math.log2(COLOUR_COMPONENTS[t.colours].count) };
}

const prelude = memo(inst => {
  const t = gridArgs(inst);
  return assemblePrelude(inst, gridPrelude(t.size, SYMBOL_COMPONENTS[t.symbols], COLOUR_COMPONENTS[t.colours], inst.classes), GRID_MUTATORS);
});

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

const describe = memo((inst): InstanceInfo => {
  const t = gridArgs(inst), s = SYMBOL_COMPONENTS[t.symbols], c = COLOUR_COMPONENTS[t.colours];
  const badges = resolve(inst.classes.map(id => ({ has: id })), inst);
  return Object.freeze({
    objectType: "Grid", args: inst.args, key: inst.key,
    label: `Grid ${t.size}×${t.size} · ${s.label} · ${c.label}`,
    badges: badges.ok ? badges.badges : [],
    terms: inst.terms,
    display: gridDisplay(inst),
    codec: { format: "grid-ascii-v1", maxLength: gridMaxLength(t) },
    mutators: availableOf(GRID_MUTATORS, inst).map(m => ({ id: m.id, name: m.name, emoji: m.emoji, summary: m.summary })),
    helpers: prelude(inst).helpers,
  });
});

export const GRID: ObjectTypeDef<GridValue> = Object.freeze({
  id: "Grid", label: "Grid", emoji: "🟥", kid: "A square board of coloured cells, each with a symbol on it",
  params: PARAMS,
  // Beginner board (lib/grid-lab/docs/explore/gridtypes.md); bigger boards via the settings presets.
  defaults: Object.freeze({ size: 4, symbols: "base10", colours: "ryb" }),
  classes: CLASSES.filter(c => c.slot === "symbols" || c.slot === "colours"),
  instantiate,
  representatives: () => GRID_SIZES.flatMap(size => GRID_SYMBOL_SETS.flatMap(symbols => GRID_COLOUR_SETS.map(colours => ({ size, symbols, colours })))),
  codec,
  spawn: spawnGrid,
  propose: proposeGrid,
  changedBits,
  layerBits,
  // A getter, so mutator modules may import grid helpers without an evaluation-order cycle.
  get mutators() { return GRID_MUTATORS; },
  prelude,
  describe,
});
