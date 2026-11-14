/**
 * The shipped agents (examples per tie-breaker, Simple/Thorough/Bold starters per family), generated in both
 * languages from catalogue.ts:
 *  - every family and tie-breaker of lib/v2-linear has them, each with exactly one "Try this:", and the rendered
 *    copies under agents/ are up to date;
 *  - an agent's own idea of the score is the engine's, on whole-number and fraction lines;
 *  - both languages make the same moves, and no agent fails on newborn lines;
 *  - each example climbs both rungs of its rule (ux: a beginner's first agent visibly works);
 *  - every one is payable from the beginner preset's starting energy, at about the same price in both languages.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateSite, layerLadders, levelOf, scoreToWire, type Variant } from "@workspace/v2-core";
import { firstAgentShare, LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { lineType, lineQ, lineZ, type LineState } from "@workspace/v2-linear";
import type { Language } from "@workspace/v2-sandbox";
import {
  BEGINNER_STARTING_ENERGY, births, CATALOGUE, check, stale, undescribed, EngineHost, exampleFor, runAct, sandboxes, scoreSource, shippedAgents, shippedPath,
  summonBits, type ShippedAgent,
} from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());
const all = shippedAgents();
const familyOf = (id: string) => lineType.families.find(f => f.id === id)!;
/** The catalogue entries v2-linear still deals. */
const LIVE = CATALOGUE.filter(e => lineType.families.some(f => f.id === e.family));
const paramsOf = (id: string) => familyOf(id).dealable(lineZ)[0] as Record<string, unknown>;

test("families and tie-breakers without shipped agents yet (a catalogue entry each)", t => {
  const missing = undescribed(), gone = stale();
  if (missing.length) t.todo(`no examples or starters yet for ${missing.join(", ")}: add them to lib/v2-agents/src/catalogue.ts`);
  if (gone.length) t.todo(`catalogue entries v2-linear no longer has: ${gone.join(", ")}`);
});

test("every described family has an example per described tie-breaker and the three starters, in both languages", () => {
  for (const e of LIVE) {
    const f = familyOf(e.family);
    for (const language of ["typescript", "python"] as const) {
      for (const tb of Object.keys(e.tieBreakers).filter(tb => f.tieBreakers.some(t => t.id === tb))) {
        assert.ok(exampleFor(f.id, tb, language), `${f.id}: no ${language} example for ${tb}`);
      }
      assert.deepEqual(all.filter(a => a.family === f.id && a.language === language && a.kind !== "example").map(a => a.title), ["Simple", "Thorough", "Bold"]);
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
    for (const params of f.dealable(lineZ) as Record<string, unknown>[]) {
      for (const tb of f.tieBreakers.filter(t => e.tieBreakers[t.id])) {
        const engine = sample.map(s => {
          const score = scoreToWire(evaluateSite(lineType, f, params, s, lineZ, 0, tb.id).score);
          return score === null ? "worst" : score.map(x => x ?? "null").join(",");
        });
        const what = `${e.family} ${JSON.stringify(params)}/${tb.id}`;
        for (const language of ["typescript", "python"] as const) {
          assert.deepEqual(await agentScores(language, e.family, params, tb.id, tb.id, sample), engine, `${what} example, ${language}`);
          assert.deepEqual(await agentScores(language, e.family, params, null, tb.id, sample), engine, `${what} starters, ${language}`);
        }
      }
    }
  }
});

const program = (a: ShippedAgent) => ({ language: a.language, source: a.source });

test("both languages make the same moves, and no shipped agent fails on newborn lines", async () => {
  const states = births(lineType, lineZ, "parity", 3);
  for (const ts of all.filter(a => a.language === "typescript")) {
    const py = all.find(a => a.language === "python" && a.family === ts.family && a.kind === ts.kind && a.tieBreaker === ts.tieBreaker)!;
    const tieBreaker = ts.tieBreaker ?? Object.keys(CATALOGUE.find(e => e.family === ts.family)!.tieBreakers)[1]!;   // starters: the second, not the default
    for (const [i, state] of states.entries()) {
      const records = [];
      for (const a of [ts, py]) {
        const { record } = await runAct(await boxes.get(a.language), {
          type: lineType, variant: lineZ, state, rule: { family: a.family, params: paramsOf(a.family), tieBreaker }, program: program(a), seed: String(i), energy: 500,
        });
        assert.notEqual(record.outcome, "failed", `${shippedPath(a)} on ${lineType.encode(state)}: ${record.reason}`);
        const { steps: _s, ...rest } = record;
        records.push(rest);
      }
      assert.deepEqual(records[1], records[0], `${ts.family} ${ts.title}: the languages differ on ${lineType.encode(state)}`);
    }
  }
});

test("each example climbs both rungs: some line reaches the main part's top, some line's tie-breaker rises", async () => {
  for (const e of LIVE) {
    const f = familyOf(e.family), params = paramsOf(e.family);
    for (const tb of Object.keys(e.tieBreakers).filter(tb => f.tieBreakers.some(t => t.id === tb))) {
      const ladders = layerLadders(f, params, lineZ, tb);
      const levels = (s: LineState) => {
        const sc = evaluateSite(lineType, f, params, s, lineZ, 0, tb).score;
        return ladders.map((r, j) => levelOf(sc === null ? null : [sc[j] ?? null], r));
      };
      const a = exampleFor(e.family, tb, "typescript")!;
      let mainTop = false, tieUp = false;
      for (const start of births(lineType, lineZ, `climb-${e.family}`, 4)) {
        let s = start;
        for (let t = 0; t < 25; t++) {
          const { record, state } = await runAct(await boxes.get("typescript"), {
            type: lineType, variant: lineZ, state: s, rule: { family: e.family, params, tieBreaker: tb }, program: program(a), seed: String(t), energy: 1000,
          });
          assert.notEqual(record.outcome, "failed", record.reason);
          if (record.outcome === "skipped") break;
          s = state;
        }
        const [m0, t0] = levels(start), [m1, t1] = levels(s);
        assert.ok(m1! >= m0!, `${e.family}/${tb}: the main part fell on ${lineType.encode(start)}`);
        if (m1 === ladders[0]!.length - 1) mainTop = true;
        if (t1! > t0!) tieUp = true;
      }
      assert.ok(mainTop, `${e.family}/${tb}: no line reached the main part's top`);
      assert.ok(tieUp, `${e.family}/${tb}: no line's tie-breaker rose`);
    }
  }
});

test("every shipped agent is payable from the beginner preset's starting energy, at about the same price in both languages", () => {
  for (const a of all) {
    const price = summonBits(a.language, a.source).energy;
    assert.ok(price <= BEGINNER_STARTING_ENERGY, `${shippedPath(a)} costs ${price.toFixed(1)} ⚡`);
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
