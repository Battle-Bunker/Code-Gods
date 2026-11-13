/**
 * The forge's words about an agent's price (pure, unit-tested): why a summon costs what it costs, the price's parts in
 * ⚡ with plain labels (from the receipt's own `parts`), and what to say when the
 * player's own store can no longer hold the price at all.
 */
const amount = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });

/** Beside the Summon button, once there is a price. */
export const PRICE_GROWS = "The price grows with the amount of code (not with what it does): shorter is cheaper.";

/** The parts of a summon price as the receipt carries them (convex/engine/pricing.ts SummonParts; the structure already weighted for the language). */
export type PriceParts = { structure?: number; names?: number; literals?: number; moveFlags?: number; literalMoves?: number; commitClause?: number };
const LABELS: readonly [keyof PriceParts, string][] = [
  ["structure", "the shape of the code"], ["names", "the names it uses"], ["literals", "the numbers and text written in it"],
  ["moveFlags", "the kinds of move it can make"], ["literalMoves", "moves written out in full"], ["commitClause", "its commit clause"],
];
/**
 * "Of the price (565 ⚡): the shape of the code 295.2 ⚡, the names it uses 238.3 ⚡, …" from the receipt's own `parts`
 * (never from the engine's prose line, whose figures are unweighted and leave parts out), so the figures shown add up
 * to the price shown in every language: each part to one decimal, the rounding left over put on the largest part, and
 * whatever the named parts do not cover said as "the rest". Parts that show as 0 are left out; null without parts.
 */
export function priceParts(parts: PriceParts | null | undefined, cost: number): string | null {
  if (!parts || !Number.isFinite(cost)) return null;
  const tenths = (x: number) => Math.round(x * 10);
  const rows = LABELS.flatMap(([key, label]) => { const v = parts[key]; return typeof v === "number" && Number.isFinite(v) && v > 0 ? [{ label, tenths: tenths(v), exact: v }] : []; });
  if (!rows.length) return null;
  const rest = cost - rows.reduce((sum, r) => sum + r.exact, 0);
  if (Math.abs(rest) >= 0.05) rows.push({ label: "the rest", tenths: tenths(rest), exact: rest });
  // The rounding left over (a tenth or two) goes on the largest part, so the line adds up to the price as shown.
  const off = tenths(cost) - rows.reduce((sum, r) => sum + r.tenths, 0);
  if (off !== 0) rows.reduce((big, r) => (r.tenths > big.tenths ? r : big)).tenths += off;
  const shown = rows.filter(r => r.tenths !== 0).map(r => `${r.label} ${amount(r.tenths / 10)} ⚡`);
  return shown.length ? `Of the price (${amount(cost)} ⚡): ${shown.join(", ")}.` : null;
}
/** The diagnostics for "Details": the engine's price line gives way to the plain parts (said above them); the rest as the engine wrote it. */
export const otherDiagnostics = (diagnostics: readonly string[]): string[] => diagnostics.filter(d => !d.startsWith("Summon price "));

/**
 * The player's own store can never hold this price (its capacity fell when power went to agents), so waiting will not
 * help and nothing is armed: say what to do. Null when the store can hold it, or the game has no capacity.
 */
export function storeTooSmall(s: { cost: number; capacity: number | undefined }): string | null {
  if (s.capacity === undefined || !Number.isFinite(s.capacity) || s.cost <= s.capacity) return null;
  return s.capacity > 0
    ? `Your own store now holds at most ${amount(Math.floor(s.capacity))} ⚡, less than this agent's price (${amount(Math.ceil(s.cost))}). Take some power back in My agents to summon again.`
    : `All your power is with your agents, so your own store holds nothing and cannot pay this agent's price (${amount(Math.ceil(s.cost))}). Take some power back in My agents to summon again.`;
}
