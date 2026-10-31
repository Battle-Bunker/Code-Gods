/**
 * Where a room's next-game settings came from (docs/ui-redesign.md §2.4, research/onboarding §3.4): a preset, or a
 * custom configuration. `modified` says whether the settings still equal what that origin produces, so the UI can
 * name the preset ("Classic") or say "Current (custom)". Pure; unit-tested in test/unit/settings-origin.test.ts.
 */
import { presetSettings, type GameSettings } from "@workspace/game-core";

export type SettingsOrigin = { kind: "preset" | "custom"; id?: string; modified: boolean };

/** JSON with sorted keys, so two equal settings compare equal whatever their key order. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** What a preset produces for a language, or null for an unknown preset id. */
function presetOutput(id: string | undefined, language: GameSettings["language"]): GameSettings | null {
  if (!id) return null;
  try { return presetSettings(id, language); } catch { return null; }
}

/**
 * The origin after an owner.settings call: a `preset` argument makes an unmodified preset origin; explicit settings
 * keep the previous origin and set `modified` to whether they differ from what it produces; with no usable previous
 * origin the settings are custom.
 */
export function nextSettingsOrigin(previous: SettingsOrigin | undefined, input: { preset?: string; settings?: Record<string, unknown> }, result: GameSettings): SettingsOrigin {
  if (input.preset) return { kind: "preset", id: input.preset, modified: false };
  const base = previous?.kind === "preset" ? presetOutput(previous.id, result.language) : null;
  if (!base) return { kind: "custom", modified: false };
  return { kind: "preset", id: previous!.id, modified: stableJson(base) !== stableJson(result) };
}

/** A new room's origin: the preset it starts on. */
export const presetOrigin = (id: string): SettingsOrigin => ({ kind: "preset", id, modified: false });
