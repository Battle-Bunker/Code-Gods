/**
 * Where a room's next-game settings came from (docs/ui-redesign.md §2.4): a game setup (convex/setups.ts), or a
 * custom configuration. `modified` says whether the settings still equal that setup's, so the UI can name the setup
 * ("Classic") or say "Custom". Pure; unit-tested in test/unit/settings-origin.test.ts.
 *
 * `kind: "preset"` is legacy: rooms and games stored before setups replaced presets keep it; readers treat it as
 * custom (the UI names a setup by comparing settings, so an unchanged legacy preset still shows its setup's name).
 */
import { sameSettings, type GameSettings } from "@workspace/game-core";

export type SettingsOrigin = { kind: "setup" | "custom" | "preset"; id?: string; modified: boolean };

/**
 * The origin after an owner.settings call: a `setupId` makes an unmodified setup origin; explicit settings keep the
 * previous setup origin's id and set `modified` to whether they differ from that setup's current settings
 * (`previousSetup`, null when the room was not on a setup or the setup is gone, which makes the settings custom).
 */
export function nextSettingsOrigin(previous: SettingsOrigin | undefined, input: { setupId?: string }, result: GameSettings,
  previousSetup: GameSettings | null): SettingsOrigin {
  if (input.setupId) return setupOrigin(input.setupId);
  if (previous?.kind !== "setup" || !previous.id || !previousSetup) return { kind: "custom", modified: false };
  return { kind: "setup", id: previous.id, modified: !sameSettings(previousSetup, result) };
}

/** A room put on a setup (a new room's First steps, or a setup the owner picked). */
export const setupOrigin = (id: string): SettingsOrigin => ({ kind: "setup", id, modified: false });
