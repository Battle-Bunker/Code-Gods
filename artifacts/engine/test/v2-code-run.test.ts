/**
 * code.run (v1's run_code, A15): a read-only script over one dataset of the game in view, run in its own sandbox and
 * kept for its author. The datasets respect the read rules: my-moves is the caller's act log as v2/play:moves shows it,
 * replay is an ended game's stored record only.
 *
 * What would break: a script that sees data its author could not read (another player's act log; a live game's
 * replay); a run that is not kept or that another human can read; a script error that fails the operation.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, bo: Human, sy: Human, gameId: string;
const COUNT = "export function main(rows: { mine: boolean }[]) { console.log('rows', rows.length); return { rows: rows.length, mine: rows.filter(r => r.mine).length }; }";

before(async () => {
  [ada, bo, sy] = await humans("Code Ada", "Code Bo", "Code Sy");
  ({ gameId } = await admin.mutation("v2/testing:seedGame", { owner: ada.userId, humans: [bo.userId], spectators: [sy.userId], moves: 4 }));
});

test("my-moves: the caller's own act log, as they read it; the run is kept for its author only", async () => {
  const shown = (await ada.query("v2/play:moves", { gameId, paginationOpts: { numItems: 100, cursor: null } })).page;
  const r = await perform(ada, "code.run", { language: "typescript", source: COUNT, dataset: "my-moves", title: "Count" }, { gameId }, "action");
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.result.status, "ok", JSON.stringify(r.result));
  assert.deepEqual(JSON.parse(r.result.resultPreview), { rows: shown.length, mine: shown.filter((m: any) => m.mine).length });
  assert.equal(r.result.output, `rows ${shown.length}`);

  const got = await perform(ada, "code.get", { runId: r.result.runId }, {}, "query");
  assert.equal(got.ok, true, JSON.stringify(got));
  assert.deepEqual([got.result.title, got.result.dataset, got.result.status, got.result.source], ["Count", "my-moves", "ok", COUNT]);
  assert.deepEqual(got.result.result, { rows: shown.length, mine: shown.filter((m: any) => m.mine).length });
  assert.equal((await perform(bo, "code.get", { runId: r.result.runId }, {}, "query")).ok, false, "another human never reads it");
  const list = await perform(ada, "code.list", { limit: 10 }, {}, "query");
  assert.equal(list.result.page[0].runId, r.result.runId);
  assert.equal((await perform(bo, "code.list", { limit: 10 }, {}, "query")).result.page.length, 0);
});

test("a script error is a kept run with its error, not a failed operation; params reach main", async () => {
  const bad = await perform(ada, "code.run", { language: "javascript", source: "function main() { throw new Error('nope'); }", dataset: "none" }, { gameId }, "action");
  assert.equal(bad.ok, true);
  assert.equal(bad.result.status, "error"); assert.match(bad.result.error, /nope/);
  const p = await perform(ada, "code.run", { language: "javascript", source: "function main(d, p) { return p.k * 2; }", dataset: "none", params: { k: 21 } }, { gameId }, "action");
  assert.equal(p.result.resultPreview, "42");
});

test("the read rules: no replay while live, no act log for a spectator", async () => {
  const live = await perform(ada, "code.run", { language: "javascript", source: "function main(d) { return d; }", dataset: "replay" }, { gameId }, "action");
  assert.equal(live.ok, false); assert.match(live.error.message, /once it has ended/);
  const spectator = await perform(sy, "code.run", { language: "javascript", source: "function main(d) { return d; }", dataset: "my-moves" }, { gameId }, "action");
  assert.equal(spectator.ok, false); assert.match(spectator.error.message, /seated player/);
});
