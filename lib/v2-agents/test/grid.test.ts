/**
 * Agents on the grid (lib/v2-grid): the engine host serves a board as it serves a line (priced reads of a view or one
 * element, quotes, the rule's score), and the grid's shipped agents (grid-catalogue.ts, grid-starters.ts):
 *  - every grid family has an example per tie-breaker and the four starters, or is listed as missing (a todo);
 *  - an agent's own idea of the score is the engine's on sampled boards, in both languages;
 *  - both languages make the same moves on newborn boards, with and without what the board is worth, and none fails;
 *  - each example climbs (no move lowers the main part; some raise it; some raise the tie-breaker);
 *  - the starters play for points: they keep their energy where a change adds too few points per ⚡ (nobody else
 *    values the board), where Naive pays regardless.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { applyCalls, evaluateSite, isInvalid, Qn, scoreToWire, type Score } from "@workspace/v2-core";
import { grid4, gridType, type GridState } from "@workspace/v2-grid";
import type { HostReply, HostRequest, Language } from "@workspace/v2-sandbox";
import {
  agentPrimer, births, EngineHost, exampleFor, GRID_CATALOGUE, gridUndescribed, hasStarters, runAct, sandboxes, scoreSource, shippedAgents, startersFor,
  type ShippedAgent,
} from "../src/index.ts";
import { valuer } from "../src/harness.ts";

const boxes = sandboxes();
after(() => boxes.close());
const familyOf = (id: string) => gridType.families.find(f => f.id === id)!;
const paramsOf = (id: string) => familyOf(id).dealable(grid4)[0] as Record<string, unknown>;
const DESCRIBED = GRID_CATALOGUE.filter(e => gridType.families.some(f => f.id === e.family));
const all = shippedAgents().filter(a => DESCRIBED.some(e => e.family === a.family));
const program = (a: ShippedAgent) => ({ language: a.language, source: a.source });

/** What a rule's boards are worth: its committed value function (owner decision 23). */
const worthOf = (rule: { family: string; params: Record<string, unknown>; tieBreaker: string }) => {
  const v = valuer(gridType, grid4, rule);
  assert.ok(v.values, `${rule.family}/${rule.tieBreaker}: no committed value function`);
  return v;
};

test("the starters without a tie-breaker (they read the dealt one) run, and the languages agree", async () => {
  const [state] = births(gridType, grid4, "generic", 1);
  for (const e of DESCRIBED) {
    const tieBreaker = familyOf(e.family).tieBreakers.at(-1)!.id;
    const rule = { family: e.family, params: paramsOf(e.family), tieBreaker };
    const [ts, py] = (["typescript", "python"] as const).map(l => startersFor(e.family, l));
    for (const [i, a] of ts!.entries()) {
      const records = [];
      for (const x of [a, py![i]!]) {
        const { record } = await runAct(await boxes.get(x.language), { type: gridType, variant: grid4, state: state!, rule, program: program(x), seed: "1", energy: 500 });
        assert.notEqual(record.outcome, "failed", `${e.family} ${x.title} (${x.language}): ${record.reason}`);
        const { steps: _s, ...rest } = record;
        records.push(rest);
      }
      assert.deepEqual(records[1], records[0], `${e.family} ${a.title}: the languages differ`);
    }
  }
  assert.throws(() => startersFor("mirrormancer", "python", "no-such-tie-breaker"), /no tie-breaker/);
});

// ---------------------------------------------------------------- the host on a board

// 1 2 3 4 / 0 0 0 0 / 5 6 7 8 / 9 0 1 2: boxes 3, 7, 20, 18; corners 1 + 4 + 9 + 2 = 16.
const board: GridState = { cells: [1, 2, 3, 4, 0, 0, 0, 0, 5, 6, 7, 8, 9, 0, 1, 2] };
const PHI = gridType.readLength(board, grid4);
const host = (rule = { family: "box-totals", params: { T: 12 }, tieBreaker: "corners" }) => new EngineHost({ type: gridType, variant: grid4, state: board, rule, energy: 50 });
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
  assert.deepEqual(s.result.score, ["-28", "16"], "main: −(9 + 5 + 8 + 6); tie-breaker: the corners' total");
  assert.deepEqual(s.result.layers.map((l: { id: string }) => l.id), ["boxes", "corners"]);
  assert.match(ask(h, { op: "myRule" }).result.card, /corner box/);
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

test("host: worth and rarity on a board come from the rule's value function", () => {
  const rule = { family: "box-totals", params: { T: 12 }, tieBreaker: "corners" };
  const v = worthOf(rule);
  const h = new EngineHost({ type: gridType, variant: grid4, state: board, rule, energy: 50, values: v.values, value: { mine: v.bits(board), others: 5, points: 5 * v.bits(board) } });
  assert.equal(ask(h, { op: "worth" }).result.others, 5);
  assert.equal(ask(h, { op: "rarity", score: ["-28", "16"] }).result.bits, v.bits(board));
  const best = ask(h, { op: "rarity", score: ["0", "36"] }).result.bits;
  assert.equal(best, v.worth(["0", "36"].map(Qn.parse)).bits);
  assert.ok(best > v.bits(board), "every box at T with the corners full is rarer than this board");
});

