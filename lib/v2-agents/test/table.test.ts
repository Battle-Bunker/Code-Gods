/**
 * The table: model seats play through the affordance directory's tools (every result checked against the tool's
 * declared result schema), chat is shared, and deals are read from it and checked against the moves.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { toolName } from "@workspace/v2-affordances";
import { Budget, mockProvider, type ChatProvider, type MockStep } from "@workspace/v2-ai";
import { lineQ, lineType, lineZ, presets } from "@workspace/v2-linear";
import { sandboxes, startersFor } from "../src/index.ts";
import { deals, runTable, type TableSeat } from "../src/table.ts";

const boxes = sandboxes();
after(() => boxes.close());
const t = (id: string, input: Record<string, unknown> = {}) => ({ name: toolName(id), input });
const beginner = presets.find(p => p.id === "lines-whole")!.rules;
const seat = (name: string, kind: TableSeat["kind"], family: string, tieBreaker: string): TableSeat => {
  const params = beginner.find(r => r.family === family)!.params as Record<string, unknown>;
  const a = startersFor(family, "typescript").find(x => x.kind === (kind === "naive" ? "naive" : "simple"))!;
  return { name, kind, rule: { family, params, tieBreaker }, program: { language: a.language, source: a.source } };
};

/** A mock that plays a different script each turn (a turn starts with a one-message conversation). */
function perTurn(scripts: MockStep[][]): ChatProvider {
  let turn = -1;
  const mocks = scripts.map(sc => mockProvider(sc));
  return { model: "mock", prices: mocks[0]!.prices, step: req => { if (req.messages.length === 1) turn++; return mocks[Math.min(turn, mocks.length - 1)]!.step(req); } };
}

test("model seats play through the directory's tools on the server's economy: the power manoeuvre, a cheap edit, a deal", async () => {
  const simple = startersFor("treasure", "typescript").find(x => x.kind === "simple")!.source;
  const naiveSource = startersFor("treasure", "typescript").find(x => x.kind === "naive")!.source;   // cheaper: the store can pay it
  const edited = simple.replace("function agent(offer) {", "function agent(offer) {\n  if ([2].includes(offer.object)) return null;   // the deal with Bo");
  const ada: MockStep[][] = [[
    { tools: [t("game.get"), t("game.standings"), t("rule.explain"), t("rule.values"), t("objects.list", { sort: "rarity", limit: 3 }), t("object.score", { objectId: "2" }), t("object.read", { objectId: "2", rep: "si" }), t("moves.list")] },
    { tools: [t("rule.worth", { score: ["0", "5"] }), t("chat.list"), t("agents.list"), t("agent.programs", { agentId: "a0-0" }), t("agent.check", { language: "typescript", source: edited })] },
    { tools: [t("agent.replace", { agentId: "a0-0", language: "typescript", source: edited }), t("chat.send", { text: "Line 2: I'll leave its gradient alone if you keep it whole. Deal?" })] },
    { text: "Kept the deal in code." },
  ], [
    // Twenty seconds on, the agent holds the energy and the store cannot pay a summon: pull power back, summon, share it out.
    { tools: [t("power.allocate", { shares: { "a0-0": 0.1 } }), t("agent.summon", { language: "typescript", source: naiveSource, share: 0.3 }), t("power.allocate", { shares: { "a0-0": 0.5, "a0-1": 0.5 } })] },
    { text: "Added an agent." },
  ]];
  const bo: MockStep[][] = [[{ tools: [t("chat.list")] }, { text: "Waiting." }], [{ tools: [t("chat.send", { text: "Deal! Line 2 it is." })] }, { text: "Accepted." }]];
  const report = await runTable(boxes, {
    type: lineType, variant: lineZ, lines: 6, seed: "t", seconds: 24,
    // The scenario's timing (24 s, 25 opportunities a second, a summon payable after the manoeuvre) is the 25 Hz economy;
    // the beginner preset now runs at 3 Hz with power 8 (the coordinator's call 13), which this tool-plumbing test does not need.
    economy: { powerPerSecond: 64, fullChargeSeconds: 30, startingEnergy: 600, opportunitiesPerSecond: 25 },
    seats: [seat("Ada", "model", "treasure", "prime-terms"), seat("Bo", "model", "prime-staircase", "first-prime"), seat("Cy", "naive", "prime-landing", "shared-factor")],
    model: { provider: (p => (name: string) => p[name === "Ada" ? 0 : 1]!)([perTurn(ada), perTurn(bo)]), budget: new Budget({ tokens: 10_000_000, usd: 5 }) },
  });
  const [a, b, c] = report.seats;
  assert.equal(a!.failedToolCalls, 0, "every call fits its tool's params and every result its result schema");
  assert.equal(a!.toolCalls, 18);
  assert.equal(a!.replaced, 1); assert.equal(a!.summoned, 1); assert.equal(a!.allocations, 2);
  assert.ok(a!.spent.edits > 0 && a!.spent.edits < 40, `the one-line edit costs the change, not the program (${a!.spent.edits.toFixed(1)} energy)`);
  assert.ok(a!.spent.summons > 300, "a new agent pays the full price");
  assert.ok(a!.acts + b!.acts + c!.acts > 100, "about 25 opportunities a second, drawn by energy");
  assert.equal(a!.messages, 1); assert.equal(a!.proposals, 1);
  assert.equal(b!.messages, 1); assert.equal(b!.proposals, 0); assert.equal(c!.messages, 0);
  assert.deepEqual(report.chat.map(m => m.from), ["Ada", "Bo"]);
  assert.equal(report.deals.length, 1);
  // Ada edited her agent to skip line 2, then summoned a second, unedited one: every agent must skip it, so pending again.
  assert.deepEqual(a!.commitments, { enacted: 0, pending: 1, retracted: 0 });
  assert.deepEqual(b!.commitments, { enacted: 0, pending: 1, retracted: 0 }, "Bo only said it");
  assert.deepEqual({ by: report.deals[0]!.by, with: report.deals[0]!.with, lines: report.deals[0]!.lines }, { by: 0, with: 1, lines: [2] });
  assert.ok(report.usd > 0);
});

