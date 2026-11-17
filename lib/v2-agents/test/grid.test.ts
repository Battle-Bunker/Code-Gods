/**
 * Agents on the grid (lib/v2-grid): the engine host serves a board as it serves a line (priced reads of a view or one
 * element, quotes, the rule's score), and the grid's shipped agents (grid-catalogue.ts, grid-starters.ts):
 *  - every grid family has the four starters (the dealt rules have no secondary preferences: owner decision 50);
 *  - an agent's own idea of the score is the engine's utility on sampled boards, in both languages;
 *  - both languages make the same moves on newborn boards, and none fails.
 */
import { grid4 } from "./config.ts";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { applyCalls, evaluateSite, isInvalid, scoreToWire } from "@workspace/v2-core";
import { gridType, type GridState } from "@workspace/v2-grid";
import type { HostReply, HostRequest, Language } from "@workspace/v2-sandbox";
import { agentPrimer, births, EngineHost, GRID_CATALOGUE, gridUndescribed, hasStarters, runAct, sandboxes, scoreSource, shippedAgents, startersFor, type ShippedAgent } from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());
const familyOf = (id: string) => gridType.families.find(f => f.id === id)!;
const paramsOf = (id: string) => familyOf(id).dealable(grid4)[0] as Record<string, unknown>;
const DESCRIBED = GRID_CATALOGUE.filter(e => gridType.families.some(f => f.id === e.family));
const all = shippedAgents().filter(a => DESCRIBED.some(e => e.family === a.family));
const program = (a: ShippedAgent) => ({ language: a.language, source: a.source });

/** For comparing the languages' logic: enough steps that the scoring cutoff never fires (see step-budget.test.ts). */
const PARITY_LIMITS = { stepBudget: 3_000_000, wallMs: 30_000 };

// ---------------------------------------------------------------- the host on a board

// 1 2 3 4 / 0 0 0 0 / 5 6 7 8 / 9 0 1 2: boxes 3, 7, 20, 18; corners 1 + 4 + 9 + 2 = 16.
const board: GridState = { cells: [1, 2, 3, 4, 0, 0, 0, 0, 5, 6, 7, 8, 9, 0, 1, 2] };
const PHI = gridType.readLength(board, grid4);
const host = (rule = { family: "row-multiples", params: { k: 7 } }) => new EngineHost({ type: gridType, variant: grid4, state: board, rule, energy: 50 });
const ask = (h: EngineHost<GridState>, request: HostRequest) => h.handle(request, { hostCallsLeft: 10 }) as HostReply & { ok: true; result: any };

test("host: a board's view is charged once, within one full read of the board; one element counts towards its view", () => {
  const h = host();
  const cells = ask(h, { op: "view", rep: "cells" });
  assert.deepEqual(cells.result.elements.r0c1, { kind: "number", q: "2" });
  assert.deepEqual(cells.result.elements.total, { kind: "number", q: "48" }, "derived elements come with the view");
  assert.equal(cells.bits, Math.min(cells.result.bits, PHI));
  assert.equal(ask(h, { op: "view", rep: "cells" }).bits, 0, "a repeat is free");
  const h2 = host();
  const row0 = ask(h2, { op: "element", ref: { rep: "tally", name: "row0" } });
  assert.deepEqual(row0.result.value, { kind: "number", q: "10" });
  assert.ok(row0.bits > 0);
  const tally = ask(h2, { op: "view", rep: "tally" });
  assert.equal(tally.bits, Math.min(tally.result.bits - row0.bits, PHI - row0.bits), "the view is charged what the element did not already pay");
  assert.equal(h2.handle({ op: "view", rep: "cells", site: 1 }, { hostCallsLeft: 1 }).ok, false, "a board is one site");
  assert.equal(h2.handle({ op: "view", rep: "si" }, { hostCallsLeft: 1 }).ok, false, "a line's view is not a board's");
});

test("host: the rule's score on a board, and quotes priced by v2-grid through the move's own view", () => {
  const h = host();
  const s = ask(h, { op: "myScore" });
  assert.deepEqual(s.result.score, scoreToWire(evaluateSite(gridType, familyOf("row-multiples"), { k: 7 }, board, grid4, 0, null).score), "the utility alone");
  assert.deepEqual(s.result.layers.map((l: { id: string }) => l.id), ["utility"]);
  assert.match(ask(h, { op: "myRule" }).result.card, /multiple of 7/);
  const calls = [{ mutator: "boxes.add", site: 0, args: { box: "box0", k: "2" } }];
  const q = ask(host(), { op: "quote", calls });
  const applied = applyCalls(gridType, grid4, board, calls);
  assert.ok(!isInvalid(applied));
  assert.deepEqual(q.result.bits, applied.prices.map(p => p.total));
  assert.ok(q.bits > 0, "the first quote reads the move's view (boxes)");
  const hq = host();
  ask(hq, { op: "quote", calls });
  assert.deepEqual([...hq.readsByRep.keys()], ["boxes"]);
  const bad = ask(host(), { op: "quote", calls: [{ mutator: "cells.add", site: 0, args: { cell: "r1c0", k: "-1" } }] });
  assert.equal(bad.result.valid, false, "a cell below 0 is not allowed");
});

