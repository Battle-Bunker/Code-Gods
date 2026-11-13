/** The room and game pages' one next step (palette-and-pages.md §3.3): one table row per test, expectations by hand. */
import test from "node:test";
import assert from "node:assert/strict";
import { gameStep, nextStep, type StepRoom } from "../src/site/lib/next-step.ts";

const room = (members: string[], game: StepRoom["activeGame"] = null): StepRoom => ({
  shortCode: "K7QX", ownerId: "ada", ownerName: "Ada Lovelace", activeGame: game,
  members: members.map(id => ({ id, kind: id.startsWith("ai:") ? "ai" : "human" })),
});
const running = (roster: string[], phase = "running") => ({ shortCode: "G9TQ", phase, roster: roster.map(id => ({ id })) });
const withRoles = (members: [string, boolean][], game: StepRoom["activeGame"] = null): StepRoom =>
  ({ ...room([], game), members: members.map(([id, spectator]) => ({ id, kind: id.startsWith("ai:") ? "ai" : "human", spectator })) });

test("a visitor signs in; a signed-in stranger joins (and may watch a running game)", () => {
  assert.deepEqual(nextStep(null, room(["ada"])), { status: "You were invited to room K7QX.", primary: "ui.auth.signIn", secondary: [] });
  assert.deepEqual(nextStep("bob", room(["ada"])), { status: "Join to play in the next game.", primary: "rooms.join", secondary: [] });
  assert.deepEqual(nextStep("bob", room(["ada", "cy", "di"], running(["ada", "cy", "di"]))).secondary, ["ui.nav.game"]);
});

test("in the lobby the owner plays by default: alone they practise against AI players, then invite, then start; ready is never the main button", () => {
  // Catches: "Mark me ready" as a player's filled button (ready gates nothing), or an owner alone left with only an invite link.
  assert.deepEqual(nextStep("bob", room(["ada", "bob"])), { status: "1 more player needed; then Ada can start.", primary: "ui.copyInviteLink", secondary: ["rooms.setSpectator"] });
  assert.deepEqual(nextStep("bob", room(["ada", "bob", "cy"])), { status: "Waiting for Ada to start the game.", primary: null, secondary: ["rooms.setReady", "rooms.setSpectator"] });
  assert.deepEqual(nextStep("ada", room(["ada"])),
    { status: "A game needs three players. Practise against AI players, or invite friends.", primary: "ui.practiceGame", secondary: ["ui.copyInviteLink"] });
  assert.deepEqual(nextStep("ada", room(["ada", "bob"])), { status: "1 more player needed. AI players count.", primary: "ui.copyInviteLink", secondary: [] });
  assert.deepEqual(nextStep("ada", room(["ada", "ai:x"])).primary, "ui.copyInviteLink", "one AI seat already: practice is for a room with nobody else in it");
  assert.deepEqual(nextStep("ada", room(["ada", "bob", "ai:x"])), { status: "3 players are in; start when you're ready.", primary: "owner.start", secondary: ["ui.copyInviteLink"] });
});

test("without AI players the owner is told what a game needs and invites", () => {
  assert.deepEqual(nextStep("ada", room(["ada"]), { aiAvailable: false }), { status: "A game needs three players. Invite two friends with this link.", primary: "ui.copyInviteLink", secondary: [] });
  // A non-admin owner alone (the page passes aiAvailable = the server has AI and the room's owner may use it): no practice game, no AI wording.
  assert.equal(nextStep("ada", room(["ada"]), { aiAvailable: false }).primary, "ui.copyInviteLink");
  assert.doesNotMatch(JSON.stringify(nextStep("ada", room(["ada"]), { aiAvailable: false })), /AI|practiceGame/);
  assert.equal(nextStep("ada", room(["ada", "bob"]), { aiAvailable: false }).status, "A game needs three players. Invite one friend with this link.");
  assert.equal(nextStep("ada", room(["ada"]), { aiAvailable: false, minPlayers: 12 }).status, "A game needs 12 players. Invite 11 friends with this link.");
});

test("during a game: seated players and watchers open the game page; the owner resumes a safety pause", () => {
  const g = running(["ada", "bob"]);
  assert.deepEqual(nextStep("bob", room(["ada", "bob", "cy"], g)), { status: "You're playing in game G9TQ.", primary: "ui.nav.game", secondary: [] });
  assert.deepEqual(nextStep("cy", room(["ada", "bob", "cy"], g)), { status: "Game G9TQ is running; you'll play in the next one.", primary: "ui.nav.game", secondary: [] });
  assert.equal(nextStep("cy", withRoles([["ada", false], ["bob", false], ["cy", true]], g)).status, "Game G9TQ is running; you're watching.");
  const r = room(["ada", "bob"], running(["ada", "bob"], "recovery"));
  assert.deepEqual(nextStep("ada", r, { recoveryReason: "No human activity for 30 minutes." }),
    { status: "Game G9TQ paused for safety: No human activity for 30 minutes.", primary: "rooms.resume", secondary: ["ui.nav.game"] });
  assert.deepEqual(nextStep("bob", r), { status: "Game G9TQ is paused; waiting for Ada to resume it.", primary: "ui.nav.game", secondary: [] });
});

