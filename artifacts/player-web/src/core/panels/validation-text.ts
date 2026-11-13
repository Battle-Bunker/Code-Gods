/**
 * The forge's words about an agent's price (pure, unit-tested): why a summon costs what it costs, the price's parts in
 * ⚡ with plain labels (read from the engine's own diagnostic line, convex/engine/pricing.ts), and what to say when the
 * player's own store can no longer hold the price at all.
 */
const amount = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });

/** Beside the Summon button, once there is a price. */
export const PRICE_GROWS = "The price grows with the amount of code (not with what it does): shorter is cheaper.";

const PARTS: readonly [RegExp, string][] = [
  [/structure (\d+(?:\.\d+)?)/, "the shape of the code"],
  [/names (\d+(?:\.\d+)?)/, "the names it uses"],
  [/literals (\d+(?:\.\d+)?)/, "the numbers and text written in it"],
  [/literal moves (\d+(?:\.\d+)?)/, "moves written out in full"],
  [/commit clause (\d+(?:\.\d+)?)/, "its commit clause"],
];
/**
 * "Of the price: the shape of the code 295.2 ⚡, the names it uses 238.3 ⚡, the numbers and text written in it 29.6 ⚡."
 * from the engine's "Summon price … (ast-bits-v1: structure 295.2, names 238.3, literals 29.6, literal moves 0.0)."
 * Parts that are 0 are left out; null when the line is not there or names no part.
 */
export function priceParts(diagnostics: readonly string[]): string | null {
  const line = diagnostics.find(d => d.startsWith("Summon price "));
  if (!line) return null;
  const parts = PARTS.flatMap(([pattern, label]) => {
    const value = Number(pattern.exec(line)?.[1]);
    return Number.isFinite(value) && value > 0 ? [`${label} ${amount(value)} ⚡`] : [];
  });
  return parts.length ? `Of the price: ${parts.join(", ")}.` : null;
}
/** The diagnostics for "Details": the price line gives way to its plain parts (said above them); the rest as the engine wrote it. */
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
