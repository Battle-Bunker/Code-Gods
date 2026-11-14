import { upgradeStoredSettings } from "@workspace/game-core";

/**
 * The setups-v2 conversion of one stored settings object (convex/migrations.ts), pure so it is unit-tested
 * (test/unit/migrate-setups.test.ts). Before setups-v2 a defence goal was dealt to each god with probability
 * `defenceRate`, and `excludedFamilies` held reward and defence ids alike. Now `defenceGoals` deals one to every god
 * or to none, and the excluded defence ids live in `excludedDefenceFamilies`:
 *   defenceRate > 0  → defenceGoals: true (else false);
 *   excludedFamilies → its reward ids; its defence ids (`defenceIds`) → excludedDefenceFamilies.
 * It also converts the single-language shape ({language, grammarId, complexityFunctionId}) to the allowed set
 * {languages: [language]} (game-core upgradeStoredSettings): each agent's grammar and price now follow its own language,
 * and fills fields added since (scoreIntervalSeconds, …, bidSeconds, bidPricing) with their defaults.
 * `played`: the settings of a game already started (and its summary): its economy is left as it was charged, so
 * `fullChargeSeconds` is not filled (docs/energy-model.md §6.1), and it had no bid phase, so `bidSeconds` and `bidPricing`
 * are not filled either (docs/bid-phase.md). Rooms and setups get them (no bid phase: 0, "first").
 * Returns null when the settings are already in the new shape (so the migration is idempotent).
 */
export function migrateSettings(settings: unknown, defenceIds: ReadonlySet<string>, played = false): Record<string, unknown> | null {
  const languages = upgradeStoredSettings(settings, played, { keepRetired: true });
  const defence = migrateDefence(languages ?? settings, defenceIds);
  return defence ?? languages;
}

function migrateDefence(settings: unknown, defenceIds: ReadonlySet<string>): Record<string, unknown> | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const s = settings as Record<string, unknown>;
  if (!("defenceRate" in s) && "defenceGoals" in s && "excludedDefenceFamilies" in s) return null;
  const { defenceRate, ...rest } = s;
  const excluded = Array.isArray(s.excludedFamilies) ? (s.excludedFamilies as unknown[]).filter((id): id is string => typeof id === "string") : [];
  const keptDefence = Array.isArray(s.excludedDefenceFamilies) ? (s.excludedDefenceFamilies as string[]) : [];
  return {
    ...rest,
    defenceGoals: typeof s.defenceGoals === "boolean" ? s.defenceGoals : typeof defenceRate === "number" && defenceRate > 0,
    excludedFamilies: excluded.filter(id => !defenceIds.has(id)),
    excludedDefenceFamilies: [...new Set([...keptDefence, ...excluded.filter(id => defenceIds.has(id))])],
  };
}
