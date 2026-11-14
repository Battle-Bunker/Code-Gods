/** The bid phase (plan §5.9) through the directory and the fake: sealed bids, exclusive wins, the auction record. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFake } from "../src/fake.ts";
import { callTool } from "../src/mcp.ts";
import { paletteFor } from "../src/index.ts";

test("bid from the screen and from the assistant; the top bid wins its family; the auction is disclosed by phase", async () => {
  const f = createFake();
  for (const u of ["u1", "u2", "u3", "u4"]) f.addUser(u, u.toUpperCase());
  const { roomId, code } = (await f.perform({ userId: "u1" }, "room.create", {}) as { result: { roomId: string; code: string } }).result;
  for (const u of ["u2", "u3", "u4"]) await f.perform({ userId: u }, "room.join", { code });
  await f.perform({ userId: "u4", roomId }, "room.setSpectator", { spectator: true });
  await f.perform({ userId: "u1", roomId }, "room.settings", { preset: "lines-beginner-bidding" });
  assert.deepEqual(await f.perform({ userId: "u1", roomId }, "game.start", {}), { ok: true, result: { gameId: null, bidPhase: true } });
  assert.deepEqual((await f.perform({ userId: "u1", roomId }, "game.start", {}) as { ok: false; error: { message: string } }).error.message,
    "The bid phase is open; the deal follows when it closes.");

  const ctx = f.contextFor("u2", roomId);
  assert.ok(paletteFor(ctx).some(e => e.id === "bid.place" && e.availability.ok));
  const viaAssistant = await callTool("bid_place", { family: "closeGradient", percent: 30 }, ctx, "assistant",
    (id, args) => f.perform({ userId: "u2", roomId, via: "assistant" }, id, args));
  assert.equal(viaAssistant.isError, false);
  assert.ok((await f.perform({ userId: "u3", roomId }, "bid.place", { family: "closeGradient", percent: 40 })).ok);
  assert.ok((await f.perform({ userId: "u3", roomId }, "bid.place", { family: "pegCount", percent: 10 })).ok);
  assert.equal((await f.perform({ userId: "u3", roomId }, "bid.place", { family: "nonsense", percent: 10 }) as { ok: false; error: { message: string } }).error.message, "nonsense is not on offer.");
  assert.equal((await f.perform({ userId: "u4", roomId }, "bid.place", { family: "pegCount", percent: 10 }) as { ok: false; error: { code: string } }).error.code, "refused", "spectators do not bid");
  const state = await f.perform({ userId: "u3", roomId }, "bid.state", {}) as { ok: true; result: { mine: unknown[] } };
  assert.deepEqual(state.result.mine, [{ family: "closeGradient", percent: 40 }, { family: "pegCount", percent: 10 }], "only my own bids: sealed");

  for (const u of ["u1", "u2", "u3"]) assert.ok((await f.perform({ userId: u, roomId }, "bid.done", {})).ok);
  const room = f.state.rooms[roomId]!, game = f.state.games[room.gameId!]!;
  assert.equal(room.bid, null);
  assert.equal(game.rules.u3, "closeGradient", "the top bid wins exclusively; u3's other bid drops");
  assert.notEqual(game.rules.u2, "closeGradient");
  assert.equal((await f.perform({ userId: "u2", roomId }, "bid.place", { family: "pegCount", percent: 5 }) as { ok: false; error: { code: string } }).error.code, "refused");

  const during = await f.perform({ userId: "u2", roomId }, "game.auction", {}) as { ok: true; result: { disclosure: string; wins: { memberId: string; handicap: number }[]; bids: unknown } };
  assert.deepEqual([during.result.disclosure, during.result.bids], ["handicaps", null]);
  const u3member = room.members.find(m => m.userId === "u3")!.memberId;
  assert.deepEqual(during.result.wins.map(w => [w.memberId, w.handicap]), [[u3member, 40]]);
  const rule = await f.perform({ userId: "u3", roomId }, "rule.explain", {}) as { ok: true; result: { wonByBid: unknown } };
  assert.deepEqual(rule.result.wonByBid, { handicap: 40 });
  const standings = await f.perform({ userId: "u2", roomId }, "game.standings", {}) as { ok: true; result: { rows: { memberId: string; points: number; handicap: number; net: number }[] } };
  const u3 = standings.result.rows.find(r => r.memberId === u3member)!;
  assert.deepEqual([u3.handicap, u3.net], [40, u3.points - 0.4 * Math.abs(u3.points)], "the handicap comes off the total only");
  await f.perform({ userId: "u1", roomId }, "game.end", {});
  const after = await f.perform({ userId: "u2", roomId, gameId: game.gameId }, "game.auction", {}) as { ok: true; result: { bids: unknown[] } };
  assert.equal(after.result.bids.length, 3, "everything after the end");
});

test("when bids win every family, the other players are still dealt a rule", async () => {
  const f = createFake();
  const users = ["u1", "u2", "u3", "u4", "u5", "u6"];
  for (const u of users) f.addUser(u, u);
  const { roomId, code } = (await f.perform({ userId: "u1" }, "room.create", { preset: "lines-beginner-bidding" }) as { result: { roomId: string; code: string } }).result;
  for (const u of users.slice(1)) await f.perform({ userId: u }, "room.join", { code });
  await f.perform({ userId: "u1", roomId }, "game.start", {});
  const families = ["closeGradient", "nearIntercept", "pegCount", "triangleArea"];
  for (const [i, family] of families.entries()) await f.perform({ userId: users[i]!, roomId }, "bid.place", { family, percent: 10 });
  for (const u of users) await f.perform({ userId: u, roomId }, "bid.done", {});
  const game = f.state.games[f.state.rooms[roomId]!.gameId!]!;
  for (const u of users) assert.ok(families.includes(game.rules[u]!), `${u} has ${game.rules[u]}`);
});
