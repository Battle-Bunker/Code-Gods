/** Failed live queries (src/sdk/query-errors.ts). What would break: one failed query taking the page down, an error that never clears, or a pane that never comes back. */
import test from "node:test";
import assert from "node:assert/strict";
import { NO_ERRORS, PANE_ERROR_LINE, clearError, errorsLine, reportError } from "../src/sdk/query-errors.ts";

test("a failed query is recorded, said in one line, and cleared when it delivers a value again", () => {
  assert.equal(errorsLine(NO_ERRORS), null);
  const one = reportError(NO_ERRORS, 'player.totals:{"gameId":"g"}', "Server Error");
  assert.equal(errorsLine(one), "Some live data could not load. It comes back by itself when the game sends new data.");
  assert.equal(reportError(one, 'player.totals:{"gameId":"g"}', "Server Error"), one, "the same failure again changes nothing (no render loop)");
  // dock.state carries the layout and the phase: the dock falls back to the default layout and says so.
  const two = reportError(one, 'dock.state:{"roomId":"r"}', "Server Error");
  assert.equal(errorsLine(two), "The game's state could not load, so this shows the default layout for now. It comes back by itself when the game sends new data.");
  // A value arrives: cleared, and counted, so a pane waiting on it remounts.
  const back = clearError(two, 'dock.state:{"roomId":"r"}');
  assert.equal(back.recovered, 1);
  assert.equal(errorsLine(back), "Some live data could not load. It comes back by itself when the game sends new data.");
  assert.equal(clearError(back, "never.failed:{}"), back, "a healthy query delivering is not a recovery");
  const clean = clearError(back, 'player.totals:{"gameId":"g"}');
  assert.equal(errorsLine(clean), null);
  assert.equal(clean.recovered, 2);
  assert.equal(PANE_ERROR_LINE, "This pane could not load. It comes back by itself when the game sends new data.");
});
