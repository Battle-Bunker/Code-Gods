/**
 * Settings-picker logic driven by the manifest's object types (docs/research/grid/architecture.md §7.1).
 * Framework-free: deltas and the rule shelf are computed client-side with @workspace/game-types and
 * @workspace/game-utilities, so nothing calls the network per click.
 *
 * Only instantiations the server lists in `offered` can be saved (each has calibration tables), so
 * picking a component snaps to the offered instantiation that keeps the most of the current choice.
 */
import { capabilityClass, instantiate, maximalClasses, type Badge } from "@workspace/game-types";
import { publicCatalog, type CatalogEntry } from "@workspace/game-utilities";
import type { ArgsLike, BadgeLike } from "./catalog.ts";

export interface ComponentOptionLike { id: string; label: string; emoji: string; kid: string }
export interface ParamSchemaLike {
  kind: "component" | "int" | string;
  id: string;
  label: string;
  slot?: string;
  options?: readonly ComponentOptionLike[];
  min?: number;
  max?: number;
  presets?: readonly number[];
}
export interface OfferedLike { key: string; args: ArgsLike; label: string; badges: readonly BadgeLike[]; classes?: readonly string[] }
export interface ObjectTypeInfoLike<O extends OfferedLike = OfferedLike> {
  id: string;
  label: string;
  emoji: string;
  kid: string;
  params: readonly ParamSchemaLike[];
  defaults: ArgsLike;
  offered: readonly O[];
}

export const sameArgs = (a: ArgsLike, b: ArgsLike) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(k => String(a[k]) === String(b[k]));
};

/** The offered instantiation equal to these args (missing args take the type's defaults). */
export function findOffered<O extends OfferedLike>(t: ObjectTypeInfoLike<O>, args: ArgsLike): O | undefined {
  const full = { ...t.defaults, ...args };
  return t.offered.find(o => sameArgs({ ...t.defaults, ...o.args }, full));
}

/**
 * The offered instantiation that contains every value in `patch` and keeps the most other current
 * values (ties: parameter order, then the server's order). Undefined when none contains the patch.
 */
export function snapToOffered<O extends OfferedLike>(t: ObjectTypeInfoLike<O>, current: ArgsLike, patch: ArgsLike): O | undefined {
  const want = { ...t.defaults, ...current, ...patch };
  let best: O | undefined, bestScore = -1;
  for (const o of t.offered) {
    const args = { ...t.defaults, ...o.args };
    if (!Object.entries(patch).every(([k, v]) => String(args[k]) === String(v))) continue;
    // Earlier parameters weigh more, so a size change keeps symbols and colours when it can.
    const score = t.params.reduce((s, p, i) => s + (String(args[p.id]) === String(want[p.id]) ? 2 ** (t.params.length - i) : 0), 0);
    if (score > bestScore) { best = o; bestScore = score; }
  }
  return best;
}

/** Values of one parameter that appear in some offered instantiation. */
export function offeredValues(t: ObjectTypeInfoLike, paramId: string): string[] {
  return [...new Set(t.offered.map(o => String({ ...t.defaults, ...o.args }[paramId])))];
}

/** A component's maximal capability badges ("🔟 Place value", not three badges). */
export function componentBadges(objectType: string, param: ParamSchemaLike, optionId: string, base: ArgsLike = {}): Badge[] {
  if (param.kind !== "component" || !param.slot) return [];
  try {
    const inst = instantiate(objectType, { ...base, [param.id]: optionId });
    const ids = inst.classes.filter(id => capabilityClass(id).slot === param.slot);
    return maximalClasses(ids).map(id => capabilityClass(id).badge);
  } catch { return []; }
}

const catalogs = new Map<string, CatalogEntry[]>();
/** The public catalog for (type, args), memoised; [] when the args do not instantiate. */
export function catalogFor(objectType: string, args: ArgsLike): CatalogEntry[] {
  let inst;
  try { inst = instantiate(objectType, args); } catch { return []; }
  let c = catalogs.get(inst.key);
  if (!c) catalogs.set(inst.key, c = publicCatalog(inst));
  return c;
}

/** How a change moves the rule shelf: families gained and lost (reward families only). */
export function ruleDelta(objectType: string, from: ArgsLike, toType: string, to: ArgsLike): { gained: number; lost: number } {
  const a = new Set(catalogFor(objectType, from).filter(e => e.available && e.role === "reward").map(e => e.id));
  const b = new Set(catalogFor(toType, to).filter(e => e.available && e.role === "reward").map(e => e.id));
  return { gained: [...b].filter(id => !a.has(id)).length, lost: [...a].filter(id => !b.has(id)).length };
}

/** Parameter ids whose value differs between two arg sets (to highlight what an unlock changed). */
export function changedParams(a: ArgsLike, b: ArgsLike): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => String(a[k]) !== String(b[k]));
}

/** Short label for an int preset: "−2,147,483,648", "9,999". */
export const intLabel = (v: number) => v.toLocaleString("en-US").replace("-", "−");
