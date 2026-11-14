/**
 * pnpm --filter @workspace/v2-valuation law -- [--variant line-z] [--samples n]
 *
 * Where the walk's stationary law puts its mass (owner decision 17 report): the height of a line (its largest number
 * in absolute value, numerators and denominators included) below which 50%, 90% and 99% of the free walk's samples
 * lie, and the share of samples whose numbers are prime against composite of the same size.
 */
import { rng, walkStep } from "@workspace/v2-core";
import { findVariant } from "./registry.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
const { type, variant } = findVariant(opt("variant") ?? "line-z");
const samples = Number(opt("samples") ?? 200_000);
const thin = 20;

const r = rng("law", variant.id);
let s = type.origin(variant);
for (let t = 0; t < 20_000; t++) s = walkStep(type, variant, s, r);
const heights: bigint[] = [];
const nums = new Map<string, number>();
for (let k = 0; k < samples; k++) {
  for (let t = 0; t < thin; t++) s = walkStep(type, variant, s, r);
  const st = s as unknown as { lines: { a: bigint; b: bigint; c: bigint }[] };
  let h = 0n;
  for (const l of st.lines) for (const x of [l.a, l.b, l.c]) { const v = x < 0n ? -x : x; if (v > h) h = v; }
  heights.push(h);
  for (const l of st.lines) for (const x of [l.a, l.c]) { const v = x < 0n ? -x : x; nums.set(String(v), (nums.get(String(v)) ?? 0) + 1); }
}
heights.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const q = (f: number) => heights[Math.min(heights.length - 1, Math.floor(f * heights.length))]!;
console.log(`${variant.id}: ${samples} samples, every ${thin} steps`);
console.log(`height (largest |number| in the line's triple) holding 50% / 90% / 99% of the mass: ${q(0.5)} / ${q(0.9)} / ${q(0.99)}`);
const top = [...nums.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([n, c]) => `${n}:${(100 * c / (2 * samples)).toFixed(1)}%`);
console.log(`commonest |a| and |c| values: ${top.join(" ")}`);
for (const [p, c] of [[23, 24], [47, 48], [97, 96]]) {
  const fp = nums.get(String(p)) ?? 0, fc = nums.get(String(c)) ?? 0;
  console.log(`  ${p} (prime) appears ${fp} times, ${c} (composite) ${fc} times`);
}
