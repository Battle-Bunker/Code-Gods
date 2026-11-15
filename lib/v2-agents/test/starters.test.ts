/**
 * The shipped agents (examples per tie-breaker, Simple/Thorough/Bold starters per family), generated in both
 * languages from catalogue.ts:
 *  - every family and tie-breaker of lib/v2-linear has them, each with exactly one "Try this:", and the rendered
 *    copies under agents/ are up to date;
 *  - an agent's own idea of the score is the engine's, on whole-number and fraction lines (a whole-lines agent gives
 *    fraction lines no score);
 *  - both languages make the same moves, and no agent fails on newborn lines;
 *  - each example gains value on some newborn line, its main part never falling (ux: a beginner's first agent visibly works);
 *  - every one is payable from the beginner preset's starting energy, at about the same price in both languages.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { isGridTypeFamily } from "../src/grid-starters.ts";
import { readFileSync } from "node:fs";
import { evaluateSite, q, Qn, scoreToWire, type Variant } from "@workspace/v2-core";
import { valueLookup } from "@workspace/v2-valuation";
import { firstAgentShare, LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { fromMC, lineType, lineQ, lineZ, type LineState } from "@workspace/v2-linear";
import type { Language } from "@workspace/v2-sandbox";
import {
  BEGINNER_STARTING_ENERGY, GRID_BEGINNER_STARTING_ENERGY, births, CATALOGUE, check, stale, undescribed, EngineHost, exampleFor, runAct, sandboxes, scoreSource, shippedAgents, shippedPath,
  startersFor, summonBits, type ShippedAgent,
} from "../src/index.ts";
import { findValues } from "../src/harness.ts";

const boxes = sandboxes();
after(() => boxes.close());
const all = shippedAgents();
const familyOf = (id: string) => lineType.families.find(f => f.id === id)!;
/** The catalogue entries v2-linear still deals. */
const LIVE = CATALOGUE.filter(e => lineType.families.some(f => f.id === e.family));
/** The variant a family is dealt on: whole-number lines if it can be, else rational lines (the rational-only families). */
const variantOf = (id: string): Variant => (familyOf(id).dealable(lineZ).length > 0 ? lineZ : lineQ);
const paramsOf = (id: string) => familyOf(id).dealable(variantOf(id))[0] as Record<string, unknown>;

test("families and tie-breakers without shipped agents yet (a catalogue entry each)", t => {
  const missing = undescribed(), gone = stale();
  if (missing.length) t.todo(`no examples or starters yet for ${missing.join(", ")}: add them to lib/v2-agents/src/catalogue.ts`);
  if (gone.length) t.todo(`catalogue entries v2-linear no longer has: ${gone.join(", ")}`);
});

test("every described family has an example per described tie-breaker and the four starters (one of them naive), in both languages", () => {
  for (const e of LIVE) {
    const f = familyOf(e.family);
    for (const language of ["typescript", "python"] as const) {
      for (const tb of Object.keys(e.tieBreakers).filter(tb => f.tieBreakers.some(t => t.id === tb))) {
        assert.ok(exampleFor(f.id, tb, language), `${f.id}: no ${language} example for ${tb}`);
      }
      assert.deepEqual(all.filter(a => a.family === f.id && a.language === language && a.kind !== "example").map(a => a.title), ["Simple", "Thorough", "Bold", "Naive (for learning)"]);
    }
  }
  for (const a of all) {
    assert.equal(a.source.match(/Try this:/g)?.length, 1, `${shippedPath(a)}: exactly one "Try this:"`);
    assert.equal(readFileSync(new URL(`../${shippedPath(a)}`, import.meta.url), "utf8"), a.source, `${shippedPath(a)} is stale: run pnpm --filter @workspace/v2-agents render`);
  }
});

