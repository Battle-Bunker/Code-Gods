/** View operations: the layout reducer, its checks, the fake's stored view, and useAffordance's handle. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DIRECTORY, EMPTY_VIEW, PRINCIPALS, VIEW_REDUCERS, applyView, pinnedRep, type AffordanceContext } from "../src/index.ts";
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
});

test("replay controls move a cursor and refuse without a replay", () => {
  const replay: AffordanceContext = { context: "replay", principal: PRINCIPALS.member! };
  assert.deepEqual(applyView(EMPTY_VIEW, "replay.step", { by: 3 }, replay).outcome,
    { ok: false, error: { code: "failed", message: "Open a replay first.", fix: "replay.open" } });
  let v = applyView(EMPTY_VIEW, "replay.open", { gameId: "g1" }, replay).view;
  v = applyView(v, "replay.step", { by: 3 }, replay).view;
  v = applyView(v, "replay.step", { by: -10 }, replay).view;
  v = applyView(v, "replay.speed", { speed: 4 }, replay).view;
  assert.deepEqual(v.replay, { gameId: "g1", seq: 0, worldSeconds: null, playing: false, speed: 4 });
  assert.equal(applyView(v, "replay.speed", { speed: 3 }, replay).outcome.ok, false);
  assert.equal((applyView(v, "replay.play", {}, live).outcome as { ok: false; error: { message: string } }).error.message, "Not available while the game runs.");
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
  await assert.rejects(pause.run({}), (e: unknown) => e instanceof AffordanceError && e.message === "Too dear." && e.code === "failed");
  assert.deepEqual(calls, [["game.pause", {}]]);
});
