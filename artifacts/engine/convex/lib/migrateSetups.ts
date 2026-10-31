/**
 * The setups-v2 conversion of one stored settings object (convex/migrations.ts), pure so it is unit-tested
 * (test/unit/migrate-setups.test.ts). Before setups-v2 a defence goal was dealt to each god with probability
 * `defenceRate`, and `excludedFamilies` held reward and defence ids alike. Now `defenceGoals` deals one to every god
 * or to none, and the excluded defence ids live in `excludedDefenceFamilies`:
 *   defenceRate > 0  → defenceGoals: true (else false);
 *   excludedFamilies → its reward ids; its defence ids (`defenceIds`) → excludedDefenceFamilies.
 * Returns null when the settings are already in the new shape (so the migration is idempotent).
 */
export function migrateSettings(settings: unknown, defenceIds: ReadonlySet<string>): Record<string, unknown> | null {
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
