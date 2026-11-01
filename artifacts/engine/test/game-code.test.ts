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
import { admin, api, envelope, gods, internal, raw, roomWith, touch, waitFor, type God } from "./game-helpers.ts";
import { disclosureChecker } from "./disclosure.ts";
import { CODE_LIMITS } from "../convex/code/limits.ts";

const settings = {
  languages: ["typescript"], objectType: "Int",
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
  // The rival-inference datasets (docs/public-log-design.md §4): the public log with own and others' summed bits, in
  // columns of equal length, and the public candidates (any god's parameters appear among them by design).
  const inference = await run(cred, roomId, { language: "python",
    source: "def main(data):\n    s = data['utility_series']\n    c = s['columns']\n    return {'rows': s['rows'], 'lengths': sorted(set(len(v) for v in c.values())), 'others': s['others'], 'families': len(data['utility_candidates']['families'])}\n",
    datasetsJson: JSON.stringify(["utility_series", "utility_candidates"]) });
  assert.equal(inference.status, "ok", JSON.stringify(inference.error));
  assert.ok(inference.result.rows > 0 && inference.result.families > 0, JSON.stringify(inference.result));
  assert.deepEqual(inference.result.lengths, [inference.result.rows], "every column has a row per event");
  assert.equal(inference.result.others, (await raw(gameId)).game.roster.length - 1, "the number of other gods");
  const inferred = JSON.parse((await ann.c.query(api.code.runs.get, { roomId, runId: inference.runId })).resultJson);
  await disclosureChecker(gameId, ann.subject, [SECRET])("inference datasets", inferred);
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

  // A failed run is charged the time it took: a loop that then raises is not free.
  const before = (await cy.c.query(api.code.runs.list, { roomId })).budget.used.cpuSeconds;
  const spin = await run(cred, roomId, { language: "typescript", source: "function main(d) { const t = Date.now(); let n = 0; for (let i = 0; i < 3e7; i++) n += i; throw new Error('after ' + n); }" });
  assert.equal(spin.error.code, "EXECUTION");
  assert.ok(spin.cpuMs > 20, `charged ${spin.cpuMs} ms`);
  assert.ok((await cy.c.query(api.code.runs.list, { roomId })).budget.used.cpuSeconds >= before + spin.cpuMs / 1000 - 1e-9);

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

test("run_code: before a room's first game the budget is that room's own", { timeout: 120_000 }, async () => {
  const [lu] = await gods("Lu Lobby");
  const a = await roomWith([lu]), b = await roomWith([lu]);
  const inA = await credential(lu, a.roomId), inB = await credential(lu, b.roomId);
  assert.equal((await run(inA, a.roomId, { language: "python", source: "def main(d):\n    return 1\n" })).status, "ok");
  assert.equal((await lu.c.query(api.code.runs.list, { roomId: a.roomId })).budget.used.runs, 1);
  assert.equal((await lu.c.query(api.code.runs.list, { roomId: b.roomId })).budget.used.runs, 0, "another room's lobby runs do not count");
  assert.equal((await run(inB, b.roomId, { language: "typescript", source: "function main(d) { return 2; }" })).result, 2);
});

test("the assistant loads the skill, runs code and shows the result in a code-output pane", { timeout: 240_000 }, async () => {
  const { members: [dee], roomId } = await startedRoom(["Dee Coder", "Dee Two", "Dee Three"]);
  await dee.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: 500_000 });
  const script = { steps: [
    { tools: [{ name: "load_skill", input: { name: "analytics-code" } }] },
    { tools: [{ name: "run_code", input: { language: "python", source: RANK_PY, datasets: ["objects"], title: "Top 5 by payoff" } }] },
    { tools: [{ name: "list_code_runs", input: {} }] },
    { tools: [{ name: "run_code", input: { language: "python", source: "def main(d):\n    store.put('k', 7)\n    return 1\n", saveAs: "readk" } }] },
    { tools: [{ name: "run_code", input: { script: "scripts/readk", load: ["k"], datasets: [] } }, { name: "list_code_objects", input: { prefix: "scripts/" } }] },
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
  const runs = t.calls.filter((c: any) => c.tool === "run_code").sort((a: any, b: any) => a.index - b.index || a._creationTime - b._creationTime).map((c: any) => JSON.parse(c.resultJson).data);
  const outcome = runs[0];
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.result.length, 5);
  assert.ok(t.calls.filter((c: any) => c.tool === "run_code").every((c: any) => /^Ran in \d+\.\d s$/.test(c.summary)));
  assert.equal(JSON.parse(byTool.list_code_runs.resultJson).data.runs[0].runId, outcome.runId);
  assert.deepEqual(runs[1].store, { written: ["k", "scripts/readk"], deleted: [] }, "a tool call writes the store and saves the script");
  assert.equal(runs[2].result, 1, JSON.stringify(runs[2].error));
  assert.deepEqual(JSON.parse(byTool.list_code_objects.resultJson).data.objects.map((o: any) => o.key), ["scripts/readk"]);
  // The panel, as the assistant would open it.
  const credentialId = await credential(dee, roomId, "act");
  const opened = await admin.mutation(internal.layout.openPanelAs, { principal: { credentialId }, panelId: "code-output", params: { runId: outcome.runId } });
  assert.match(opened.summary, /One run/);
  const current = await dee.c.query(api.layout.current, { roomId });
  const pane = Object.values(current.layout.panes).find((p: any) => p.panelId === "code-output") as any;
  assert.equal(pane.params.runId, outcome.runId);
});

