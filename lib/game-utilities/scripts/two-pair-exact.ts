/**
 * ✌️ Two Pair's link tiers, exactly (archive/engine-v1:docs/layered-rules-measurements/two-pair.md). At the base's top every box holds two
 * different pairs, and a link depends only on which two numbers each box holds, so the tier's law on the top boards is
 * a count over 45⁴ choices of four number pairs (each with 6 arrangements, which cancel). The count itself is
 * `twoPairTopCounts` in scripts/tiered-profile.ts, which is also what `--check` compares the shipped tables against;
 * this script only prints it.
 *
 *   node --experimental-strip-types scripts/two-pair-exact.ts
 */
import { twoPairTopCounts } from "./tiered-profile.ts";

const { boards, links, via, sums } = twoPairTopCounts();
const bits = (c: number) => (-Math.log2(c / boards)).toFixed(2);
const top = (h: readonly number[]) => { let m = 4; while (m > 0 && h[m] === 0) m--; return m; };
console.log(`| tier | tierTop | choices of four number pairs at the top (of ${boards.toLocaleString("en")}) | added bits (exact) |\n|---|--:|--:|--:|`);
console.log(`| links | ${top(links)} | ${links[top(links)]} | ${bits(links[top(links)])} |`);
console.log(`| linksVia (any y) | ${top(via)} | ${via[top(via)]} | ${bits(via[top(via)])} |`);
for (let x = 0; x <= 36; x++) {
  const h = sums.get(x)!, m = top(h);
  console.log(`| linkSums x = ${x} (and ${72 - x}) | ${m} | ${m ? h[m] : 0} | ${m ? bits(h[m]) : "dead"} |`);
}
