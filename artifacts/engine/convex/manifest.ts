"use node";
import { MIN_TICK_MS, TICK_SECONDS } from "./lib/world";
/**
 * The settings manifest for pickers: object types with parameters, classes and the OFFERED instantiations (every
 * dealable utility function calibrated, whatever families a room excludes), the pre-authored dropdown options,
 * available runtimes and AI funding status. Game setups are a table of their own (convex/setups.ts).
 */
import { DEFAULT_SETTINGS, SETTINGS_OPTIONS, defaultSettingsFor } from "@workspace/game-core";
import { OBJECT_TYPES, instanceInfo } from "@workspace/game-types";
import { offeredInstantiations, type CalibrationManifest } from "@workspace/game-utilities";
import { VERSION as PLAYER_PROTOCOL } from "@workspace/player-client";
import { action } from "./_generated/server";
import { calibrationManifest } from "./engine/calibration";
import { priorIds } from "./engine/node";
import { bindRuntime, languageAvailable } from "./engine/runtime";
import { AI_MODEL_CATALOG, ASSISTANT_BUDGET_MAX, DEFAULT_AGENT_MODEL, mockEnabled, providerConfigured } from "./lib/aiModels";

/** Per calibration manifest (file storage's, cached ≤ 1 min by engine/calibration.ts): a new upload is listed. */
const objectTypes = new WeakMap<CalibrationManifest, unknown[]>();
function objectTypesManifest(calibration: CalibrationManifest) {
  let found = objectTypes.get(calibration);
  if (!found) objectTypes.set(calibration, found = OBJECT_TYPES.map(T => ({
    id: T.id, label: T.label, emoji: T.emoji, kid: T.kid, params: T.params, defaults: T.defaults,
    classes: T.classes.map(c => ({ id: c.id, slot: c.slot, superclasses: c.superclasses, badge: c.badge })),
    // The same list the settings model is given on the server (engine/settingsDomain.ts, from the same manifest).
    offered: offeredInstantiations(calibration, T.id).map(inst => {
      const info = instanceInfo(inst);
      return { key: inst.key, args: inst.args, label: info.label, badges: info.badges, classes: inst.classes };
    }),
  })));
  return found;
}

export const get = action({
  args: {},
  handler: async (ctx) => {
    await bindRuntime(ctx);
    const calibration = await calibrationManifest(ctx);
    const runtimes = [];
    for (const language of ["python", "typescript"] as const) {
      if (await languageAvailable(defaultSettingsFor("Int", language))) runtimes.push(language);
    }
    return {
      protocolVersion: 1, playerProtocol: PLAYER_PROTOCOL, minimumPlayers: 3, maximumPlayers: 8, defaults: DEFAULT_SETTINGS,
      runtimes, options: SETTINGS_OPTIONS, objectTypes: objectTypesManifest(calibration),
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
