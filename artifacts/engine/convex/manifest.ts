"use node";
import { MIN_TICK_MS, TICK_SECONDS } from "./lib/world";
/**
 * The settings manifest for pickers: object types with parameters, classes and the PLAYABLE instantiations (every one
 * the type can instantiate, minus retired shapes: game-utilities playableInstantiations, the list the settings model
 * is given on the server), each saying how its first game here goes (`prepare`: how many rule tables would be
 * computed on demand, and about how long that takes; none for a shape whose tables are shipped or analytic) and
 * the priors under which the Aligned Lottery has measured synergy for it (`synergy`). `offered` keeps the shapes whose every table is shipped, for
 * diagnostics. Also the pre-authored dropdown options, available runtimes and AI funding status. Game setups are a
 * table of their own (convex/setups.ts).
 */
import { DEFAULT_SETTINGS, LANGUAGES, LANGUAGE_SPECS, SETTINGS_OPTIONS, defaultSettingsFor } from "@workspace/game-core";
import { OBJECT_TYPES, instanceInfo, type Instantiation } from "@workspace/game-types";
import { analyticFor, coverage, firstUseSeconds, legacyInstantiations, offeredInstantiations, playableInstantiations, synergyFor, type CalibrationManifest } from "@workspace/game-utilities";
import { VERSION as PLAYER_PROTOCOL } from "@workspace/player-client";
import { action } from "./_generated/server";
import { calibrationManifest } from "./engine/calibration";
import { priorIds } from "./engine/node";
import { bindRuntime, languageAvailable } from "./engine/runtime";
import { AI_MODEL_CATALOG, ASSISTANT_BUDGET_MAX, DEFAULT_AGENT_MODEL, mockEnabled, providerConfigured } from "./lib/aiModels";

const shape = (inst: Instantiation) => {
  const info = instanceInfo(inst);
  return { key: inst.key, args: inst.args, label: info.label, badges: info.badges, classes: inst.classes };
};
/** How a first game on `inst` goes on this deployment: the dealable draws with no shipped or analytic table. */
function prepareOf(calibration: CalibrationManifest, inst: Instantiation) {
  const toCompute = coverage(calibration, inst).missing.filter(m => !analyticFor(m.familyId, m.params, inst)).length;
  return toCompute ? { toCompute, seconds: firstUseSeconds(inst) } : null;
}

/** Per calibration manifest (file storage's, cached ≤ 1 min by engine/calibration.ts): a new upload is listed. */
const objectTypes = new WeakMap<CalibrationManifest, unknown[]>();
function objectTypesManifest(calibration: CalibrationManifest) {
  let found = objectTypes.get(calibration);
  if (!found) objectTypes.set(calibration, found = OBJECT_TYPES.map(T => ({
    id: T.id, label: T.label, emoji: T.emoji, kid: T.kid, params: T.params, defaults: T.defaults,
    classes: T.classes.map(c => ({ id: c.id, slot: c.slot, superclasses: c.superclasses, badge: c.badge })),
    // The same list the settings model is given on the server (engine/settingsDomain.ts).
    playable: playableInstantiations(T.id).map(inst => ({ ...shape(inst), prepare: prepareOf(calibration, inst), synergy: priorIds(calibration).filter(p => synergyFor(inst, p)) })),
    // Shapes on a legacy component (Grid's rgb), still valid for stored rooms but never offered: their notes only.
    legacy: legacyInstantiations(T.id).map(inst => ({ ...shape(inst), prepare: prepareOf(calibration, inst) })),
    // Diagnostics: the shapes whose every dealable table is shipped in file storage.
    offered: offeredInstantiations(calibration, T.id).map(shape),
  })));
  return found;
}

export const get = action({
  args: {},
  handler: async (ctx) => {
    await bindRuntime(ctx);
    const calibration = await calibrationManifest(ctx);
    const runtimes = [];
    for (const language of LANGUAGES) {
      if (await languageAvailable(language, defaultSettingsFor("Int", [language]))) runtimes.push(language);
    }
    return {
      protocolVersion: 1, playerProtocol: PLAYER_PROTOCOL, minimumPlayers: 3, maximumPlayers: 8, defaults: DEFAULT_SETTINGS,
      runtimes, languages: LANGUAGES.map(id => ({ id, ...LANGUAGE_SPECS[id] })), options: SETTINGS_OPTIONS, objectTypes: objectTypesManifest(calibration),
      priors: priorIds(calibration),
      aiFunding: {
        provider: "anthropic", model: DEFAULT_AGENT_MODEL, billing: "direct", mock: mockEnabled(),
        configured: mockEnabled() || providerConfigured("anthropic") || providerConfigured("openai"), live: true,
        models: AI_MODEL_CATALOG.map(m => ({ ...m, configured: mockEnabled() || providerConfigured(m.provider) })),
        /** The largest assistant allowance (tokens per human per game) an owner may approve. */
        assistantBudgetMax: ASSISTANT_BUDGET_MAX,
      },
      engine: { tickSeconds: TICK_SECONDS, minTickMs: MIN_TICK_MS },
    };
  },
});
