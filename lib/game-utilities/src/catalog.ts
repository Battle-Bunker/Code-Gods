/**
 * The family catalog, kid cards and the trusted host evaluator.
 *
 * The TypeScript card is the single source of truth for a draw's ordinal (docs/clean-implementation-plan.md §3):
 * the host compiles it once per (instantiation, family, params) together with the instantiation's generated JS
 * prelude, and the calibration pipeline uses this same evaluator, so live scores and tables cannot drift apart.
 * Cards are authored in this package and are plain JavaScript (no type annotations); player code never reaches
 * `new Function` here.
 */
import { instanceInfo, objectType, resolve, type Badge, type Instantiation, type ObjectValue, type TypeArgs } from "@workspace/game-types";
import type { FamilyContext, Ordinal, Params, ScoreShape, UtilityCard, UtilityDescriptor, UtilityFamily } from "./types.ts";
import { setHostEval } from "./families/define.ts";
import { cardProgram } from "./families/card.ts";
import { GRID_FAMILIES } from "./families/grid/index.ts";
import { INT_FAMILIES } from "./families/int.ts";
import { STRING_FAMILIES } from "./families/string.ts";

export const FAMILIES: readonly UtilityFamily<any>[] = [...INT_FAMILIES, ...STRING_FAMILIES, ...GRID_FAMILIES];
const byId = new Map(FAMILIES.map(f => [f.id, f]));
if (byId.size !== FAMILIES.length) throw new Error("duplicate utility family id");

export function family(id: string): UtilityFamily<any> {
  const found = byId.get(id);
  if (!found) throw new Error(`Unknown utility family: ${id}`);
  return found;
}

/** Families of one object type, optionally of one role. */
export const familiesFor = (objectType: string, role?: "reward" | "penalty") =>
  FAMILIES.filter(f => f.objectType === objectType && (role === undefined || f.role === role));

const contexts = new Map<string, FamilyContext>();
/** What families see of an instantiation (memoised by key). */
export function context(inst: Instantiation): FamilyContext {
  let ctx = contexts.get(inst.key);
  if (!ctx) contexts.set(inst.key, ctx = Object.freeze({ inst, info: instanceInfo(inst) }));
  return ctx;
}

/** Whether a family can be dealt in this instantiation (its constraints, via game-types' resolver). */
export function available(f: UtilityFamily<any>, inst: Instantiation) {
  if (f.objectType !== inst.objectType) {
    return { ok: false as const, unmet: [], reason: `only for ${f.objectType} games` };
  }
  return resolve(f.requires, inst);
}

/** The distinct canonical params of the support: what calibration enumerates (one table each). */
export function canonicalSupport<P extends Params>(f: UtilityFamily<P>, ctx: FamilyContext): P[] {
  const out = new Map<string, P>();
  for (const p of f.support(ctx)) {
    const c = f.canonical(p, ctx);
    out.set(paramsKey(c), c);
  }
  return [...out.values()];
}

