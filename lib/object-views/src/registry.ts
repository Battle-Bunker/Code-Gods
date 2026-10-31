/**
 * The object-type registry: one entry per object type, mapping the type's id (the room setting
 * `objectType`, e.g. "Int", "string", "Grid") to the renderers that draw its values. A type may have
 * several named renderers (a Grid as coloured digits or as tiles); each viewer's choice per type is
 * remembered in localStorage, and the type's default applies until they choose.
 *
 * This module is framework-free so the dispatch rules can be unit tested under plain Node; the
 * React components register themselves in `views.tsx`.
 */

export type ObjectValue = number | string;

/** Grid type parameters as the room settings will carry them; every field optional for display. */
export interface GridSettings {
  size?: number;
  symbols?: string;
  colours?: string;
}

export interface ObjectContext {
  /** The game's `settings.objectType` when the caller knows it. Unknown types fall back to inference. */
  objectType?: string;
  /** Grid(size, symbols, colours) parameters, when known. */
  grid?: GridSettings;
}

/**
 * One way to draw a type's values, e.g. a Grid as coloured digits or as tiles. `Component` is whatever the
 * caller renders with (a React component in `views.tsx`; a plain value in the tests).
 */
export interface ObjectRenderer<C> {
  /** Stable id, remembered per viewer, e.g. "digits". */
  id: string;
  /** Short name for toggles and the palette, e.g. "Digits". */
  label: string;
  /** One sentence on what it shows. */
  blurb: string;
  Component: C;
}

/** A registered type, normalised: every entry has at least one renderer and a default among them. */
export interface ObjectTypeEntry<C> {
  /** The settings `objectType` this entry renders, e.g. "Grid". */
  type: string;
  renderers: readonly ObjectRenderer<C>[];
  /** The id of the renderer used when neither the caller nor the viewer chose one. */
  defaultRenderer: string;
  /** The default renderer's component (the one-renderer shape, for callers that need no choice). */
  component: C;
  /**
   * Optional: claim a value whose type the caller does not know. Entries are tried from the most
   * recently registered to the first, so a specific type (Grid) wins over a general one (string).
   */
  infer?: (value: ObjectValue) => boolean;
}

/** What `register` takes: several named renderers, or (the original shape) one component. */
export type ObjectTypeRegistration<C> =
  | { type: string; renderers: readonly ObjectRenderer<C>[]; defaultRenderer?: string; infer?: (value: ObjectValue) => boolean }
  | { type: string; component: C; infer?: (value: ObjectValue) => boolean };

export interface ObjectTypeRegistry<C> {
  register(entry: ObjectTypeRegistration<C>): void;
  get(type: string): ObjectTypeEntry<C> | undefined;
  /** The entry for a value: `context.objectType` when registered, otherwise the first entry whose `infer` accepts it. */
  resolve(value: ObjectValue, context?: ObjectContext): ObjectTypeEntry<C> | undefined;
  types(): string[];
  /** A type's renderers, in registration order; empty for an unknown type. */
  renderers(type: string): readonly ObjectRenderer<C>[];
  /** The renderer id in effect for this viewer: their remembered choice while the type still has it, else the default. */
  choice(type: string): string | undefined;
  /** Remembers the viewer's renderer for a type. Refuses (false) an id the type does not have. */
  choose(type: string, id: string): boolean;
  /** Called after every accepted `choose`. */
  subscribe(listener: () => void): () => void;
  /** The renderer to draw with: `explicit` when the type has it, else the viewer's choice, else the default. */
  pick(type: string, explicit?: string): ObjectRenderer<C> | undefined;
}

/** localStorage key prefix of the viewer's renderer choice; the type id follows, e.g. `…renderer.Grid`. */
export const OBJECT_RENDERER_KEY_PREFIX = "code-gods.object-views.renderer.";

// Storage can be missing (Node, SSR) or throw (private windows, blocked site data): every access is guarded,
// and a choice that cannot be stored still holds for this page.
function readStored(type: string): string | null {
  try { return globalThis.localStorage?.getItem(OBJECT_RENDERER_KEY_PREFIX + type) ?? null; } catch { return null; }
}
function writeStored(type: string, id: string): void {
  try { globalThis.localStorage?.setItem(OBJECT_RENDERER_KEY_PREFIX + type, id); } catch { /* not remembered */ }
}

function normalise<C>(entry: ObjectTypeRegistration<C>): ObjectTypeEntry<C> {
  const renderers = "renderers" in entry
    ? entry.renderers
    : [{ id: "default", label: "Default", blurb: `The ${entry.type} view.`, Component: entry.component }];
  if (!renderers.length) throw new Error(`Object type "${entry.type}" needs at least one renderer.`);
  const defaultRenderer = ("defaultRenderer" in entry ? entry.defaultRenderer : undefined) ?? renderers[0].id;
  const fallback = renderers.find(r => r.id === defaultRenderer);
  if (!fallback) throw new Error(`Object type "${entry.type}": default renderer "${defaultRenderer}" is not one of its renderers.`);
  return { type: entry.type, renderers, defaultRenderer, component: fallback.Component, infer: entry.infer };
}

export function createObjectTypeRegistry<C>(): ObjectTypeRegistry<C> {
  const entries = new Map<string, ObjectTypeEntry<C>>();
  /** The viewer's choices read or made on this page (null: nothing stored). */
  const chosen = new Map<string, string | null>();
  const listeners = new Set<() => void>();
  const has = (entry: ObjectTypeEntry<C>, id: string | null | undefined): id is string => !!id && entry.renderers.some(r => r.id === id);
  const stored = (type: string): string | null => {
    if (!chosen.has(type)) chosen.set(type, readStored(type));
    return chosen.get(type) ?? null;
  };
  const choice = (type: string): string | undefined => {
    const entry = entries.get(type);
    if (!entry) return undefined;
    const id = stored(type);
    return has(entry, id) ? id : entry.defaultRenderer;
  };
  return {
    register(entry) { const e = normalise(entry); entries.delete(e.type); entries.set(e.type, e); },
    get: (type) => entries.get(type),
    resolve(value, context) {
      const known = context?.objectType !== undefined ? entries.get(context.objectType) : undefined;
      if (known) return known;
      const all = [...entries.values()].reverse();
      return all.find(e => e.infer?.(value));
    },
    types: () => [...entries.keys()],
    renderers: (type) => entries.get(type)?.renderers ?? [],
    choice,
    choose(type, id) {
      const entry = entries.get(type);
      if (!entry || !has(entry, id)) return false;
      chosen.set(type, id);
      writeStored(type, id);
      listeners.forEach(l => l());
      return true;
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    pick(type, explicit) {
      const entry = entries.get(type);
      if (!entry) return undefined;
      const id = has(entry, explicit) ? explicit : choice(type);
      return entry.renderers.find(r => r.id === id);
    },
  };
}
