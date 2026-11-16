/**
 * The helper libraries behave the same in both languages: the same agent, written once in TypeScript and once in
 * Python with the helpers (look, peek, goal, progress, move, price, cheapest, energy, prime, square, near), makes the
 * same host calls in the same order, is charged the same reads and returns the same calls, against the engine host
 * over lib/v2-linear's real line, rules and prices.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromMC, lineType, lineZ, lineQ } from "@workspace/v2-linear";
import { applyCalls, isInvalid, q, type Q } from "@workspace/v2-core";
import { EngineHost, runAct, sandboxes, type RuleRef } from "../src/index.ts";
import { findValues } from "../src/harness.ts";
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

test("Prime Gradient with look and near: one read of si, then a tilt to the nearest prime", async () => {
  const r = await both("prime-gradient", { family: "prime-gradient", params: { suffix: "1" } }, line(9, 1));
  assert.deepEqual(r.transcript.map(t => t.request), [{ op: "view", rep: "si" }]);
  assert.equal(r.outcome, "committed");
  assert.deepEqual(r.calls.map(c => [c.mutator, c.args]), [["si.tilt", { k: "-2" }]], "9 → 7: on a tie the smaller prime");
  assert.equal(r.after, lineType.encode({ lines: [fromMC(q(7), q(1))] }));
  const skip = await both("prime-gradient", { family: "prime-gradient", params: { suffix: "1" } }, line(5, 3));
  assert.equal(skip.outcome, "skipped");
});

test("m Meets c with cheapest: three routes priced, the cheapest made, by real v2-linear prices", async () => {
  const r = await both("m-meets-c", { family: "m-meets-c", params: {} }, line(1, 5));
  assert.deepEqual(r.transcript.map(t => t.request.op), ["view", "quote", "quote", "quote"]);
  const charges = r.transcript.slice(1).map(t => (t.reply as { ok: true; result: { charge: number } }).result.charge);
  const cheapest = Math.min(...charges);
  assert.equal(r.outcome, "committed");
  const picked = charges.indexOf(cheapest);
  assert.equal(r.calls[0]!.mutator, ["si.shift", "si.tilt", "seq.step"][picked]);
  assert.equal(r.calls[0]!.rep, ["si", "si", "seq"][picked]);
});

test("Triangle Area with goal and cheapest: one read, a search in the agent's own time, quotes only of the best", async () => {
  const r = await both("triangle-area", { family: "triangle-area", params: { A: 6 } }, line(2, 3));
  const ops = r.transcript.map(t => t.request.op);
  assert.deepEqual(ops.slice(0, 2), ["view", "myRule"]);
  assert.ok(ops.slice(2).every(op => op === "quote"));
  assert.equal(r.outcome, "committed");
});

test("every helper gives the same answers in both languages", async () => {
  const out: string[] = [];
  for (const language of ["typescript", "python"] as Language[]) {
    const host = new EngineHost({ type: lineType, variant: lineQ, state: line(q(3, 2), q(-4), lineQ).state, rule: { family: "triangle-area", params: { A: 6 } }, energy: 100 });
    const res = await (await boxes.get(language)).act({ source: source(`every-helper.${language === "python" ? "py" : "ts"}`), offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) out.push(JSON.stringify({ calls: JSON.parse(res.calls), transcript: res.transcript, readBits: res.readBits }));
  }
  assert.equal(out[1], out[0]);
  const calls = JSON.parse(out[0]!).calls as { mutator: string; args: Record<string, string> }[];
  assert.deepEqual(calls.map(c => c.mutator), ["si.shift", "probe"], "the one-move plan is cheaper than the two-move one; the made-up mutator is not allowed");
  assert.deepEqual(calls[1]!.args.r.split("|").slice(6), ["1/2", "16/3", "100", "true", "true", "false", "false", "true", "false", "2", "9", "true", "false", "false", "false", "3", "9", "2", "199996164", "0",
    // near with a last digit k: the prime ending in 3 nearest 25 is 23; 8 is as near 3 as 13 (the smaller); below 11
    // (the smallest prime ending in 1), 11; 19½ is nearest 19; an odd number ending in 7 nearest 10 is 7.
    "23", "3", "11", "19", "7"]);
});

test("an agent may declare its own name that a helper has (the helpers are configurable globals)", async () => {
  const src = `const square = x => Q.mul(x, x);\nconst price = 3;\nfunction agent(offer) { return [move("si.shift", { k: Q.sub(square(price), 8) })]; }`;
  const { record } = await runAct(await boxes.get("typescript"), {
    type: lineType, ...line(1, 1), rule: { family: "m-meets-c", params: {} }, program: { language: "typescript", source: src }, seed: "1", energy: 10,
  });
  assert.equal(record.outcome, "committed", record.reason);
  assert.deepEqual(record.calls[0]!.args, { k: "1" });
});

test("the points helpers: worth, rarity, recent, pushback and contested agree in both languages; notes are capped", async () => {
  const value = { mine: 4, others: 6, points: 24 };
  // My gain taken back (1), my gain taken back again (2); a drop with no gain of mine before it is not counted.
  const history = [
    { mine: false, pointsBefore: 5, pointsAfter: 2 }, { mine: true, pointsBefore: 2, pointsAfter: 9 }, { mine: false, pointsBefore: 9, pointsAfter: 3 },
    { mine: true, pointsBefore: 3, pointsAfter: 8 }, { mine: false, pointsBefore: 8, pointsAfter: 12 }, { mine: false, pointsBefore: 12, pointsAfter: 1 },
  ];
  // A value function: 0 bits for WORST, 3 at a score of 1, 7 at 2, and 1 bit more per unit beyond (no maximum).
  const values = { knots: [[null, 0], [["1"], 3], [["2"], 7]].map(([u, bits]) => ({ u: u as string[] | null, bits: bits as number, lo: bits as number, hi: bits as number, source: "exact" as const })), tail: { secondary: { form: "linear" as const, slope: 1 }, primary: { form: "linear" as const, slope: 1 } } };
  const ts = `function agent(offer) {
  const w = worth(offer), r = [rarity(offer, null), rarity(offer, [1]), rarity(offer, [Q.of(5, 2)]), rarity(offer, [9])];
  const out = [w.mine, w.others, w.points, ...r, recent(offer).length, pushback(offer), contested(offer, 3), contested(offer, 2), note(offer, "  two  "), note(offer, "x"), note(offer, "y")];
  return [move("probe", { r: out.join("|") })];
}`;
  const py = `def agent(offer):
    w = worth(offer)
    r = [rarity(offer, None), rarity(offer, [1]), rarity(offer, [Fraction(5, 2)]), rarity(offer, [9])]
    out = [w.mine, w.others, w.points, *r, len(recent(offer)), pushback(offer), contested(offer, 3), contested(offer, 2), note(offer, "  two  "), note(offer, "x"), note(offer, "y")]
    return [move("probe", r="|".join(str(x).lower() for x in out))]
`;
  const out = [];
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, ...line(1, 1), rule: { family: "m-meets-c", params: {} }, energy: 10, value, history, values });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) out.push({ r: (JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r, notes: host.notes, readBits: res.readBits });
  }
  assert.deepEqual(out[1], out[0], "Python and TypeScript differ");
  assert.deepEqual(out[0]!.r.split("|"), ["4", "6", "24", "0", "3", "7.5", "14", "6", "2", "false", "true", "true", "true", "false"]);
  assert.deepEqual(out[0]!.notes, ["Tug-of-war on line 0: another player keeps pulling it back. Make a deal with them; to keep your agent off it, add 0 to \"leaves these lines alone\" under your agent.", "two", "x"], "at most 3 notes, trimmed");
});

test("without the game's values an agent still runs (worth is null, rarity 0, recent empty), and its notes reach the act record", async () => {
  const src = `function agent(offer) { note(offer, [worth(offer), rarity(offer, [1]), recent(offer).length, contested(offer, 1)].join("|")); return null; }`;
  const { record } = await runAct(await boxes.get("typescript"), {
    type: lineType, ...line(1, 1), rule: { family: "m-meets-c", params: {} }, program: { language: "typescript", source: src }, seed: "1", energy: 10,
  });
  assert.equal(record.outcome, "skipped", record.reason);
  assert.deepEqual(record.notes, ["|0|0|false"]);
});

test("price() of the plan cheapest() just returned is answered without a second quote, in both languages", async () => {
  const ts = `function agent(offer) { const plans = [[move("si.shift", { k: 1 })], [move("si.tilt", { k: 1 })]]; const p = cheapest(offer, plans); return price(offer, p) === null ? null : p; }`;
  const py = `def agent(offer):\n    plans = [[move("si.shift", k=1)], [move("si.tilt", k=1)]]\n    p = cheapest(offer, plans)\n    return None if price(offer, p) is None else p\n`;
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const { record } = await runAct(await boxes.get(language), {
      type: lineType, ...line(1, 1), rule: { family: "m-meets-c", params: {} }, program: { language, source: src }, seed: "1", energy: 10,
    });
    assert.equal(record.outcome, "committed", record.reason);
    assert.equal(record.transcript.filter(e => e.request.op === "quote").length, 2, `${language}: two plans, two quotes`);
  }
});

test("fair: true when a plan keeps the others' rarity, added up; the same in both languages; a small read each time", async () => {
  const other = { family: "prime-gradient", params: { suffix: "1" }, tieBreaker: "shared-factor" };
  const vf = findValues("line-q", other)!   /* the dealt ending is valued on line-q only */;
  const gradientOff = { lines: [fromMC(q(11), q(3))] };   // m = 11 is a prime ending in 1: the other player's rule likes it
  const ts = `function agent(offer) { return [move("probe", { r: [fair(offer, [move("si.shift", { k: 1 })]), fair(offer, [move("si.tilt", { k: 1 })]), fair(offer, [move("nope", {})])].join("|") })]; }`;
  const py = `def agent(offer):\n    r = [fair(offer, [move("si.shift", k=1)]), fair(offer, [move("si.tilt", k=1)]), fair(offer, [move("nope")])]\n    return [move("probe", r="|".join(str(x).lower() for x in r))]\n`;
  const out = [];
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, variant: lineZ, state: gradientOff, rule: { family: "m-meets-c", params: {} }, energy: 10, others: [{ rule: other, values: vf }] });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) out.push({ r: (JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r, readBits: res.readBits });
  }
  assert.deepEqual(out[1], out[0], "Python and TypeScript differ");
  // Shifting keeps the gradient 11 (a prime ending in 1): fair. Tilting to 12 loses it: not fair. A move that is not allowed: fair (it changes nothing).
  assert.equal(out[0]!.r, "true|false|true");
  assert.ok(out[0]!.readBits >= 3 * 6, "each othersAfter is a small read");
  // Without the others' rules the game does not say, and fair is true.
  const plain = new EngineHost({ type: lineType, variant: lineZ, state: gradientOff, rule: { family: "m-meets-c", params: {} }, energy: 10 });
  const res = await (await boxes.get("typescript")).act({ source: ts, offer: { object: 0 }, seed: "1", host: plain });
  assert.equal(res.ok && (JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r, "true|true|true");
});

