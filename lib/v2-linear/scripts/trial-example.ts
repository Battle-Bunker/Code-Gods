import { q, type Q } from "@workspace/v2-core";
import { areaSquare, axisArea, callPrice, fromMC, gradientPrime, height, interceptSmooth, trialScore, describeLine, TRIAL, type Line } from "../src/index.ts";
const L = (m: Q | number, c: Q | number): Line => fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c);
const rules = { A: gradientPrime("1"), B: interceptSmooth([3, 17], true), C: areaSquare(300) };
const f = (x: number) => x.toFixed(2);
function show(name: string, l: Line) {
  const s = Object.entries(rules).map(([k, r]) => { const t = trialScore(r, l); return `${k} ${f(t.score)} [${t.trophy?.label ?? "-"}; worth ${f(t.worth)}, price ${f(t.price)}]`; });
  console.log(`${name}: ${describeLine(l)}  H=${f(height(l))}  area=${axisArea(l)?.toFixed(2)}\n   ${s.join("\n   ")}`);
}
function move(name: string, id: string, args: Record<string, unknown>, a: Line, b: Line) {
  const p = callPrice(id, args, a, b)!;
  console.log(`  MOVE ${name}: friction ${f(p.friction)} + lift ${f(p.lift)} = ${f(p.total)} bits = ${p.energy.toFixed(0)} energy`);
}
const s0 = L(2, 9), s1 = L(2, 867), s2 = L(101, 867), star = L(q(751689n, 7442n), 867);
show("S0 start", s0);
move("shift +858", "si.shift", { k: q(858) }, s0, s1); show("S1", s1);
move("tilt +99", "si.tilt", { k: q(99) }, s1, s2); show("S2", s2);
move("tilt +45/7442 (exact area)", "si.tilt", { k: q(45n, 7442n) }, s2, star); show("L*", star);
// approach of B's second layer: gradient to 289 (a divisor of 867)
const s3 = L(289, 867); move("tilt 101->289", "si.tilt", { k: q(188) }, s2, s3); show("S3 (B's divisor 289)", s3);
// cheap refinements
const r1 = L(q(201, 2), 867); move("tilt -1/2", "si.tilt", { k: q(-1, 2) }, s2, r1); show("refine m=100.5", r1);
const r2 = L(101, 866); move("shift -1", "si.shift", { k: q(-1) }, s2, r2); show("near miss c=866", r2);
const r3 = L(101, q(1733, 2)); move("shift -1/2", "si.shift", { k: q(-1, 2) }, s2, r3); show("c=866.5", r3);
// knocks from S2
const k1 = L(q(101, 2), q(867, 2)); move("halve (stretch 1/2)", "mach.stretch", { f: q(1, 2) }, s2, k1); show("knock halve", k1);
move("undo halve (stretch 2)", "mach.stretch", { f: q(2) }, k1, s2);
const k2 = L(-101, -867); move("mirror x", "cart.mirror", { axis: "x" }, s2, k2); show("knock mirror", k2);
const k3 = L(101, 857); move("shift -10", "si.shift", { k: q(-10) }, s2, k3); show("knock shift -10", k3);
move("repair shift +10", "si.shift", { k: q(10) }, k3, s2);
const k4 = L(91, 867); move("tilt -10", "si.tilt", { k: q(-10) }, s2, k4); show("knock tilt -10", k4);
// area player's own cheap holder
const a1 = L(q(1, 8), q(61, 2)); show("C's cheap holder", a1);
// near-L* with integer m: area near 3721
console.log("TRIAL", JSON.stringify(TRIAL));
