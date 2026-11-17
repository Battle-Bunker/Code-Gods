/**
 * The helper libraries behave the same in both languages: the same agent, written once in TypeScript and once in
 * Python with the helpers (look, peek, goal, progress, move, price, cheapest, energy, prime, square, near), makes the
 * same host calls in the same order, is charged the same reads and returns the same calls, against the engine host
 * over lib/v2-linear's real line, rules and prices.
 */
import { lineQ, lineZ } from "./config.ts";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromMC, lineType } from "@workspace/v2-linear";
import { applyCalls, isInvalid, q, type Q } from "@workspace/v2-core";
import { EngineHost, runAct, sandboxes, type RuleRef } from "../src/index.ts";
import type { Language } from "@workspace/v2-sandbox";

const boxes = sandboxes();
after(() => boxes.close());
const source = (file: string) => readFileSync(new URL(`./agents/${file}`, import.meta.url), "utf8");
const line = (m: Q | number, c: Q | number, v = lineZ) =>
  ({ variant: v, state: { lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] } });

async function both(agent: string, rule: RuleRef, at: ReturnType<typeof line>) {
  const out = [];
  for (const language of ["typescript", "python"] as Language[]) {
    const file = `${agent}.${language === "python" ? "py" : "ts"}`;
    const { record } = await runAct(await boxes.get(language), {
      type: lineType, ...at, rule, program: { language, source: source(file) }, seed: "7", energy: 100,
    });
    const { steps: _steps, ...comparable } = record;
    out.push(comparable);
  }
  assert.deepEqual(out[1], out[0], `${agent}: Python and TypeScript differ`);
  return out[0]!;
}

test("every helper gives the same answers in both languages", async () => {
  const out: string[] = [];
  for (const language of ["typescript", "python"] as Language[]) {
    const host = new EngineHost({ type: lineType, variant: lineQ, state: line(q(3, 2), q(-4), lineQ).state, rule: { family: "square-triangle", params: { k: 3 } }, energy: 100, energySeed: "1" });
    const res = await (await boxes.get(language)).act({ source: source(`every-helper.${language === "python" ? "py" : "ts"}`), offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) out.push(JSON.stringify({ calls: JSON.parse(res.calls), transcript: res.transcript, readBits: res.readBits }));
  }
  assert.equal(out[1], out[0]);
  const calls = JSON.parse(out[0]!).calls as { mutator: string; args: Record<string, string> }[];
  assert.deepEqual(calls.map(c => c.mutator), ["add", "probe"], "the one-move plan is cheaper than the two-move one; the made-up mutator is not allowed");
  assert.deepEqual(calls[1]!.args.r.split("|").slice(6), ["1/2", "16/3", "100", "true", "true", "false", "false", "true", "false", "2", "9", "true", "false", "false", "false", "3", "9", "2", "199996164", "0",
    // near with a last digit k: the prime ending in 3 nearest 25 is 23; 8 is as near 3 as 13 (the smaller); below 11
    // (the smallest prime ending in 1), 11; 19½ is nearest 19; an odd number ending in 7 nearest 10 is 7.
    "23", "3", "11", "19", "7"]);
});

test("an agent may declare its own name that a helper has (the helpers are configurable globals)", async () => {
  const src = `const square = x => Q.mul(x, x);\nconst price = 3;\nfunction agent(offer) { return [move("add", { lens: "mc", at: 3, k: Q.sub(square(price), 8) })]; }`;
  const { record } = await runAct(await boxes.get("typescript"), {
    type: lineType, ...line(1, 1), rule: { family: "multiples", params: { k: 3 } }, program: { language: "typescript", source: src }, seed: "1", energy: 10,
  });
  assert.equal(record.outcome, "committed", record.reason);
  assert.deepEqual(record.calls[0]!.args, { lens: "mc", at: "3", k: "1" });
});

test("the points helpers: worth (null) and rarity (0) without tables, recent, pushback and contested agree in both languages; notes are capped", async () => {
  const value = { mine: 4, others: 6, points: 24 };
  // My gain taken back (1), my gain taken back again (2); a drop with no gain of mine before it is not counted.
  const history = [
    { mine: false, pointsBefore: 5, pointsAfter: 2 }, { mine: true, pointsBefore: 2, pointsAfter: 9 }, { mine: false, pointsBefore: 9, pointsAfter: 3 },
    { mine: true, pointsBefore: 3, pointsAfter: 8 }, { mine: false, pointsBefore: 8, pointsAfter: 12 }, { mine: false, pointsBefore: 12, pointsAfter: 1 },
  ];
  // No rule has a value table (decision 50): rarity is 0 at every score.
  const ts = `function agent(offer) {
  const w = worth(offer), r = [rarity(offer, null), rarity(offer, [1]), rarity(offer, [Q.of(5, 2)]), rarity(offer, [9])];
  const out = [w === null, ...r, recent(offer).length, pushback(offer), contested(offer, 3), contested(offer, 2), note(offer, "  two  "), note(offer, "x"), note(offer, "y")];
  return [move("probe", { r: out.join("|") })];
}`;
  const py = `def agent(offer):
    w = worth(offer)
    r = [rarity(offer, None), rarity(offer, [1]), rarity(offer, [Fraction(5, 2)]), rarity(offer, [9])]
    out = [w is None, *r, len(recent(offer)), pushback(offer), contested(offer, 3), contested(offer, 2), note(offer, "  two  "), note(offer, "x"), note(offer, "y")]
    return [move("probe", r="|".join(str(x).lower() for x in out))]
`;
  const out = [];
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, ...line(1, 1), rule: { family: "multiples", params: { k: 3 } }, energy: 10, value, history });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) out.push({ r: (JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r, notes: host.notes, readBits: res.readBits });
  }
  assert.deepEqual(out[1], out[0], "Python and TypeScript differ");
  assert.deepEqual(out[0]!.r.split("|"), ["true", "0", "0", "0", "0", "6", "2", "false", "true", "true", "true", "false"]);
  assert.deepEqual(out[0]!.notes, ["Tug-of-war on line 0: another player keeps pulling it back. Make a deal with them; to keep your agent off it, add 0 to \"leaves these lines alone\" under your agent.", "two", "x"], "at most 3 notes, trimmed");
});

