/**
 * The two-line pairs' shipped agents (src/pair-starters.ts): every agent's own score is the engine's for every dealt
 * family and tie-breaker, in both languages; every starter acts on newborn pairs without failing, and its steps are
 * ones the game accepts.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { applyCalls, evaluateSite, isInvalid, scoreToWire } from "@workspace/v2-core";
import { pairPresets, pairQ, pairType, UNDEALT, type PairState } from "@workspace/v2-pair";
import {
  births, EngineHost, hasStarters, isPairFamily, PAIR_CATALOGUE, pairUndescribed, runAct, sandboxes, scoreSource, shippedAgents, startersFor,
} from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());
const familyOf = (id: string) => pairType.families.find(f => f.id === id)!;
const DEALT = pairPresets[0].rules.map(r => r.family);

test("every dealt pair family has shipped agents, and the catalogue covers each of its tie-breakers", () => {
  for (const f of DEALT) assert.ok(hasStarters(f) && isPairFamily(f), `${f} has starters`);
  assert.deepEqual(pairUndescribed().filter(x => !UNDEALT.has(x.split("/")[0]!)), []);
  assert.ok(PAIR_CATALOGUE.every(e => !UNDEALT.has(e.family)));
});

/** Lines as the probe passes them: "a,b,c;a,b,c". */
const wire = (s: PairState) => s.lines.map(l => `${l.a},${l.b},${l.c}`).join(";");
const EDGE: PairState[] = [
  "0,1,-3;1,0,-2",     // y = 3 and x = 2: a vertical and a flat line
  "-2,1,-5;-2,1,0",    // parallel
  "-1,1,0;1,1,-4",     // perpendicular through (2, 2)
  "-3,1,-1;-1,1,-2",   // the steeper three times as steep
  "-1,2,-6;1,0,4",     // a vertical line
  "-1,1,-3;0,1,-7",    // one flat line
].map(w => pairType.decode(w));

async function agentScores(language: "typescript" | "python", family: string, tb: string | null, tie: string, states: PairState[]): Promise<string[]> {
  const L = JSON.stringify(states.map(wire));
  const args = tb === null ? `{}, ${JSON.stringify(tie)}` : "{}";
  const probe = language === "python"
    ? `\nSTATES = ${L}\n\n\ndef agent(offer):\n    out = []\n    for w in STATES:\n        s = score([[Fraction(int(x)) for x in l.split(",")] for l in w.split(";")], ${args})\n        out.append("worst" if s is None else ",".join("null" if x is None else str(Fraction(x)) for x in s))\n    return [move("probe", r=";".join(out))]\n`
    : `\nconst STATES = ${L};\nfunction agent(offer) {\n  return [move("probe", { r: STATES.map(w => { const s = score(w.split(";").map(l => l.split(",").map(x => Q.from(x))), ${args}); return s === null ? "worst" : s.map(x => x === null ? "null" : Q.toString(Q.from(x))).join(","); }).join(";") })];\n}\n`;
  const source = scoreSource(family, tb, language) + probe;
  const host = new EngineHost({ type: pairType, variant: pairQ, state: states[0]!, rule: { family, params: {} }, energy: 0 });
  const res = await (await boxes.get(language)).act({ source, offer: { object: 0 }, seed: "1", host, limits: { stepBudget: 5_000_000, wallMs: 20_000 } });
  assert.equal(res.ok, true, res.ok ? "" : res.error);
  return (JSON.parse(res.ok ? res.calls : "[]")[0].args.r as string).split(";");
}

test("a pair agent's own score is the engine's, for every dealt family and tie-breaker, in both languages", async () => {
  const states = [...EDGE, ...births(pairType, pairQ, "pair-scores", 40)];
  for (const family of DEALT) {
    const f = familyOf(family);
    for (const tb of f.tieBreakers) {
      const engine = states.map(s => {
        const score = scoreToWire(evaluateSite(pairType, f, {}, s, pairQ, 0, tb.id).score);
        return score === null ? "worst" : score.map(x => x ?? "null").join(",");
      });
      for (const language of ["typescript", "python"] as const) {
        assert.deepEqual(await agentScores(language, family, tb.id, tb.id, states), engine, `${family}/${tb.id} example, ${language}`);
        assert.deepEqual(await agentScores(language, family, null, tb.id, states), engine, `${family}/${tb.id} starters, ${language}`);
      }
    }
  }
});