test("without the manoeuvre a second summon is refused: the store holds too little while the agent holds the power", async () => {
  const simple = startersFor("treasure", "typescript").find(x => x.kind === "simple")!.source;
  const ada: MockStep[] = [{ tools: [t("agent.summon", { language: "typescript", source: simple, share: 0.2 })] }, { text: "tried" }];
  const report = await runTable(boxes, {
    type: lineType, variant: lineZ, lines: 4, seed: "u", seconds: 1.5,
    seats: [seat("Ada", "model", "treasure", "prime-terms"), seat("Cy", "naive", "prime-landing", "shared-factor")],
    model: { provider: mockProvider(ada), budget: new Budget({ tokens: 10_000_000, usd: 5 }) },
    // At power 64 (summon prices at their calibrated bits) the store after the first summon holds less than a second one.
    economy: { powerPerSecond: 64, fullChargeSeconds: 30, startingEnergy: 600, opportunitiesPerSecond: 25 },
  });
  assert.equal(report.seats[0]!.failedToolCalls, 1);
  assert.equal(report.seats[0]!.summoned, 0);
});

test("deals: a refusal is no deal; a move that lowers the partner's points on a named line breaks it", () => {
  const chat = [
    { by: 0, text: "Line 3: I'll keep it prime if you leave it. Deal?", at: 0 },
    { by: 1, text: "No deal, sorry.", at: 0 },
    { by: 2, text: "Deal, line 3.", at: 0 },
    { by: 0, text: "Line 5 and line 6: let's both leave them. Deal?", at: 40 },
    { by: 1, text: "ok", at: 40 },
  ];
  const log = [
    { object: 3, by: 0, before: [1, 1, 9], after: [5, 1, 4], at: 20 },    // breaks the deal with seat 2
    { object: 6, by: 1, before: [2, 2, 2], after: [2, 3, 2], at: 60 },    // does not lower seat 0
  ];
  const found = deals(chat, log, 40);
  assert.deepEqual(found.proposals, [0, 3], "an acceptance naming a line is not a proposal");
  assert.deepEqual(found.deals.map(d => [d.by, d.with, d.lines, d.kept]), [[0, 2, [3], false], [0, 1, [5, 6], true]]);
});

