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

test("saved scripts (v1's saveAs / script): saved after a good run, run again by name, listed, deleted, the author's own", async () => {
  const name = `count-${Date.now()}`;
  const saved = await perform(ada, "code.run", { language: "typescript", source: COUNT, dataset: "my-moves", saveAs: name, title: "Count mine" }, { gameId }, "action");
  assert.equal(saved.result.saved, name, JSON.stringify(saved.result));
  const bad = await perform(ada, "code.run", { language: "javascript", source: "function main() { throw new Error('x'); }", dataset: "none", saveAs: `${name}-bad` }, { gameId }, "action");
  assert.equal(bad.result.saved, null, "a run with an error saves nothing");
  const again = await perform(ada, "code.run", { script: name, dataset: "my-moves" }, { gameId }, "action");
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.deepEqual([again.result.title, again.result.resultPreview], ["Count mine", saved.result.resultPreview]);
  const list = (await perform(ada, "code.scripts", {}, {}, "query")).result.scripts.map((s: any) => s.name);
  assert.ok(list.includes(name) && !list.includes(`${name}-bad`), list.join(", "));
  assert.equal((await perform(bo, "code.run", { script: name, dataset: "my-moves" }, { gameId }, "action")).ok, false, "another human's script is not theirs to run");
  assert.equal((await perform(ada, "code.deleteScript", { name }, {})).result.deleted, true);
  assert.equal((await perform(ada, "code.run", { script: name, dataset: "none" }, { gameId }, "action")).ok, false, "deleted");
});

test("the object store (v1's): a good run's writes kept per game, loaded by key or prefix, listed; an error writes nothing", async () => {
  const w = await perform(ada, "code.run", { language: "javascript", source: "function main(rows) { store.set('stats/moves', rows.length); store.set('stats/first', rows[0] ? rows[0].seq : null); return 'ok'; }", dataset: "my-moves" }, { gameId }, "action");
  assert.deepEqual(w.result.store, { written: ["stats/first", "stats/moves"], deleted: [] }, JSON.stringify(w.result));
  const r = await perform(ada, "code.run", { language: "javascript", source: "function main() { return [store.keys(), store.get('stats/moves')]; }", dataset: "none", load: ["stats/*"] }, { gameId }, "action");
  const [keys, moves] = JSON.parse(r.result.resultPreview);
  assert.deepEqual(keys, ["stats/first", "stats/moves"]); assert.ok(moves > 0);
  const bad = await perform(ada, "code.run", { language: "javascript", source: "function main() { store.set('stats/moves', -1); throw new Error('no'); }", dataset: "none" }, { gameId }, "action");
  assert.equal(bad.result.store, null);
  const listed = (await perform(ada, "code.objects", { prefix: "stats/" }, { gameId }, "query")).result.objects.map((o: any) => o.key);
  assert.deepEqual(listed, ["stats/first", "stats/moves"]);
  const again = await perform(ada, "code.run", { language: "javascript", source: "function main() { return store.get('stats/moves'); }", dataset: "none", load: ["stats/moves"] }, { gameId }, "action");
  assert.equal(again.result.resultPreview, String(moves), "the failed run wrote nothing");
  assert.deepEqual((await perform(bo, "code.objects", {}, { gameId }, "query")).result.objects, [], "another human's store is their own");
  const badKey = await perform(ada, "code.run", { language: "javascript", source: "function main() { store.set('bad key!', 1); return 1; }", dataset: "none" }, { gameId }, "action");
  assert.ok("refused" in badKey.result.store, "a key outside the alphabet is refused, nothing written");
});
