"use node";
/**
 * The settings model's domain on the server (game-core settings-model.ts): the instantiations offered whatever
 * families a room excludes (manifest.get lists the same), and the families that can be dealt in an instantiation.
 * Node only (it loads the calibration tables); imports packages only, so the unit tests load it directly.
 */
import type { FamilyRole, SettingsDomain } from "@workspace/game-core";
import { instantiate, type TypeArgs } from "@workspace/game-types";
import { familiesFor, offeredInstantiations, publicCatalog } from "@workspace/game-utilities";

const offeredArgs = new Map<string, readonly TypeArgs[]>();
const familyIds = new Map<string, readonly string[]>();
/** The settings' family role in game-utilities' words. */
const utilityRole = (role: FamilyRole) => (role === "defence" ? "penalty" : "reward");

export const SETTINGS_DOMAIN: SettingsDomain = {
  offered(objectTypeId) {
    let found = offeredArgs.get(objectTypeId);
    if (!found) offeredArgs.set(objectTypeId, found = offeredInstantiations(objectTypeId).map(inst => inst.args));
    return found;
  },
  families(objectTypeId, typeArgs, role) {
    const inst = instantiate(objectTypeId, typeArgs);
    const key = `${inst.key}|${role}`;
    let found = familyIds.get(key);
    if (!found) familyIds.set(key, found = publicCatalog(inst).filter(e => e.available && e.role === utilityRole(role)).map(e => e.id));
    return found;
  },
  typeFamilies: (objectTypeId, role) => familiesFor(objectTypeId, utilityRole(role)).map(f => f.id),
};
