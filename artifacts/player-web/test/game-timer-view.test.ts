import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameTimerView } from "../src/core/game-timer-view.ts";

const html = (timer: Parameters<typeof GameTimerView>[0]["timer"]) => renderToStaticMarkup(createElement(GameTimerView, { timer }));

test("a fixed game shows the exact remaining time as a non-announcing timer", () => {
  const h = html({ kind: "fixed", seconds: 3725, paused: false });
  assert.match(h, /role="timer"/);
  assert.match(h, /aria-live="off"/);
  assert.match(h, />1:02:05</);
  assert.match(h, /aria-label="Game ends in 1:02:05\./);
});

test("a half-life game shows the 90% range with its explanation", () => {
  const h = html({ kind: "halfLife", lo: 22.2, hi: 1296.6, halfLifeSeconds: 300, paused: false });
  assert.match(h, />0:22–21:37</);
  assert.match(h, />90%</);
  assert.match(h, /same chance of ending \(half-life 5:00\)/);
});

test("paused and planning states", () => {
  assert.match(html({ kind: "fixed", seconds: 10, paused: true }), /data-paused="true"[^>]*>.*paused/);
  assert.match(html({ kind: "planning", seconds: 169, held: false }), /World starts in.*>2:49</);
  assert.match(html({ kind: "planning", seconds: 0, held: true }), /sandboxes are warming up/);
  assert.equal(html(null), "");
});

test("an ended game stands at 0:00 (or 'ended' when its owner stopped it): never mistaken for a stall", () => {
  const lifetime = html({ kind: "ended", reason: "lifetime", world: 600 });
  assert.match(lifetime, /Game over.*>0:00<.*time is up \(10:00 of world time\)/);
  assert.match(html({ kind: "ended", reason: "owner", world: 75 }), /Game over.*>ended<.*the owner ended it at 1:15/);
});
