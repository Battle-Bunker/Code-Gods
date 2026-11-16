/**
 * Agents on the coloured boards (lib/v2-grid-boards; board-starters.ts):
 *  - every board family has the four starters (and an example per tie-breaker);
 *  - an agent's own idea of the score is the engine's on sampled boards, in both languages, on digits and on cards;
 *  - the starters run on newborn boards in both languages, make the same moves, and none fails.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, scoreToWire, type Variant } from "@workspace/v2-core";
import { BOARD_FAMILIES, board4Type, board4rgb, board7Type, board7cards, type BoardState } from "@workspace/v2-grid-boards";
import type { Language } from "@workspace/v2-sandbox";
import { births, boardUndescribed, EngineHost, exampleFor, hasStarters, runAct, sandboxes, scoreSource, startersFor } from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());

test("every board family has the four starters, and examples for its tie-breakers", () => {
  assert.deepEqual(boardUndescribed(), []);
  for (const f of BOARD_FAMILIES) {
    assert.ok(hasStarters(f.id), f.id);
    for (const language of ["typescript", "python"] as const) {
      assert.deepEqual(startersFor(f.id, language).map(a => a.title), ["Simple", "Thorough", "Bold", "Naive (for learning)"]);
      for (const tb of f.tieBreakers) assert.ok(exampleFor(f.id, tb.id, language), `${f.id}/${tb.id}`);
    }
  }
});

/** The boards' cell names and how the agents see them (look(offer, "cells")): numbers, colour names, suits. */
const seen = (s: BoardState) => ({
  n: Math.round(Math.sqrt(s.sym.length)),
  v: s.sym.map(x => (s.cards ? (x % 13) + 1 : x)),
  c: s.col.map(c => ["red", "orange", "yellow", "green", "blue", "violet", "plain"][c]!),
  s: s.cards ? s.sym.map(x => ["spades", "hearts", "diamonds", "clubs"][Math.floor(x / 13)]!) : null,
});

async function agentScores(language: Language, type: typeof board4Type, variant: Variant, family: string, params: unknown, tb: string | null, tie: string | null, states: BoardState[]): Promise<string[]> {
  const P = JSON.stringify(params), BS = JSON.stringify(states.map(seen));
  const args = tb === null ? `P, ${tie === null ? (language === "python" ? "None" : "null") : JSON.stringify(tie)}` : "P";
  const probe = language === "python"
    ? `\nimport json\nP = json.loads(${JSON.stringify(P)})\n\n\nclass Board:\n    def __init__(self, d):\n        self.n, self.v, self.c, self.s = d["n"], d["v"], d["c"], d["s"]\n\n\nBOARDS = [Board(d) for d in json.loads(${JSON.stringify(BS)})]\n\n\ndef agent(offer):\n    return [move("probe", r=";".join(",".join(str(x) for x in score(b, ${args})) for b in BOARDS))]\n`
    : `\nconst P = ${P}, BOARDS = ${BS};\nfunction agent(offer) {\n  return [move("probe", { r: BOARDS.map(b => score(b, ${args}).map(String).join(",")).join(";") })];\n}\n`;
  const source = scoreSource(family, tb, language as "typescript" | "python") + probe;
  const h = new EngineHost({ type, variant, state: states[0]!, rule: { family, params }, energy: 0 });
  const res = await (await boxes.get(language)).act({ source, offer: { object: 0 }, seed: "1", host: h, limits: { stepBudget: 10_000_000, wallMs: 30_000 } });
  assert.equal(res.ok, true, res.ok ? "" : res.error);
  return (JSON.parse(res.ok ? res.calls : "[]")[0].args.r as string).split(";");
}

for (const [type, variant] of [[board4Type, board4rgb], [board7Type, board7cards]] as const) {
  test(`${variant.id}: an agent's own score is the engine's, for every family and parameter set sampled, in both languages`, async () => {
    const sample = births(type, variant, "scores", type === board4Type ? 24 : 6);   // the probe is a program of at most 16 KiB
    for (const f of BOARD_FAMILIES) {
      const all = f.dealable(variant) as unknown[];
      for (const params of all.filter((_, i) => i % Math.ceil(all.length / 4) === 0)) {
        for (const tb of [null, ...f.tieBreakers.map(t => t.id)]) {
          if (tb === null && f.tieBreakers.length) continue;
          const engine = sample.map(s => scoreToWire(evaluateSite(type, f as never, params, s, variant, 0, tb).score)!.join(","));
          for (const language of ["typescript", "python"] as const) {
            assert.deepEqual(await agentScores(language, type, variant, f.id, params, tb, null, sample), engine, `${f.id} ${JSON.stringify(params)}/${tb} (written for it), ${language}`);
            assert.deepEqual(await agentScores(language, type, variant, f.id, params, null, tb, sample), engine, `${f.id} ${JSON.stringify(params)}/${tb} (reading it), ${language}`);
          }
        }
      }
    }
  });
}

test("the starters run on a newborn 4×4 board in both languages, agree, and none fails", async () => {
  const [state] = births(board4Type, board4rgb, "run", 1);
  for (const f of BOARD_FAMILIES) {
    const params = f.dealable(board4rgb)[0];
    const tieBreaker = f.tieBreakers[0]?.id ?? null;
    const rule = { family: f.id, params, tieBreaker };
    const [ts, py] = (["typescript", "python"] as const).map(l => startersFor(f.id, l, tieBreaker));
    for (const [i, a] of ts!.entries()) {
      const records = [];
      for (const x of [a, py![i]!]) {
        const { record } = await runAct(await boxes.get(x.language), { type: board4Type, variant: board4rgb, state: state!, rule, program: { language: x.language, source: x.source }, seed: "1", energy: 500 });
        assert.notEqual(record.outcome, "failed", `${f.id} ${x.title} (${x.language}): ${record.reason}`);
        const { steps: _s, ...rest } = record;
        records.push(rest);
      }
      assert.deepEqual(records[1], records[0], `${f.id} ${a.title}: the languages differ`);
    }
  }
});
