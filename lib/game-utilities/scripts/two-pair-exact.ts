/**
 * ✌️ Two Pair's link tiers, exactly (docs/layered-rules-measurements/two-pair.md). At the base's top every box holds two
 * different pairs, and a link depends only on which two numbers each box holds, so the tier's law on the top boards is
 * a count over 45⁴ choices of four number pairs (each with 6 arrangements, which cancel).
 *
 *   node --experimental-strip-types scripts/two-pair-exact.ts
 */
const sets: [number, number][] = [];
for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) sets.push([a, b]);
const n = sets.length;
// shared[i][j]: the one shared number of sets i and j, or −1 (none or both).
const shared = sets.map(s => sets.map(t => { const c = s.filter(x => t.includes(x)); return c.length === 1 ? c[0] : -1; }));
const total = sets.map(([a, b]) => 2 * (a + b));
// Boxes in ring order: top-left, top-right, bottom-right, bottom-left.
const links = new Array<number>(5).fill(0), via = new Array<number>(5).fill(0), sums = new Map<number, number[]>();
for (let x = 0; x <= 72; x++) sums.set(x, new Array<number>(5).fill(0));
for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) for (let l = 0; l < n; l++) {
  const ring: [number, number][] = [[i, j], [j, k], [k, l], [l, i]];
  let all = 0, v = 0;
  const hit = new Map<number, number>();
  for (const [p, q] of ring) {
    if (shared[p][q] < 0) continue;
    all++;
    if (shared[p][q] === 0) v++;
    const t = total[p] + total[q];
    hit.set(t, (hit.get(t) ?? 0) + 1);
  }
  links[all]++; via[v]++;
  for (const [t, c] of hit) sums.get(t)![c]++;
}
const boards = n ** 4, bits = (c: number) => (-Math.log2(c / boards)).toFixed(2);
const top = (h: number[]) => { let m = 4; while (m > 0 && h[m] === 0) m--; return m; };
console.log("| tier | tierTop | choices of four number pairs at the top (of 45⁴) | added bits (exact) |\n|---|--:|--:|--:|");
console.log(`| links | ${top(links)} | ${links[top(links)]} | ${bits(links[top(links)])} |`);
console.log(`| linksVia (any y) | ${top(via)} | ${via[top(via)]} | ${bits(via[top(via)])} |`);
for (let x = 0; x <= 36; x++) {
  const h = sums.get(x)!, m = top(h);
  console.log(`| linkSums x = ${x} (and ${72 - x}) | ${m} | ${m ? h[m] : 0} | ${m ? bits(h[m]) : "dead"} |`);
}
