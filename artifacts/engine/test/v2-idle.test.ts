/**
 * Idle parking (v1's rule, restored; convex/v2/activity.ts): after 30 minutes without human activity a live game parks
 * at its next commit (paused, `parked`: no ticks), and the next human activity (`account.touch`) resumes it; a
 * read-only connection cannot wake it.
 *
 * What would break: a game that ticks (and costs) forever with nobody there; a parked game nothing wakes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

test("nobody for 30 minutes: the game parks and stops ticking; a human's touch resumes it", { timeout: 120_000 }, async () => {
  const [ada] = await humans("Idle Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Idle room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  const header = () => ada!.query("v2/games:header", { gameId });
  try {
    await admin.mutation("v2/testing:setActivity", { at: Date.now() - 31 * 60_000 });
    for (let i = 0; !(await header()).parked; i++) {
      assert.ok(i < 40, "the game parks at a commit once the engine is idle");
      await new Promise(r => setTimeout(r, 250));
    }
    const parked = await header();
    assert.deepEqual([parked.phase, parked.parked, parked.endsAt], ["paused", true, null]);
    const commits = async () => (await admin.query("v2/testing:clock", { gameId })).commits as number;
    const before = await commits();
    await new Promise(r => setTimeout(r, 3000));
    assert.equal(await commits(), before, "a parked game does not tick");

    const touched = await perform(ada!, "account.touch", {}, {});
    assert.equal(touched.ok, true, JSON.stringify(touched));
    assert.ok(touched.result.resumed >= 1, "the touch resumed the parked game");
    const back = await header();
    assert.deepEqual([back.phase, back.parked], ["live", false]);
    assert.ok(back.endsAt > Date.now(), "the end is set again");
    for (let i = 0; (await commits()) <= before; i++) { assert.ok(i < 40, "it ticks again"); await new Promise(r => setTimeout(r, 250)); }
  } finally {
    await admin.mutation("v2/testing:setActivity", { at: Date.now() });
    await perform(ada!, "game.end", {}, { gameId });
  }
});
