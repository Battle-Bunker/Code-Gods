import { readFileSync, readdirSync, existsSync } from "node:fs";
const S = process.argv[2] ?? "study/results";
const map = { "pg-prime": ["prime-gradient", "prime"], "pg-cprime": ["prime-gradient", "cPrime"], "pl-big": ["prime-landing", "big-prime"], "pl-pg": ["prime-landing", "prime-gradient"] };
for (const [w, [f, tb]] of Object.entries(map)) {
  if (!existsSync(`${S}/res-exact-${w}.json`) || !existsSync(`${S}/res-sim-${w}.json`)) continue;
  const ex = JSON.parse(readFileSync(`${S}/res-exact-${w}.json`)), sim = JSON.parse(readFileSync(`${S}/res-sim-${w}.json`));
  const d = new URL(`../artefacts/line-z/${f}/`, import.meta.url).pathname;
  const art = JSON.parse(readFileSync(d + readdirSync(d).find(x => x.endsWith(`-${tb}.json`))));
  console.log(`== ${w}: exact tail 2^${Math.log2(ex.tail).toFixed(1)} (${ex.ms} ms); no-nudge sim ${sim.status} through ${sim.convergedThrough} (${(sim.ms/1000).toFixed(0)} s)`);
  let agree = 0, conv = 0, worst = 0;
  for (let k = 1; k < ex.lo.length; k++) {
    const e = (ex.lo[k] + ex.hi[k]) / 2, s = sim.bits[k], se = sim.error[k], a = art.rungs[k];
    const ok = se !== null && Number.isFinite(s) && se <= Math.max(0.02 * s, 0.03) && !sim.empty[k];
    if (ok) { conv++; const z = Math.abs(s - e) / Math.max(se, 1e-9); worst = Math.max(worst, Math.abs(s - e)); if (Math.abs(s - e) <= Math.max(3 * se, 0.02 * e)) agree++; }
    if (k % 3 === 0 || k > ex.lo.length - 8) console.log(`  ${String(k).padStart(2)} exact ${e.toFixed(3)}${ex.hi[k]-ex.lo[k]>0.01?"±"+((ex.hi[k]-ex.lo[k])/2).toFixed(3):""}  sim(no nudge) ${Number.isFinite(s)?s.toFixed(3):"—"}±${se===null?"—":se.toFixed(3)}${ok?"":" (unconv)"}  committed(nudge) ${a&&a.bits!==null?a.bits.toFixed(3):"—"}`);
  }
  console.log(`  converged sim rungs ${conv}, agreeing with exact within max(3σ, 2%): ${agree}; worst |diff| on converged ${worst.toFixed(3)}`);
}
