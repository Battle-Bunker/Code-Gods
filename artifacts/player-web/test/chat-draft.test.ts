/** A proposal's board in chat is drawn as a board: four rows of four digits become one, the rest stays text. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { boardsIn, requestChat, takeChatDraft } from "../src/panes/chat-draft.ts";

test("four rows of four digits are a board; text around it stays text", () => {
  const parts = boardsIn("Shall we settle grid 3 like this and both hold it?\n9 7 7 9\n8 5 5 8\n7 9 9 7\n9 7 7 9\nThere I get 4.20 bits.");
  assert.deepEqual(parts, [
    { text: "Shall we settle grid 3 like this and both hold it?" },
    { board: [[9, 7, 7, 9], [8, 5, 5, 8], [7, 9, 9, 7], [9, 7, 7, 9]] },
    { text: "There I get 4.20 bits." },
  ]);
  assert.deepEqual(boardsIn("1 2 3 4\n5 6 7 8\nhello"), [{ text: "1 2 3 4\n5 6 7 8\nhello" }], "three rows are not a board");
});

test("a draft is opened in the chat once", async () => {
  const opened: string[] = [];
  await requestChat("hello", async p => { opened.push(p); });
  assert.deepEqual(opened, ["public-chat"]);
  assert.equal(takeChatDraft(), "hello");
  assert.equal(takeChatDraft(), null);
});
