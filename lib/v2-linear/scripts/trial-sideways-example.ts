// Lift + sideways (scoring-trial.md, last section): the table, rarity at height, sparsity, bigger-is-better, area.
import { q } from "@workspace/v2-core";
import { biggerRule, doublings, fromMC, mcOf, rarityBits, rarityRules, sidewaysFormula, sidewaysSampled, targetRule, targetsPowersOf2, targetsPrimesEnding, targetsSmooth, targetsSquares } from "../src/index.ts";
const N = Number(process.argv[2] ?? 150);
const A = targetRule("A gradient prime ending 1", "m", targetsPrimesEnding("1"));
const B = targetRule("B intercept from 3s and 17s", "c", targetsSmooth([3, 17]));
const C = targetRule("C area a perfect square", "area", targetsSquares);
const rar = rarityRules("1", [3, 17]);
const L = (m: number, c: number) => fromMC(q(m), q(c));
const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "-");
console.log(`1. Table (N = ${N} starts each; energy = H + sideways; H in energy, g = 100 a doubling)`);
for (const [name, m, c] of [["on targets", 101, 867], ["one unit off", 102, 866], ["halfway", 116, 1122], ["doubled, off targets", 202, 1734], ["ten times, on targets", 1021, 7803]] as const) {
  const l = L(m, c), parts = [A, B, C].map((r, i) => {
    const s = sidewaysSampled(r, l, N), a = sidewaysFormula(r, l), tree = rarityBits(rar[i]!, mcOf(l)!).bits;
    return `${r.label[0]}: sideways ${f(s.sideways)} (formula ${f(a)}), in class ${(100 * s.inClass).toFixed(0)}% = ${f(-Math.log2(Math.max(s.inClass, 1 / N)))} bits at height; tree rarity ${tree.toFixed(1)}; energy ${f(s.energy)}`;
  });
  console.log(`  ${name}: y = ${m}x + ${c}, H = ${f(doublings(l) * 100)}\n    ${parts.join("\n    ")}`);
}
console.log("3. Sparsity: on a target of |m| (line y = Tx + 17), sideways by target set");
for (const [label, T, set] of [["suffix 1", 101, targetsPrimesEnding("1")], ["suffix 1", 1021, targetsPrimesEnding("1")], ["suffix 101", 101, targetsPrimesEnding("101")], ["suffix 101", 5101, targetsPrimesEnding("101")], ["suffix 101", 12101, targetsPrimesEnding("101")], ["suffix 1", 12101, targetsPrimesEnding("1")], ["powers of 2", 128, targetsPowersOf2], ["powers of 2", 1024, targetsPowersOf2]] as const) {
  const r = targetRule(label, "m", set), l = L(T, 17), s = sidewaysSampled(r, l, N);
  console.log(`  ${label} at ${T}: sideways ${f(s.sideways)} (formula ${f(sidewaysFormula(r, l))}), in class ${(100 * s.inClass).toFixed(0)}%`);
}
console.log("4. Bigger is better (|c|): sideways");
for (const c of [100, 1000, 10000]) { const l = L(5, c), s = sidewaysSampled(biggerRule("c"), l, N); console.log(`  c = ${c}: sideways ${f(s.sideways)} (formula ${f(sidewaysFormula(biggerRule("c"), l))}), in class ${(100 * s.inClass).toFixed(0)}%, energy ${f(s.energy)} vs H ${f(s.height)}`); }
