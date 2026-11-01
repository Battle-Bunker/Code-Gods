/**
 * The assistant composer's conversation choice (src/core/chat/composer.ts) is per game: a thread chosen in one game must
 * not stay selected once the room's next game starts (the pane would show, and the next message try to continue, the
 * last game's conversation), while the player's own choices (the draft, the permission) stay.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { composer, threadFor } from "../src/core/chat/composer.ts";

test("a chosen thread is dropped when the next game starts; the draft and permission stay", () => {
  composer.enterGame("game-1");
  composer.setThread("thread-1");
  composer.setDraft("half typed");
  composer.setPermission("read");
  assert.equal(threadFor(composer.get(), "game-1"), "thread-1");
  assert.equal(threadFor(composer.get(), "game-2"), null, "never shown in another game, even before the switch is recorded");
  composer.enterGame("game-2");
  assert.deepEqual([composer.get().thread, composer.get().draft, composer.get().permission], [null, "half typed", "read"]);
  composer.setThread("new");
  composer.enterGame("game-2");
  assert.equal(threadFor(composer.get(), "game-2"), "new", "the same game keeps the choice");
});