test("every pair starter acts on newborn pairs without failing, and makes only moves the game accepts", async () => {
  const starts = births(pairType, pairQ, "pair-acts", 3);
  let moved = 0;
  for (const family of DEALT) for (const language of ["typescript", "python"] as const) for (const a of startersFor(family, language)) {
    const tieBreaker = familyOf(family).tieBreakers[0]!.id;
    for (const [i, state] of starts.entries()) {
      const { record } = await runAct(await boxes.get(language), {
        type: pairType, variant: pairQ, state, rule: { family, params: {}, tieBreaker }, program: { language, source: a.source }, seed: String(i), energy: 600,
      });
      assert.ok(record.outcome === "committed" || record.outcome === "skipped", `${family} ${a.kind} ${language} on ${pairType.encode(state)}: ${record.outcome} ${record.reason ?? ""}`);
      if (record.outcome === "committed") moved++;
    }
  }
  assert.ok(moved > 0, "some starter moved");
});

test("pair agents are among the shipped agents, in both languages", () => {
  const all = shippedAgents().filter(a => isPairFamily(a.family));
  for (const family of DEALT) for (const language of ["typescript", "python"] as const) {
    assert.equal(all.filter(a => a.family === family && a.language === language && a.kind !== "example").length, 4);
    assert.equal(all.filter(a => a.family === family && a.language === language && a.kind === "example").length, familyOf(family).tieBreakers.length);
  }
});

test("the two-line kit's steps land where the game puts them: every step pairSteps predicts is the engine's result", async () => {
  const states = [...EDGE, ...births(pairType, pairQ, "pair-steps", 12)];
  const KINDS = JSON.stringify(["shift", "tilt", "stretch", "turn", "slide", "combine", "reflect", "quarter"]);
  for (const language of ["typescript", "python"] as const) {
    const probe = language === "python"
      ? `STATES = ${JSON.stringify(states.map(wire))}\n\n\ndef agent(offer):\n    out = []\n    for w in STATES:\n        L = [[Fraction(int(x)) for x in l.split(",")] for l in w.split(";")]\n        for c, L2 in pair_steps(L, 2, ${KINDS}):\n            out.append(c["mutator"] + "|" + ",".join(k + "=" + str(v) for k, v in sorted(c["args"].items())) + "|" + ";".join(",".join(str(int(x)) for x in l) for l in L2))\n        out.append("#")\n    return [move("probe", r=" ".join(out))]\n`
      : `const STATES = ${JSON.stringify(states.map(wire))};\nfunction agent(offer) {\n  const out = [];\n  for (const w of STATES) {\n    const L = w.split(";").map(l => l.split(",").map(x => Q.from(x)));\n    for (const [c, L2] of pairSteps(L, 2, ${KINDS})) out.push(c.mutator + "|" + Object.keys(c.args).sort().map(k => k + "=" + c.args[k]).join(",") + "|" + L2.map(l => l.map(x => Q.toString(x)).join(",")).join(";"));\n    out.push("#");\n  }\n  return [move("probe", { r: out.join(" ") })];\n}\n`;
    const host = new EngineHost({ type: pairType, variant: pairQ, state: states[0]!, rule: { family: "whole-answer", params: {} }, energy: 0 });
    const res = await (await boxes.get(language)).act({ source: probe, offer: { object: 0 }, seed: "1", host, limits: { stepBudget: 10_000_000, wallMs: 30_000 } });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    const groups = (JSON.parse(res.ok ? res.calls : "[]")[0].args.r as string).split(" #").map(g => g.trim()).slice(0, states.length);
    let checked = 0;
    groups.forEach((g, i) => {
      for (const item of g.split(" ").filter(x => x && x !== "#")) {
        const [mutator, args, after] = item.split("|") as [string, string, string];
        const a = Object.fromEntries(args.split(",").map(kv => kv.split("=") as [string, string]));
        const applied = applyCalls(pairType, pairQ, states[i]!, [{ mutator, site: 0, args: a }]);
        assert.ok(!isInvalid(applied), `${language}: ${mutator} ${args} on ${wire(states[i]!)} is refused by the game (${isInvalid(applied) ? applied.invalid : ""})`);
        if (!isInvalid(applied)) assert.equal(wire(applied.result), after, `${language}: ${mutator} ${args} on ${wire(states[i]!)}`);
        checked++;
      }
    });
    assert.ok(checked > 100, `${language}: ${checked} steps checked`);
  }
});