test("deals: \"lines 2, 7 and 9\" names three lines; a counter-offer ending \"Deal?\" is not an acceptance", () => {
  const chat = [
    { by: 0, text: "Lines 2, 7 and 9: let's both leave them. Deal?", at: 0 },
    { by: 1, text: "Line 2: I'd rather you leave c at 4 instead. Deal?", at: 0 },
    { by: 2, text: "Yes, agreed.", at: 40 },
  ];
  const found = deals(chat, [{ object: 9, by: 2, before: [5, 0, 0], after: [1, 0, 0], at: 60 }]);
  assert.deepEqual(found.proposals, [0, 1]);
  assert.deepEqual(found.deals.map(d => [d.by, d.with, d.lines, d.kept]), [[0, 2, [2, 7, 9], false]]);
});

test("unique objects: a move onto a state another line already holds is refused, and only then", async () => {
  // One agent drives every line to y = x + 1 (shift and tilt, without quoting): with uniqueness, only the first line may end there.
  const rule = { family: "prime-landing", params: beginner.find(r => r.family === "prime-landing")!.params as Record<string, unknown>, tieBreaker: "shared-factor" };
  const seat: TableSeat = { name: "P0", kind: "starter", rule, program: { language: "typescript", source: "function agent(offer) { const v = look(offer, \"si\"), one = Q.from(1), plan = []; if (!Q.eq(v.c, one)) plan.push(move(\"si.shift\", { k: Q.sub(one, v.c) })); if (!Q.eq(v.m, one)) plan.push(move(\"si.tilt\", { k: Q.sub(one, v.m) })); return plan.length ? plan : null; }" } };
  const run = (unique: boolean) => runTable(boxes, { type: lineType, variant: lineZ, lines: 4, seed: "u", seconds: 20, seats: [seat], birthsPerSecond: 0, unique });
  const [free, unique] = [await run(false), await run(true)];
  assert.equal(free.seats[0]!.refused, 0);
  assert.ok(unique.seats[0]!.refused > 0, "the second line onto y = x + 1 is refused");
});

test("on the beginner economy (power 4) starters live within their income: no agent owes more than about 5 seconds of it", async () => {
  let worst = 0, acts = 0;
  const rules = [["prime-landing", "shared-factor"], ["treasure", "prime-terms"], ["whole-crossing", "k-spf"]] as const;
  await runTable(boxes, {
    type: lineType, variant: lineQ, lines: 3, seed: "income", seconds: 90, unique: true,
    seats: rules.map(([f, t], k) => seat(`P${k}`, "starter", f, t)),
    onAct: e => { acts++; if (e.balance < 0) worst = Math.max(worst, -e.balance / e.income); },
  });
  assert.ok(acts > 100, `${acts} acts`);
  assert.ok(worst <= 6, `worst debt ${worst.toFixed(1)} s of income (a move may borrow 5 s)`);
});

test("drift is staggered by seat, as on the server: seat i redraws at k·D + i·D/n, and nobody in the last 90 s", async () => {
  const D = 120, seconds = 400, at: { at: number; seat: number }[] = [];
  const rules = [["prime-landing", "shared-factor"], ["treasure", "prime-terms"], ["same-on-both-rulers", "steep"]] as const;
  await runTable(boxes, {
    type: lineType, variant: lineQ, lines: 3, seed: "stagger", seconds, unique: true, driftSeconds: D,
    seats: rules.map(([f, t], k) => seat(`P${k}`, "starter", f, t)),
    onDrift: e => at.push({ at: e.at, seat: e.seat }),
  });
  assert.ok(at.length > 0, "some seat redrew");
  for (const e of at) {
    const due = [1, 2, 3].map(k => k * D + (e.seat * D) / 3);
    assert.ok(due.some(t => e.at >= t && e.at - t <= 1.5), `seat ${e.seat} redrew at ${e.at}, due at ${due.join(", ")}`);
    assert.ok(e.at <= seconds - 90, `no redraw in the last 90 s (${e.at})`);
  }
});
