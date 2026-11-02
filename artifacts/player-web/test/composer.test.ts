/**
 * The assistant composer's conversation choice (src/core/chat/composer.ts) is kept per game: a thread chosen in one game
 * can never be the choice in another (the pane reads it with the game it shows), while the player's own choices (the
 * draft, the permission) stay across games.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { composer, threadIn } from "../src/core/chat/composer.ts";

test("a chosen thread is the choice of its game only; the draft and permission are the player's", () => {
  composer.setThread("game-1", "thread-1");
  composer.setDraft("half typed");
  composer.setPermission("read");
  assert.equal(threadIn(composer.get(), "game-1"), "thread-1");
  assert.equal(threadIn(composer.get(), "game-2"), null, "the next game starts from its own latest (none)");
  composer.setThread("game-2", "new");
  assert.deepEqual([threadIn(composer.get(), "game-2"), threadIn(composer.get(), "game-1")], ["new", "thread-1"]);
  composer.setThread("game-1", null);
  assert.equal(threadIn(composer.get(), "game-1"), null);
  assert.deepEqual([composer.get().draft, composer.get().permission], ["half typed", "read"]);
});