// ---------------------------------------------------------------- the shipped agents

test("every grid family has shipped agents, or is listed as missing; hasStarters says which the deal may deal", t => {
  const missing = gridUndescribed();
  if (missing.length) t.todo(`no grid examples or starters yet for ${missing.join(", ")}: add them to lib/v2-agents/src/grid-catalogue.ts`);
  assert.ok(DESCRIBED.length > 0);
  for (const f of gridType.families) {
    const e = DESCRIBED.find(x => x.family === f.id);
    assert.equal(hasStarters(f.id), !!e, f.id);
    if (!e) {
      assert.deepEqual(startersFor(f.id, "python"), [], `${f.id}: no starters yet, and no line catalogue fallback`);
      assert.equal(exampleFor(f.id, f.tieBreakers[0]!.id, "python"), null);
      continue;
    }
    for (const language of ["typescript", "python"] as const) {
      for (const tb of f.tieBreakers.filter(t => e.tieBreakers[t.id])) assert.ok(exampleFor(f.id, tb.id, language), `${f.id}/${tb.id}: no ${language} example`);
      assert.deepEqual(startersFor(f.id, language).map(a => a.title), ["Simple", "Thorough", "Bold", "Naive (for learning)"]);
    }
  }
  assert.equal(hasStarters("no-such-family"), false);
  assert.equal(hasStarters("m-meets-c"), true, "lines too");
});

/** Score boards with an agent's own score function, in the sandbox, as wire strings. */
async function agentScores(language: Language, family: string, params: Record<string, unknown>, tb: string | null, tie: string, states: GridState[]): Promise<string[]> {
  const P = JSON.stringify(params), B = JSON.stringify(states.map(s => s.cells));
  const args = tb === null ? `P, ${JSON.stringify(tie)}` : "P";
  const probe = language === "python"
    ? `\nP = ${P}\nBOARDS = ${B}\n\n\ndef agent(offer):\n    out = []\n    for b in BOARDS:\n        s = score(b, ${args})\n        out.append(",".join(str(x) for x in s))\n    return [move("probe", r=";".join(out))]\n`
    : `\nconst P = ${P}, BOARDS = ${B};\nfunction agent(offer) {\n  return [move("probe", { r: BOARDS.map(b => score(b, ${args}).map(String).join(",")).join(";") })];\n}\n`;
  const source = scoreSource(family, tb, language as "typescript" | "python") + probe;
  const h = new EngineHost({ type: gridType, variant: grid4, state: states[0]!, rule: { family, params }, energy: 0 });
  const res = await (await boxes.get(language)).act({ source, offer: { object: 0 }, seed: "1", host: h, limits: { stepBudget: 5_000_000, wallMs: 20_000 } });
  assert.equal(res.ok, true, res.ok ? "" : res.error);
  return (JSON.parse(res.ok ? res.calls : "[]")[0].args.r as string).split(";");
}

test("a grid agent's own score is the engine's utilities on sampled boards, for every described family and tie-breaker, in both languages", async () => {
  const edge = [Array(16).fill(0), Array(16).fill(9), [7, 0, 0, 5, 3, 2, 9, 9, 0, 0, 3, 3, 2, 7, 3, 3]].map(cells => ({ cells }));
  const sample = [...edge, ...births(gridType, grid4, "scores", 40)];
  for (const e of DESCRIBED) {
    const f = familyOf(e.family);
    for (const params of f.dealable(grid4) as Record<string, unknown>[]) {
      for (const tb of f.tieBreakers.filter(t => e.tieBreakers[t.id])) {
        const engine = sample.map(s => scoreToWire(evaluateSite(gridType, f, params, s, grid4, 0, tb.id).score)!.join(","));
        for (const language of ["typescript", "python"] as const) {
          assert.deepEqual(await agentScores(language, e.family, params, tb.id, tb.id, sample), engine, `${e.family}/${tb.id} example, ${language}`);
          assert.deepEqual(await agentScores(language, e.family, params, null, tb.id, sample), engine, `${e.family}/${tb.id} starters, ${language}`);
        }
      }
    }
  }
});

test("both languages make the same moves on newborn boards, with and without what the board is worth, and no grid agent fails", async () => {
  const states = births(gridType, grid4, "parity", 3);
  for (const ts of all.filter(a => a.language === "typescript")) {
    const py = all.find(a => a.language === "python" && a.family === ts.family && a.kind === ts.kind && a.tieBreaker === ts.tieBreaker)!;
    const tieBreaker = ts.tieBreaker!;   // every shipped grid agent is written for one tie-breaker
    const rule = { family: ts.family, params: paramsOf(ts.family), tieBreaker };
    const v = worthOf(rule);
    for (const [i, state] of states.entries()) for (const others of [undefined, 0, 40]) {
      const told = others === undefined ? {} : { values: v.values, value: { mine: v.bits(state), others, points: v.bits(state) * others } };
      const records = [];
      for (const a of [ts, py]) {
        const { record } = await runAct(await boxes.get(a.language), { type: gridType, variant: grid4, state, rule, program: program(a), seed: String(i), energy: 500, ...told });
        assert.notEqual(record.outcome, "failed", `${a.family} ${a.title} (${a.language}) on ${gridType.encode(state)}: ${record.reason}`);
        const { steps: _s, ...rest } = record;
        records.push(rest);
      }
      assert.deepEqual(records[1], records[0], `${ts.family} ${ts.title}: the languages differ on ${gridType.encode(state)} (others ${others})`);
    }
  }
});