test("without the game's values an agent still runs (worth is null, rarity 0, recent empty), and its notes reach the act record", async () => {
  const src = `function agent(offer) { note(offer, [worth(offer), rarity(offer, [1]), recent(offer).length, contested(offer, 1)].join("|")); return null; }`;
  const { record } = await runAct(await boxes.get("typescript"), {
    type: lineType, ...line(1, 1), rule: { family: "multiples", params: { k: 3 } }, program: { language: "typescript", source: src }, seed: "1", energy: 10,
  });
  assert.equal(record.outcome, "skipped", record.reason);
  assert.deepEqual(record.notes, ["|0|0|false"]);
});

test("price() of the plan cheapest() just returned is answered without a second quote, in both languages", async () => {
  const ts = `function agent(offer) { const plans = [[move("add", { lens: "mc", at: 3, k: 1 })], [move("add", { lens: "mc", at: 1, k: 1 })]]; const p = cheapest(offer, plans); return price(offer, p) === null ? null : p; }`;
  const py = `def agent(offer):\n    plans = [[move("add", lens="mc", at=3, k=1)], [move("add", lens="mc", at=1, k=1)]]\n    p = cheapest(offer, plans)\n    return None if price(offer, p) is None else p\n`;
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const { record } = await runAct(await boxes.get(language), {
      type: lineType, ...line(1, 1), rule: { family: "multiples", params: { k: 3 } }, program: { language, source: src }, seed: "1", energy: 10,
    });
    assert.equal(record.outcome, "committed", record.reason);
    assert.equal(record.transcript.filter(e => e.request.op === "quote").length, 2, `${language}: two plans, two quotes`);
  }
});