/** Score lines with an agent's own score function, in the sandbox, as wire strings ("worst" for WORST). */
async function agentScores(language: Language, family: string, params: Record<string, unknown>, tb: string | null, tie: string, lines: LineState[]): Promise<string[]> {
  const mc = lines.map(s => { const l = s.lines[0]!; return [`${-l.a}/${l.b}`, `${-l.c}/${l.b}`]; });
  const P = JSON.stringify(params);
  const args = tb === null ? `P, ${JSON.stringify(tie)}` : "P";
  const probe = language === "python"
    ? `\nP = ${P}\nPAIRS = ${JSON.stringify(mc)}\n\n\ndef agent(offer):\n    out = []\n    for m, c in PAIRS:\n        s = score(Fraction(m), Fraction(c), ${args})\n        out.append("worst" if s is None else ",".join("null" if x is None else str(Fraction(x)) for x in s))\n    return [move("probe", r=";".join(out))]\n`
    : `\nconst P = ${P}, PAIRS = ${JSON.stringify(mc)};\nfunction agent(offer) {\n  return [move("probe", { r: PAIRS.map(([m, c]) => { const s = score(Q.from(m), Q.from(c), ${args}); return s === null ? "worst" : s.map(x => x === null ? "null" : Q.toString(x)).join(","); }).join(";") })];\n}\n`;
  const source = scoreSource(family, tb, language as "typescript" | "python") + probe;
  const host = new EngineHost({ type: lineType, variant: lineZ, state: lines[0]!, rule: { family, params }, energy: 0 });
  const res = await (await boxes.get(language)).act({ source, offer: { object: 0 }, seed: "1", host, limits: { stepBudget: 5_000_000, wallMs: 20_000 } });
  assert.equal(res.ok, true, res.ok ? "" : res.error);
  return (JSON.parse(res.ok ? res.calls : "[]")[0].args.r as string).split(";");
}

test("an agent's own score is the engine's, for every family, its dealable numbers and tie-breakers, in both languages", async () => {
  const lines = (v: Variant, n: number) => births(lineType, v, "scores", n);
  const edge = [[0n, 1n, 0n], [0n, 1n, 5n], [-3n, 1n, 0n], [2n, 1n, -7n]].map(([a, b, c]) => ({ lines: [{ a: a!, b: b!, c: c! }] }));
  const sample = [...edge, ...lines(lineZ, 30), ...lines(lineQ, 30).filter(s => s.lines[0]!.b !== 0n)];   // y = mx + c only
  for (const e of LIVE) {
    const f = familyOf(e.family);
    const v = variantOf(e.family);
    for (const params of f.dealable(v) as Record<string, unknown>[]) {
      const lines = e.wholeLines ? sample.filter(s => s.lines[0]!.b === 1n) : sample;
      for (const tb of f.tieBreakers.filter(t => e.tieBreakers[t.id])) {
        const engine = lines.map(s => {
          const ev = evaluateSite(lineType, f, params, s, v, 0, tb.id), score = scoreToWire(ev.score);   // the utilities (decision 23)
          return score === null ? "worst" : score.map(x => x ?? "null").join(",");
        });
        const what = `${e.family} ${JSON.stringify(params)}/${tb.id}`;
        for (const language of ["typescript", "python"] as const) {
          assert.deepEqual(await agentScores(language, e.family, params, tb.id, tb.id, lines), engine, `${what} example, ${language}`);
          assert.deepEqual(await agentScores(language, e.family, params, null, tb.id, lines), engine, `${what} starters, ${language}`);
          if (e.wholeLines) {
            const fractions = sample.filter(s => s.lines[0]!.b !== 1n);
            assert.deepEqual(await agentScores(language, e.family, params, tb.id, tb.id, fractions), fractions.map(() => "worst"), `${what}: a whole-lines agent reads fraction lines as no score`);
          }
        }
      }
    }
  }
});

const program = (a: ShippedAgent) => ({ language: a.language, source: a.source });

test("both languages make the same moves, and no shipped agent fails on newborn lines, whole and rational", async () => {
  for (const variant of [lineZ, lineQ]) for (const ts of all.filter(a => a.language === "typescript" && LIVE.some(e => e.family === a.family))) {   // lines; grids: grid.test.ts
    const py = all.find(a => a.language === "python" && a.family === ts.family && a.kind === ts.kind && a.tieBreaker === ts.tieBreaker)!;
    const live = Object.keys(CATALOGUE.find(e => e.family === ts.family)!.tieBreakers).filter(tb => familyOf(ts.family).tieBreakers.some(t => t.id === tb));
    const tieBreaker = ts.tieBreaker ?? live[1] ?? live[0]!;   // starters: the second the family still has, not the default
    for (const [i, state] of births(lineType, variant, "parity", 3).entries()) {
      const records = [];
      for (const a of [ts, py]) {
        const { record } = await runAct(await boxes.get(a.language), {
          type: lineType, variant, state, rule: { family: a.family, params: paramsOf(a.family), tieBreaker }, program: program(a), seed: String(i), energy: 500,
        });
        assert.notEqual(record.outcome, "failed", `${shippedPath(a)} on ${variant.id} ${lineType.encode(state)}: ${record.reason}`);
        const { steps: _s, ...rest } = record;
        records.push(rest);
      }
      assert.deepEqual(records[1], records[0], `${ts.family} ${ts.title}: the languages differ on ${lineType.encode(state)}`);
    }
  }
});

