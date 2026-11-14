/**
 * The rule gallery's model (pages site/pages/rule-gallery.tsx and rule-family.tsx): pure library data, no server.
 *
 *   setup     the rule-determining settings: an object type and its type args (Grid: size, symbols, colours)
 *   families  the richly annotated families (game-utilities LENSES) the setup's board can deal
 *   params    one draw of a family: each param a named, typed field (game-utilities params.ts: a colour picker, a symbol
 *             picker, a number, a choice) whose values are its type's domain on this board, within the family's support
 *   tiers     a family with tiers (archive/engine-v1:docs/layered-rules-design.md) has one more, optional field, "To score even higher":
 *             "none" (the base rule, whose params carry no `tiers` key) or one of its gated tiers (`family.tiered(ctx, 1)`)
 *
 * The family page keeps everything in GET params (the gallery keeps its board there; a tile's params ride on its link): the type args by their own names (size, symbols, colours; objectType
 * only when it is not Grid), every family param by its name and `lang` for TypeScript source, so a tile's link opens its family page on exactly
 * the board and params the tile showed. Unit tested in test/rule-gallery.test.ts.
 */
import { OBJECT_TYPES, instantiate, objectType, seededRng, type Instantiation, type TypeArgs } from "@workspace/game-types";
import {
  LENSES, applicable, context, family, isPlayableInstantiation, playableInstantiations, type ParamJson, type ParamKind, type ParamOption, type Params,
} from "@workspace/game-utilities";

export interface GallerySetup { objectType: string; typeArgs: TypeArgs }
/** A field's value: a scalar, a list (a preset, a dealt tier list), or null for an optional field left out. */
export type GalleryValue = ParamJson | null;

const DEFAULT_TYPE = "Grid";
export const DEFAULT_SETUP: GallerySetup = Object.freeze({ objectType: DEFAULT_TYPE, typeArgs: Object.freeze({ ...objectType(DEFAULT_TYPE).defaults }) });

/** The object types the setup form offers (every type the game supports). */
export const galleryObjectTypes = (): { id: string; label: string; emoji: string }[] =>
  OBJECT_TYPES.map(t => ({ id: t.id, label: t.label, emoji: t.emoji }));

/**
 * The setup form's fields for a setup: each type param with the values some playable board has, plus the setup's own
 * value when it is a valid board the presets do not list (Int(5,100)), so a select always shows what the page uses.
 */
export function setupFields(setup: GallerySetup): { id: string; label: string; options: { value: string | number; label: string }[] }[] {
  const t = objectType(setup.objectType), boards = playableInstantiations(setup.objectType);
  return t.params.map(p => {
    const values = [...new Set([...boards.map(b => b.args[p.id]), ...(setup.typeArgs[p.id] !== undefined ? [setup.typeArgs[p.id]] : [])])];
    const label = (v: string | number) => (p.kind === "component" ? p.options.find(o => o.id === v)?.label ?? String(v) : String(v));
    return { id: p.id, label: p.label, options: values.map(value => ({ value, label: label(value) })) };
  });
}

/** The instantiation of a setup (throws on an invalid one). */
export const instOf = (setup: GallerySetup): Instantiation => instantiate(setup.objectType, setup.typeArgs);

/** The setup in a query string; anything missing takes the type's default, and an unplayable board the beginner board. */
export function setupFromSearch(search: string): GallerySetup {
  const q = new URLSearchParams(search);
  const typeId = q.get("objectType") ?? DEFAULT_TYPE;
  let t;
  try { t = objectType(typeId); } catch { return DEFAULT_SETUP; }
  const args: Record<string, string | number> = { ...t.defaults };
  for (const p of t.params) {
    const raw = q.get(p.id);
    if (raw !== null) args[p.id] = p.kind === "int" ? Number(raw) : raw;
  }
  try {
    const inst = instantiate(typeId, args);
    return isPlayableInstantiation(inst) ? { objectType: typeId, typeArgs: { ...inst.args } } : DEFAULT_SETUP;
  } catch { return DEFAULT_SETUP; }
}

/** The annotated families this board can deal, in the lens registry's order. */
export function galleryFamilies(inst: Instantiation): string[] {
  return LENSES.map(l => l.familyId).filter(id => {
    const f = family(id);
    return f.role === "reward" && applicable(f, inst).ok;
  });
}

/**
 * The draws the gallery offers: the family's support, then (a family with tiers) each base with each gated tier. The
 * base draws come first, so a tie between a base draw and a tiered one goes to the base.
 */
function draws(familyId: string, inst: Instantiation): readonly Params[] {
  const f = family(familyId), ctx = context(inst);
  return [...f.support(ctx), ...(f.tiered?.(ctx, 1) ?? [])] as readonly Params[];
}

/**
 * A value as one short string: an option's key in a select and its form in a link. A scalar is itself; a dealt tier
 * list is each interaction with its own params, without the gate (the board fixes it): "lines.x18"; null (an optional
 * field left out) is "". Any other list or object is its JSON.
 */
