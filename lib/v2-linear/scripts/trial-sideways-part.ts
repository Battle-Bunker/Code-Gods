// Per-part sideways (scoring-trial.md, last section): table, rank against the tree's closeness, sparsity, bigger-is-better.
import { q } from "@workspace/v2-core";
import { biggerRule, fromMC, mcOf, partRule, rarityBits, rarityRules, sidewaysPerPart, targetsPowersOf2, targetsPrimesEnding, targetsSmooth, targetsSquares, UNIT_FEE } from "../src/index.ts";
const N = Number(process.argv[2] ?? 200), L = (m: number, c: number) => fromMC(q(m), q(c)), f = (x: number) => x.toFixed(1);
const rules = [partRule("A", "m", targetsPrimesEnding("1")), partRule("B", "c", targetsSmooth([3, 17])), partRule("C", "area", targetsSquares)];
const rar = rarityRules("1", [3, 17]).map(r => ({ ...r, third: undefined }));  // B without its third part, like the sideways class
console.log(`unit fee ${f(UNIT_FEE())}; N = ${N}`);
for (const [name, m, c] of [["on targets", 101, 867], ["one unit off", 102, 866], ["halfway", 116, 1122], ["doubled, off targets", 202, 1734], ["ten times, on targets", 1021, 7803]] as const) {
  const l = L(m, c);
  console.log(`${name}: ` + rules.map((r, i) => { const s = sidewaysPerPart(r, l, N), t = rarityBits(rar[i]!, mcOf(l)!); return `${r.label} lift ${f(s.lift)} + sideways ${f(s.sideways)} (${f(s.units)} units, ${(100 * s.inClass).toFixed(0)}% in) ; tree close ${t.close.toFixed(2)}`; }).join(" | "));
}
// rank agreement: sideways against the tree's closeness bits, over offsets from a target
const spearman = (a: number[], b: number[]) => { const rk = (v: number[]) => { const o = v.map((x, i) => [x, i] as const).sort((p, q2) => p[0] - q2[0]); const r = new Array(v.length); o.forEach(([, i], k) => (r[i] = k)); return r; }; const ra = rk(a), rb = rk(b), n = a.length; return 1 - (6 * ra.reduce((t, x, i) => t + (x - rb[i]) ** 2, 0)) / (n * (n * n - 1)); };
for (const [i, base, vary] of [[0, 101, "m"], [1, 867, "c"]] as const) {
  const xs = [0, 1, 2, 4, 8, 15, 30, 60, 100, 150, 200].map(d => base + d), sw: number[] = [], cl: number[] = [];
  for (const v of xs) { const l = vary === "m" ? L(v, 867) : L(101, v); sw.push(sidewaysPerPart(rules[i]!, l, N).sideways); cl.push(rarityBits(rar[i]!, mcOf(l)!).close); }
  console.log(`${rules[i]!.label} offsets ${xs.map(x => x - base).join(",")}: sideways ${sw.map(f).join(" ")}; close bits ${cl.map(x => x.toFixed(2)).join(" ")}; Spearman(sideways, close) ${spearman(sw, cl).toFixed(2)}`);
}
console.log("sparsity at matched size (on target, |m|)");
for (const [lab, T, set] of [["suffix 1", 5101, targetsPrimesEnding("1")], ["suffix 101", 5101, targetsPrimesEnding("101")], ["powers of 2", 4096, targetsPowersOf2], ["suffix 1", 101, targetsPrimesEnding("1")], ["suffix 101", 101, targetsPrimesEnding("101")], ["powers of 2", 128, targetsPowersOf2]] as const) {
  const s = sidewaysPerPart(partRule(lab, "m", set), L(T, 17), N);
  console.log(`  ${lab} at ${T}: sideways ${f(s.sideways)} (${f(s.units)} units), ${(100 * s.inClass).toFixed(0)}% in`);
}
for (const c of [100, 1000, 10000]) { const s = sidewaysPerPart(biggerRule("c"), L(5, c), N); console.log(`bigger |c| at ${c}: sideways ${f(s.sideways)}, ${(100 * s.inClass).toFixed(0)}% in, energy ${f(s.energy)} = lift ${f(s.lift)} + sideways`); }
