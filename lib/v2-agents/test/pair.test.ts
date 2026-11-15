/**
 * Agents on pairs of lines (lib/v2-pair) and their shipped agents (pair-starters.ts):
 *  - every dealt pair family has an example per tie-breaker and the four starters, and hasStarters says so;
 *  - an agent's own idea of the score is the engine's on sampled pairs (odd ones too), in both languages;
 *  - both languages make the same moves on newborn pairs, and no agent fails;
 *  - the starters climb for points: no step they take lowers their owner's points.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, scoreToWire } from "@workspace/v2-core";
import { normalise, type Line } from "@workspace/v2-linear";
import { canonicalPair, pairPresets, pairQ, pairType, type PairState } from "@workspace/v2-pair";
import type { Language } from "@workspace/v2-sandbox";
import { births, exampleFor, hasStarters, runAct, sandboxes, scoreSource, shippedAgents, startersFor, watcherFor, type ShippedAgent } from "../src/index.ts";
import { valuer } from "../src/harness.ts";

const boxes = sandboxes();
after(() => boxes.close());
const DEALT = pairPresets[0].rules.map(r => r.family);
const familyOf = (id: string) => pairType.families.find(f => f.id === id)!;
const program = (a: ShippedAgent) => ({ language: a.language, source: a.source });
const L = (a: number, b: number, c: number) => normalise(BigInt(a), BigInt(b), BigInt(c)) as Line;
const sys = (l: Line, m: Line) => canonicalPair([l, m], pairQ) as PairState;

test("every dealt pair family has shipped agents; On the Diagonal (not dealt) has none", () => {
  for (const f of pairType.families) {
    const dealt = DEALT.includes(f.id);
    assert.equal(hasStarters(f.id), dealt, f.id);
    for (const language of ["typescript", "python"] as const) {
      if (!dealt) { assert.deepEqual(startersFor(f.id, language), []); continue; }
      for (const t of f.tieBreakers) assert.ok(exampleFor(f.id, t.id, language), `${f.id}/${t.id} ${language}`);
      assert.deepEqual(startersFor(f.id, language, f.tieBreakers[0]!.id).map(a => a.title), ["Simple", "Thorough", "Bold", "Naive (for learning)"]);
    }
  }
  assert.match(watcherFor("pairs", "python").source, /look\(offer, "eqs"\)/);
});

const toWire = (x: unknown) => (x === null ? "null" : String(x));
async function agentScores(language: Language, family: string, tb: string, states: PairState[]): Promise<string[]> {
  const S = states.map(s => s.lines.map(l => [l.a, l.b, l.c].map(String)));
  const probe = language === "python"
    ? `\nSTATES = ${JSON.stringify(S)}\n\n\ndef agent(offer):\n    out = []\n    for P in STATES:\n        s = score(tuple(tuple(int(x) for x in l) for l in P), ${JSON.stringify(tb)})\n        out.append("null" if s is None else ",".join("null" if x is None else str(x) for x in s))\n    return [move("probe", r=";".join(out))]\n`
    : `\nconst STATES = ${JSON.stringify(S)};\nconst W = x => (x === null ? "null" : x.d === 1n ? String(x.n) : x.n + "/" + x.d);\nfunction agent(offer) {\n  return [move("probe", { r: STATES.map(P => { const s = score(P.map(l => l.map(BigInt)), ${JSON.stringify(tb)}); return s === null ? "null" : s.map(W).join(","); }).join(";") })];\n}\n`;
  const { EngineHost } = await import("../src/index.ts");
  const h = new EngineHost({ type: pairType, variant: pairQ, state: states[0]!, rule: { family, params: {} }, energy: 0 });
  const res = await (await boxes.get(language)).act({ source: scoreSource(family, tb, language as "typescript" | "python") + probe, offer: { object: 0 }, seed: "1", host: h, limits: { stepBudget: 10_000_000, wallMs: 30_000 } });
  assert.equal(res.ok, true, res.ok ? "" : res.error);
  return (JSON.parse(res.ok ? res.calls : "[]")[0].args.r as string).split(";");
}

test("a pair agent's own score is the engine's on sampled pairs (vertical, flat, parallel, through the origin), in both languages", async () => {
  const odd = [
    sys(L(0, 1, 0), L(1, 0, 0)), sys(L(2, 3, -12), L(1, -1, -1)), sys(L(-2, 1, -1), L(-2, 1, 3)), sys(L(1, 0, -3), L(-3, 1, -1)),
    sys(L(0, 1, -4), L(1, 1, 0)), sys(L(-6, 1, 0), L(-2, 1, -5)), sys(L(-5, 4, 20), L(4, 5, -180)), sys(L(-9, 14, 5), L(-2, 3, -104)),
  ];
  const sample = [...odd, ...births(pairType, pairQ, "scores", 40)];
  for (const id of DEALT) {
    const f = familyOf(id);
    for (const tb of f.tieBreakers) {
      const engine = sample.map(s => { const w = scoreToWire(evaluateSite(pairType, f, {}, s, pairQ, 0, tb.id).score); return w === null ? "null" : w.map(toWire).join(","); });
      for (const language of ["typescript", "python"] as const) assert.deepEqual(await agentScores(language, id, tb.id, sample), engine, `${id}/${tb.id}, ${language}`);
    }
  }
});

test("both languages make the same moves on newborn pairs, with and without what the pair is worth, and no pair agent fails", async () => {
  const states = births(pairType, pairQ, "parity", 2);
  const all = shippedAgents().filter(a => DEALT.includes(a.family));
  for (const ts of all.filter(a => a.language === "typescript")) {
    const py = all.find(a => a.language === "python" && a.family === ts.family && a.kind === ts.kind && a.tieBreaker === ts.tieBreaker)!;
    const rule = { family: ts.family, params: {}, tieBreaker: ts.tieBreaker! };
    const v = valuer(pairType, pairQ, rule);
    assert.ok(v.values, `${ts.family}/${ts.tieBreaker}: no committed value function`);
    for (const [i, state] of states.entries()) for (const others of [undefined, 30]) {
      const told = others === undefined ? {} : { values: v.values, value: { mine: v.bits(state), others, points: v.bits(state) * others } };
      const records = [];
      for (const a of [ts, py]) {
        const { record } = await runAct(await boxes.get(a.language), { type: pairType, variant: pairQ, state, rule, program: program(a), seed: String(i), energy: 500, ...told });
        assert.notEqual(record.outcome, "failed", `${a.family}/${a.tieBreaker} ${a.title} (${a.language}) on ${pairType.encode(state)}: ${record.reason}`);
        const { steps: _s, ...rest } = record;
        records.push(rest);
      }
      assert.deepEqual(records[1], records[0], `${ts.family}/${ts.tieBreaker} ${ts.title}: the languages differ on ${pairType.encode(state)}`);
    }
  }
});

test("the starters climb for points: no step they take lowers their owner's points (rarity × the others')", async () => {
  const rule = { family: "whole-answer", params: {}, tieBreaker: "peg-divisor" };
  const opp = { family: "right-angle", params: {}, tieBreaker: "prime-divisor" };
  const mine = valuer(pairType, pairQ, rule), them = valuer(pairType, pairQ, opp);
  const points = (s: PairState) => mine.bits(s) * them.bits(s);
  const others = [{ rule: opp, values: them.values! }];
  let moved = 0;
  for (const a of startersFor("whole-answer", "typescript", "peg-divisor").filter(x => x.kind !== "naive")) {
    for (const [i, start] of births(pairType, pairQ, "climb-points", 4).entries()) {
      const value = { mine: mine.bits(start), others: them.bits(start), points: points(start) };
      const { record, state } = await runAct(await boxes.get("typescript"), { type: pairType, variant: pairQ, state: start, rule, program: program(a), seed: String(i), energy: 600, values: mine.values, value, others });
      assert.notEqual(record.outcome, "failed", `${a.title}: ${record.reason}`);
      if (record.outcome !== "committed") continue;
      moved++;
      assert.ok(points(state) > points(start) - 1e-9, `${a.title} lowered its owner's points on ${pairType.encode(start)}`);
    }
  }
  assert.ok(moved > 0, "no starter moved (the test would prove nothing)");
});