export function optionKey(value: GalleryValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  const tier = (t: unknown): string | null => {
    if (typeof t !== "object" || t === null || Array.isArray(t) || typeof (t as { id?: unknown }).id !== "string") return null;
    const { id, gate: _gate, compose: _compose, ...own } = t as Record<string, unknown>;
    if (Object.values(own).some(v => typeof v === "object")) return null;
    return [id as string, ...Object.entries(own).map(([k, v]) => `${k}${String(v)}`)].join(".");
  };
  const tiers = Array.isArray(value) && value.length ? value.map(tier) : [null];
  return tiers.every(t => t !== null) ? tiers.join("~") : JSON.stringify(value);
}
/** The key of a draw's value for a field ("" when the draw leaves an optional field out). */
export const currentKey = (params: Params, key: string): string => optionKey(params[key] as GalleryValue | undefined);
const same = (a: unknown, b: unknown) => optionKey(a as GalleryValue) === optionKey(b as GalleryValue);

/** One picker on a tile: the param's name, label and type, and the values it can take on this board (support order). */
export interface GalleryField {
  readonly key: string;
  readonly label: string;
  readonly kind: ParamKind;
  /** The field may be left out: its first option is then "none" (value null). */
  readonly optional?: boolean;
  readonly options: readonly (Omit<ParamOption, "value"> & { readonly value: GalleryValue })[];
}

/**
 * A tile's fields: each declared param of the family with the values of its domain that its draws use. An optional
 * field (a family's tiers) starts with "none"; one with nothing else to offer on this board is left out.
 */
export function paramFields(familyId: string, inst: Instantiation): GalleryField[] {
  const f = family(familyId), ctx = context(inst), all = draws(familyId, inst);
  // Whole values are compared (as JSON): a tier list dealt with another gate or composition is another value.
  const used = (key: string) => new Set(all.filter(p => p[key] !== undefined).map(p => JSON.stringify(p[key])));
  return f.params(ctx).flatMap((field): GalleryField[] => {
    const u = used(field.key), options: GalleryField["options"] = field.options.filter(o => u.has(JSON.stringify(o.value)));
    if (!field.optional) return [{ key: field.key, label: field.label, kind: field.kind, options }];
    return options.length ? [{ key: field.key, label: field.label, kind: field.kind, optional: true, options: [{ value: null, label: "none (the base rule)" }, ...options] }] : [];
  });
}

/**
 * The offered draw that agrees with `wanted` on the most keys (`must` keys exactly, a left-out key matching only a
 * draw without it), the first on a tie. A draw with an optional field `wanted` leaves out (or the reverse) ranks below
 * one that agrees on it, so a base rule stays a base rule when another field changes.
 */
function closest(familyId: string, inst: Instantiation, wanted: Record<string, unknown>, must: readonly string[] = []): Params {
  const all = draws(familyId, inst), absent = (v: unknown) => v === undefined || v === null;
  let best: Params | undefined, bestScore = -Infinity;
  for (const p of all) {
    if (must.some(k => !same(p[k], wanted[k]))) continue;
    const keys = new Set([...Object.keys(p), ...Object.keys(wanted).filter(k => !absent(wanted[k]))]);
    let score = 0;
    for (const k of keys) score += same(p[k], wanted[k]) ? 1 : absent(p[k]) !== absent(wanted[k]) ? -0.5 : 0;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return { ...(best ?? all[0]) };
}

/** The params after one field changes: that field's value (null: left out), the rest kept where the draws allow. */
export function withParam(familyId: string, inst: Instantiation, params: Params, key: string, value: GalleryValue): Params {
  const { [key]: _old, ...rest } = params;
  return closest(familyId, inst, value === null ? rest : { ...rest, [key]: value }, [key]);
}

/** A random draw of the family's params (its own sampler), repeatable by seed. */
export const randomParams = (familyId: string, inst: Instantiation, seed: number | string): Params =>
  ({ ...family(familyId).sample(seededRng(seed), context(inst)) });

/** The GET params the board and language use: a family param must never share one of these names (tested). */
export const RESERVED_PARAMS = ["objectType", "lang", ...new Set(OBJECT_TYPES.flatMap(t => t.params.map(p => p.id)))];

/** The family params a query string carries as typed (everything but the board and language), for a board that cannot use them. */
export function rawParamsOf(search: string): Record<string, string> {
  return Object.fromEntries([...new URLSearchParams(search)].filter(([k]) => !RESERVED_PARAMS.includes(k)));
}

/** A fresh random seed (the gallery's random params and example objects). */
export const freshSeed = () => Math.floor(Math.random() * 2 ** 31);

/** The query string of a setup, (optionally) a family's params, and the source language when it is not Python. */
export function gallerySearch(setup: GallerySetup, params: Params = {}, language: "python" | "typescript" = "python"): string {
  const q = new URLSearchParams();
  if (setup.objectType !== DEFAULT_TYPE) q.set("objectType", setup.objectType);
  for (const p of objectType(setup.objectType).params) if (setup.typeArgs[p.id] !== undefined) q.set(p.id, String(setup.typeArgs[p.id]));
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, optionKey(v));
  if (language !== "python") q.set("lang", language);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * A family's params from a query string: each named param matched against its offered values, the rest completed. An
 * optional field the link leaves out (or names with a value the board does not offer) is left out: the base rule.
 */
export function paramsFromSearch(familyId: string, inst: Instantiation, search: string): Params {
  const q = new URLSearchParams(search), wanted: Record<string, unknown> = {}, given: string[] = [];
  for (const { key, options, optional } of paramFields(familyId, inst)) {
    const raw = q.get(key);
    const match = raw === null ? undefined : options.find(o => o.value !== null && optionKey(o.value) === raw);
    if (match !== undefined) { wanted[key] = match.value; given.push(key); }
    else if (optional) given.push(key);
  }
  return closest(familyId, inst, wanted, given);
}
