/**
 * The settings model's domain on the server (game-core settings-model.ts): the instantiations offered whatever
 * families a room excludes (manifest.get lists the same), and the families that can be dealt in an instantiation.
 * The offered list follows the calibration manifest it is built from (what file storage holds:
 * engine/calibration.ts calibrationManifest), memoised per manifest. Imports packages only, so the unit tests load it
 * directly (with the shipped manifest from disk).
 */
import type { FamilyRole, SettingsDomain } from "@workspace/game-core";
import { instantiate, type TypeArgs } from "@workspace/game-types";
import { familiesFor, offeredInstantiations, publicCatalog, type CalibrationManifest } from "@workspace/game-utilities";

const familyIds = new Map<string, readonly string[]>();
/** The settings' family role in game-utilities' words. */
const utilityRole = (role: FamilyRole) => (role === "defence" ? "penalty" : "reward");
const domains = new WeakMap<CalibrationManifest, SettingsDomain>();

export function settingsDomain(manifest: CalibrationManifest): SettingsDomain {
  let domain = domains.get(manifest);
  if (domain) return domain;
  const offeredArgs = new Map<string, readonly TypeArgs[]>();
  domain = {
    offered(objectTypeId) {
      let found = offeredArgs.get(objectTypeId);
      if (!found) offeredArgs.set(objectTypeId, found = offeredInstantiations(manifest, objectTypeId).map(inst => inst.args));
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
  domains.set(manifest, domain);
  return domain;
}
