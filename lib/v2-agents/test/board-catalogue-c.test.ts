/**
 * The agents' scores for Magic Accountant, Number Bonds, Stepping Stones and Kings and Subjects on the coloured boards
 * (src/board-catalogue-c.ts) are the engine's, on newborn boards, in both languages, written for a tie-breaker and
 * reading it (as test/boards.test.ts checks the shipped ones).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, scoreToWire, type RuleFamily, type Variant } from "@workspace/v2-core";
import { board4Type, board4rgb, board7Type, board7cards, type BoardState } from "@workspace/v2-grid-boards";
import { originalKingsAndSubjects, originalMagicAccountant, originalNumberBonds, originalSteppingStones } from "../../v2-grid-boards/src/families/v1-numbers-c.ts";
import type { Language } from "@workspace/v2-sandbox";
import { births, EngineHost, sandboxes } from "../src/index.ts";
import type { BoardFamilyEntry } from "../src/board-starters.ts";
import { BOARD_CATALOGUE_C } from "../src/board-catalogue-c.ts";

const boxes = sandboxes();
after(() => boxes.close());

const FAMILIES = [originalMagicAccountant(), originalNumberBonds(), originalSteppingStones(), originalKingsAndSubjects()] as unknown as RuleFamily<BoardState, unknown>[];

/** board-starters.ts's scoreTs and scorePy (not exported), as they render an entry. */
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

async function agentScores(language: Language, type: typeof board4Type, variant: Variant, e: BoardFamilyEntry, params: unknown, tb: string | null, tie: string | null, states: BoardState[]): Promise<string[]> {
  const P = JSON.stringify(params), BS = JSON.stringify(states.map(seen));
  const args = tb === null ? `P, ${tie === null ? (language === "python" ? "None" : "null") : JSON.stringify(tie)}` : "P";
  const probe = language === "python"
    ? `\nimport json\nP = json.loads(${JSON.stringify(P)})\n\n\nclass Board:\n    def __init__(self, d):\n        self.n, self.v, self.c, self.s = d["n"], d["v"], d["c"], d["s"]\n\n\nBOARDS = [Board(d) for d in json.loads(${JSON.stringify(BS)})]\n\n\ndef agent(offer):\n    return [move("probe", r=";".join(",".join(str(x) for x in score(b, ${args})) for b in BOARDS))]\n`
    : `\nconst P = ${P}, BOARDS = ${BS};\nfunction agent(offer) {\n  return [move("probe", { r: BOARDS.map(b => score(b, ${args}).map(String).join(",")).join(";") })];\n}\n`;
  const source = (language === "typescript" ? scoreTs(e, tb) : scorePy(e, tb)).join("\n") + "\n" + probe;
  // The host only carries the probe: any registered family will do.
  const h = new EngineHost({ type, variant, state: states[0]!, rule: { family: "chessmaster", params: { first: "red", second: "blue" } }, energy: 0 });
  const res = await (await boxes.get(language)).act({ source, offer: { object: 0 }, seed: "1", host: h, limits: { stepBudget: 10_000_000, wallMs: 30_000 } });
  assert.equal(res.ok, true, res.ok ? "" : res.error);
  return (JSON.parse(res.ok ? res.calls : "[]")[0].args.r as string).split(";");
}

test("every family has an entry, with its tie-breakers, and no entry says \"line\"", () => {
  assert.deepEqual(BOARD_CATALOGUE_C.map(e => e.family), FAMILIES.map(f => f.id));
  for (const f of FAMILIES) {
    const e = BOARD_CATALOGUE_C.find(x => x.family === f.id)!;
    assert.deepEqual(Object.keys(e.tieBreakers), f.tieBreakers.map(t => t.id), f.id);
    const words = [e.mainSays, ...Object.values(e.tieBreakers).flatMap(t => [t.says, t.tryThis]), f.main.title, ...f.tieBreakers.map(t => t.title)];
    for (const p of f.dealable(board4rgb)) words.push(f.card(p, null), ...f.tieBreakers.map(t => f.card(p, t.id)));
    for (const w of words) assert.ok(!/\blines?\b/i.test(w), `${f.id}: ${w}`);
  }
});

for (const [type, variant, count] of [[board4Type, board4rgb, 24], [board7Type, board7cards, 6]] as const) {
  test(`${variant.id}: an agent's own score is the engine's, for each family, a few parameter sets and its tie-breakers, in both languages`, async () => {
    const sample = births(type, variant, "scores", count);
    for (const f of FAMILIES) {
      const e = BOARD_CATALOGUE_C.find(x => x.family === f.id)!;
      const all = f.dealable(variant);
      for (const params of all.filter((_, i) => i % Math.ceil(all.length / 4) === 0)) {
        for (const tb of [null, ...f.tieBreakers.map(t => t.id)]) {
          if (tb === null && f.tieBreakers.length) continue;
          const engine = sample.map(s => scoreToWire(evaluateSite(type, f as never, params, s, variant, 0, tb).score)!.join(","));
          for (const language of ["typescript", "python"] as const) {
            assert.deepEqual(await agentScores(language, type, variant, e, params, tb, null, sample), engine, `${f.id} ${JSON.stringify(params)}/${tb} (written for it), ${language}`);
            assert.deepEqual(await agentScores(language, type, variant, e, params, null, tb, sample), engine, `${f.id} ${JSON.stringify(params)}/${tb} (reading it), ${language}`);
          }
        }
      }
    }
  });
}
