/**
 * Host-side mutator engine for Grid games: validate, price and apply agents' mutator calls.
 *
 * Agents change a grid ONLY through the closed set of bit-priced mutators defined in Grid Lab
 * (lib/grid-lab/gridlab/mutators.py, rationale in lib/grid-lab/docs/mutators.md). An agent act is a
 * JSON list `[{"m": "<mutator id>", "p": {<Grid Lab params>}}, ...]`.
 *
 * Validation IS the table lookup: gridlab/export_mutators.py ships, per GridType, every parameter
 * setting of every available mutator (`Mutator.space`) with its cost, keyed by canonical JSON. A
 * call whose params are not in the table is invalid. Costs split into
 *   decision = mult × (tool base + description + measurement)   bits of choosing the step
 *   physical = mult × (erasure + motion)                         bits of doing it
 * and decision + physical = Grid Lab's `Mutator.cost`.
 *
 * Apply functions are line-for-line ports (./mutators-apply.ts), checked against Grid Lab on
 * fixtures. Tables are parsed lazily, once per GridType; each mutator's key map is built on its
 * first use and each entry (frozen params, price, apply cache) on its first lookup.
 */
import { decodeGrid, encodeGrid, gridTypeKey, type GridTypeArgs } from "@workspace/game-core";
import { canonicalJson } from "./data.ts";
import { GRID_MUTATOR_INDEX, GRID_MUTATOR_TEXT } from "./data/mutators_index.ts";
import { gridEnv, type GridEnv, type GridView } from "./env.ts";
import { APPLY, type ApplyCache, type ApplyFn, type ParamValue, type Params } from "./mutators-apply.ts";
import { DEFAULT_MAX_CALLS, MutatorCallError, type MutatorCall } from "./mutators-parse.ts";
import { TEXT } from "./mutators-text.ts";

export { MutatorCallError, parseCalls, DEFAULT_MAX_CALLS, type MutatorCall, type MutatorErrorCode } from "./mutators-parse.ts";
export { type ParamValue, type Params } from "./mutators-apply.ts";

export const MUTATOR_DATA_VERSION: number = GRID_MUTATOR_INDEX.version;

export interface MutatorInfo {
  id: string;
  name: string;
  /** Kid-readable, parameter-free. */
  summary: string;
  /** colour | symbol | both | suit | mixed (the layer is a parameter). */
  layer: string;
  bijective: boolean;
  scopes: string[];
  /** Parameter field names, in Grid Lab's prefix-code order. */
  fields: string[];
  /** Number of parameter settings (|Mutator.space|). */
  count: number;
}

interface MutatorData {
  format: string;
  version: number;
  gridType: GridTypeArgs & { key: string };
  knobs: Record<string, unknown>;
  available: number;
  mutators: MutatorInfo[];
  costPool: [number, number][];
  costs: Record<string, { rows: (ParamValue | null)[][]; cost: number[] }>;
}

export interface MutatorPrice { decision: number; physical: number; total: number }

/** One validated call: the shipped (canonical, frozen) params and their price. */
interface Entry extends MutatorPrice {
  id: string;
  params: Params;
  apply: ApplyFn;
  cache: ApplyCache;
}

interface Table {
  key: string;
  env: GridEnv;
  data: MutatorData;
  catalog: readonly Readonly<MutatorInfo>[];
  spaces: Map<string, Space>;
}

const tables = new Map<string, Table>();

function deepFreeze<T>(v: T): T {
  if (Array.isArray(v)) { v.forEach(deepFreeze); Object.freeze(v); }
  return v;
}

function table(args: GridTypeArgs): Table {
  const key = gridTypeKey(args);
  const hit = tables.get(key);
  if (hit) return hit;
  const text = GRID_MUTATOR_TEXT[key];
  if (text === undefined) throw new MutatorCallError("unsupported_grid", `No mutator table for ${key}`);
  const data = JSON.parse(text) as MutatorData;
  if (data.version !== MUTATOR_DATA_VERSION) throw new Error(`Grid mutator data version mismatch for ${key}`);
  for (const m of data.mutators) if (!APPLY[m.id] || !TEXT[m.id]) throw new Error(`Mutator ${m.id} has no TypeScript port`);
  const catalog = Object.freeze(data.mutators.map(m => Object.freeze({
    ...m, scopes: Object.freeze([...m.scopes]), fields: Object.freeze([...m.fields]),
  }) as Readonly<MutatorInfo>));
  const t: Table = { key, env: gridEnv(args), data, catalog, spaces: new Map() };
  tables.set(key, t);
  return t;
}