test("rounding: on a line with fractions, the steps to the whole number below and above, by one part, and a stretch by each denominator; the same in both languages", async () => {
  const ts = `function agent(offer) {
  const a = rounding(Q.of(2), Q.of(7, 3)), b = rounding(Q.of(1, 2), Q.of(3, 2)), z = rounding(Q.of(2), Q.of(5));
  const say = t => t.map(([p, m, c]) => p.mutator + ":" + Object.values(p.args).join(",") + ":" + Q.toString(m) + ":" + Q.toString(c)).join(" ");
  return [move("probe", { r: [say(a), say(b), z.length].join("|") })];
}`;
  const py = `def agent(offer):
    a, b, z = rounding(Fraction(2), Fraction(7, 3)), rounding(Fraction(1, 2), Fraction(3, 2)), rounding(Fraction(2), Fraction(5))
    def say(t):
        return " ".join(p["mutator"] + ":" + ",".join(str(v) for v in p["args"].values()) + ":" + str(m) + ":" + str(c) for p, m, c in t)
    return [move("probe", r="|".join([say(a), say(b), str(len(z))]))]
`;
  const out: string[] = [];
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, ...line(1, 1), rule: { family: "multiples", params: { k: 3 } }, energy: 10 });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) out.push((JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r);
  }
  assert.equal(out[1], out[0], "Python and TypeScript differ");
  const [a, b, z] = out[0]!.split("|");
  assert.equal(a, "si.shift:-1/3:2:2 si.shift:2/3:2:3 si.shift:1/3:2:8/3 si.shift:-1/3:2:2 mach.stretch:3:6:7");
  assert.equal(b!.split(" ").length, 9, "both parts fractional, one shared denominator: 4 shifts, 4 tilts, one stretch");
  assert.ok(b!.endsWith("mach.stretch:2:1:3"), b);
  assert.equal(z, "0", "whole numbers: nothing to round");
});

test("fractions and tips: steps into halves and thirds; on a vertical line, the moves that tip it; the same in both languages", async () => {
  const ts = `function agent(offer) {
  const say = t => t.map(([p, m, c]) => p.mutator + ":" + Object.values(p.args).join(",") + ":" + Q.toString(m) + ":" + Q.toString(c)).join(" ");
  return [move("probe", { r: [say(fractions(Q.of(2), Q.of(5))), say(tips(offer))].join("|") })];
}`;
  const py = `def agent(offer):
    def say(t):
        return " ".join(p["mutator"] + ":" + ",".join(str(v) for v in p["args"].values()) + ":" + str(m) + ":" + str(c) for p, m, c in t)
    return [move("probe", r="|".join([say(fractions(Fraction(2), Fraction(5))), say(tips(offer))]))]
`;
  const out: string[][] = [];
  for (const state of [{ lines: [{ a: 2n, b: 0n, c: -1n }] }, line(3, 4, lineQ).state]) {   // x = 1/2 (vertical), then y = 3x + 4
    const row: string[] = [];
    for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
      const host = new EngineHost({ type: lineType, variant: lineQ, state, rule: { family: "multiples", params: { k: 3 } }, energy: 10 });
      const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host });
      assert.equal(res.ok, true, res.ok ? "" : res.error);
      if (res.ok) row.push((JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r);
    }
    assert.equal(row[1], row[0], "Python and TypeScript differ");
    out.push(row[0]!.split("|"));
  }
  const [frac, tipsVertical] = out[0]!, [, tipsSloped] = out[1]!;
  assert.equal(frac!.split(" ").length, 15, "6 shifts, 6 tilts, 3 stretches");
  assert.ok(frac!.startsWith("si.shift:1/2:2:11/2 si.tilt:1/2:5/2:5"), frac);
  assert.equal(tipsVertical, "cart.mirror:diagonal:0:1/2 gen.nudge:b,1:-2:1 gen.nudge:b,2:-1:1/2", "x = 1/2 tips to y = 1/2, y = -2x + 1, y = -x + 1/2");
  assert.equal(tipsSloped, "", "a line that is not vertical has nothing to tip");
});

