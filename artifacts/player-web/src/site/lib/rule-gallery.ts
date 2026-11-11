/**
 * The rule gallery's model (pages site/pages/rule-gallery.tsx and rule-family.tsx): pure library data, no server.
 *
 *   setup     the rule-determining settings: an object type and its type args (Grid: size, symbols, colours)
 *   families  the richly annotated families (game-utilities LENSES) the setup's board can deal
 *   params    one draw of a family: each param a named, typed field (game-utilities params.ts: a colour picker, a symbol
 *             picker, a number, a choice) whose values are its type's domain on this board, within the family's support
 *
 * The family page keeps everything in GET params (the gallery keeps its board there; a tile's params ride on its link): the type args by their own names (size, symbols, colours; objectType
 * only when it is not Grid), every family param by its name and `lang` for TypeScript source, so a tile's link opens its family page on exactly
 * the board and params the tile showed. Unit tested in test/rule-gallery.test.ts.
 */
import { OBJECT_TYPES, instantiate, objectType, seededRng, type Instantiation, type TypeArgs } from "@workspace/game-types";
import {
  LENSES, applicable, context, family, isPlayableInstantiation, playableInstantiations, type ParamKind, type ParamOption, type Params,
} from "@workspace/game-utilities";

export interface GallerySetup { objectType: string; typeArgs: TypeArgs }
type Scalar = string | number | boolean;

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

const support = (familyId: string, inst: Instantiation) => family(familyId).support(context(inst)) as readonly Record<string, Scalar>[];

/** One picker on a tile: the param's name, label and type, and the values it can take on this board (support order). */
export interface GalleryField {
  readonly key: string;
  readonly label: string;
  readonly kind: ParamKind;
  readonly options: readonly (ParamOption & { readonly value: Scalar })[];
}

/** A tile's fields: each declared param of the family with the values of its domain that its support uses. */
export function paramFields(familyId: string, inst: Instantiation): GalleryField[] {
  const f = family(familyId), ctx = context(inst), sup = support(familyId, inst);
  const used = (key: string) => new Set(sup.map(p => p[key]));
  return f.params(ctx).map(field => {
    const u = used(field.key);
    return { key: field.key, label: field.label, kind: field.kind, options: field.options.filter(o => u.has(o.value as Scalar)) as GalleryField["options"] };
  });
}

/** The support entry that agrees with `wanted` on the most keys (`must` keys first), the support's first on a tie. */
function closest(familyId: string, inst: Instantiation, wanted: Record<string, unknown>, must: readonly string[] = []): Params {
  let best: Record<string, Scalar> | undefined, bestScore = -1;
  for (const p of support(familyId, inst)) {
    if (must.some(k => p[k] !== wanted[k])) continue;
    const score = Object.keys(p).filter(k => p[k] === wanted[k]).length;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return { ...(best ?? support(familyId, inst)[0]) };
}

/** The params after one field changes: that field's value, the rest kept where the support allows. */
export const withParam = (familyId: string, inst: Instantiation, params: Params, key: string, value: Scalar): Params =>
  closest(familyId, inst, { ...params, [key]: value }, [key]);

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
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  if (language !== "python") q.set("lang", language);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** A family's params from a query string: each named param matched against its support values, the rest completed. */
export function paramsFromSearch(familyId: string, inst: Instantiation, search: string): Params {
  const q = new URLSearchParams(search), wanted: Record<string, Scalar> = {}, given: string[] = [];
  for (const { key, options } of paramFields(familyId, inst)) {
    const raw = q.get(key);
    const match = raw === null ? undefined : options.find(o => String(o.value) === raw);
    if (match !== undefined) { wanted[key] = match.value; given.push(key); }
  }
  return closest(familyId, inst, wanted, given);
}