/** One mutator's shipped parameter space: canonical key -> row, entries built on first lookup. */
interface Space {
  id: string;
  fields: string[];
  rows: (ParamValue | null)[][];
  cost: number[];
  keys: Map<string, number>;
  built: (Entry | undefined)[];
}

function space(t: Table, id: string): Space | undefined {
  const hit = t.spaces.get(id);
  if (hit) return hit;
  const info = t.data.mutators.find(m => m.id === id), costs = t.data.costs[id];
  if (!info || !costs) return undefined;
  // canonicalJson of {field: value} without building objects: sorted keys, values as plain JSON
  // (values are ints, strings and nested arrays of them, where JSON.stringify === canonicalJson)
  const order = info.fields.map((f, j) => j).sort((a, b) => (info.fields[a] < info.fields[b] ? -1 : 1));
  const prefix = info.fields.map(f => `${JSON.stringify(f)}:`);
  const keys = new Map<string, number>();
  costs.rows.forEach((row, i) => {
    let key = "{", first = true;
    for (const j of order) {
      if (row[j] === null) continue;
      key += (first ? "" : ",") + prefix[j] + JSON.stringify(row[j]);
      first = false;
    }
    keys.set(key + "}", i);
  });
  if (keys.size !== costs.rows.length) throw new Error(`Duplicate parameter settings for ${id}`);
  const sp: Space = { id, fields: info.fields, rows: costs.rows, cost: costs.cost, keys, built: [] };
  t.spaces.set(id, sp);
  return sp;
}

function entry(t: Table, sp: Space, i: number): Entry {
  const hit = sp.built[i];
  if (hit) return hit;
  const params: Record<string, ParamValue> = {}, row = sp.rows[i];
  sp.fields.forEach((f, j) => { if (row[j] !== null) params[f] = deepFreeze(row[j]!); });
  const [decision, physical] = t.data.costPool[sp.cost[i]];
  const e: Entry = Object.freeze({
    id: sp.id, params: Object.freeze(params), apply: APPLY[sp.id], cache: {}, decision, physical, total: decision + physical,
  });
  sp.built[i] = e;
  return e;
}

function resolve(t: Table, call: unknown, index: number | null): Entry {
  const c = call as MutatorCall | null;
  if (typeof c !== "object" || c === null || typeof c.m !== "string" || typeof c.p !== "object" || c.p === null || Array.isArray(c.p)) {
    throw new MutatorCallError("bad_shape", "a call is {m: <mutator id>, p: <params object>}", index);
  }
  const sp = Object.hasOwn(t.data.costs, c.m) ? space(t, c.m) : undefined;
  if (!sp) throw new MutatorCallError("unavailable_mutator", `${c.m} is not available in ${t.key}`, index);
  let key: string;
  try { key = canonicalJson(c.p); } catch { throw new MutatorCallError("invalid_params", `bad params for ${c.m}`, index); }
  const i = sp.keys.get(key);
  if (i === undefined) throw new MutatorCallError("invalid_params", `params are not a valid ${c.m} setting in ${t.key}`, index);
  return entry(t, sp, i);
}

/** True when this GridType ships a mutator table. */
export function hasMutatorTable(args: GridTypeArgs): boolean {
  return gridTypeKey(args) in GRID_MUTATOR_TEXT;
}

/** The mutators available in a GridType, in Grid Lab order, with metadata. */
export function mutatorCatalog(args: GridTypeArgs): readonly Readonly<MutatorInfo>[] {
  return table(args).catalog;
}

/** Every valid params object of one mutator, in `Mutator.space` order (for tests and tools). */
export function mutatorSpace(args: GridTypeArgs, id: string): readonly Params[] {
  const t = table(args), sp = space(t, id);
  if (!sp) throw new MutatorCallError("unavailable_mutator", `${id} is not available in ${gridTypeKey(args)}`);
  return sp.rows.map((_, i) => entry(t, sp, i).params);
}

