/**
 * BOARD_CATALOGUE_A (the old Mirrormancer, Magic Eighteen, Opposite Nines and Two Pair on the coloured boards): an
 * agent's own score is the engine's on 24 newborn 4×4 boards, for every dealt parameter set and tie-breaker, in both
 * languages, written for the tie-breaker and reading it (as test/boards.test.ts checks BOARD_CATALOGUE).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, scoreToWire, type RuleFamily } from "@workspace/v2-core";
import { board4Type, board4rgb, type BoardState } from "@workspace/v2-grid-boards";
import { V1_NUMBERS_A } from "../../v2-grid-boards/src/families/v1-numbers-a.ts";
import type { Language } from "@workspace/v2-sandbox";
import { births, EngineHost, sandboxes } from "../src/index.ts";
import type { BoardFamilyEntry } from "../src/board-starters.ts";
import { BOARD_CATALOGUE_A } from "../src/board-catalogue-a.ts";

const boxes = sandboxes();
after(() => boxes.close());

const FAMILIES = V1_NUMBERS_A.map(make => make() as unknown as RuleFamily<BoardState, unknown>);
const type = { ...board4Type, families: [...board4Type.families, ...FAMILIES] } as typeof board4Type;

/** The score function as board-starters.ts renders it (scoreTs / scorePy, which it does not export). */
function scoreTs(e: BoardFamilyEntry, tieBreaker: string | null): string[] {
  const out = [`function score(B, p${tieBreaker === null ? ", tie" : ""}) {`, ...e.main.ts.map(l => `  ${l}`)];
  if (tieBreaker !== null) out.push(`  return [main, ${e.tieBreakers[tieBreaker]!.ts}];`);
  else {
    for (const [id, t] of Object.entries(e.tieBreakers)) out.push(`  if (tie === ${JSON.stringify(id)}) return [main, ${t.ts}];`);
    out.push("  return [main];");
  }
  out.push("}");
  return out;
}
function scorePy(e: BoardFamilyEntry, tieBreaker: string | null): string[] {
  const out = [`def score(B, p${tieBreaker === null ? ", tie" : ""}):`, ...e.main.py.map(l => `    ${l}`)];
  if (tieBreaker !== null) out.push(`    return [main, ${e.tieBreakers[tieBreaker]!.py}]`);
  else {
    for (const [id, t] of Object.entries(e.tieBreakers)) out.push(`    if tie == ${JSON.stringify(id)}:`, `        return [main, ${t.py}]`);
    out.push("    return [main]");
  }
  return out;
}

const seen = (s: BoardState) => ({
  n: Math.round(Math.sqrt(s.sym.length)),
  v: s.sym.map(x => (s.cards ? (x % 13) + 1 : x)),
  c: s.col.map(c => ["red", "orange", "yellow", "green", "blue", "violet", "plain"][c]!),
  s: s.cards ? s.sym.map(x => ["spades", "hearts", "diamonds", "clubs"][Math.floor(x / 13)]!) : null,
});

async function agentScores(language: Language, e: BoardFamilyEntry, params: unknown, tb: string | null, tie: string | null, states: BoardState[]): Promise<string[]> {
  const P = JSON.stringify(params), BS = JSON.stringify(states.map(seen));
  const args = tb === null ? `P, ${tie === null ? (language === "python" ? "None" : "null") : JSON.stringify(tie)}` : "P";
  const probe = language === "python"
    ? `\nimport json\nP = json.loads(${JSON.stringify(P)})\n\n\nclass Board:\n    def __init__(self, d):\n        self.n, self.v, self.c, self.s = d["n"], d["v"], d["c"], d["s"]\n\n\nBOARDS = [Board(d) for d in json.loads(${JSON.stringify(BS)})]\n\n\ndef agent(offer):\n    return [move("probe", r=";".join(",".join(str(x) for x in score(b, ${args})) for b in BOARDS))]\n`
    : `\nconst P = ${P}, BOARDS = ${BS};\nfunction agent(offer) {\n  return [move("probe", { r: BOARDS.map(b => score(b, ${args}).map(String).join(",")).join(";") })];\n}\n`;
  const source = (language === "python" ? scorePy(e, tb) : scoreTs(e, tb)).join("\n") + "\n" + probe;
  const h = new EngineHost({ type, variant: board4rgb, state: states[0]!, rule: { family: e.family, params }, energy: 0 });
  const res = await (await boxes.get(language)).act({ source, offer: { object: 0 }, seed: "1", host: h, limits: { stepBudget: 10_000_000, wallMs: 30_000 } });
  assert.equal(res.ok, true, res.ok ? "" : res.error);
  return (JSON.parse(res.ok ? res.calls : "[]")[0].args.r as string).split(";");
}

test("every family has an entry, with exactly its tie-breakers", () => {
  assert.deepEqual(BOARD_CATALOGUE_A.map(e => e.family), FAMILIES.map(f => f.id));
  for (const f of FAMILIES) assert.deepEqual(Object.keys(BOARD_CATALOGUE_A.find(e => e.family === f.id)!.tieBreakers), f.tieBreakers.map(t => t.id));
});

test("no entry says 'line' or uses a pictograph", () => {
  const text = JSON.stringify(BOARD_CATALOGUE_A);
  assert.doesNotMatch(text, /\blines?\b/i);
  assert.doesNotMatch(text, /[☀-➿]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/);
});

test("board4rgb: an agent's own score is the engine's, for every family, parameter set and tie-breaker, in both languages", async () => {
  const sample = births(board4Type, board4rgb, "scores", 24);
  for (const f of FAMILIES) {
    const e = BOARD_CATALOGUE_A.find(x => x.family === f.id)!;
    const all = f.dealable(board4rgb);
    assert.ok(all.length > 0, f.id);
    for (const params of all) {
      for (const tb of [null, ...f.tieBreakers.map(t => t.id)]) {
        const engine = sample.map(s => scoreToWire(evaluateSite(board4Type, f, params, s, board4rgb, 0, tb).score)!.join(","));
        for (const language of ["typescript", "python"] as const) {
          assert.deepEqual(await agentScores(language, e, params, tb, null, sample), engine, `${f.id} ${JSON.stringify(params)}/${tb} (written for it), ${language}`);
          assert.deepEqual(await agentScores(language, e, params, null, tb, sample), engine, `${f.id} ${JSON.stringify(params)}/${tb} (reading it), ${language}`);
        }
      }
    }
  }
});
