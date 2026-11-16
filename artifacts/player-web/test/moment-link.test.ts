import { test } from "node:test";
import assert from "node:assert/strict";
import { momentLink, parseMoment, replayKey } from "../src/replay/moment-link.ts";

test("a moment link opens the replay at a world time, as a player", () => {
  const url = momentLink("https://x.test/rooms/r1/games/g1?foo=1", { worldSeconds: 83.4, as: "m2" });
  assert.equal(url, "https://x.test/rooms/r1/games/g1?foo=1&replay=&t=83&as=m2");
  assert.deepEqual(parseMoment(new URL(url).search), { worldSeconds: 83, as: "m2" });
});

test("a plain ?replay has no moment; nonsense times are ignored", () => {
  assert.deepEqual(parseMoment("?replay"), { worldSeconds: null, as: null });
  assert.deepEqual(parseMoment("?replay&t=-4&as="), { worldSeconds: null, as: null });
});

test("keys: space plays, arrows step, Home and End jump; typing in a field is left alone", () => {
  assert.equal(replayKey({ key: " " }), "toggle");
  assert.equal(replayKey({ key: "ArrowLeft" }), "back");
  assert.equal(replayKey({ key: "ArrowRight" }), "forward");
  assert.equal(replayKey({ key: "Home" }), "start");
  assert.equal(replayKey({ key: "End" }), "end");
  assert.equal(replayKey({ key: "ArrowRight", target: "INPUT" }), null);
  assert.equal(replayKey({ key: " ", target: "BUTTON" }), null);
  assert.equal(replayKey({ key: "ArrowRight", ctrl: true }), null);
});