test("the object store: per-user namespaces, persistence across runs, deletion, quota refusals, audit, saved scripts", { timeout: 240_000 }, async () => {
  const { members: [ivy, jon], roomId } = await startedRoom(["Ivy Store", "Jon Store", "Kim Store"]);
  const ivyCred = await credential(ivy, roomId), jonCred = await credential(jon, roomId);
  const events = (credentialId: string) => admin.query(internal.code.objects.eventsAs, { principal: { credentialId } });

  // Run 1 writes; run 2 (a new sandbox) reads it back, increments, deletes, and lists.
  const first = await run(ivyCred, roomId, { language: "python", source: "def main(d):\n    store.put('counter', 1)\n    store.put('notes/a', {'x': 1})\n    store.put('notes/b', 'two')\n    return 'ok'\n" });
  assert.deepEqual(first.store, { written: ["counter", "notes/a", "notes/b"], deleted: [] });
  const second = await run(ivyCred, roomId, { language: "typescript", load: ["counter", "notes/*"],
    source: "function main(d) { const n = store.get('counter'); store.put('counter', n + 1); store.delete('notes/b'); return { n, notes: store.list('notes/') }; }" });
  assert.deepEqual(second.result, { n: 1, notes: ["notes/a"] }, JSON.stringify(second.error));
  const third = await run(ivyCred, roomId, { language: "python", load: ["*"], source: "def main(d):\n    return {'counter': store.get('counter'), 'keys': [k for k in store.list() if not k.startswith('runs/')]}\n" });
  assert.deepEqual(third.result, { counter: 2, keys: ["counter", "notes/a"] });
  // A run's whole result is the object runs/<runId> in the same store, readable by a later run.
  const chained = await run(ivyCred, roomId, { language: "python", load: [`runs/${second.runId}`], source: `def main(d):\n    return store.get('runs/${second.runId}')['result']\n` });
  assert.deepEqual(chained.result, { n: 1, notes: ["notes/a"] });

  // Isolation: Jon names the same keys and sees only his own (empty) namespace; a key cannot name another user.
  const jons = await run(jonCred, roomId, { language: "python", load: ["*", "counter"], source: "def main(d):\n    return {'counter': store.get('counter'), 'keys': store.list()}\n" });
  assert.deepEqual(jons.result, { counter: null, keys: [] });
  const escape = await run(jonCred, roomId, { language: "python", load: ["counter"], source: `def main(d):\n    store.put('${ivy.subject.replace(/[^A-Za-z0-9_-]/g, "_")}/counter', 9)\n    return 1\n` });
  assert.equal(escape.status, "ok");
  assert.equal((await run(ivyCred, roomId, { language: "python", load: ["counter"], source: "def main(d):\n    return store.get('counter')\n" })).result, 2, "Ivy's counter is untouched");
  // Loading another user's key by a crafted scope is refused before the run; so is a disk path.
  assert.match((await run(jonCred, roomId, { language: "python", load: ["../x"], source: "def main(d):\n    return 1\n" })).error.message, /invalid key/);
  const disk = await run(jonCred, roomId, { language: "python", source: "def main(d):\n    try:\n        open('/etc/passwd')\n    except NameError as e:\n        return str(e)\n" });
  assert.match(disk.result, /open/);

  // Quota: a value over 1 MiB, or more keys than a run may write, is refused whole, recorded, and nothing is written.
  const big = await run(jonCred, roomId, { language: "python", source: "def main(d):\n    store.put('small', 1)\n    store.put('big', 'x' * 1100000)\n    return 1\n" });
  assert.match(big.store.refused, /one value is at most 1 MiB/);
  const many = await run(jonCred, roomId, { language: "typescript", source: `function main(d) { for (let i = 0; i < ${CODE_LIMITS.writesPerRun + 1}; i++) store.put('k' + i, i); return 1; }` });
  assert.match(many.store.refused, new RegExp(`at most ${CODE_LIMITS.writesPerRun} keys`));
  const listed = await jon.c.query(api.code.objects.list, {});
  assert.deepEqual(listed.objects.filter((o: any) => !o.key.startsWith("runs/")).map((o: any) => o.key), [escape.store.written[0]], "nothing of the refused sets was written");
  const audit = await events(jonCred);
  assert.equal(audit.filter((e: any) => e.op === "refused").length, 2);
  assert.ok((await events(ivyCred)).some((e: any) => e.op === "delete" && e.key === "notes/b" && e.runId === second.runId), "every write is audited with its run");
  assert.ok(!(await events(ivyCred)).some((e: any) => e.subject !== ivy.subject), "the audit is per user");
  // A large value lives in file storage and loads back whole.
  const blob = await run(ivyCred, roomId, { language: "python", source: "def main(d):\n    store.put('blob', 'y' * 200000)\n    return 1\n" });
  assert.deepEqual(blob.store, { written: ["blob"], deleted: [] });
  assert.equal((await run(ivyCred, roomId, { language: "python", load: ["blob"], source: "def main(d):\n    return len(store.get('blob'))\n" })).result, 200000);

  // Saved scripts are objects too: save with saveAs, run by key.
  const saved = await run(ivyCred, roomId, { language: "python", saveAs: "count", load: ["counter"], source: "def main(d):\n    return store.get('counter')\n", title: "Counter" });
  assert.ok(saved.store.written.includes("scripts/count"));
  const rerun = await run(ivyCred, roomId, { script: "scripts/count", load: ["counter"] });
  assert.equal(rerun.result, 2);
  assert.equal(rerun.title, "Counter");
  assert.equal(await errorCode(run(jonCred, roomId, { script: "scripts/count" })), "NOT_FOUND", "another user's saved script does not exist for Jon");
  const mine = await ivy.c.query(api.code.objects.list, { prefix: "scripts/" });
  assert.deepEqual(mine.objects.map((o: any) => o.key), ["scripts/count"]);
  assert.ok(mine.usage.objects >= 4 && mine.limits.objects === CODE_LIMITS.objectsPerUser);
});

