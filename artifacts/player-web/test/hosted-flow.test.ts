/**
 * The browser client's sign-in steps (src/core/hosted-flow.ts): which room the page is for, when it may send the
 * browser to the engine by itself (never in a loop, never from inside a frame, where Google sign-in cannot load), and
 * when it plays. What would break: a redirect loop after a denial, an iframe sent to the engine, or a session of
 * another room used for the room in the URL.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { autoRedirectAllowed, hostedStep, roomKey } from "../src/core/hosted-flow.ts";

const session = { roomId: "r1", roomCode: "ABCD1234" };

test("room references match in any case, with or without dashes", () => {
  assert.equal(roomKey(" abcd-1234 "), "ABCD1234");
  assert.equal(roomKey("ABCD 1234"), "ABCD1234");
});

test("steps: ask for a room, play with that room's session, else connect (by itself only once, never framed)", () => {
  assert.deepEqual(hostedStep({ room: "", session: null, framed: false, autoAllowed: true }), { step: "ask" });
  assert.deepEqual(hostedStep({ room: "", session, framed: false, autoAllowed: true }), { step: "play", session }, "the most recent session when the URL names none");
  assert.deepEqual(hostedStep({ room: "abcd-1234", session, framed: false, autoAllowed: true }), { step: "play", session });
  assert.deepEqual(hostedStep({ room: "OTHER", session: null, framed: false, autoAllowed: true }), { step: "redirect" });
  assert.deepEqual(hostedStep({ room: "OTHER", session: null, framed: false, autoAllowed: false }), { step: "connect", framed: false }, "after one try: a button");
  assert.deepEqual(hostedStep({ room: "OTHER", session: null, framed: true, autoAllowed: true }), { step: "connect", framed: true }, "a frame uses the device flow");
});

test("the automatic redirect happens at most once a minute per room and tab", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  assert.equal(autoRedirectAllowed(storage, "abcd1234", 1000), true);
  assert.equal(autoRedirectAllowed(storage, "ABCD-1234", 2000), false, "same room, any spelling");
  assert.equal(autoRedirectAllowed(storage, "OTHER", 2000), true);
  assert.equal(autoRedirectAllowed(storage, "abcd1234", 1000 + 61_000), true);
  assert.equal(autoRedirectAllowed(null, "abcd1234", 1000), false, "no storage: never automatic (no loop guard)");
});
