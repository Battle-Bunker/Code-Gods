// Probe: graded Hensel's ladder, each rung knocked by the least k that keeps its bottom, and Archimedes on the same rung. Not a test.
import { q, Qn, physicsOf } from "@workspace/v2-core";
import { lineQ as V } from "../test/config.ts";
import { hensel, archimedes, estimateLine, fromMC, lineRule } from "../src/index.ts";
for (const h of [{ k: 2, p: 7 }, { k: 7, p: 3 }]) {
  const r = lineRule(hensel.dynamic!, h), ra = lineRule(archimedes.dynamic!, { k: h.k });
  const E = (l: any) => [0, 1].map(i => estimateLine(l, r, V, { seed: `k${i}` }).energy).reduce((a, b) => a + b) / 2;
  console.log(`\nHensel (D ${h.k}, p ${h.p}) | rung gradient | u | energy | knocked by the least k keeping the bottom: k, u, energy | Archimedes (D ${h.k}) u at the rung`);
  const L = Math.log2(h.p);
  for (const lv of [1, 2, 3, 5, 8, 12]) {
    const t = r.candidates(fromMC(q(5, 1), q(7, 3)), lv * L).filter(x => r.u(x) >= lv * L - 1e-9).sort((a, b) => r.u(a) - r.u(b))[0];
    if (!t) continue;
    const m = q(-t.a, t.b);
    let k = 1n; while (Qn.toWire(q(m.n + k, m.d)).split("/")[1] !== Qn.toWire(m).split("/")[1]) k++;
    const kn = fromMC(q(m.n + k, m.d), q(7, 3));
    console.log(`| ${Qn.toWire(m)} | ${r.u(t).toFixed(1)} | ${E(t).toFixed(1)} | ${k}, ${r.u(kn).toFixed(1)}, ${E(kn).toFixed(1)} | ${ra.u(t).toFixed(1)} |`);
  }
}
