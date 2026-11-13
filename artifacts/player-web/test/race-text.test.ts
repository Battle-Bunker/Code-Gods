/** The leaderboard's words (src/core/panels/race-text.ts). What would break: a scoreboard that looks live while it is seconds old, or two figures for one player with nothing to tell them apart. */
import test from "node:test";
import assert from "node:assert/strict";
import { ownNow, publishedLine } from "../src/core/panels/race-text.ts";

test("the pane says how old its scores are and when the next ones come", () => {
  assert.equal(publishedLine({ worldNow: 132, publishedAt: 120, interval: 15 }), "Scores as published 12 s ago; the next update is in about 3 s.");
  assert.equal(publishedLine({ worldNow: 120.4, publishedAt: 120, interval: 15 }), "Scores as published just now; the next update is in about 15 s.");
  assert.equal(publishedLine({ worldNow: 136, publishedAt: 120, interval: 15 }), "Scores as published 16 s ago; the next update is due.");
  assert.equal(publishedLine({ worldNow: 132, publishedAt: 120 }), "Scores as published 12 s ago.", "only the age is known");
  assert.equal(publishedLine({ worldNow: 132, publishedAt: undefined, interval: 15 }), null);
  assert.equal(publishedLine({ worldNow: undefined, publishedAt: 120 }), null);
  assert.equal(publishedLine({ worldNow: 300, publishedAt: 300, interval: 15, ended: true }), "Final scores.");
});

test("the player's own row shows the fresher figure only when it is newer and differs", () => {
  const format = (v: number) => v.toFixed(1);
  assert.equal(ownNow({ published: 272, publishedAt: 120, fresher: { score: 593.8, world: 131 }, format }), "593.8");
  assert.equal(ownNow({ published: 272, publishedAt: 120, fresher: { score: 272.02, world: 131 }, format }), null, "shows the same");
  assert.equal(ownNow({ published: 272, publishedAt: 120, fresher: { score: 250, world: 110 }, format }), null, "older than the publication");
  assert.equal(ownNow({ published: 272, publishedAt: 120, fresher: { score: 250 }, format }), null, "an undated figure is not 'now'");
  assert.equal(ownNow({ published: 272, publishedAt: 120, fresher: null, format }), null);
});
