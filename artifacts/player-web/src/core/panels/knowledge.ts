/**
 * Paid observation, as the panels word it (pure; tested in test/knowledge.test.ts). In a game whose looking costs energy
 * a seated god sees each object as it was when they were last told it (`knownAt`, world seconds: at its birth, when one
 * of their agents changed it or read all of it, or after a paid look), and how often it has changed since
 * (`changesSince`, public). A row is STALE only when it has changed since: an old row nobody touched is still exact.
 * Free games carry neither field, and nothing here applies to them.
 */

/** A span of world seconds, compact: "now", "42s", "3m 10s", "1h 2m". */
export function ageText(seconds: number): string {
  const s = Math.floor(Math.max(0, seconds));
  if (s < 1) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s / 60}m`;
  const m = Math.floor((s % 3600) / 60);
  return m ? `${Math.floor(s / 3600)}h ${m}m` : `${Math.floor(s / 3600)}h`;
}

/** "seen 42s ago" / "seen just now". */
export const seenText = (age: number): string => (ageText(age) === "now" ? "seen just now" : `seen ${ageText(age)} ago`);

export type Staleness = {
  /** The object has changed since the god was last told it: what is shown may no longer be so. */
  stale: boolean;
  /** World seconds since the god was last told it. */
  age: number;
  /** Changes since then; undefined where the row does not carry the count (ranked pages, the board). */
  changes: number | undefined;
  seen: string;
  /** "changed 3× since" / "unchanged since"; null without the count. */
  note: string | null;
};

/** What a row knows about its own age at world time `world`; null in a free game (no `knownAt`). */
export function staleness(o: { knownAt?: number; changesSince?: number }, world: number): Staleness | null {
  if (o.knownAt === undefined) return null;
  const age = Math.max(0, world - o.knownAt), changes = o.changesSince;
  return {
    stale: (changes ?? 0) > 0, age, changes, seen: seenText(age),
    note: changes === undefined ? null : changes === 0 ? "unchanged since" : changes === 1 ? "changed once since" : `changed ${changes}× since`,
  };
}

/** The small hint other panels put beside an object they show as last seen ("seen 42s ago"); null in a free game. */
export const seenHint = (o: { knownAt?: number }, world: number): string | null => staleness(o, world)?.seen ?? null;

const price1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
/** A balance as the engine's refusal writes it: two decimals, a debt as nothing to spend. */
const exact = (v: number) => Math.max(0, v).toFixed(2);

export type LookOffer = { total: number; label: string; ok: boolean; reason: string | null };

/**
 * One look (no `count`) or a look at all `count` objects: the price (economy.lookPrice each), the button's label with
 * the price on it, and whether the god's own energy pays for it; if not, the reason, with the price and the balance as
 * the engine's refusal states them (game/commands.ts "look").
 */
export function lookOffer({ price, energy, count }: { price: number; energy: number; count?: number }): LookOffer {
  const all = count !== undefined;
  const total = Math.round(price * (count ?? 1) * 100) / 100;
  const label = all ? `Look at all ${count} · ${price1(total)}` : `Look · ${price1(total)}`;
  if (all && count <= 0) return { total, label, ok: false, reason: "There are no objects to look at yet" };
  if (energy >= total) return { total, label, ok: true, reason: null };
  return { total, label, ok: false, reason: `${all ? `A look at all ${count} objects` : "A look"} costs ${total.toFixed(2)} energy; you have ${exact(energy)}` };
}