/** Validate and price one call. Throws MutatorCallError if the mutator or its params are not shipped. */
export function priceCall(args: GridTypeArgs, call: MutatorCall): MutatorPrice {
  const e = resolve(table(args), call, null);
  return { decision: e.decision, physical: e.physical, total: e.total };
}

/** Kid-readable one-liner for a (valid) call, e.g. "paint row 3 red". */
export function describeCall(args: GridTypeArgs, call: MutatorCall): string {
  const t = table(args), e = resolve(t, call, null);
  return TEXT[e.id](e.params, t.env);
}

function run(e: Entry, s: Uint8Array, c: Uint8Array, os: Uint8Array, oc: Uint8Array, env: GridEnv): boolean {
  os.set(s); oc.set(c);
  e.apply(s, c, os, oc, e.params, env, e.cache);
  for (let i = 0; i < s.length; i++) if (s[i] !== os[i] || c[i] !== oc[i]) return true;
  return false;
}

/** Apply one validated call to a decoded grid. Returns a new grid, or null for a no-op (as Grid Lab). */
export function applyCall(grid: GridView, call: MutatorCall, env: GridEnv): GridView | null {
  const e = resolve(table(env.args), call, null);
  if (grid.size !== env.N || grid.sym.length !== env.N * env.N || grid.col.length !== env.N * env.N) {
    throw new MutatorCallError("bad_grid", `grid is not ${env.N}×${env.N}`);
  }
  const sym = new Uint8Array(grid.sym.length), col = new Uint8Array(grid.col.length);
  return run(e, grid.sym, grid.col, sym, col, env) ? { size: env.N, sym, col } : null;
}

export interface MutatorStep {
  mutator: string;
  /** The canonical shipped params (frozen). */
  params: Params;
  decision: number;
  physical: number;
  /** False when the step was a no-op on the grid it met (it is skipped, but still paid for). */
  changed: boolean;
}

export interface ApplyCallsResult {
  /** Final canonical ASCII, or null when the grid ends where it started. */
  after: string | null;
  steps: MutatorStep[];
  /** Totals over every call, no-ops included (the agent chose them). */
  decisionBits: number;
  physicalBits: number;
}

/**
 * Validate, price and apply an agent's call list to a grid (canonical ASCII). The whole list is
 * checked first: one invalid call, or more than maxCalls, rejects it all (MutatorCallError with the
 * call's index). Calls then apply in order, each to the previous result, skipping no-ops.
 */
export function applyCalls(text: string, calls: readonly MutatorCall[], args: GridTypeArgs,
  opts: { maxCalls?: number } = {}): ApplyCallsResult {
  const maxCalls = opts.maxCalls ?? DEFAULT_MAX_CALLS;
  if (!Array.isArray(calls)) throw new MutatorCallError("bad_shape", "calls must be an array");
  if (calls.length > maxCalls) throw new MutatorCallError("too_many_calls", `at most ${maxCalls} calls per act`);
  const t = table(args), env = t.env;
  const resolved = calls.map((c, i) => resolve(t, c, i));
  let g;
  try { g = decodeGrid(text, args); } catch (err) {
    throw new MutatorCallError("bad_grid", err instanceof Error ? err.message : "not a grid of this type");
  }
  const n = g.sym.length, s0 = g.sym.slice(), c0 = g.col.slice();
  let s: Uint8Array = g.sym, c: Uint8Array = g.col, os: Uint8Array = new Uint8Array(n), oc: Uint8Array = new Uint8Array(n);
  const steps: MutatorStep[] = [];
  let decisionBits = 0, physicalBits = 0, any = false;
  for (const e of resolved) {
    const changed = run(e, s, c, os, oc, env);
    if (changed) { [s, os] = [os, s]; [c, oc] = [oc, c]; any = true; }
    steps.push({ mutator: e.id, params: e.params, decision: e.decision, physical: e.physical, changed });
    decisionBits += e.decision;
    physicalBits += e.physical;
  }
  let same = true;
  if (any) for (let i = 0; i < n; i++) if (s[i] !== s0[i] || c[i] !== c0[i]) { same = false; break; }
  return { after: same ? null : encodeGrid({ size: env.N, sym: s, col: c }, args), steps, decisionBits, physicalBits };
}

