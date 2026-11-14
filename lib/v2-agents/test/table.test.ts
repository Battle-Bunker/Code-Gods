/**
 * The table: model seats play through the affordance directory's tools (every result checked against the tool's
 * declared result schema), chat is shared, and deals are read from it and checked against the moves.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { toolName } from "@workspace/v2-affordances";
import { Budget, mockProvider, type MockStep } from "@workspace/v2-ai";
import { lineType, lineZ, presets } from "@workspace/v2-linear";
import { sandboxes, startersFor } from "../src/index.ts";
import { deals, runTable, type TableSeat } from "../src/table.ts";

const boxes = sandboxes();
after(() => boxes.close());
const t = (id: string, input: Record<string, unknown> = {}) => ({ name: toolName(id), input });
const beginner = presets.find(p => p.id === "lines-beginner")!.rules;
const seat = (name: string, kind: TableSeat["kind"], family: string, tieBreaker: string): TableSeat => {
  const params = beginner.find(r => r.family === family)!.params as Record<string, unknown>;
  const a = startersFor(family, "typescript").find(x => x.kind === (kind === "naive" ? "naive" : "simple"))!;
  return { name, kind, rule: { family, params, tieBreaker }, program: { language: a.language, source: a.source } };
};

test("model seats read, chat and replace through the directory's tools; a proposal and its acceptance make a deal", async () => {
  const naive = startersFor("treasure", "typescript").find(x => x.kind === "naive")!;
  const ada: MockStep[] = [
    { tools: [t("game.get"), t("game.standings"), t("rule.explain"), t("rule.ladder"), t("objects.list", { sort: "points", limit: 3 }), t("object.score", { objectId: "2" }), t("object.read", { objectId: "2", rep: "si" }), t("moves.list")] },
    { tools: [t("chat.list"), t("agents.list"), t("agent.check", { language: "typescript", source: naive.source })] },
    { tools: [t("agent.replace", { agentId: "a0", language: "typescript", source: naive.source }), t("chat.send", { text: "Line 2: I'll leave its gradient alone if you keep it whole. Deal?" })] },
    { text: "Proposed a deal on line 2." },
  ];
  const bo: MockStep[] = [{ tools: [t("chat.list")] }, { tools: [t("chat.send", { text: "Deal! Line 2 it is." })] }, { text: "Accepted." }];
  const report = await runTable(boxes, {
    type: lineType, variant: lineZ, lines: 6, seed: "t", rounds: 2, acts: 2, energy: 600, income: 50,
    seats: [seat("Ada", "model", "treasure", "prime-terms"), seat("Bo", "model", "prime-staircase", "first-prime"), seat("Cy", "naive", "prime-landing", "big-prime")],
    model: { provider: name => mockProvider(name === "Ada" ? ada : bo), budget: new Budget({ tokens: 10_000_000, usd: 5 }), every: 2 },
  });
  const [a, b, c] = report.seats;
  assert.equal(a!.failedToolCalls, 0, "every result fits its tool's declared result schema");
  assert.equal(a!.toolCalls, 13);
  assert.equal(a!.replaced, 1);
  assert.equal(a!.messages, 1); assert.equal(a!.proposals, 1);
  assert.equal(b!.messages, 1); assert.equal(b!.proposals, 0); assert.equal(c!.messages, 0);
  assert.deepEqual(report.chat.map(m => m.from), ["Ada", "Bo"]);
  assert.equal(report.deals.length, 1);
  assert.deepEqual({ by: report.deals[0]!.by, with: report.deals[0]!.with, lines: report.deals[0]!.lines }, { by: 0, with: 1, lines: [2] });
  assert.ok(report.usd > 0);
});

test("deals: a refusal is no deal; a move that lowers the partner's points on a named line breaks it", () => {
  const chat = [
    { by: 0, text: "Line 3: I'll keep it prime if you leave it. Deal?", round: 0 },
    { by: 1, text: "No deal, sorry.", round: 0 },
    { by: 2, text: "Deal, line 3.", round: 0 },
    { by: 0, text: "Line 5 and line 6: let's both leave them. Deal?", round: 2 },
    { by: 1, text: "ok", round: 2 },
  ];
  const log = [
    { object: 3, by: 0, before: [1, 1, 9], after: [5, 1, 4], round: 1 },    // breaks the deal with seat 2
    { object: 6, by: 1, before: [2, 2, 2], after: [2, 3, 2], round: 3 },    // does not lower seat 0
  ];
  const found = deals(chat, log);
  assert.deepEqual(found.proposals, [0, 3], "an acceptance naming a line is not a proposal");
  assert.deepEqual(found.deals.map(d => [d.by, d.with, d.lines, d.kept]), [[0, 2, [3], false], [0, 1, [5, 6], true]]);
});

test("deals: \"lines 2, 7 and 9\" names three lines; a counter-offer ending \"Deal?\" is not an acceptance", () => {
  const chat = [
    { by: 0, text: "Lines 2, 7 and 9: let's both leave them. Deal?", round: 0 },
    { by: 1, text: "Line 2: I'd rather you leave c at 4 instead. Deal?", round: 0 },
    { by: 2, text: "Yes, agreed.", round: 2 },
  ];
  const found = deals(chat, [{ object: 9, by: 2, before: [5, 0, 0], after: [1, 0, 0], round: 3 }]);
  assert.deepEqual(found.proposals, [0, 1]);
  assert.deepEqual(found.deals.map(d => [d.by, d.with, d.lines, d.kept]), [[0, 2, [2, 7, 9], false]]);
});
