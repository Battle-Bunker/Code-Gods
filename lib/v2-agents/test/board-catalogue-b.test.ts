/**
 * The agents' own scores for the old beginner number rules on the coloured boards (board-catalogue-b.ts) are the
 * engine's, for every family, its dealt parameters and each of its tie-breakers, on 24 newborn 4×4 boards, in both
 * languages. Modelled on boards.test.ts's agentScores test; the score rendering is copied from board-starters.ts (it is
 * not exported) so the entries can be checked before they are registered.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, scoreToWire, type ObjectType } from "@workspace/v2-core";
import { board4Type, board4rgb, type BoardState } from "@workspace/v2-grid-boards";
import { originalCrosswiseThrees, originalLeapfrog, originalSpreadThree, originalStrangers } from "../../v2-grid-boards/src/families/v1-numbers-b.ts";
import type { Language } from "@workspace/v2-sandbox";
import { births, EngineHost, sandboxes } from "../src/index.ts";
import { BOARD_CATALOGUE_B } from "../src/board-catalogue-b.ts";
import type { BoardFamilyEntry } from "../src/board-starters.ts";

const boxes = sandboxes();
after(() => boxes.close());

const FAMILIES = [originalSpreadThree(), originalStrangers(), originalLeapfrog(), originalCrosswiseThrees()];
/** board4 with these families (not yet registered), so the host can deal them. */
const type: ObjectType<BoardState> = { ...board4Type, families: [...board4Type.families, ...FAMILIES] as typeof board4Type.families };

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
  const source = (language === "typescript" ? scoreTs(e, tb) : scorePy(e, tb)).join("\n") + "\n" + probe;
  const h = new EngineHost({ type, variant: board4rgb, state: states[0]!, rule: { family: e.family, params }, energy: 0 });
  const res = await (await boxes.get(language)).act({ source, offer: { object: 0 }, seed: "1", host: h, limits: { stepBudget: 10_000_000, wallMs: 30_000 } });
  assert.equal(res.ok, true, res.ok ? "" : res.error);
  return (JSON.parse(res.ok ? res.calls : "[]")[0].args.r as string).split(";");
}

test("every family has an entry, with exactly its tie-breakers, and no entry says \"line\"", () => {
  assert.deepEqual(BOARD_CATALOGUE_B.map(e => e.family), FAMILIES.map(f => f.id));
  for (const [i, e] of BOARD_CATALOGUE_B.entries()) {
    assert.deepEqual(Object.keys(e.tieBreakers), FAMILIES[i]!.tieBreakers.map(t => t.id), e.family);
    assert.doesNotMatch(JSON.stringify(e), /\blines?\b/i, e.family);
  }
});

test("board-4-base10-rgb: an agent's own score is the engine's, for every family, parameter set and tie-breaker, in both languages", async () => {
  const sample = births(type, board4rgb, "scores", 24);
  for (const f of FAMILIES) {
    const e = BOARD_CATALOGUE_B.find(x => x.family === f.id)!;
    const all = f.dealable(board4rgb) as unknown[];
    assert.ok(all.length > 0, f.id);
    for (const params of all.filter((_, i) => i % Math.ceil(all.length / 4) === 0)) {
      for (const tb of [null, ...f.tieBreakers.map(t => t.id)]) {
        const engine = sample.map(s => scoreToWire(evaluateSite(type, f as never, params, s, board4rgb, 0, tb).score)!.join(","));
        for (const language of ["typescript", "python"] as const) {
          if (tb !== null || !f.tieBreakers.length) assert.deepEqual(await agentScores(language, e, params, tb, null, sample), engine, `${f.id} ${JSON.stringify(params)}/${tb} (written for it), ${language}`);
          assert.deepEqual(await agentScores(language, e, params, null, tb, sample), engine, `${f.id} ${JSON.stringify(params)}/${tb} (reading it), ${language}`);
        }
      }
    }
  }
});
