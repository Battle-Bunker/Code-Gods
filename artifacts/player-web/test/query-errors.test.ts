/** Failed live queries (src/sdk/query-errors.ts). What would break: one failed query taking the page down, an error that never clears, one consumer's unmount hiding a failure others still have, or a promise that it "comes back" when it will not. */
import test from "node:test";
import assert from "node:assert/strict";
import { lasting, NO_ERRORS, errorsLine, holdError, paneErrorLine, releaseError } from "../src/sdk/query-errors.ts";

test("a failed query is held by each consumer that has it, and cleared when the last one lets go", () => {
  assert.equal(errorsLine(NO_ERRORS), null);
  const key = 'player.totals:{"gameId":"g"}';
  const one = holdError(NO_ERRORS, key, "Server Error");
  assert.equal(errorsLine(one), "Some live data could not load. It comes back by itself when the game sends new data.");
  // A second consumer of the same query (many components share one subscription): the key is held twice.
  const two = holdError(one, key, "Server Error");
  const stillOne = releaseError(two, key);
  assert.equal(errorsLine(stillOne), "Some live data could not load. It comes back by itself when the game sends new data.", "one unmount does not hide a failure another consumer still has");
  assert.equal(errorsLine(releaseError(stillOne, key)), null, "the last one lets go (it got a value, or unmounted): cleared");
  assert.equal(releaseError(NO_ERRORS, "never.held:{}"), NO_ERRORS, "letting go of what was never held changes nothing");
});

test("dock.state has its own words; an error that will not recover by itself never says it comes back", () => {
  const dock = holdError(NO_ERRORS, 'dock.state:{"roomId":"r"}', "Server Error");
  assert.equal(errorsLine(dock), "The game's state could not load, so this shows the default layout for now. It comes back by itself when the game sends new data.");
  assert.equal(errorsLine(holdError(NO_ERRORS, "dock.state:{}", "[CONVEX Q(dock:state)] Uncaught ConvexError: {\"code\":\"FORBIDDEN\",\"message\":\"Not a member\"}")),
    "You no longer have access to this game.");
  assert.equal(errorsLine(holdError(NO_ERRORS, "player.totals:{}", "NOT_FOUND: no such game")), "You no longer have access to this game.");
  assert.equal(errorsLine(holdError(NO_ERRORS, "player.totals:{}", "UNAUTHENTICATED")), "You are signed out. Sign in again to see this game.");
  // A pane's own line, from the messages of what failed in it.
  assert.equal(paneErrorLine(["Server Error"]), "This pane could not load. It comes back by itself when the game sends new data.");
  assert.equal(paneErrorLine(["Server Error", "FORBIDDEN"]), "This pane could not load: you no longer have access to this game.");
  assert.equal(paneErrorLine(["Not signed in"]), "This pane could not load: you are signed out. Sign in again to see it.");
  assert.equal(paneErrorLine([]), null);
});

test("no game yet and not seated get their own true sentence, never 'you no longer have access'", () => {
  const noGame = "[CONVEX Q(player:utilitySeries)] Uncaught ConvexError: {\"code\":\"NOT_FOUND\",\"message\":\"There is no game in this room yet\"}";
  const notSeated = "Uncaught ConvexError: {\"code\":\"FORBIDDEN\",\"message\":\"The utility series is for the game's players; you are not seated in this game\"}";
  assert.equal(lasting(noGame), "noGame");
  assert.equal(lasting(notSeated), "notSeated");
  assert.equal(paneErrorLine([noGame]), "There is no game in this room yet. This pane fills in by itself when a game starts.");
  assert.equal(paneErrorLine([notSeated]), "You are watching, not playing: this pane is for the game's players.");
  assert.equal(errorsLine(holdError(NO_ERRORS, "player.series:{}", noGame)), "There is no game in this room yet. This fills in by itself when a game starts.");
  assert.equal(errorsLine(holdError(NO_ERRORS, "player.series:{}", notSeated)), "You are watching, not playing: some of this is for the game's players.");
  assert.equal(paneErrorLine([noGame, "FORBIDDEN"]), "This pane could not load: you no longer have access to this game.", "lost access outranks them");
});