test("simplest: the fraction with the smallest denominator between two numbers (then the numerator nearest 0); the same in both languages", async () => {
  const cases = [["37/2", "39/2"], ["-81/100", "-77/100"], ["-3", "5"], ["5/7", "5/7"], ["-1", "-1/3"], ["1/1000", "1/999"]];
  const ts = `function agent(offer) { return [move("probe", { r: ${JSON.stringify(cases)}.map(([a, b]) => Q.toString(simplest(Q.from(a), Q.from(b)))).join("|") })]; }`;
  const py = `def agent(offer):\n    return [move("probe", r="|".join(str(simplest(Fraction(a), Fraction(b))) for a, b in ${JSON.stringify(cases)}))]\n`;
  const out: string[] = [];
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, variant: lineQ, state: line(q(3, 2), q(-4), lineQ).state, rule: { family: "square-triangle", params: { k: 3 } }, energy: 100, energySeed: "1" });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) out.push((JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r);
  }
  assert.equal(out[1], out[0], "Python and TypeScript differ");
  assert.deepEqual(out[0]!.split("|"), ["19", "-4/5", "0", "5/7", "-1", "1/999"]);
});

test("shortcuts offers only the moves in the game's menu (myRule().mutators), in both languages", async () => {
  const ts = `function agent(offer) { const menu = goal(offer).mutators; return [move("probe", { r: [menu.includes("cart.mirror"), [...new Set(shortcuts(Q.from(2), Q.from(3), ["cart.mirror"]).map(([p]) => p.mutator))].join(",")].join("|") })]; }`;
  const py = `def agent(offer):\n    menu = goal(offer).mutators\n    kinds = sorted(set(p["mutator"] for p, _, _ in shortcuts(Fraction(2), Fraction(3), ["cart.mirror"])))\n    return [move("probe", r=("true" if "cart.mirror" in menu else "false") + "|" + ",".join(kinds))]\n`;
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, variant: lineQ, state: line(q(3, 2), q(-4), lineQ).state, rule: { family: "square-triangle", params: { k: 3 } }, energy: 100, energySeed: "1" });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) assert.equal((JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r, `${lineQ.mutators.includes("cart.mirror")}|cart.mirror`, language);
  }
});

test("simplest equals the brute-force definition (smallest denominator, then numerator nearest 0) on random intervals, in both languages", async () => {
  const r = (i: number) => { let x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const cases = Array.from({ length: 120 }, (_, i) => { const a = Math.round((r(i) - 0.5) * 4000), b = a + 1 + Math.floor(r(i + 999) * 300), d = 1 + Math.floor(r(i + 77) * 500); return [`${a}/${d}`, `${b}/${d}`]; });
  const brute = ([a, b]: string[]) => {
    const [an, ad] = a!.split("/").map(BigInt) as [bigint, bigint], [bn, bd] = b!.split("/").map(BigInt) as [bigint, bigint];
    for (let d = 1n; ; d++) {
      const lo = -((-an * d) / ad) + (((-an * d) % ad) !== 0n && an * d > 0n ? 1n : 0n);   // ceil(a·d)
      const ceil = (n: bigint, m: bigint) => (n >= 0n ? (n + m - 1n) / m : -((-n) / m)), floor = (n: bigint, m: bigint) => (n >= 0n ? n / m : -((-n + m - 1n) / m));
      const nlo = ceil(an * d, ad), nhi = floor(bn * d, bd); void lo;
      if (nlo <= nhi) { const n = nlo > 0n ? nlo : nhi < 0n ? nhi : 0n; const g = (x: bigint, y: bigint): bigint => (y === 0n ? (x < 0n ? -x : x) : g(y, x % y)); const k = g(n, d) || 1n; return `${n / k}/${d / k}`; }
    }
  };
  const ts = `function agent(offer) { return [move("probe", { r: ${JSON.stringify(cases)}.map(([a, b]) => Q.toString(simplest(Q.from(a), Q.from(b)))).join("|") })]; }`;
  const py = `def agent(offer):\n    return [move("probe", r="|".join(str(simplest(Fraction(a), Fraction(b))) for a, b in ${JSON.stringify(cases)}))]\n`;
  const want = cases.map(brute).map(s => (s.endsWith("/1") ? s.slice(0, -2) : s));
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, variant: lineQ, state: line(q(3, 2), q(-4), lineQ).state, rule: { family: "square-triangle", params: { k: 3 } }, energy: 100, energySeed: "1" });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host, limits: { stepBudget: 5_000_000, wallMs: 20_000 } });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) assert.deepEqual((JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r.split("|"), want, language);
  }
});

