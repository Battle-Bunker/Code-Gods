/**
 * Defence goals (v1, restored; owner-decisions call 1), live: off by default; a room on a grids preset may turn them
 * on, and then every seat is dealt one beside its rule (rule.explain shows it) and the game plays on; a lines room is
 * refused. What would break: the setting not reaching the deal, a deal on lines, or values that stop the game.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

test("defence goals: off by default, refused on lines, dealt to every seat on grids", { timeout: 240_000 }, async () => {
  const [ada] = await humans("Defence Ada");
  const lines = (await perform(ada!, "room.create", { name: "Defence lines" })).result.roomId;
  await assert.rejects(perform(ada!, "room.settings", { overrides: { defenceGoals: true } }, { roomId: lines }), /grids only/);

  const roomId = (await perform(ada!, "room.create", { name: "Defence grids", preset: "grids-beginner" })).result.roomId;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const g0 = (await perform(ada!, "game.start", {}, { roomId })).result.gameId;
  assert.equal((await perform(ada!, "rule.explain", {}, { gameId: g0 }, "query")).result.defence, null, "off by default");
  await perform(ada!, "game.end", {}, { gameId: g0 });

  assert.equal((await perform(ada!, "room.settings", { overrides: { defenceGoals: true, penaltyWeight: 2 } }, { roomId })).ok, true);
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const d = (await perform(ada!, "rule.explain", {}, { gameId }, "query")).result.defence;
  assert.ok(d && ["hated-number", "number-crowd"].includes(d.family) && d.card.length > 0, JSON.stringify(d));
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  await new Promise(r => setTimeout(r, 6_000));
  const log = (await ada!.query("v2/play:log", { gameId, paginationOpts: { numItems: 50, cursor: null } })).page;
  assert.ok(log.length > 0 && log.every((r: any) => r.own === null || Number.isFinite(r.own)), "the game plays on with finite bits");
  // The practice partners' agents act with their defence goals in the host (tick.ts): acts are judged, nothing fails.
  let acts: any[] = [];
  for (let i = 0; !acts.length; i++) {
    assert.ok(i < 60, "the partners' agents act");
    acts = (await admin.query("v2/testing:events", { gameId, after: -1 })).filter((e: any) => e.kind === "act");
    if (!acts.length) await new Promise(r => setTimeout(r, 500));
  }
  // A quote says the bits the commit would pay, the penalty taken off (a move to any cell: one of the two directions is allowed).
  const quotes = await Promise.all(["1", "-1"].map(k => perform(ada!, "object.quote", { objectId: log[0].objectId, calls: [{ mutator: "cells.add", args: { cell: "r0c0", k } }] }, { gameId }, "query")));
  const after = quotes.map((q: any) => q.result).find((r: any) => r.valid)!.after;
  assert.ok(after && Number.isFinite(after.bits), JSON.stringify(after));
  await perform(ada!, "game.end", {}, { gameId });
});
