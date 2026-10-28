/**
 * The object-type registry: one entry per object type, mapping the type's id (the room setting
 * `objectType`, e.g. "Int", "string", "Grid") to the component that renders its values.
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

export interface ObjectTypeEntry<C> {
  /** The settings `objectType` this entry renders, e.g. "Grid". */
  type: string;
  component: C;
  /**
   * Optional: claim a value whose type the caller does not know. Entries are tried from the most
   * recently registered to the first, so a specific type (Grid) wins over a general one (string).
   */
  infer?: (value: ObjectValue) => boolean;
}

export interface ObjectTypeRegistry<C> {
  register(entry: ObjectTypeEntry<C>): void;
  get(type: string): ObjectTypeEntry<C> | undefined;
  /** The entry for a value: `context.objectType` when registered, otherwise the first entry whose `infer` accepts it. */
  resolve(value: ObjectValue, context?: ObjectContext): ObjectTypeEntry<C> | undefined;
  types(): string[];
}

export function createObjectTypeRegistry<C>(): ObjectTypeRegistry<C> {
  const entries = new Map<string, ObjectTypeEntry<C>>();
  return {
    register(entry) { entries.delete(entry.type); entries.set(entry.type, entry); },
    get: (type) => entries.get(type),
    resolve(value, context) {
      const known = context?.objectType !== undefined ? entries.get(context.objectType) : undefined;
      if (known) return known;
      const all = [...entries.values()].reverse();
      return all.find(e => e.infer?.(value));
    },
    types: () => [...entries.keys()],
  };
}
