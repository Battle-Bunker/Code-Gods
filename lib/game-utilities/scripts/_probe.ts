import { instantiate } from "@workspace/game-types";
import { context, family } from "../src/catalog.ts";
import { tierLiveness, hybridLawOf } from "../src/families/grid/tiers-hybrid.ts";
import { linesSum, windowsSum, withTiers } from "../src/families/grid/tiers.ts";
const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
const ctx = context(inst), f = family("opposite_nines");
const spec = (await import("../src/families/grid/beginner/opposite_nines.ts")) as any;
for (const id of ["lines", "squares"]) for (let x = id === "lines" ? 9 : 6; x <= 18; x += 1) {
  const p = { tiers: [{ id, x, gate: 6 }] };
  const t0 = performance.now();
  const live = tierLiveness("opposite_nines", spec.ninesTiers, p as any, ctx)!;
  const law = hybridLawOf("opposite_nines", spec.ninesTiers, p as any, ctx)!;
  const L = law.levels;
  console.log(id, x, "tierTop", live.tierTop, "min", live.tierMin, "added", live.addedBits.toFixed(1), "top bits", (-L[L.length - 1][1]).toFixed(1), "base top", (-law.baseLevels[law.baseLevels.length - 1][1]).toFixed(1),
    "levels", L.length, "evals", law.evaluations, ((performance.now() - t0) / 1000).toFixed(1) + "s", live.problems.join("; "));
}