test("every grid family has the four starters in both languages; hasStarters says which the deal may deal", () => {
  assert.deepEqual(gridUndescribed(), []);
  for (const f of gridType.families) {
    assert.ok(hasStarters(f.id), f.id);
    for (const language of ["typescript", "python"] as const) assert.deepEqual(startersFor(f.id, language).map(a => a.title), ["Simple", "Thorough", "Bold", "Naive (for learning)"]);
  }
  assert.equal(hasStarters("no-such-family"), false);
  assert.equal(hasStarters("multiples"), true, "lines too");
});

/** Score boards with an agent's own score function, in the sandbox, as wire strings. */
async function agentScores(language: Language, family: string, params: Record<string, unknown>, states: GridState[]): Promise<string[]> {
  const P = JSON.stringify(params), B = JSON.stringify(states.map(s => s.cells));
  const probe = language === "python"
    ? `\nP = ${P}\nBOARDS = ${B}\n\n\ndef agent(offer):\n    out = []\n    for b in BOARDS:\n        s = score(b, P)\n        out.append(",".join(repr(float(x)) for x in s))\n    return [move("probe", r=";".join(out))]\n`
    : `\nconst P = ${P}, BOARDS = ${B};\nfunction agent(offer) {\n  return [move("probe", { r: BOARDS.map(b => score(b, P).map(String).join(",")).join(";") })];\n}\n`;
  const source = scoreSource(family, null, language as "typescript" | "python") + probe;
  const h = new EngineHost({ type: gridType, variant: grid4, state: states[0]!, rule: { family, params }, energy: 0 });
  const res = await (await boxes.get(language)).act({ source, offer: { object: 0 }, seed: "1", host: h, limits: { stepBudget: 5_000_000, wallMs: 20_000 } });
  assert.equal(res.ok, true, res.ok ? "" : res.error);
  return (JSON.parse(res.ok ? res.calls : "[]")[0].args.r as string).split(";");
}

test("a grid agent's own score is the engine's utility on sampled boards, for every family and its peers, in both languages", async () => {
  const edge = [Array(16).fill(0), Array(16).fill(9), [7, 0, 0, 5, 3, 2, 9, 9, 0, 0, 3, 3, 2, 7, 3, 3]].map(cells => ({ cells }));
  const sample = [...edge, ...births(gridType, grid4, "scores", 30)];
  for (const e of DESCRIBED) {
    const f = familyOf(e.family);
    for (const params of f.dealable(grid4) as Record<string, unknown>[]) {
      const engine = sample.map(s => f.dynamic!.u(s, params));
      for (const language of ["typescript", "python"] as const) {
        const got = (await agentScores(language, e.family, params, sample)).map(Number);
        got.forEach((x, i) => assert.ok(Math.abs(x - engine[i]!) < 1e-6, `${e.family} ${JSON.stringify(params)} ${language} on ${gridType.encode(sample[i]!)}: ${x} vs ${engine[i]}`));
      }
    }
  }
});

test("both languages make the same moves on newborn boards, and no grid agent fails", async () => {
  const states = births(gridType, grid4, "parity", 2);
  for (const ts of all.filter(a => a.language === "typescript")) {
    const py = all.find(a => a.language === "python" && a.family === ts.family && a.kind === ts.kind && a.tieBreaker === ts.tieBreaker)!;
    const rule = { family: ts.family, params: paramsOf(ts.family) };
    for (const [i, state] of states.entries()) {
      const records = [];
      for (const a of [ts, py]) {
        const { record } = await runAct(await boxes.get(a.language), { type: gridType, variant: grid4, state, rule, program: program(a), seed: String(i), energy: 500, limits: PARITY_LIMITS });
        assert.notEqual(record.outcome, "failed", `${a.family} ${a.title} (${a.language}) on ${gridType.encode(state)}: ${record.reason}`);
        const { steps: _s, ...rest } = record;
        records.push(rest);
      }
      assert.deepEqual(records[1], records[0], `${ts.family} ${ts.title}: the languages differ on ${gridType.encode(state)}`);
    }
  }
});

test("grid agents climb in small steps: FAR is at most 2 and no \"Try this\" suggests a bigger jump (a far move costs its path, #580)", () => {
  for (const a of all) {
    const far = Number(/FAR\s*=\s*(\d+)/.exec(a.source)?.[1]);
    assert.ok(far >= 1 && far <= 2, `${a.family} ${a.title} (${a.language}): FAR = ${far}`);
    const hint = /Try this: (.*)/.exec(a.source)?.[1] ?? "";
    assert.doesNotMatch(hint, /FAR = \d+ to ([3-9]|\d\d)/, `${a.family} ${a.title}: ${hint}`);
  }
});

test("the primer for grids lists the board's views and moves, says board, and shows a grid example", () => {
  const primer = agentPrimer(gridType);
  for (const r of gridType.representations) assert.ok(primer.includes(`- ${r.id}: `), r.id);
  for (const m of grid4.mutators) assert.match(primer, new RegExp(`^- ${m.replace(".", "\\.")}\\(`, "m"), m);
  assert.match(primer, /cells\.add\(cell: r0c0 \| r0c1 \| … \| r3c3, k\)/, "long choices are shortened");
  assert.match(primer, /engine v2: grids/);
  assert.doesNotMatch(primer, /\b(a|the|this|one|that) lines?\b/i, "no line words on a board");
  assert.match(primer, /def agent\(offer\)/, "the example");
  // Nine representations since the old beginner rules returned (windows, leaps, fold): 12,000 characters exactly.
  assert.ok(primer.length < 13000, `${primer.length} characters`);
});