test("each example gains value: on some newborn line its bits rise and the main part never falls (owner decision 23)", async () => {
  for (const e of LIVE) {
    const f = familyOf(e.family), params = paramsOf(e.family), v = variantOf(e.family);
    for (const tb of Object.keys(e.tieBreakers).filter(tb => f.tieBreakers.some(t => t.id === tb))) {
      const rule = { family: e.family, params, tieBreaker: tb };
      const vf = findValues(v.id, rule);
      if (!vf) continue;   // not valued yet: the score test above still checks it
      const look = valueLookup(vf);
      const utility = (s: LineState) => evaluateSite(lineType, f, params, s, v, 0, tb).score;
      const a = exampleFor(e.family, tb, "typescript")!;
      let rose = false;
      for (const start of births(lineType, v, `climb-${e.family}`, 4)) {
        let s = start;
        for (let t = 0; t < 25; t++) {
          const { record, state } = await runAct(await boxes.get("typescript"), {
            type: lineType, variant: v, state: s, rule, program: program(a), seed: String(t), energy: 1000,
          });
          assert.notEqual(record.outcome, "failed", record.reason);
          if (record.outcome === "skipped") break;
          s = state;
        }
        const u0 = utility(start), u1 = utility(s);
        assert.ok(u1 !== null || u0 === null, `${e.family}/${tb}: a scored line lost its score on ${lineType.encode(start)}`);
        if (u0 !== null && u1 !== null) assert.ok(Qn.cmp(u1[0]!, u0[0]!) >= 0, `${e.family}/${tb}: the main part fell on ${lineType.encode(start)}`);
        if (look(u1).bits > look(u0).bits) rose = true;
      }
      assert.ok(rose, `${e.family}/${tb}: no line's bits rose`);
    }
  }
});

test("every shipped agent is payable from its beginner preset's starting energy (lines 600, grids 900), at about the same price in both languages", () => {
  for (const a of all) {
    const price = summonBits(a.language, a.source).energy;
    const starting = isGridTypeFamily(a.family) ? GRID_BEGINNER_STARTING_ENERGY : BEGINNER_STARTING_ENERGY;
    assert.ok(price <= starting, `${shippedPath(a)} costs ${price.toFixed(1)} ⚡ of ${starting}`);
    if (a.language === "typescript") {
      const py = all.find(b => b.language === "python" && b.family === a.family && b.kind === a.kind && b.tieBreaker === a.tieBreaker)!;
      const ratio = summonBits("python", py.source).bits / summonBits("typescript", a.source).bits;
      assert.ok(ratio > 0.85 && ratio < 1.15, `${shippedPath(a)}: Python/TypeScript price ratio ${ratio.toFixed(2)}`);
    }
  }
});

test("summon price: comments are free, names cost once, the Q. prefix is JavaScript's operator", () => {
  const bare = summonBits("python", "def agent(offer):\n    return None\n");
  assert.equal(summonBits("python", "# a comment in plain words\ndef agent(offer):\n    return None  # skip\n").bits, bare.bits);
  const once = summonBits("python", "def agent(offer):\n    width = 1\n    return None\n").bits;
  const twice = summonBits("python", "def agent(offer):\n    width = 1\n    width = 1\n    return None\n").bits;
  assert.ok(twice - once < (once - bare.bits) / 2, "a second use of a name is cheaper than spelling it");
  assert.equal(summonBits("typescript", "function agent(offer) { return Q.add(c, k); }").bits, summonBits("typescript", "function agent(offer) { return add(c, k); }").bits);
  const decimal = (l: Language) => summonBits(l, "x = 0.5").bits - summonBits(l, "x = 7").bits;
  assert.equal(decimal("typescript"), decimal("python"), "a decimal costs the same in both");
  assert.equal(summonBits("typescript", "x = 5_000").tokens, summonBits("typescript", "x = 5").tokens, "a number with separators is one token");
  assert.ok(summonBits("python", `x = """${"data ".repeat(50)}"""`).bits > 1000, "a triple-quoted string is not a comment");
});

