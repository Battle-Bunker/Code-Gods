import { writeFileSync } from "node:fs";
import { lineType, lineZ } from "@workspace/v2-linear";
import { tieBreakersOn as tbOn, type RuleFamily } from "@workspace/v2-core";
import { exactLadder } from "../src/exact.ts";
const [fid, out] = [process.argv[2]!, process.argv[3]!];
const f = lineType.families.find(x => x.id === fid)! as RuleFamily<never, unknown>;
const rows = [];
for (const t of tbOn(f, lineZ)) {
  const t0 = Date.now();
  const r = exactLadder(f as never, f.dealable(lineZ)[0], lineZ, t.id);
  const cert = r.lo.map((lo, k) => k === 0 || (Number.isFinite(r.hi[k]!) && (r.hi[k]! - lo) / 2 <= Math.max(0.02 * (lo + r.hi[k]!) / 2, 0.03)));
  const through = cert.indexOf(false) === -1 ? r.lo.length - 1 : cert.indexOf(false) - 1;
  rows.push({ family: fid, tb: t.id, ms: Date.now() - t0, through, top: r.lo.length - 1, lo: r.lo, hi: r.hi, method: r.method });
  console.log(fid, t.id, `${((Date.now() - t0) / 1000).toFixed(0)} s`, `certified through ${through}/${r.lo.length - 1}`, `at ${((r.lo[through]! + r.hi[through]!) / 2).toFixed(2)} bits`, r.method[r.method.length - 1]);
}
writeFileSync(out, JSON.stringify(rows));
