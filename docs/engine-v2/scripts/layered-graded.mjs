#!/usr/bin/env node
// Graded families (line-families.mjs) under the reference law 2^−φ on primitive rational lines of height ≤ H:
// levels attained per part (primary, secondary, tertiary) and bits per rung.
//
//   node docs/engine-v2/scripts/layered-graded.mjs [--height 100] [--law digits|mixed] [--only id,id] [--markdown out.md] [--json out.json]
//   … --pairs id,id,…   also: for each pair, the line that serves both best (largest smaller share of top bits)
import { writeFileSync } from "node:fs";
import { FAMILIES, LAWS, gcd, levels, lineCtx, rungLabels } from "./line-families.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const H = Number(opt("height", "100"));
const LAW = opt("law", "digits"); // "digits" (the old law) or "mixed" (owner decision 17)
const intLen = LAWS[LAW];
if (!intLen) throw new Error(`unknown law ${LAW}`);
const only = opt("only", "") ? new Set(opt("only").split(",")) : null;
const pairIds = opt("pairs", "") ? opt("pairs").split(",") : null;
const fams = pairIds
  ? pairIds.map((id) => FAMILIES.find((f) => f.id === id) ?? (() => { throw new Error(`no family ${id}`); })())
  : FAMILIES.filter((f) => !only || only.has(f.id) || [...only].some((o) => f.id.startsWith(o)));
const lines = pairIds ? [] : null;


const acc = fams.map((f) => ({ mass: new Float64Array(rungLabels(f).length + 1), hit: f.parts.map((p) => new Set()) }));
let Z = 0;
const t0 = Date.now();
for (let B = 0; B <= H; B++)
  for (let A = -H; A <= H; A++) {
    if (B === 0 && A <= 0) continue;
    const gab = gcd(A, B);
    for (let C = -H; C <= H; C++) {
      if (gcd(gab, C) !== 1) continue;
      const w = 2 ** -(intLen(A) + intLen(B) + intLen(C));
      Z += w;
      const L = lineCtx(A, B, C);
      const lv8 = lines ? new Int8Array(fams.length) : null;
      for (let i = 0; i < fams.length; i++) {
        const [lv, per] = levels(fams[i], L);
        acc[i].mass[lv] += w;
        per.forEach((k, j) => acc[i].hit[j].add(k));
        if (lv8) lv8[i] = lv;
      }
      if (lines) lines.push([A, B, C, lv8]);
    }
  }
console.error(`H = ${H}: Z = ${Z.toFixed(4)}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const out = [`## Graded families under the reference law (${LAW} code, H = ${H})\n`, "| family | source | parts: levels attained, effective (≥ 0.25 bit) / declared | bits per rung (P | S | T) | top |", "|---|---|---|---|--:|"];
const json = {};
fams.forEach((f, i) => {
  const a = acc[i];
  const n = a.mass.length - 1;
  const bits = [];
  let tail = 0;
  for (let r = n; r >= 1; r--) {
    tail += a.mass[r];
    bits[r] = tail > 0 ? -Math.log2(tail / Z) : null;
  }
  let r = 1;
  const groups = f.parts.map((p, j) => {
    const g = p.rungs.map(() => bits[r++]);
    // effective: rungs that add at least ¼ bit over the rung below them (a flat rung extends nothing)
    let prev = j === 0 ? 0 : (bits[r - g.length - 1] ?? 0), effective = 0;
    for (const b of g) {
      if (b != null && b - prev >= 0.25) effective++;
      if (b != null) prev = b;
    }
    return { key: p.key, attained: [...a.hit[j]].filter((k) => k > 0).length, effective, declared: p.rungs.length, bits: g };
  });
  const top = bits.filter((b) => b != null).at(-1) ?? 0;
  json[f.id] = { name: f.name, source: f.source, pool: f.pool, groups, top };
  const lv = groups.map((g) => `${g.key} ${g.attained}, ${g.effective} / ${g.declared}`).join("; ");
  const bp = groups.map((g) => g.bits.map((b) => (b == null ? "—" : b.toFixed(1))).join(" ")).join(" \\| ");
  out.push(`| ${f.id} | ${f.source} | ${lv} | ${bp} | ${top.toFixed(1)} |`);
});
if (lines) {
  const V = fams.map((f) => {
    const g = json[f.id].groups.flatMap((x) => x.bits);
    return [0, ...g.map((b) => b ?? 0)];
  });
  const tops = V.map((v) => Math.max(...v));
  const str = ([a, b, c]) => `${a}x ${b < 0 ? "−" : "+"} ${Math.abs(b)}y ${c < 0 ? "−" : "+"} ${Math.abs(c)} = 0`;
  out.push(`\n## Pairs (H = ${H}): the line that serves both rules best\n`, "| pair | smaller share | line | bits (a, b) / tops |", "|---|--:|---|---|");
  for (let i = 0; i < fams.length; i++)
    for (let j = i + 1; j < fams.length; j++) {
      let best = null;
      for (const [A, B, C, lv] of lines) {
        const a = V[i][lv[i]] / tops[i], b = V[j][lv[j]] / tops[j];
        const key = Math.min(a, b) + 1e-6 * (a + b);
        if (!best || key > best.key) best = { key, a, b, line: [A, B, C], li: lv[i], lj: lv[j] };
      }
      out.push(`| ${fams[i].id} × ${fams[j].id} | ${Math.min(best.a, best.b).toFixed(2)} | ${str(best.line)} | ${V[i][best.li].toFixed(1)}, ${V[j][best.lj].toFixed(1)} / ${tops[i].toFixed(1)}, ${tops[j].toFixed(1)} |`);
    }
}
const text = out.join("\n");
console.log(text);
if (opt("markdown")) writeFileSync(opt("markdown"), text + "\n");
if (opt("json")) writeFileSync(opt("json"), JSON.stringify(json, null, 1));
