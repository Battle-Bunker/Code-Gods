/** The object-type registry: every type the product offers, and instantiation from settings. */
import { registerObjectType } from "./constraints.ts";
import { GRID } from "./grid/index.ts";
import { INT } from "./int/index.ts";
import { availableOf } from "./prelude.ts";
import { STRING } from "./string/index.ts";
import type { InstanceInfo, Instantiation, MutatorDef, ObjectTypeDef, TypeArgs } from "./types.ts";

export const OBJECT_TYPES: readonly ObjectTypeDef<any>[] = Object.freeze([INT, STRING, GRID]);
OBJECT_TYPES.forEach(registerObjectType);

const BY_ID = new Map(OBJECT_TYPES.map(t => [t.id, t]));

export function objectType(id: string): ObjectTypeDef<any> {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`Unknown object type ${id}`);
  return t;
}

/** Validates the arguments (missing ones take the type's defaults) and resolves terms and classes. */
export function instantiate(id: string, typeArgs: TypeArgs = {}): Instantiation {
  return objectType(id).instantiate(typeArgs);
}

export function instanceInfo(inst: Instantiation): InstanceInfo {
  return objectType(inst.objectType).describe(inst);
}

/** The mutators whose requirements this instantiation meets, in the type's order. */
export function availableMutators(inst: Instantiation): MutatorDef<any, any>[] {
  return availableOf(objectType(inst.objectType).mutators, inst);
}

/** Canonical key for (type, args) without keeping the instantiation: "Grid(5,base10,rgby)". */
export function encodeKey(id: string, typeArgs: TypeArgs = {}): string {
  return instantiate(id, typeArgs).key;
}