test("climb: the step that raises my points most (rarity × the others' total), best for my rule first; null when none does; without values, my rule's best; the same in both languages", async () => {
  const other = { family: "prime-gradient", params: { suffix: "1" }, tieBreaker: "shared-factor" };
  const others = [{ rule: other, values: findValues("line-q", other)!   /* the dealt ending is valued on line-q only */ }];
  const at = { lines: [fromMC(q(11), q(3))] };   // m = 11 is a prime ending in 1: the other player's rule likes it, so tilting lowers the others
  const values = { knots: [[null, 0], [["1"], 3], [["2"], 7]].map(([u, bits]) => ({ u: u as string[] | null, bits: bits as number, lo: bits as number, hi: bits as number, source: "exact" as const })), tail: { secondary: { form: "linear" as const, slope: 1 }, primary: { form: "linear" as const, slope: 1 } } };
  // Scores are given: the shift reaches 1 (3 bits), the tilt 2 (7 bits) but lowers the others, a third option is not allowed.
  const ts = `function agent(offer) {
  const sh = [move("si.shift", { k: 1 })], ti = [move("si.tilt", { k: 1 })], no = [move("nope", {})];
  const pick = climb(offer, [[sh, [1]], [ti, [2]], [no, [9]]], [0]);
  const one = climb(offer, [[sh, [1]], [ti, [2]]], [0], 1);
  return [move("probe", { r: [pick ? pick[0].mutator : "none", one ? one[0].mutator : "none", climb(offer, [[sh, null]], [0]) === null].join("|") })];
}`;
  const py = `def agent(offer):
    sh, ti, no = [move("si.shift", k=1)], [move("si.tilt", k=1)], [move("nope")]
    pick = climb(offer, [(sh, [1]), (ti, [2]), (no, [9])], [0])
    one = climb(offer, [(sh, [1]), (ti, [2])], [0], 1)
    r = [pick[0]["mutator"] if pick else "none", one[0]["mutator"] if one else "none", str(climb(offer, [(sh, None)], [0]) is None).lower()]
    return [move("probe", r="|".join(r))]
`;
  const out: string[][] = [];
  for (const withValues of [true, false]) for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, variant: lineZ, state: at, rule: { family: "m-meets-c", params: {} }, energy: 10, others,
      ...(withValues ? { values, value: { mine: 0.5, others: 1, points: 0.5 } } : {}) });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) out.push((JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r.split("|"));
  }
  assert.deepEqual(out[1], out[0], "Python and TypeScript differ (with values)");
  assert.deepEqual(out[3], out[2], "Python and TypeScript differ (without values)");
  // With values: rarity 7 × the others after the tilt against 3 × the others after the shift; weighing only the best one, the tilt.
  const shift = new EngineHost({ type: lineType, variant: lineZ, state: at, rule: { family: "m-meets-c", params: {} }, energy: 10, others });
  const after = (k: "si.shift" | "si.tilt") => (shift.handle({ op: "othersAfter", calls: [{ mutator: k, site: 0, args: { k: "1" } }] } as never, { hostCallsLeft: 5 }) as { result: { after: number } }).result.after;
  assert.equal(out[0]![0], 7 * after("si.tilt") > 3 * after("si.shift") ? "si.tilt" : "si.shift");
  assert.deepEqual(out[0]!.slice(1), ["si.tilt", "true"], "most = 1 weighs only the rule's best; a step worth nothing to my rule (no score) is null");
  assert.deepEqual(out[2], ["si.tilt", "si.tilt", "true"], "without values: the rule's best, or null when nothing beats now");
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
    const host = new EngineHost({ type: lineType, ...line(1, 1), rule: { family: "m-meets-c", params: {} }, energy: 10 });
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
      const host = new EngineHost({ type: lineType, variant: lineQ, state, rule: { family: "m-meets-c", params: {} }, energy: 10 });
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