test("the spectator view: the owner resumes a safety pause, everyone else just watches", () => {
  const g = { shortCode: "G9TQ", status: "active", phase: "running", roomShortCode: "K7QX", ownerId: "ada", roster: [{ id: "bob" }] };
  assert.deepEqual(gameStep("zed", g), { status: "You're watching this game.", primary: null, secondary: [] });
  assert.equal(gameStep("ada", { ...g, phase: "recovery" }).primary, "rooms.resume");
  assert.equal(gameStep("zed", { ...g, phase: "recovery" }).primary, null);
  assert.equal(gameStep("zed", { ...g, status: "ended" }).primary, "ui.nav.room");
});

test("while the game prepares its rule tables everyone sees the progress; a failed preparation lets the owner start again", () => {
  const preparing = { ...room(["ada", "bob", "cy"]), preparing: { ready: 12, total: 18 } };
  assert.deepEqual(nextStep("bob", preparing), { status: "Preparing rule tables: 12 of 18 ready.", primary: null, secondary: [] });
  assert.equal(nextStep("ada", preparing).primary, null, "no second start while it prepares");
  const failed = { ...preparing, preparing: { ready: 3, total: 18, error: "The rule table for snap {} … could not be prepared" } };
  assert.deepEqual(nextStep("ada", failed), { status: "Preparing the game failed; start again to retry.", primary: "owner.start", secondary: [] });
  assert.deepEqual(nextStep("bob", failed), { status: "Preparing the game failed; Ada can retry.", primary: null, secondary: [] });
});

test("the owner's click shows at once: Starting the game, the same primary button (rendered busy), until the room shows the game or its preparation", () => {
  const ready = room(["ada", "bob", "cy"]);
  assert.deepEqual(nextStep("ada", ready, { start: { phase: "starting", source: "owner" } }),
    { status: "Starting the game: dealing secret goals…", primary: "owner.start", secondary: [] });
  assert.match(nextStep("ada", ready, { start: { phase: "starting", source: "assistant" } }).status, /assistant/);
  assert.equal(nextStep("bob", ready, { start: { phase: "starting", source: "owner" } }).status, "Waiting for Ada to start the game.", "only the owner's own click is local");
  const failed = { ...ready, preparing: { ready: 3, total: 18, error: "boom" } };
  assert.equal(nextStep("ada", failed, { start: { phase: "starting", source: "owner" } }).status, "Starting the game: dealing secret goals…", "a retry is starting, not the old failure");
  const preparing = { ...ready, preparing: { ready: 12, total: 18 } };
  assert.equal(nextStep("ada", preparing, { start: { phase: "preparing", ready: 12, total: 18 } }).status, "Preparing rule tables: 12 of 18 ready.", "the room's own progress wins");
});

test("spectators watch: only players count toward the minimum, and the step offers to play", () => {
  // Catches: a spectating owner counted as one of the three.
  assert.deepEqual(nextStep("ada", withRoles([["ada", true], ["bob", false], ["cy", false]])),
    { status: "1 more player needed; you're watching. AI players count.", primary: "ui.copyInviteLink", secondary: ["rooms.setSpectator"] });
  assert.deepEqual(nextStep("ada", withRoles([["ada", true], ["bob", false], ["cy", false], ["ai:x", false]])),
    { status: "3 players are in; you're watching. Start when ready.", primary: "owner.start", secondary: ["rooms.setSpectator"] });
  // An owner who chose to watch, alone: no practice game (they would not be in it).
  assert.deepEqual(nextStep("ada", withRoles([["ada", true]])),
    { status: "3 more players needed; you're watching. AI players count.", primary: "ui.copyInviteLink", secondary: ["rooms.setSpectator"] });
  assert.deepEqual(nextStep("bob", withRoles([["ada", false], ["bob", true]])), { status: "You'll watch the next game.", primary: "rooms.setSpectator", secondary: [] });
  const full = withRoles([["bob", true], ...["a", "b", "c", "d", "e", "f", "g", "h"].map(id => [id, false] as [string, boolean])]);
  assert.deepEqual(nextStep("bob", full), { status: "The next game is full; you'll watch it.", primary: null, secondary: [] }, "no dead Play button");
});

test("during the bid phase the status says Bidding and names no other step; a failed one is the owner's to retry", () => {
  const bidding = { ...room(["ada", "bob", "cy"]), bidding: {} };
  assert.deepEqual(nextStep("bob", bidding), { status: "Bidding: bid for the rule you want, or pass.", primary: null, secondary: [] });
  assert.deepEqual(nextStep("ada", bidding, { start: { phase: "bidding", endsAt: 31_000 } }), { status: "Bidding: bid for the rule you want, or pass.", primary: null, secondary: [] }, "no second start");
  const watching = { ...withRoles([["ada", true], ["bob", false], ["cy", false], ["di", false]]), bidding: {} };
  assert.deepEqual(nextStep("ada", watching), { status: "Bidding: the players are bidding for their rules.", primary: null, secondary: [] });
  const failed = { ...bidding, bidding: { error: "Players left during bidding and fewer than three remain. Start again." } };
  assert.deepEqual(nextStep("ada", failed), { status: "Bidding failed; start again to retry.", primary: "owner.start", secondary: [] });
  assert.deepEqual(nextStep("bob", failed), { status: "Bidding failed; Ada can retry.", primary: null, secondary: [] });
  assert.equal(nextStep("ada", failed, { start: { phase: "starting", source: "owner" } }).status, "Starting the game: dealing secret goals…", "a retry is starting");
  // Once dealt, the room prepares: that is what shows.
  assert.equal(nextStep("bob", { ...bidding, bidding: null, preparing: { ready: 1, total: 4 } }).status, "Preparing rule tables: 1 of 4 ready.");
});
