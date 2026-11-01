/**
 * Code runs (convex/code; docs/assistant/code-execution.md) against the live local backend: run_code's action as a
 * seeded credential, the stored runs, and one scripted assistant turn through the real tool loop.
 *
 * What would break: a script reading another god's secrets through a dataset, a run visible to another human, the
 * budget not holding, a large result lost instead of stored, the model getting an unbounded result, or run_code /
 * the code-output panel not reachable from the assistant.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, envelope, gods, internal, roomWith, touch, waitFor, type God } from "./game-helpers.ts";
import { disclosureChecker } from "./disclosure.ts";
import { CODE_LIMITS } from "../convex/code/limits.ts";

const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 6, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
};
async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string } }).data?.code ?? `untyped: ${(error as Error).message}`; }
  return "no error";
}
async function startedRoom(names: string[]) {
  const members = await gods(...names);
  await touch(members[0]);
  const { roomId } = await roomWith(members, settings);
  const game = await members[0].c.action(api.owner.start, { roomId });
  return { members, roomId, gameId: game.gameId as string };
}
const credential = (god: God, roomId: string, permission: "read" | "act" = "read") =>
  admin.mutation(internal.testing.seedCredential, { subject: god.subject, roomId, permission }) as Promise<string>;
const run = (credentialId: string, roomId: string, args: Record<string, unknown>) =>
  admin.action(internal.code.execute.runAs, { principal: { credentialId }, roomId, datasetsJson: "[]", ...args });

const RANK_PY = "def main(data):\n    rows = sorted(data['objects'], key=lambda o: (-o['payoff'], o['id']))\n"
  + "    print('objects', len(rows))\n    return [{'id': o['id'], 'payoff': o['payoff'], 'mine': o['own']['netBits']} for o in rows[:5]]\n";

test("run_code: a script over datasets resolved as the player, stored for them only, within disclosure", { timeout: 240_000 }, async () => {
  const { members: [ann, bob], roomId, gameId } = await startedRoom(["Ann Coder", "Bob Coder", "Cal Coder"]);
  const SECRET = "bob_code_marker";
  const summoned = await bob.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", language: "typescript", source: `function agent(x) { const ${SECRET} = 1; return [add(${SECRET})]; }` }, gameId) });
  assert.equal(summoned.accepted, true, summoned.message);
  const cred = await credential(ann, roomId);

  const out = await run(cred, roomId, { language: "python", source: RANK_PY, datasetsJson: JSON.stringify(["objects"]), title: "Top 5" });
  assert.equal(out.status, "ok", JSON.stringify(out.error));
  // The expectation is Ann's own observation, ranked here by the same rule.
  const observation = await ann.c.query(api.player.observation, { roomId });
  const expected = [...observation.objects].sort((a: any, b: any) => b.payoff - a.payoff || (a.id < b.id ? -1 : 1)).slice(0, 5)
    .map((o: any) => ({ id: o.id, payoff: o.payoff, mine: o.own.netBits }));
  assert.deepEqual(out.result, expected);
  assert.equal(out.output, `objects ${observation.objects.length}\n`);
  assert.match(out.show, /code-output/);
  assert.equal(out.TRUNCATED, undefined);

  // Every dataset at once, dumped whole: nothing in it is another god's.
  const dump = await run(cred, roomId, { language: "typescript", source: "function main(data) { return data; }",
    datasetsJson: JSON.stringify(["objects", "my_utility", "agents", "leaderboard", "observation", "events", "trajectories", "chat", "settings", "rules", "games"]) });
  assert.equal(dump.status, "ok", JSON.stringify(dump.error));
  const dumped = await ann.c.query(api.code.runs.get, { roomId, runId: dump.runId });
  assert.equal(dumped.clipped, false, "a few objects fit in the row");
  const data = JSON.parse(dumped.resultJson);
  assert.equal(data.my_utility.utility.familyId, (await ann.c.query(api.player.myUtility, { roomId })).utility.familyId, "her own utility");
  assert.equal(typeof data.rules, "string");
  assert.ok(Array.isArray(data.events) && Array.isArray(data.trajectories));
  assert.deepEqual(data.agents, [], "Ann has no agents; Bob's are not hers");
  await disclosureChecker(gameId, ann.subject, [SECRET])("every dataset", data);

  // Stored for Ann: the panel's query has the run; Bob cannot see it.
  const latest = await ann.c.query(api.code.runs.get, { roomId });
  assert.equal(latest.runId, dump.runId);
  const ranked = await ann.c.query(api.code.runs.get, { roomId, runId: out.runId });
  assert.equal(ranked.title, "Top 5");
  assert.equal(ranked.source, RANK_PY);
  assert.deepEqual(JSON.parse(ranked.resultJson), expected);
  assert.deepEqual(ranked.datasets, ["objects"]);
  assert.equal(await errorCode(bob.c.query(api.code.runs.get, { roomId, runId: out.runId })), "NOT_FOUND");
  assert.equal(await bob.c.query(api.code.runs.get, { roomId }), null);
  const listed = await ann.c.query(api.code.runs.list, { roomId });
  assert.deepEqual(listed.runs.map((r: any) => r.runId), [dump.runId, out.runId]);
  assert.equal(listed.budget.used.runs, 2);
  // An outsider of the room cannot run code in it.
  const [eve] = await gods("Eve Outsider");
  const other = await roomWith([eve]);
  const eveCred = await credential(eve, other.roomId);
  assert.equal(await errorCode(run(eveCred, roomId, { language: "python", source: RANK_PY })), "FORBIDDEN");
});

test("run_code: errors are stored and explained, large results go to storage, the budget holds", { timeout: 300_000 }, async () => {
  const { members: [cy], roomId } = await startedRoom(["Cy Coder", "Cy Two", "Cy Three"]);
  const cred = await credential(cy, roomId);
  const syntax = await run(cred, roomId, { language: "python", source: "def main(data):\n    return [1,\n" });
  assert.equal(syntax.status, "error");
  assert.equal(syntax.error.code, "COMPILE");
  assert.match(syntax.error.message, /line \d+/);
  const raised = await run(cred, roomId, { language: "typescript", source: "function main(d) { return d.nope.deeper; }" });
  assert.equal(raised.error.code, "EXECUTION");
  assert.match(raised.error.message, /TypeError/);
  assert.equal((await cy.c.query(api.code.runs.get, { roomId, runId: raised.runId })).status, "error");
  const history = await run(cred, roomId, { language: "python", source: "def main(d):\n    return 1\n", datasetsJson: JSON.stringify(["game_history"]) });
  assert.equal(history.error.code, "DATASETS");
  assert.match(history.error.message, /gameId/);

  // A result larger than the row keeps: a preview for the model, the row's prefix, the whole in storage.
  const big = await run(cred, roomId, { language: "python", source: "def main(d):\n    return [{'i': i, 'label': 'row %d' % i} for i in range(20000)]\n" });
  assert.equal(big.status, "ok", JSON.stringify(big.error));
  assert.match(big.TRUNCATED, /result shows the first 3500 of \d+ characters/);
  assert.equal(big.result, undefined);
  assert.equal(big.resultPreview.length, CODE_LIMITS.previewResultChars);
  const row = await cy.c.query(api.code.runs.get, { roomId, runId: big.runId });
  assert.equal(row.clipped, true);
  assert.equal(row.resultJson.length, CODE_LIMITS.rowResultChars);
  assert.ok(row.fullUrl, "the whole result has a URL");
  const whole = await admin.action(internal.code.execute.fullText, { principal: { credentialId: cred }, roomId, runId: big.runId });
  assert.equal(JSON.parse(whole.result).length, 20000);
  assert.equal(whole.result.length, row.resultChars);

  // The run budget: runsPerGame runs per game, then RATE_LIMITED (failed runs count).
  const used = (await cy.c.query(api.code.runs.list, { roomId })).budget.used.runs;
  for (let i = used; i < CODE_LIMITS.runsPerGame; i++) {
    const ok = await run(cred, roomId, { language: "typescript", source: `function main(d) { return ${i}; }` });
    assert.equal(ok.status, "ok", JSON.stringify(ok.error));
  }
  assert.equal(await errorCode(run(cred, roomId, { language: "typescript", source: "function main(d) { return 0; }" })), "RATE_LIMITED");
  const budget = (await cy.c.query(api.code.runs.list, { roomId })).budget;
  assert.deepEqual(budget.left.runs, 0);
});

test("the assistant loads the skill, runs code and shows the result in a code-output pane", { timeout: 240_000 }, async () => {
  const { members: [dee], roomId } = await startedRoom(["Dee Coder", "Dee Two", "Dee Three"]);
  await dee.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: 500_000 });
  const script = { steps: [
    { tools: [{ name: "load_skill", input: { name: "analytics-code" } }] },
    { tools: [{ name: "run_code", input: { language: "python", source: RANK_PY, datasets: ["objects"], title: "Top 5 by payoff" } }] },
    { tools: [{ name: "list_code_runs", input: {} }] },
    { text: "Here are your top objects." },
  ] };
  const sent = await dee.c.mutation(api.assistant.send, { roomId, text: `/mock ${JSON.stringify(script)}` });
  const t = await waitFor(async () => {
    const th = await dee.c.query(api.assistant.thread, { threadId: sent.threadId });
    const turn = th.turns.find((x: any) => x._id === sent.turnId);
    return turn && ["done", "failed", "cancelled", "budget_exhausted"].includes(turn.status) ? { turn, calls: th.toolCalls.filter((c: any) => c.turnId === sent.turnId) } : null;
  }, "the code turn", 120_000, 200);
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  const byTool = Object.fromEntries(t.calls.map((c: any) => [c.tool, c]));
  assert.ok(t.calls.every((c: any) => c.status === "ok"), JSON.stringify(t.calls.map((c: any) => [c.tool, c.status, c.summary])));
  assert.match(JSON.parse(byTool.load_skill.resultJson).data.body, /ANALYTICS CODE/);
  const outcome = JSON.parse(byTool.run_code.resultJson).data;
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.result.length, 5);
  assert.match(byTool.run_code.summary, /^Ran in \d+\.\d s$/);
  assert.equal(JSON.parse(byTool.list_code_runs.resultJson).data.runs[0].runId, outcome.runId);
  // The panel, as the assistant would open it.
  const credentialId = await credential(dee, roomId, "act");
  const opened = await admin.mutation(internal.layout.openPanelAs, { principal: { credentialId }, panelId: "code-output", params: { runId: outcome.runId } });
  assert.match(opened.summary, /One run/);
  const current = await dee.c.query(api.layout.current, { roomId });
  const pane = Object.values(current.layout.panes).find((p: any) => p.panelId === "code-output") as any;
  assert.equal(pane.params.runId, outcome.runId);
});