test("climb: a step dearer than the allowance (15 s of income) is paid from energy saved in hand, never on credit; the same in both languages", async () => {
  const other = { family: "prime-gradient", params: { suffix: "1" }, tieBreaker: "shared-factor" };
  const others = [{ rule: other, values: findValues("line-q", other)! }];
  const at = { lines: [fromMC(q(11), q(3))] };   // shifting keeps m = 11, which the other rule likes
  const values = { knots: [[null, 0], [["1"], 3], [["2"], 7]].map(([u, bits]) => ({ u: u as string[] | null, bits: bits as number, lo: bits as number, hi: bits as number, source: "exact" as const })), tail: { secondary: { form: "linear" as const, slope: 1 }, primary: { form: "linear" as const, slope: 1 } } };
  const ts = `function agent(offer) {
  const pick = climb(offer, [[[move("si.shift", { k: 5 })], [2]]], [0]);
  return [move("probe", { r: (pick ? "shift" : "none") + "|" + price(offer, move("si.shift", { k: 5 })) + "|" + allowance(offer) })];
}`;
  const py = `def agent(offer):
    pick = climb(offer, [([move("si.shift", k=5)], [2])], [0])
    return [move("probe", r=("shift" if pick else "none") + "|" + str(price(offer, move("si.shift", k=5))) + "|" + str(allowance(offer)))]
`;
  const out: string[][] = [];
  for (const energy of [400, 20]) for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, variant: lineZ, state: at, rule: { family: "m-meets-c", params: {} }, energy, income: 1, others, values, value: { mine: 0.5, others: 1, points: 0.5 } });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) out.push((JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r.split("|"));
  }
  assert.equal(out[1]![0], out[0]![0], "Python and TypeScript differ (savings)");
  assert.equal(out[3]![0], out[2]![0], "Python and TypeScript differ (no savings)");
  const [, price, cap] = out[0]!.map(Number);
  assert.ok(price! > cap! && price! > 20 && price! <= 400, `the shift costs ${price}, above the allowance ${cap} and within the savings`);
  assert.equal(out[0]![0], "shift", "saved energy pays for it");
  assert.equal(out[2]![0], "none", "without the savings it waits (no debt beyond the allowance)");
});

