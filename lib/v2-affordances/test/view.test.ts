/** View operations: the layout reducer, its checks, the fake's stored view, and useAffordance's handle. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DIRECTORY, EMPTY_VIEW, PRINCIPALS, VIEW_REDUCERS, applyView, pinnedRep, REPLAY_END, SCORING_PAGE, type AffordanceContext } from "../src/index.ts";
import { createFake } from "../src/fake.ts";
import { AffordanceError, affordanceHandle } from "../src/react.ts";

const live: AffordanceContext = { context: "live", principal: PRINCIPALS.seated! };

test("every view operation has a reducer (signing in is the auth client's)", () => {
  const client = DIRECTORY.filter(a => a.runs === "client").map(a => a.id).filter(id => id !== "account.signIn").sort();
  assert.deepEqual(Object.keys(VIEW_REDUCERS).sort(), client);
});

test("representation pins and switching", () => {
  let v = EMPTY_VIEW;
  const apply = (id: string, args: unknown) => { const r = applyView(v, id, args, live); assert.ok(r.outcome.ok, JSON.stringify(r.outcome)); v = r.view; };
  apply("view.pinRepresentation", { rep: "cart" });
  apply("view.pinRepresentation", { rep: "mach", family: "nearIntercept" });
  assert.equal(pinnedRep(v, "nearIntercept", "si"), "mach");
  assert.equal(pinnedRep(v, "closeGradient", "si"), "cart");
  apply("view.compareRepresentations", { objectId: "o1", reps: ["si", "cart", "si"] });
  assert.deepEqual(v.focus, { objectId: "o1", reps: ["si", "cart"] });
  apply("view.showRepresentation", { objectId: "o1", rep: "gen" });
  assert.deepEqual(v.focus, { objectId: "o1", reps: ["gen"] });
  assert.deepEqual(v.panes, [{ pane: "object", place: "main" }]);
  assert.equal(v.version, 4);
  assert.equal(pinnedRep(v, "constructor", "si"), "cart", "only own pins count");
  const same = applyView(v, "view.showRepresentation", { objectId: "o1", rep: "gen" }, live);
  assert.deepEqual([same.changed, same.view.version, same.outcome], [false, 4, { ok: true, result: { ok: true, layoutVersion: 4 } }]);
});

test("opening an open pane keeps the order; opening another object shows its rule's representations", () => {
  let v = { ...EMPTY_VIEW, panes: [{ pane: "object", place: "main" as const }, { pane: "agents", place: "left" as const }] };
  v = applyView(v, "view.showRepresentation", { objectId: "o1", rep: "si" }, live).view;
  assert.deepEqual(v.panes.map(p => p.pane), ["object", "agents"]);
  v = applyView(v, "view.openPane", { pane: "object", place: "right" }, live).view;
  assert.deepEqual(v.panes, [{ pane: "object", place: "right" }, { pane: "agents", place: "left" }]);
  v = applyView(v, "view.openObject", { objectId: "o2" }, live).view;
  assert.deepEqual(v.focus, { objectId: "o2", reps: [] });
});

test("replay controls move a cursor and refuse without a replay", () => {
  const replay: AffordanceContext = { context: "replay", principal: PRINCIPALS.member! };
  assert.deepEqual(applyView(EMPTY_VIEW, "replay.step", { by: 3 }, replay).outcome,
    { ok: false, error: { code: "failed", message: "Open a replay first.", fix: "replay.open" } });
  let v = applyView(EMPTY_VIEW, "replay.open", { gameId: "g1" }, replay).view;
  // v1 opened a replay at its end (the final board; parity e2e-replay-shot): every event up to any game's end.
  assert.deepEqual(v.replay!.cursor, REPLAY_END);
  v = applyView(v, "replay.step", { by: -2 }, replay).view;
  assert.deepEqual(v.replay!.cursor, { ...REPLAY_END, plus: -2 }, "a step back from the end moves back from it");
  v = applyView(v, "replay.seek", { seq: 0 }, replay).view;
  v = applyView(v, "replay.step", { by: 3 }, replay).view;
  v = applyView(v, "replay.step", { by: -10 }, replay).view;
  v = applyView(v, "replay.speed", { speed: 4 }, replay).view;
  assert.deepEqual(v.replay, { gameId: "g1", cursor: { seq: 0 }, playing: false, speed: 4 });
  v = applyView(v, "replay.seek", { worldSeconds: 120 }, replay).view;
  v = applyView(v, "replay.step", { by: 1 }, replay).view;
  assert.deepEqual(v.replay!.cursor, { worldSeconds: 120, plus: 1 }, "a step after a seek by time moves on from that time");
  assert.equal(applyView(v, "replay.seek", { seq: 3, worldSeconds: 1 }, replay).outcome.ok, false);
  v = applyView(v, "view.closePane", { pane: "replay" }, replay).view;
  assert.equal(v.replay, null);
  assert.equal(applyView(v, "replay.play", {}, replay).outcome.ok, false, "no controls on a closed replay");
  assert.equal(applyView(v, "replay.speed", { speed: 3 }, replay).outcome.ok, false);
  assert.equal((applyView(v, "replay.play", {}, live).outcome as { ok: false; error: { message: string } }).error.message, "Not available while the game runs.");
});

test("the replay jumps to its start and to its end in one step (v1: \"Replay: jump to the start\")", () => {
  // Catches: a palette or an assistant that can only seek with a number, so "jump to the start" needs a value.
  const replay: AffordanceContext = { context: "replay", principal: PRINCIPALS.member! };
  let v = applyView(EMPTY_VIEW, "replay.open", { gameId: "g1" }, replay).view;
  v = applyView(v, "replay.play", {}, replay).view;
  v = applyView(v, "replay.start", {}, replay).view;
  assert.deepEqual(v.replay!.cursor, { seq: 0 }, "the start: before the first event");
  assert.equal(v.replay!.playing, false, "a jump stops play");
  v = applyView(v, "replay.end", {}, replay).view;
  assert.deepEqual(v.replay!.cursor, REPLAY_END);
  assert.equal(applyView(EMPTY_VIEW, "replay.start", {}, replay).outcome.ok, false, "no replay open");
});

test("a replay is watched through one player's eyes, chosen by the human and kept while the cursor moves", () => {
  // Catches: the point of view lost on a seek or a step (the panes would jump back to the viewer's own rule).
  const replay: AffordanceContext = { context: "replay", principal: PRINCIPALS.member! };
  assert.equal(applyView(EMPTY_VIEW, "replay.watchAs", { memberId: "m2" }, replay).outcome.ok, false, "no replay open");
  let v = applyView(EMPTY_VIEW, "replay.open", { gameId: "g1" }, replay).view;
  v = applyView(v, "replay.watchAs", { memberId: "m2" }, replay).view;
  v = applyView(v, "replay.seek", { seq: 40 }, replay).view;
  v = applyView(v, "replay.step", { by: 2 }, replay).view;
  assert.deepEqual(v.replay, { gameId: "g1", cursor: { seq: 42 }, playing: false, speed: 1, as: "m2" });
  v = applyView(v, "replay.open", { gameId: "g2" }, replay).view;
  assert.equal(v.replay!.as, undefined, "another game starts from the human's own seat");
});

test("a remote assistant changes what the human sees; a read-only credential cannot", async () => {
  const f = createFake();
  for (const u of ["u1", "u2", "u3"]) f.addUser(u, u);
  const { roomId, code } = (await f.perform({ userId: "u1" }, "room.create", {}) as { result: { roomId: string; code: string } }).result;
  for (const u of ["u2", "u3"]) await f.perform({ userId: u }, "room.join", { code });
  await f.perform({ userId: "u1", roomId }, "game.start", {});
  const viaMcp = await f.perform({ userId: "u2", roomId, grant: "act", via: "mcp" }, "view.pinRepresentation", { rep: "cart" });
  assert.deepEqual(viaMcp, { ok: true, result: { ok: true, layoutVersion: 1 } });
  assert.equal(f.state.views[`u2|${roomId}`]!.pins["*"], "cart");
  const readOnly = await f.perform({ userId: "u2", roomId, grant: "read", via: "mcp" }, "view.openPane", { pane: "agents" });
  assert.ok(!readOnly.ok && readOnly.error.code === "refused");
  await f.perform({ userId: "u1", roomId }, "game.end", {});
  const gameId = f.state.rooms[roomId]!.games[0]!;
  assert.ok((await f.perform({ userId: "u2", roomId, via: "mcp" }, "replay.open", { gameId })).ok);
  assert.ok((await f.perform({ userId: "u2", roomId, gameId, replay: true, via: "mcp" }, "replay.play", {})).ok, "an assistant drives the human's replay");
});

test("useAffordance's handle: availability, reason, confirmation, and run through perform", async () => {
  const calls: unknown[] = [];
  const rt = {
    context: { ...live, game: { phase: "live" as const, energy: 0 } },
    perform: async (id: string, args: unknown) => { calls.push([id, args]); return { ok: false as const, error: { code: "failed" as const, message: "Too dear." } }; },
  };
  const summon = affordanceHandle("agent.summon", rt);
  assert.deepEqual([summon.available, summon.reason, summon.confirm, summon.spends], [false, "You have no energy left; it accrues over time.", "summary", "energy"]);
  const end = affordanceHandle("game.end", rt);
  assert.deepEqual([end.available, end.hidden, end.reason], [false, true, "Only the room owner can do this."]);
  const pause = affordanceHandle("game.pause", rt);
  assert.equal(pause.available, true);
  await assert.rejects(pause.run({}), (e: unknown) => e instanceof AffordanceError && e.message === "Too dear." && e.code === "failed" && e.name === "AffordanceError");
  assert.deepEqual(calls, [["game.pause", {}]]);
});

test("objects sort by rarity and filter by bits (decision 23: values, not levels)", () => {
  let v = applyView(EMPTY_VIEW, "view.sortObjects", { sort: "rarity" }, live).view;
  v = applyView(v, "view.filterObjects", { minBits: 2.5 }, live).view;
  assert.deepEqual(v.objects, { sort: "rarity", filter: { minBits: 2.5 } });
  assert.equal(applyView(v, "view.sortObjects", { sort: "level" }, live).outcome.ok, false);
});

test("the glossary stays closed once closed: closing it is stored in the view, not only on one screen", () => {
  let v = applyView(EMPTY_VIEW, "view.showGlossary", { term: "bits" }, live).view;
  assert.equal(v.glossary, "bits");
  const r = applyView(v, "view.closeGlossary", {}, live);
  assert.ok(r.outcome.ok);
  v = r.view;
  assert.equal(v.glossary, null);
  assert.equal(applyView(v, "view.showGlossary", {}, live).view.glossary, "");
});

test("How scoring works (v1's sheet) opens the glossary at its scoring page, for anyone, and closes like it", () => {
  let v = applyView(EMPTY_VIEW, "view.showScoring", {}, live).view;
  assert.equal(v.glossary, SCORING_PAGE);
  v = applyView(v, "view.closeGlossary", {}, live).view;
  assert.equal(v.glossary, null);
});

test("opening an object from a move keeps the move's words, as v1's 'Opened from:'; opening it otherwise drops them", () => {
  let v = applyView(EMPTY_VIEW, "view.openObject", { objectId: "o1", from: "Your agent Tally-1 added 4 to row 1, column 1" }, live).view;
  assert.equal(v.focus?.from, "Your agent Tally-1 added 4 to row 1, column 1");
  v = applyView(v, "view.openObject", { objectId: "o1" }, live).view;
  assert.equal(v.focus?.from, undefined);
});
