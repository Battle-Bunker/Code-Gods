/**
 * Kid wording for "How this scores" (game-utilities explain/workings.ts): one idea per line, the real numbers shown.
 * Pure text, so it is unit tested under Node; HowThisScores.tsx only lays it out.
 */
import { impactText, tierName, tupleText, type ScoreWorkings } from "@workspace/game-utilities";
import { formatCount, oneInN } from "../rarity.ts";

/** 0.172 → "0.172"; 0.0004213 → "0.000421"; 1 → "1": three significant digits, no exponent. */
export function formatProbability(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (p >= 0.9995) return "1";
  const decimals = Math.min(15, 2 - Math.floor(Math.log10(p)));
  return p.toFixed(decimals).replace(/0+$/, "");
}
/** 0.172 → "17.2%"; 0.0004 → "0.04%". */
export function formatPercent(p: number): string {
  const pct = p * 100;
  const s = pct >= 1 ? pct.toFixed(1) : pct >= 0.01 ? pct.toFixed(2) : pct.toFixed(Math.min(12, 1 - Math.floor(Math.log10(pct))));
  return `${s.replace(/\.0+$/, "")}%`;
}
/** Bits to two decimals, no "-0". */
export const bits2 = (x: number) => (Math.round(x * 100) / 100 === 0 ? 0 : Math.round(x * 100) / 100).toFixed(2);

export interface WorkingsText {
  /** Step 1. */
  rawTitle: string;
  rawLines: { text: string; points: string }[];
  rawTotal: string;
  /** Step 2. */
  rarityTitle: string;
  rarityLines: string[];
  /** Step 3. */
  bitsTitle: string;
  bitsLines: string[];
  /** Step 4, when there is anything past the bits (a defence goal) and the final line. */
  defenceLines: string[];
  netLines: string[];
}


export function workingsText(w: ScoreWorkings, noun = "board"): WorkingsText {
  const [one, many] = w.breakdown.unit, first = w.breakdown.total[0];
  const unit = first === 1 ? one : many;
  const multi = w.components.length > 1, tuple = tupleText(w.breakdown.total);
  // The raw score is the points tuple; a rule with several tiers says what each counts.
  const rawTotal = multi
    ? `Total: ${tuple}: ${w.components.map((name, k) => `${tierName(k)} points ${String(w.breakdown.total[k]).replace("-", "−")} (${name})`).join(", ")}`
    : `Total: ${tuple}, ${first} ${unit}`;
  const r = w.rarity, p = formatProbability(r.probability);
  const atLeast = multi ? `a points tuple at least ${tuple} (primary points first, then secondary…)` : `at least ${first} ${unit}`;
  const rarityLines = [
    `Out of all possible ${noun}s, dealt at random, ${formatPercent(r.probability)} have ${atLeast}.`,
    `As a chance: P = ${p}.`,
  ];
  if (r.spot === "between") rarityLines.push("This score sits between two steps of the rarity table, so its bits sit between the steps' bits.");
  if (r.spot === "below") rarityLines.push("This score is below the table's lowest step, so P is close to 1.");
  if (r.spot === "above") rarityLines.push("This score is above the table's highest step, so the rarity keeps growing past it.");
  const one1 = r.bits <= 0 ? "an everyday " + noun : `1 in ${formatCount(oneInN(r.bits))}`;
  const bitsLines = [
    `bits = −log₂(P) = −log₂(${p}) = ${bits2(r.bits)} bits`,
    `That is ${one1}: every bit makes it twice as rare.`,
  ];
  const defenceLines: string[] = [], netLines: string[] = [];
  const d = w.defence;
  if (d) {
    const sMinus = d.badnessBits, pBad = 2 ** -sMinus;
    defenceLines.push(
      `Your defence goal looks at how bad the ${noun} is. Badness ${d.ordinal.join(", ")} is as bad as or worse than ${formatPercent(pBad)} of random ${noun}s.`,
      `badness bits s⁻ = −log₂(${formatProbability(pBad)}) = ${bits2(sMinus)}`,
      `The penalty only grows once a ${noun} is worse than half of all ${noun}s: h = log₂(1 + 2^(s⁻ − 1)) − log₂(1.5) = ${bits2(d.penaltyBits)} ⚠️`,
      `Random ${noun}s average h = ${bits2(d.meanBits)} ⚠️, so you are only charged for being worse than average.`,
    );
    if (w.netBits !== undefined) {
      netLines.push(`net bits = ✨ ${bits2(r.bits)} − ${d.weight} × (${bits2(d.penaltyBits)} − ${bits2(d.meanBits)}) = ${bits2(w.netBits)}`);
    }
  } else if (w.netBits !== undefined) {
    netLines.push(`You have no defence goal, so net bits = ✨ ${bits2(r.bits)}.`);
  }
  if (w.netBits !== undefined) netLines.push("Your points for a " + noun + " = your net bits × what the other gods add up to care about it (never less than 0).");
  return {
    rawTitle: "1. What this board scores",
    rawLines: w.breakdown.items.length ? w.breakdown.items.map(it => ({ text: it.text, points: impactText(it.points) })) : [{ text: `Nothing on this ${noun} scores`, points: impactText(w.breakdown.total.map(() => 0)) }],
    rawTotal,
    rarityTitle: "2. How rare is that?",
    rarityLines,
    bitsTitle: "3. From rarity to bits",
    bitsLines,
    defenceLines,
    netLines,
  };
}