test("check: works, warns, fails and rejected, with the summon price and every act", async () => {
  const samples = births(lineType, lineZ, "check", 3).map((state, i) => ({ objectId: `o${i}`, state }));
  const run = (language: Language, source: string, s = samples) => boxes.get(language).then(box => check(box, {
    type: lineType, variant: lineZ, rule: { family: "m-meets-c", params: {} }, program: { language, source }, samples: s, energy: 100,
  }));
  const simple = all.find(a => a.family === "m-meets-c" && a.kind === "simple" && a.language === "python")!;
  const works = await run("python", simple.source);
  assert.equal(works.verdict, "works", works.summary);
  assert.equal(works.price, summonBits("python", simple.source).energy);
  assert.deepEqual(works.sample.map(s => s.objectId), ["o0", "o1", "o2"]);
  assert.equal(works.acts.length, 3);
  assert.equal((await run("typescript", "function agent(o) { return null; }")).verdict, "warns");
  const fails = await run("typescript", `function agent(o) { return [move("si.shift", { k: 0 })]; }`);
  assert.equal(fails.verdict, "fails");
  assert.match(fails.summary, /k/);
  const rejected = await run("python", "def agent(offer)\n    return None\n");
  assert.equal(rejected.verdict, "rejected");
  assert.equal(rejected.sample.length, 1, "a program that does not compile is tried once");
  assert.equal((await run("python", simple.source, [])).verdict, "warns", "no samples: nothing to try");
});

test("after a first summon at the first-agent share, the player's store can still hold the dearest shipped agent (ux 1.5, 3.7)", () => {
  const dearest = Math.max(...all.map(a => summonBits(a.language, a.source).energy));
  const e = LINES_BEGINNER_ECONOMY;
  const share = firstAgentShare({ allocated: 0, powerPerSecond: e.powerPerSecond, fullChargeSeconds: e.fullChargeSeconds, need: dearest });
  assert.ok(share !== undefined && share >= 0.65, `first agent's share ${share}`);
  assert.ok((1 - share) * e.powerPerSecond * e.fullChargeSeconds >= dearest, "the store's capacity holds the dearest agent");
});

test("on a rational line the starters clear a fraction their rule cares about: y = 2x + 7/3 goes to a whole intercept", async () => {
  const at = { lines: [fromMC(q(2), q(7, 3))] };
  for (const language of ["typescript", "python"] as const) {
    const simple = startersFor("whole-intercept", language).find(a => a.kind === "simple")!;
    const tieBreaker = familyOf("whole-intercept").tieBreakers[0]!.id;
    const { record, state } = await runAct(await boxes.get(language), {
      type: lineType, variant: lineQ, state: at, rule: { family: "whole-intercept", params: paramsOf("whole-intercept"), tieBreaker }, program: program(simple), seed: "1", energy: 500,
    });
    assert.equal(record.outcome, "committed", `${language}: ${record.reason}`);
    const v = new EngineHost({ type: lineType, variant: lineQ, state, rule: { family: "m-meets-c", params: {} }, energy: 0 }).handle({ op: "view", rep: "si" } as never, { hostCallsLeft: 5 }) as { result: { elements: { c: { q: string } } } };
    assert.ok(!v.result.elements.c.q.includes("/"), `${language}: the intercept is whole now (${v.result.elements.c.q})`);
  }
});

test("a vertical line is tipped, not skipped: the starters climb the tips (mirror or nudge b) in both languages", async () => {
  const at = { lines: [{ a: 1n, b: 0n, c: -3n }] };   // x = 3
  for (const language of ["typescript", "python"] as const) {
    const simple = startersFor("prime-landing", language).find(a => a.kind === "simple")!;
    const { record } = await runAct(await boxes.get(language), {
      type: lineType, variant: lineQ, state: at, rule: { family: "prime-landing", params: paramsOf("prime-landing"), tieBreaker: familyOf("prime-landing").tieBreakers[0]!.id }, program: program(simple), seed: "1", energy: 500,
    });
    assert.equal(record.outcome, "committed", `${language}: ${record.reason}`);
    assert.ok(["cart.mirror", "gen.nudge"].includes(record.calls[0]!.mutator), `${language}: ${record.calls[0]!.mutator}`);
  }
});