test("simplest: the fraction with the smallest denominator between two numbers (then the numerator nearest 0); the same in both languages", async () => {
  const cases = [["37/2", "39/2"], ["-81/100", "-77/100"], ["-3", "5"], ["5/7", "5/7"], ["-1", "-1/3"], ["1/1000", "1/999"]];
  const ts = `function agent(offer) { return [move("probe", { r: ${JSON.stringify(cases)}.map(([a, b]) => Q.toString(simplest(Q.from(a), Q.from(b)))).join("|") })]; }`;
  const py = `def agent(offer):\n    return [move("probe", r="|".join(str(simplest(Fraction(a), Fraction(b))) for a, b in ${JSON.stringify(cases)}))]\n`;
  const out: string[] = [];
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, variant: lineQ, state: line(q(3, 2), q(-4), lineQ).state, rule: { family: "triangle-area", params: { A: 6 } }, energy: 100 });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) out.push((JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r);
  }
  assert.equal(out[1], out[0], "Python and TypeScript differ");
  assert.deepEqual(out[0]!.split("|"), ["19", "-4/5", "0", "5/7", "-1", "1/999"]);
});

test("shortcuts: each step in another view lands where the game puts it, the same in both languages", async () => {
  const lines = [[q(2), q(-6)], [q(-3, 2), q(4)], [q(10), q(48)], [q(1, 3), q(-7)], [q(-1), q(1, 2)]] as const;
  const W = JSON.stringify(lines.map(([m, c]) => [`${m.n}/${m.d}`, `${c.n}/${c.d}`]));
  const ts = `function agent(offer) {
  const out = [];
  for (const [m, c] of ${W}) for (const [plan, m2, c2] of shortcuts(Q.from(m), Q.from(c))) out.push(JSON.stringify(Array.isArray(plan) ? plan : [plan]) + "|" + Q.toString(m2) + "|" + Q.toString(c2));
  return [move("probe", { r: out.join("\\n") })];
}`;
  const py = `def agent(offer):
    out = []
    for m, c in ${W}:
        for plan, m2, c2 in shortcuts(Fraction(m), Fraction(c)):
            p = plan if isinstance(plan, list) else [plan]
            out.append(json.dumps(p) + "|" + str(m2) + "|" + str(c2))
    return [move("probe", r="\\n".join(out))]
`;
  const rows: string[][] = [];
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, variant: lineQ, state: { lines: [fromMC(q(1), q(1))] }, rule: { family: "triangle-area", params: { A: 6 } }, energy: 100 });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host, limits: { stepBudget: 5_000_000, wallMs: 20_000 } });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) rows.push((JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r.split("\n"));
  }
  assert.equal(rows[0]!.length, rows[1]!.length, "both languages offer as many shortcuts");
  let i = 0, checked = 0;
  for (const [m, c] of lines) {
    const state = { lines: [fromMC(m, c)] };
    for (; i < rows[0]!.length; i++) {
      const [planTs, mTs, cTs] = rows[0]![i]!.split("|"), [, mPy, cPy] = rows[1]![i]!.split("|");
      assert.deepEqual([mPy, cPy].map(x => Q2(x!)), [mTs, cTs].map(x => Q2(x!)), `languages differ on shortcut ${i}`);
      const calls = (JSON.parse(planTs!) as { mutator: string; args: Record<string, unknown> }[]).map(cl => ({ mutator: cl.mutator, site: 0, args: Object.fromEntries(Object.entries(cl.args).map(([k, v]) => [k, String(v)])) }));
      const applied = applyCalls(lineType, lineQ, state, calls);
      if (isInvalid(applied)) { assert.fail(`${planTs} on y = ${m.n}/${m.d} x + ${c.n}/${c.d} is refused: ${applied.invalid}`); }
      const expect = lineType.encode({ lines: [fromMC(q(...(frac(mTs!))), q(...(frac(cTs!))))] });
      assert.equal(lineType.encode(applied.result), expect, `${planTs} on y = ${m.n}/${m.d} x + ${c.n}/${c.d}`);
      checked++;
      const next = rows[0]![i + 1];
      if (next !== undefined && next.startsWith('[{"mutator":"cart.mirror","site":0,"args":{"axis":"x"}}]') && i + 1 < rows[0]!.length && checked % 1 === 0 && rows[0]![i + 1] !== rows[0]![i]) { i++; break; }
    }
  }
  assert.ok(checked > 60, `${checked} shortcuts checked`);
});
const frac = (s: string): [number, number] => { const [n, d] = s.split("/"); return [Number(n), Number(d ?? 1)]; };
const Q2 = (s: string) => { const [n, d] = frac(s); return `${n}/${d}`; };

