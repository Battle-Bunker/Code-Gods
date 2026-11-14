#!/usr/bin/env node
// The beginner families of line-families.mjs (BEGINNER), each primary with each candidate secondary, UNGATED: the score
// is the plain lexicographic tuple (P, S). Reference law 2^−φ on primitive rational lines of height ≤ H.
// Reports, per family: the primary's bits per level (marginal), and per secondary its own bits per level (marginal over
// all lines, since ungated it orders lines at every P level), its bits per level among lines at P's top, and the joint
// top (P and S both at their top rungs).
//
//   node docs/engine-v2/scripts/layered-beginner.mjs [--height 100] [--markdown out.md]
import { writeFileSync } from "node:fs";
import { BEGINNER, gcd, lineCtx, pairLevels } from "./line-families.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const H = Number(opt("height", "100"));
const intLen = (n) => 2 * Math.floor(Math.log2((n >= 0 ? 2 * n : -2 * n - 1) + 1)) + 1;

const acc = BEGINNER.map((f) => ({
  p: new Float64Array(f.P.rungs.length + 1),
  s: f.S.map(([, , , S]) => ({ all: new Float64Array(S.rungs.length + 1), atTop: new Float64Array(S.rungs.length + 1), joint: new Map() })),
}));
let Z = 0;
for (let B = 0; B <= H; B++)
  for (let A = -H; A <= H; A++) {
    if (B === 0 && A <= 0) continue;
    const gab = gcd(A, B);
    for (let C = -H; C <= H; C++) {
      if (gcd(gab, C) !== 1) continue;
      const w = 2 ** -(intLen(A) + intLen(B) + intLen(C));
      Z += w;
      const L = lineCtx(A, B, C);
      BEGINNER.forEach((f, i) => {
        const a = acc[i];
        let pTop = null;
        f.S.forEach(([, , , S], j) => {
          const lv = pairLevels(f.P, S, L);
          if (!lv) return;
          if (j === 0) a.p[lv[0]] += w;
          pTop = lv[0] === f.P.rungs.length;
          a.s[j].all[lv[1]] += w;
          if (pTop) a.s[j].atTop[lv[1]] += w;
          const key = lv[0] * 100 + lv[1];
          a.s[j].joint.set(key, (a.s[j].joint.get(key) ?? 0) + w);
        });
      });
    }
  }

const upper = (m) => {
  const out = [];
  let t = 0;
  for (let k = m.length - 1; k >= 1; k--) {
    t += m[k];
    out[k] = t > 0 ? -Math.log2(t / Z) : null;
  }
  return out.slice(1);
};
const effective = (bits) => {
  let prev = 0, n = 0;
  for (const b of bits) {
    if (b != null && b - prev >= 0.25) n++;
    if (b != null) prev = b;
  }
  return n;
};
const fmt = (b) => b.map((x) => (x == null ? "—" : x.toFixed(1))).join(" ");
const out = [`## Beginner families, ungated (P, S), reference law at height ${H}\n`];
const json = {};
BEGINNER.forEach((f, i) => {
  const a = acc[i];
  const pb = upper(a.p);
  out.push(`### ${f.name} — ${f.topic}\n`, `Primary: "${f.card}" Levels attained ${pb.filter((x) => x != null).length}, effective ${effective(pb)} of ${f.P.rungs.length}; bits per level ${fmt(pb)}.\n`);
  out.push("| secondary | card | lens | levels attained, effective | bits per level (all lines) | bits per level (with P at its top) | joint top (P top and S top) | joint levels |", "|---|---|---|---|---|---|--:|--:|");
  json[f.id] = { name: f.name, topic: f.topic, card: f.card, P: { bits: pb, effective: effective(pb) }, S: {} };
  f.S.forEach(([sid, card, lens, S], j) => {
    const sb = upper(a.s[j].all);
    // bits at P's top: −log2 of the mass with P at top and S ≥ k
    const pTopMass = a.s[j].atTop;
    const tb = [];
    let t = 0;
    for (let k = pTopMass.length - 1; k >= 1; k--) {
      t += pTopMass[k];
      tb[k - 1] = t > 0 ? -Math.log2(t / Z) : null;
    }
    const jointTop = tb.filter((x) => x != null).at(-1);
    const joint = [...a.s[j].joint.keys()].length;
    json[f.id].S[sid] = { card, lens, bits: sb, atTop: tb, effective: effective(sb), jointTop, joint };
    out.push(`| ${sid} | ${card} | ${lens} | ${sb.filter((x) => x != null).length}, ${effective(sb)} / ${S.rungs.length} | ${fmt(sb)} | ${fmt(tb)} | ${jointTop == null ? "—" : jointTop.toFixed(1)} | ${joint} |`);
  });
  out.push("");
});
const text = out.join("\n");
console.log(text);
if (opt("markdown")) writeFileSync(opt("markdown"), text + "\n");
if (opt("json")) writeFileSync(opt("json"), JSON.stringify(json, null, 1));
