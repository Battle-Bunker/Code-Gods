// The worked example under the log height (docs/engine-v2/scoring-trial.md, "Log height").
import { q, type Q } from "@workspace/v2-core";
import { allMutators, areaSquare, axisArea, callPrice, describeLine, fromMC, gradientPrime, height, interceptSmooth, isPrimeN, lineQLenses, TRIAL_LOG as D, trialScore, type Line } from "../src/index.ts";
const L = (m: Q | number, c: Q | number): Line => fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c);
const rules = { A: gradientPrime("1"), B: interceptSmooth([3, 17], true), C: areaSquare(400) };
const f = (x: number) => x.toFixed(1);
const scores = (l: Line) => Object.fromEntries(Object.entries(rules).map(([k, r]) => [k, trialScore(r, l, D)]));
function show(name: string, l: Line) {
  const s = scores(l);
  console.log(`${name}: ${describeLine(l)}  H=${f(height(l, D))} (${(height(l, D) / D.g).toFixed(2)} doublings)  area=${axisArea(l)?.toFixed(0)}`);
  for (const [k, t] of Object.entries(s)) console.log(`   ${k} ${f(t.score)} [${t.trophy?.label ?? "-"}; worth ${f(t.worth)}, price ${f(t.price)}]`);
  return s;
}
const BY = new Map(allMutators.map(m => [m.id, m]));
function call(id: string, args: Record<string, unknown>, a: Line) {
  const r = BY.get(id)!.apply({ lines: [a] }, 0, args as never, lineQLenses);
  if ("invalid" in r) return null;
  const b = r.lines[0]!, p = callPrice(id, args, a, b, D);
  return p ? { b, p } : null;
}
function move(name: string, id: string, args: Record<string, unknown>, a: Line) {
  const r = call(id, args, a)!;
  const before = scores(a), after = scores(r.b);
  const ds = Object.keys(rules).map(k => `${k} ${(after[k]!.score - before[k]!.score >= 0 ? "+" : "")}${f(after[k]!.score - before[k]!.score)}`).join(", ");
  console.log(`  MOVE ${name} → ${describeLine(r.b)}: fee/friction ${f(r.p.friction)} + lift ${f(r.p.lift)} = ${f(r.p.total)}⚡; ${ds}`);
  return r.b;
}
const s2 = L(101, 867);
show("joint state", s2);
move("stretch ×2", "mach.stretch", { f: q(2) }, s2);
move("stretch ×1/2 (halve)", "mach.stretch", { f: q(1, 2) }, s2);
move("undo: stretch ×2 from the halved line", "mach.stretch", { f: q(2) }, L(q(101, 2), q(867, 2)));
move("shift −1", "si.shift", { k: q(-1) }, s2);
move("shift +1 (overshoot B)", "si.shift", { k: q(1) }, s2);
move("shift −10", "si.shift", { k: q(-10) }, s2);
move("shift +100", "si.shift", { k: q(100) }, s2);
move("tilt −1", "si.tilt", { k: q(-1) }, s2);
move("mirror x", "cart.mirror", { axis: "x" }, s2);
move("swap m and c", "coef.swap", { pair: "m-c" }, s2);
// the cheapest knock: every call of a menu, the one that costs least while lowering someone's score
const menu: [string, Record<string, unknown>][] = [
  ...[1, 2, 5, 10, 50, 100, 400].flatMap(n => [-n, n].flatMap(k => [["si.shift", { k: q(k) }], ["si.tilt", { k: q(k) }], ["seq.step", { k: q(k) }]] as [string, Record<string, unknown>][])),
  ...[2, 3, 10].flatMap(n => [["mach.stretch", { f: q(n) }], ["mach.stretch", { f: q(1, n) }]] as [string, Record<string, unknown>][]),
  ["mach.stretch", { f: q(-1) }], ["cart.mirror", { axis: "x" }], ["cart.mirror", { axis: "y" }], ["cart.mirror", { axis: "diagonal" }],
  ["coef.swap", { pair: "m-c" }], ["coef.swap", { pair: "b-c" }], ["si.shift", { k: q(1, 2) }], ["si.tilt", { k: q(1, 2) }],
];
const base = scores(s2);
const knocks = menu.map(([id, a]) => {
  const r = call(id, a, s2); if (!r) return null;
  const sc = scores(r.b), loss = Object.keys(rules).reduce((t, k) => t + Math.max(0, base[k]!.score - sc[k]!.score), 0);
  return { id, a, price: r.p.total, loss, ratio: loss / r.p.total };
}).filter(x => x && x.loss > 1) as { id: string; a: Record<string, unknown>; price: number; loss: number; ratio: number }[];
const fmtA = (a: Record<string, unknown>) => Object.entries(a).map(([k, v]) => `${k}=${typeof v === "object" ? `${(v as Q).n}/${(v as Q).d}` : v}`).join(",");
const cheapest = knocks.sort((x, y) => x.price - y.price)[0]!, lever = [...knocks].sort((x, y) => y.ratio - x.ratio)[0]!;
console.log(`cheapest knock: ${cheapest.id}(${fmtA(cheapest.a)}) costs ${f(cheapest.price)}, total loss ${f(cheapest.loss)}`);
console.log(`most leverage: ${lever.id}(${fmtA(lever.a)}) costs ${f(lever.price)}, total loss ${f(lever.loss)} (×${lever.ratio.toFixed(1)})`);
show("next good place up (131, 1377)", L(131, 1377));
show("ten times the size", L(1010, 8670));
show("ten times, on trophies (1021, 7803)", L(1021, 7803));
// staircase check: B's score around its trophy 867 at m = 101
console.log("B around c = 867 (m = 101): c, score, price of the direct shift back");
for (const c of [767, 857, 866, 867, 868, 877, 967, 1200]) {
  const l = L(101, c), r = call("si.shift", { k: q(867 - c) }, l);
  console.log(`   ${c}: ${f(trialScore(rules.B, l, D).score)}  shift back ${r ? f(r.p.total) : "-"}`);
}
// do trophies get rarer in cost terms? next prime ending in 1 from p, at sizes 10 … 10,000
console.log("A's next rung: from p to the next prime ending in 1 (line y = px + 0)");
for (const size of [10, 100, 1000, 10000]) {
  let p = size; while (!(isPrimeN(p) && p % 10 === 1)) p++;
  let p2 = p + 10; while (!isPrimeN(p2)) p2 += 10;
  const r = call("si.tilt", { k: q(p2 - p) }, L(p, 0))!;
  const a1 = trialScore(rules.A, L(p, 0), D).score, a2 = trialScore(rules.A, L(p2, 0), D).score;
  console.log(`   ${p} → ${p2}: tilt fee ${f(r.p.friction)} + lift ${f(r.p.lift)}; A gains ${f(a2 - a1)}`);
}