test("shortcuts offers only the moves in the game's menu (myRule().mutators), in both languages", async () => {
  const ts = `function agent(offer) { const menu = goal(offer).mutators; return [move("probe", { r: [menu.includes("cart.mirror"), [...new Set(shortcuts(Q.from(2), Q.from(3), ["cart.mirror"]).map(([p]) => p.mutator))].join(",")].join("|") })]; }`;
  const py = `def agent(offer):\n    menu = goal(offer).mutators\n    kinds = sorted(set(p["mutator"] for p, _, _ in shortcuts(Fraction(2), Fraction(3), ["cart.mirror"])))\n    return [move("probe", r=("true" if "cart.mirror" in menu else "false") + "|" + ",".join(kinds))]\n`;
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, variant: lineQ, state: line(q(3, 2), q(-4), lineQ).state, rule: { family: "triangle-area", params: { A: 6 } }, energy: 100 });
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
    const host = new EngineHost({ type: lineType, variant: lineQ, state: line(q(3, 2), q(-4), lineQ).state, rule: { family: "triangle-area", params: { A: 6 } }, energy: 100 });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host, limits: { stepBudget: 5_000_000, wallMs: 20_000 } });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) assert.deepEqual((JSON.parse(res.calls) as { args: { r: string } }[])[0]!.args.r.split("|"), want, language);
  }
});

