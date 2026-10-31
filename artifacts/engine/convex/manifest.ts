"use node";
import { MIN_TICK_MS, TICK_SECONDS } from "./lib/world";
/**
 * The settings manifest for pickers (ported from api-server routes/rooms.ts GET /manifest): object types
 * with parameters, classes, tuned defaults and the OFFERED instantiations (every dealable utility function
 * calibrated), presets, the pre-authored dropdown options, available runtimes and AI funding status.
 */
import { DEFAULT_SETTINGS, SETTINGS_OPTIONS, SETTINGS_PRESETS, defaultSettingsFor, presetSettings, typeDefaults, type GameSettings } from "@workspace/game-core";
import { OBJECT_TYPES, instanceInfo } from "@workspace/game-types";
import { offeredInstantiations } from "@workspace/game-utilities";
import { VERSION as PLAYER_PROTOCOL } from "@workspace/player-client";
import { action } from "./_generated/server";
import { assertOffered, PRIORS } from "./engine/node";
import { bindRuntime, languageAvailable } from "./engine/runtime";
import { AI_MODEL_CATALOG, ASSISTANT_BUDGET_MAX, DEFAULT_AGENT_MODEL, mockEnabled, providerConfigured } from "./lib/aiModels";

let objectTypes: unknown[] | undefined;
function objectTypesManifest() {
  return objectTypes ??= OBJECT_TYPES.map(T => ({
    id: T.id, label: T.label, emoji: T.emoji, kid: T.kid, params: T.params, defaults: T.defaults,
    settingsDefaults: typeDefaults(T.id),
    classes: T.classes.map(c => ({ id: c.id, slot: c.slot, superclasses: c.superclasses, badge: c.badge })),
    offered: offeredInstantiations(T.id, { excludedFamilies: inst => typeDefaults(T.id, inst.args).excludedFamilies ?? [] }).map(inst => {
      const info = instanceInfo(inst);
      return { key: inst.key, args: inst.args, label: info.label, badges: info.badges, classes: inst.classes, settingsDefaults: typeDefaults(T.id, inst.args) };
    }),
  }));
}
const offered = (settings: GameSettings) => { try { assertOffered(settings); return true; } catch { return false; } };

export const get = action({
  args: {},
  handler: async (ctx) => {
    await bindRuntime(ctx);
    const runtimes = [];
    for (const language of ["python", "typescript"] as const) {
      if (await languageAvailable(defaultSettingsFor("Int", language))) runtimes.push(language);
    }
    return {
      protocolVersion: 1, playerProtocol: PLAYER_PROTOCOL, minimumPlayers: 3, maximumPlayers: 8, defaults: DEFAULT_SETTINGS,
      runtimes, options: SETTINGS_OPTIONS, objectTypes: objectTypesManifest(),
      presets: SETTINGS_PRESETS.map(p => {
        const settings = presetSettings(p.id);
        return { id: p.id, label: p.label, kid: p.kid, objectType: p.objectType, typeArgs: p.typeArgs, settings, offered: offered(settings) };
      }),
      priors: Object.keys(PRIORS),
      aiFunding: {
        provider: "anthropic", model: DEFAULT_AGENT_MODEL, billing: "direct", mock: mockEnabled(),
        configured: mockEnabled() || providerConfigured("anthropic") || providerConfigured("openai"), live: true,
        models: AI_MODEL_CATALOG.map(m => ({ ...m, configured: mockEnabled() || providerConfigured(m.provider) })),
        /** The largest assistant allowance (tokens per player per game) an owner may approve. */
        assistantBudgetMax: ASSISTANT_BUDGET_MAX,
      },
      engine: { tickSeconds: TICK_SECONDS, minTickMs: MIN_TICK_MS },
    };
  },
});
