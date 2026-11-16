import { bigGrid4, bigGridType, primeBiggestFour, primeRows } from "@workspace/v2-grid";
import { bigGridValueFunction, valueLookup } from "../src/index.ts";
import { evaluateObject } from "@workspace/v2-core";
const boards: Record<string, number[]> = {
  law: [4,4,1,0, 0,0,0,0, 0,3,1,0, 0,7,8,5],
  "131": [119,2,6,4, 3,2,1,3, 6,1,0,1, 3,2,2,0],
  "271": [250,10,8,3, 9,0,1,0, 6,3,2,0, 2,0,0,0],
};
for (const [fam, p, tb] of [[primeBiggestFour(4), { ends: 1 }, "closeness>row"], [primeRows(4), { edge: "top", ends: 1 }, "closeness>cross"]] as const) {
  const t0 = Date.now();
  const vf = bigGridValueFunction(fam as never, p, bigGrid4, { tieBreaker: tb });
  const look = valueLookup(vf);
  console.log(fam.id, tb, `${Date.now() - t0} ms, ess ${vf.diagnostics.sampled?.ess}, top level knot`, vf.tree?.levels.at(-1));
  for (const [k, b] of Object.entries(boards)) {
    const u = evaluateObject(bigGridType, fam as never, p, { cells: b }, bigGrid4, tb).score;
    const l = look(u); console.log(" ", k, JSON.stringify(u, (_, x) => typeof x === "bigint" ? Number(x) : x), l.bits.toFixed(1), l.parts?.map(x => x.toFixed(1)));
  }
}
