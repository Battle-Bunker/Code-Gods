// The three-rule example under scale-free rarity (scoring-trial.md, rarity mode).
import { q } from "@workspace/v2-core";
import { fromMC, mcOf, rarityBits, rarityHeight, rarityRules } from "../src/index.ts";
const rules = rarityRules("1", [3, 17]);
for (const [name, m, c] of [["joint state", 101, 867], ["one unit off", 101, 866], ["one doubling up", 202, 1734], ["ten times the size", 1010, 8670], ["ten times, on targets", 1021, 7803]] as const) {
  const l = mcOf(fromMC(q(m), q(c)))!;
  console.log(`${name}: y = ${m}x + ${c}  H = ${rarityHeight(l).toFixed(1)} bits`);
  for (const r of rules) {
    const b = rarityBits(r, l);
    console.log(`   ${r.label.slice(0, 2)} ${b.bits.toFixed(2)} bits  (target ${b.T}; level ${b.level.toFixed(2)}, close ${b.close.toFixed(2)}, third ${b.third.toFixed(2)})`);
  }
}