test("the object store: the per-user object quota refuses the write that would exceed it", { timeout: 240_000 }, async () => {
  const { members: [lea], roomId } = await startedRoom(["Lea Quota", "Lea Two", "Lea Three"]);
  const cred = await credential(lea, roomId);
  const per = CODE_LIMITS.writesPerRun;
  for (let i = 0; i < CODE_LIMITS.objectsPerUser / per; i++) {
    const r = await run(cred, roomId, { language: "typescript", source: `function main(d) { for (let j = 0; j < ${per}; j++) store.put('q${i}/' + j, j); return 1; }` });
    assert.equal(r.store.written.length, per, JSON.stringify(r.store));
  }
  const over = await run(cred, roomId, { language: "python", source: "def main(d):\n    store.put('one-more', 1)\n    return 1\n" });
  assert.match(over.store.refused, new RegExp(`would hold ${CODE_LIMITS.objectsPerUser + 1} objects; the limit is ${CODE_LIMITS.objectsPerUser}`));
  // Replacing an existing key is not a new object; deleting makes room.
  assert.deepEqual((await run(cred, roomId, { language: "python", source: "def main(d):\n    store.put('q0/0', 'new')\n    return 1\n" })).store, { written: ["q0/0"], deleted: [] });
  assert.deepEqual((await run(cred, roomId, { language: "python", source: "def main(d):\n    store.delete('q0/1')\n    store.put('one-more', 1)\n    return 1\n" })).store, { written: ["one-more"], deleted: ["q0/1"] });
});

test("run_code: a clipped non-ASCII result pages exactly; a tampered store export is refused, never a stuck run", { timeout: 240_000 }, async () => {
  const { members: [mo], roomId } = await startedRoom(["Mo Pages", "Mo Two", "Mo Three"]);
  const cred = await credential(mo, roomId);
  const big = await run(cred, roomId, { language: "python", source: "def main(d):\n    return ['café %d' % i for i in range(30000)]\n" });
  assert.equal(big.status, "ok", JSON.stringify(big.error));
  const row = await mo.c.query(api.code.runs.get, { roomId, runId: big.runId });
  assert.equal(row.clipped, true);
  const whole = await admin.action(internal.code.execute.fullText, { principal: { credentialId: cred }, roomId, runId: big.runId });
  assert.equal(whole.result.length, row.resultChars, "the whole text is the run's own (ASCII-escaped) JSON");
  assert.ok(whole.result.startsWith(row.resultJson), "the row's prefix is a prefix of the whole");
  assert.equal(JSON.parse(whole.result)[29999], "café 29999");
  const tampered = await run(cred, roomId, { language: "typescript",
    source: "function main(d) { store.put('k', 1); Array.prototype.join = function () { return '}}{'; }; Object.fromEntries = null; return 1; }" });
  assert.equal(tampered.status, "ok");
  assert.match(tampered.store.refused, /malformed/);
  assert.equal((await mo.c.query(api.code.runs.get, { roomId, runId: tampered.runId })).status, "ok", "the run finished");
  assert.deepEqual((await mo.c.query(api.code.objects.list, {})).objects.filter((o: any) => !o.key.startsWith("runs/")), []);
});
