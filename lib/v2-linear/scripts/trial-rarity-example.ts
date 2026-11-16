// The three-rule example under scale-free rarity (scoring-trial.md, rarity mode): tree (default) and lexicographic.
import { q } from "@workspace/v2-core";
import { fromMC, mcOf, RARITY_LEX, rarityBits, rarityHeight, rarityRules } from "../src/index.ts";
const rules = rarityRules("1", [3, 17]);
const states = [["on targets", 101, 867], ["one unit off (c 866, m 102)", 102, 866], ["halfway to the next targets (m 116, c 1122)", 116, 1122],
  ["one doubling up", 202, 1734], ["ten times the size", 1010, 8670], ["ten times, on targets", 1021, 7803]] as const;
for (const [name, m, c] of states) {
  const l = mcOf(fromMC(q(m), q(c)))!;
  console.log(`${name}: y = ${m}x + ${c}  H = ${rarityHeight(l).toFixed(1)} bits`);
  for (const r of rules) {
    const b = rarityBits(r, l), x = rarityBits(r, l, RARITY_LEX);
    console.log(`   ${r.label.slice(0, 1)} tree ${b.bits.toFixed(2)} = level ${b.level.toFixed(2)} + close ${b.close.toFixed(2)} + third ${b.third.toFixed(2)} (target ${b.T}); lexicographic ${x.bits.toFixed(2)}`);
  }
}
