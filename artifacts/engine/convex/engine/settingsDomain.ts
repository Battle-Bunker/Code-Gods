/**
 * The settings model's domain on the server (game-core settings-model.ts): the playable instantiations
 * (game-utilities `playableInstantiations`, which manifest.get lists too; any other valid, non-retired arguments are
 * accepted as well) and the families that can be dealt in an instantiation. Calibration tables play no part: a shape
 * with none prepares them on its first game (docs/analytic-calibration/architecture.md §3.4). Imports packages only, so
 * the unit tests load it directly.
 */
import type { FamilyRole, SettingsDomain } from "@workspace/game-core";
import { instantiate, type TypeArgs } from "@workspace/game-types";
import { familiesFor, isPlayableInstantiation, playableInstantiations, publicCatalog } from "@workspace/game-utilities";

const familyIds = new Map<string, readonly string[]>();
/** The settings' family role in game-utilities' words. */
const utilityRole = (role: FamilyRole) => (role === "defence" ? "penalty" : "reward");
const playableArgs = new Map<string, readonly TypeArgs[]>();

const DOMAIN: SettingsDomain = {
  playable(objectTypeId) {
    let found = playableArgs.get(objectTypeId);
    if (!found) playableArgs.set(objectTypeId, found = playableInstantiations(objectTypeId).map(inst => inst.args));
    return found;
  },
  isPlayable(objectTypeId, typeArgs) {
    try { return isPlayableInstantiation(instantiate(objectTypeId, typeArgs)); } catch { return false; }
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

export function settingsDomain(): SettingsDomain { return DOMAIN; }