test("climb skips instead of failing when the act has few host calls left (64 an act), in both languages", async () => {
  // Spend 56 of the 64 calls on budget reads, then climb over steps that each need a look at the others (worth is told).
  const rule = { family: "prime-gradient", params: { suffix: "1" }, tieBreaker: "shared-factor" }, other = { family: "treasure", params: { k: 3 }, tieBreaker: "shared-factor" };
  const ts = `function agent(offer) { for (let i = 0; i < 56; i++) offer.budget(); const opts = [11, 31, 41, 61, 71, 101].map(k => [move("si.tilt", { k }), [Q.of(k), Q.of(1)]]); return climb(offer, opts, [Q.of(-5), Q.of(0)], 6) ?? []; }`;
  const py = `def agent(offer):\n    for _ in range(56):\n        offer.budget()\n    opts = [(move("si.tilt", k=k), [Fraction(k), Fraction(1)]) for k in (11, 31, 41, 61, 71, 101)]\n    return climb(offer, opts, [Fraction(-5), Fraction(0)], 6) or []\n`;
  for (const [language, src] of [["typescript", ts], ["python", py]] as const) {
    const host = new EngineHost({ type: lineType, variant: lineQ, state: line(q(0), q(3), lineQ).state, rule, energy: 1000,
      values: findValues("line-q", rule)!, value: { mine: 0.01, others: 1, points: 0.01 }, others: [{ rule: other, values: findValues("line-q", other)! }] });
    const res = await (await boxes.get(language)).act({ source: src, offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : `${language}: ${res.error}`);
  }
});
