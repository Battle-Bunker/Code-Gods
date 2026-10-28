/**
 * The public utility-function catalog as kids read it: locked reasons, grouping by capability
 * badge, and the badges a utility card uses. Framework-free (unit tested under Node).
 *
 * Shapes are structural so both apps can pass the API's `UtilityFamily` rows directly.
 */
import { badgesFor, type Badge } from "@workspace/game-types";
import { family } from "@workspace/game-utilities";

export interface BadgeLike { id: string; emoji: string; label: string; kid: string }
export type ArgsLike = { [key: string]: number | string };

export interface CatalogEntryLike {
  id: string;
  name: string;
  emoji: string;
  theme: string;
  role: "reward" | "penalty" | string;
  available: boolean;
  /** Taken out of the lottery by the owner (settings.excludedFamilies): "not dealt in this game". */
  excluded?: boolean;
  badges: readonly BadgeLike[];
  locked?: { reason: string; unlock?: ArgsLike };
}

/**
 * "needs ♠ Suits: pick Playing cards" → "locked: needs ♠ Suits. Pick Playing cards".
 * Reasons without a pick ("needs a bigger board: size 6 or more") keep their own colon.
 */
export function lockedText(reason: string | undefined): string {
  if (!reason) return "locked";
  const i = reason.lastIndexOf(": pick ");
  const body = i >= 0 ? `${reason.slice(0, i)}. Pick ${reason.slice(i + ": pick ".length)}` : reason;
  return `locked: ${body}`;
}

export const WORKS_EVERYWHERE: BadgeLike = Object.freeze({
  id: "everywhere", emoji: "🌍", label: "Works everywhere", kid: "Needs nothing special from the board",
});
export const DEFENCE_GOALS: BadgeLike = Object.freeze({
  id: "defence", emoji: "⚠️", label: "Defence goals", kid: "Things a god may want to stop: they lose points when an object gets worse than usual",
});

export interface CatalogGroup<E extends CatalogEntryLike> {
  badge: BadgeLike;
  entries: E[];
  /** Available entries in the group. */
  available: number;
}

/** The family's most specific badge: its first (maximal class) badge, or "Works everywhere". */
export function primaryBadge(e: CatalogEntryLike): BadgeLike {
  if (e.role === "penalty") return DEFENCE_GOALS;
  return e.badges[0] ?? WORKS_EVERYWHERE;
}

/**
 * Groups the shelf by primary badge: "Works everywhere" first, then badges in order of first
 * appearance, then defence goals. Locked families (which have no badges yet) go in the group of the
 * badge their unlock would earn when it is named in the reason, otherwise in "Works everywhere".
 */
export function groupByBadge<E extends CatalogEntryLike>(entries: readonly E[], badges: readonly BadgeLike[] = []): CatalogGroup<E>[] {
  const groups = new Map<string, CatalogGroup<E>>();
  const add = (b: BadgeLike, e: E) => {
    let g = groups.get(b.id);
    if (!g) groups.set(b.id, g = { badge: b, entries: [], available: 0 });
    g.entries.push(e);
    if (e.available) g.available++;
  };
  groups.set(WORKS_EVERYWHERE.id, { badge: WORKS_EVERYWHERE, entries: [], available: 0 });
  for (const e of entries) {
    if (e.available || e.role === "penalty") { add(primaryBadge(e), e); continue; }
    const named = badges.find(b => e.locked?.reason.includes(`${b.emoji} ${b.label}`));
    add(named ?? WORKS_EVERYWHERE, e);
  }
  const out = [...groups.values()].filter(g => g.entries.length);
  const defence = out.filter(g => g.badge.id === DEFENCE_GOALS.id);
  return [...out.filter(g => g.badge.id !== DEFENCE_GOALS.id), ...defence];
}

/** Badges a family relies on ("This rule uses: ♠ Suits · 📏 Big board"); [] when it works everywhere or is unknown. */
export function familyUses(familyId: string): Badge[] {
  try { return badgesFor(family(familyId).requires); } catch { return []; }
}

/** Reward families: how many can be dealt (available and not excluded), out of how many; locked and excluded counts. */
export function shelfCounts(entries: readonly CatalogEntryLike[]): { available: number; total: number; locked: number; excluded: number } {
  const rewards = entries.filter(e => e.role !== "penalty");
  const open = rewards.filter(e => e.available);
  const excluded = open.filter(e => e.excluded).length;
  return { available: open.length - excluded, total: rewards.length, locked: rewards.length - open.length, excluded };
}

/** Marks entries excluded by a (draft) excludedFamilies list; entries keep the server's flag otherwise. */
export function withExcluded<E extends CatalogEntryLike>(entries: readonly E[], excluded: readonly string[] | undefined): E[] {
  if (!excluded) return [...entries];
  const set = new Set(excluded);
  return entries.map(e => ({ ...e, excluded: set.has(e.id) }));
}