/** Stable JSON of params (sorted keys), for caches and table keys. */
export function paramsKey(p: unknown): string {
  if (Array.isArray(p)) return `[${p.map(paramsKey).join(",")}]`;
  if (p && typeof p === "object") {
    return `{${Object.keys(p).sort().map(k => `${JSON.stringify(k)}:${paramsKey((p as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(p);
}

export interface CatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly theme: string;
  readonly role: "reward" | "penalty";
  readonly tags: readonly string[];
  readonly available: boolean;
  /** Capability badges the family relies on (available families only). */
  readonly badges: readonly Badge[];
  /** Kid wording when locked ("needs ♠ Suits: pick Playing cards"), and the smallest settings patch that unlocks it. */
  readonly locked?: { readonly reason: string; readonly unlock?: TypeArgs };
}

/** Public knowledge: which kinds of gods might be in this pantheon, with availability, without parameters. */
export function publicCatalog(inst: Instantiation): CatalogEntry[] {
  return familiesFor(inst.objectType).map(f => {
    const r = available(f, inst);
    const base = { id: f.id, name: f.name, emoji: f.emoji, theme: f.theme, role: f.role, tags: f.tags };
    return r.ok ? { ...base, available: true, badges: r.badges }
      : { ...base, available: false, badges: [], locked: { reason: r.reason, ...("unlock" in r && r.unlock ? { unlock: r.unlock } : {}) } };
  });
}

export function readDescriptor(value: unknown): UtilityDescriptor {
  const d = value as UtilityDescriptor | null;
  const ok = (x: { familyId?: unknown; params?: unknown } | null | undefined) =>
    !!x && typeof x === "object" && typeof x.familyId === "string" && !!x.params && typeof x.params === "object";
  if (!ok(d) || (d!.penalty !== undefined && !ok(d!.penalty))) throw new Error("Invalid utility descriptor");
  if (family(d!.familyId).role !== "reward") throw new Error(`${d!.familyId} is a defence goal, not a utility`);
  if (d!.penalty && family(d!.penalty.familyId).role !== "penalty") throw new Error(`${d!.penalty.familyId} is not a defence goal`);
  return d!;
}

/** What a god is told about their own utility function (and defence goal). */
export function card(descriptor: UtilityDescriptor, ctx: FamilyContext): UtilityCard {
  const f = family(descriptor.familyId), p = descriptor.params;
  const pen = descriptor.penalty;
  const pf = pen ? family(pen.familyId) : null;
  return {
    familyId: f.id, emoji: f.emoji, name: f.name, theme: f.theme, summary: f.summary(p, ctx), shape: f.shape(ctx),
    source: { python: f.card.python(p, ctx), typescript: f.card.typescript(p, ctx) },
    ...(pen && pf ? {
      penalty: {
        familyId: pf.id, emoji: pf.emoji, name: pf.name, summary: pf.summary(pen.params, ctx),
        comparative: pf.comparative?.(pen.params, ctx) ?? "worse", shape: pf.shape(ctx),
        source: { python: pf.card.python(pen.params, ctx), typescript: pf.card.typescript(pen.params, ctx) },
      },
    } : {}),
  };
}

// ------------------------------------------------------------------------------------------------
// ordinals
// ------------------------------------------------------------------------------------------------

/** Lexicographic comparison (scalars as 1-tuples): negative, zero or positive. */
export function compareOrdinals(a: Ordinal, b: Ordinal): number {
  const x = typeof a === "number" ? [a] : a, y = typeof b === "number" ? [b] : b;
  if (x.length !== y.length) throw new Error(`Cannot compare ordinals of arity ${x.length} and ${y.length}`);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** Checks a card's return value against its shape: safe integers, fixed arity. Returns it frozen. */
export function assertOrdinal(shape: ScoreShape, x: unknown): Ordinal {
  if (shape.kind === "scalar") {
    if (typeof x !== "number" || !Number.isSafeInteger(x)) throw new Error(`Expected a whole number, got ${String(x)}`);
    return x === 0 ? 0 : x; // no -0
  }
  if (!Array.isArray(x) || x.length !== shape.arity || !x.every(v => typeof v === "number" && Number.isSafeInteger(v))) {
    throw new Error(`Expected ${shape.arity} whole numbers, got ${JSON.stringify(x)}`);
  }
  return Object.freeze(x.map(v => (v === 0 ? 0 : v)));
}

// ------------------------------------------------------------------------------------------------
// host evaluator
// ------------------------------------------------------------------------------------------------

/** A family plus params: a reward draw or a descriptor's defence goal. */
export interface Draw { readonly familyId: string; readonly params: Params }

/** The card's entry point. */
export const entryPoint = (f: UtilityFamily<any>) => (f.role === "penalty" ? "penalty" : "utility");

const compiled = new Map<string, (wire: ObjectValue) => Ordinal>();
const MAX_COMPILED = 4096;

/**
 * Trusted host evaluator for one draw in one instantiation: the TypeScript card's program (`cardProgram`, exactly what
 * table keys hash) compiled once with the
 * instantiation's JS prelude, returning `utility(__decode(wire))` (or `penalty(...)`) checked against the
 * family's shape. Cached by (inst.key, familyId, params).
 */
export function evaluator(draw: Draw, inst: Instantiation): (wire: ObjectValue) => Ordinal {
  const key = `${inst.key}\0${draw.familyId}\0${paramsKey(draw.params)}`;
  let fn = compiled.get(key);
  if (fn) return fn;
  const f = family(draw.familyId), ctx = context(inst);
  if (f.objectType !== inst.objectType) throw new Error(`${f.id} does not apply to ${inst.key}`);
  const prelude = objectType(inst.objectType).prelude(inst);
  const body = `"use strict";\n${prelude.js}\n;\n${cardProgram(f.card.typescript(draw.params, ctx))}\n;\nreturn (wire) => ${entryPoint(f)}(__decode(wire));`;
  const raw = new Function(body)() as (wire: ObjectValue) => unknown;
  const shape = f.shape(ctx);
  fn = (wire: ObjectValue) => assertOrdinal(shape, raw(wire));
  if (compiled.size >= MAX_COMPILED) compiled.delete(compiled.keys().next().value!);
  compiled.set(key, fn);
  return fn;
}

/** One draw's ordinal for one object. */
export const ordinal = (draw: Draw, inst: Instantiation, wire: ObjectValue): Ordinal => evaluator(draw, inst)(wire);

setHostEval((familyId, params, ctx) => evaluator({ familyId, params }, ctx.inst));
