/** The room and game pages' one next step (palette-and-pages.md §3.3): one table row per test, expectations by hand. */
import test from "node:test";
import assert from "node:assert/strict";
import { gameStep, nextStep, type StepRoom } from "../src/lib/next-step.ts";

const room = (members: string[], game: StepRoom["activeGame"] = null): StepRoom => ({
  shortCode: "K7QX", ownerId: "ada", ownerName: "Ada Lovelace", activeGame: game,
  members: members.map(id => ({ id, kind: id.startsWith("ai:") ? "ai" : "human" })),
});
const running = (roster: string[], phase = "running") => ({ shortCode: "G9TQ", phase, roster: roster.map(id => ({ id })) });

test("a visitor signs in; a signed-in stranger joins (and may watch a running game)", () => {
  assert.deepEqual(nextStep(null, room(["ada"])), { status: "You were invited to room K7QX.", primary: "ui.auth.signIn", secondary: [] });
  assert.deepEqual(nextStep("bob", room(["ada"])), { status: "Join to play in the next game.", primary: "rooms.join", secondary: [] });
  assert.deepEqual(nextStep("bob", room(["ada", "cy", "di"], running(["ada", "cy", "di"]))).secondary, ["ui.nav.game"]);
});

test("in the lobby a member opens the player client and may mark ready; the owner invites, then starts", () => {
  assert.deepEqual(nextStep("bob", room(["ada", "bob"])), { status: "Waiting for Ada to start the game.", primary: "ui.nav.playerClient", secondary: ["rooms.setReady"] });
  assert.deepEqual(nextStep("ada", room(["ada"])), { status: "2 more players needed. AI players count.", primary: "ui.copyInviteLink", secondary: ["rooms.addAi", "ui.nav.playerClient"] });
  assert.equal(nextStep("ada", room(["ada", "bob"])).status, "1 more player needed. AI players count.");
  assert.deepEqual(nextStep("ada", room(["ada", "bob", "ai:x"])), { status: "3 players are in; start when you're ready.", primary: "owner.start", secondary: ["rooms.addAi", "ui.nav.playerClient"] });
});

test("without AI on the server, AI is neither offered nor mentioned; a full room offers no more seats", () => {
  assert.deepEqual(nextStep("ada", room(["ada"]), { aiAvailable: false }), { status: "2 more players needed.", primary: "ui.copyInviteLink", secondary: ["ui.nav.playerClient"] });
  assert.deepEqual(nextStep("ada", room(["ada", "b", "c", "d", "e", "f", "g", "h"])).secondary, ["ui.nav.playerClient"]);
});

test("during a game: seated players play, other members watch, the owner resumes a safety pause", () => {
  const g = running(["ada", "bob"]);
  assert.deepEqual(nextStep("bob", room(["ada", "bob", "cy"], g)), { status: "You're playing in game G9TQ.", primary: "ui.nav.playerClient", secondary: ["ui.nav.game"] });
  assert.deepEqual(nextStep("cy", room(["ada", "bob", "cy"], g)), { status: "Game G9TQ is running; you'll play in the next one.", primary: "ui.nav.game", secondary: [] });
  const r = room(["ada", "bob"], running(["ada", "bob"], "recovery"));
  assert.deepEqual(nextStep("ada", r, { recoveryReason: "No human activity for 30 minutes." }),
    { status: "Game G9TQ paused for safety: No human activity for 30 minutes.", primary: "rooms.resume", secondary: ["ui.nav.game"] });
  assert.equal(nextStep("bob", r).status, "Game G9TQ is paused; waiting for Ada to resume it.");
});

test("the game page: players open their client, spectators just watch, the ended game goes back to its room", () => {
  const g = { shortCode: "G9TQ", status: "active", phase: "running", roomShortCode: "K7QX", ownerId: "ada", roster: [{ id: "ada" }, { id: "bob" }] };
  assert.equal(gameStep("bob", g).primary, "ui.nav.playerClient");
  assert.equal(gameStep("zed", g).primary, null);
  assert.equal(gameStep("ada", { ...g, phase: "recovery" }).primary, "rooms.resume");
  assert.equal(gameStep("bob", { ...g, status: "ended" }).primary, "ui.nav.room");
  assert.equal(gameStep("bob", { ...g, status: "ended", roomShortCode: null }).primary, null);
});

test("while the game prepares its rule tables everyone sees the progress; a failed preparation lets the owner start again", () => {
  const preparing = { ...room(["ada", "bob", "cy"]), preparing: { ready: 12, total: 18 } };
  assert.deepEqual(nextStep("bob", preparing), { status: "Preparing rule tables: 12 of 18 ready.", primary: "ui.nav.playerClient", secondary: [] });
  assert.deepEqual(nextStep("ada", preparing).primary, "ui.nav.playerClient", "no second start while it prepares");
  const failed = { ...preparing, preparing: { ready: 3, total: 18, error: "The rule table for snap {} … could not be prepared" } };
  assert.deepEqual(nextStep("ada", failed), { status: "Preparing the game failed; start again to retry.", primary: "owner.start", secondary: ["ui.nav.playerClient"] });
  assert.equal(nextStep("bob", failed).status, "Preparing the game failed; Ada can retry.");
});