test("each grid example climbs: no move lowers the main part, some raise it, some raise the tie-breaker", async () => {
  const stuck: string[] = [];
  for (const e of DESCRIBED) {
    const f = familyOf(e.family), params = paramsOf(e.family);
    for (const tb of f.tieBreakers.filter(t => e.tieBreakers[t.id]).map(t => t.id)) {
      const utility = (s: GridState): Score => evaluateSite(gridType, f, params, s, grid4, 0, tb).score;
      const a = exampleFor(e.family, tb, "typescript")!;
      let mainUp = false, tieUp = false;
      for (const start of births(gridType, grid4, `climb-${e.family}`, 3)) {
        let s = start;
        for (let t = 0; t < 25; t++) {
          const { record, state } = await runAct(await boxes.get("typescript"), { type: gridType, variant: grid4, state: s, rule: { family: e.family, params, tieBreaker: tb }, program: program(a), seed: String(t), energy: 1000 });
          assert.notEqual(record.outcome, "failed", record.reason);
          if (record.outcome === "skipped") break;
          const u0 = utility(s), u1 = utility(state);
          s = state;
          assert.ok(u1 !== null || u0 === null, `${e.family}/${tb}: a scored board lost its score on ${gridType.encode(start)}`);
          if (u0 === null || u1 === null) continue;
          const main = Qn.cmp(u1[0]!, u0[0]!);
          assert.ok(main >= 0, `${e.family}/${tb}: the main part fell on ${gridType.encode(start)}`);
          if (main > 0) mainUp = true;
          if (Qn.cmp(u1[1]!, u0[1]!) > 0) tieUp = true;
        }
      }
      if (!mainUp) stuck.push(`${e.family}/${tb}: no move raised the main part`);
      if (!tieUp) stuck.push(`${e.family}/${tb}: no move raised the tie-breaker`);
    }
  }
  assert.deepEqual(stuck, []);
});

test("the starters play for points: below their reserve they keep their energy where nobody else values the board, and pay where others do", async () => {
  for (const e of DESCRIBED) {
    const f = familyOf(e.family), tieBreaker = f.tieBreakers[0]!.id;
    const rule = { family: e.family, params: paramsOf(e.family), tieBreaker };
    const v = worthOf(rule);
    const [start] = births(gridType, grid4, `points-${e.family}`, 1);
    const run = async (a: ShippedAgent, others: number, energy: number) => (await runAct(await boxes.get(a.language), {
      type: gridType, variant: grid4, state: start!, rule, program: program(a), seed: "1", energy,
      values: v.values, value: { mine: v.bits(start!), others, points: v.bits(start!) * others },
    })).record.outcome;
    for (const language of ["typescript", "python"] as const) {
      const [simple, thorough, bold, naive] = startersFor(e.family, language, tieBreaker);
      assert.equal(await run(naive!, 0, 280), "committed", `${e.family}: Naive pays on a board only it values`);
      for (const a of [simple!, thorough!, bold!]) {
        const what = `${e.family} ${a.title} (${language})`;
        assert.equal(await run(a, 0, 280), "skipped", `${what}: below its reserve, a board nobody else values is not worth a move`);
        assert.equal(await run(a, 60, 280), "committed", `${what}: a board the others value is`);
        assert.equal(await run(a, 0, 500), "committed", `${what}: above its reserve it climbs`);
      }
    }
  }
});

test("a grid agent's own notes name the board: a tug-of-war is on a grid, not a line", async () => {
  const [state] = births(gridType, grid4, "tug", 1);
  const rule = { family: "magic-eighteen", params: paramsOf("magic-eighteen"), tieBreaker: "first-column" };
  const sources = {
    typescript: "function agent(offer) {\n  contested(offer, 0);\n  return null;\n}\n",
    python: "def agent(offer):\n    contested(offer, 0)\n    return None\n",
  } as const;
  for (const language of ["typescript", "python"] as const) {
    const { record } = await runAct(await boxes.get(language), { type: gridType, variant: grid4, state: state!, rule, program: { language, source: sources[language] }, seed: "1", energy: 100 });
    assert.equal(record.notes.length, 1, language);
    assert.match(record.notes[0]!, /^Tug-of-war on grid \d+:/, language);
    assert.doesNotMatch(record.notes[0]!, /\bline\b/, language);
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
