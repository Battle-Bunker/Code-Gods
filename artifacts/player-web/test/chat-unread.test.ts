import { test } from "node:test";
import assert from "node:assert/strict";
import { unreadCount } from "../src/site/components/chat-unread.ts";

const m = (id: string, memberId: string | null, at: number) => ({ id, memberId, at });

test("unread: other people's messages since you last had chat open; not yours, not room notices", () => {
  const page = [m("4", "bo", 40), m("3", "me", 30), m("2", null, 25), m("1", "bo", 10)];
  assert.equal(unreadCount(page, 0, "me"), 2);
  assert.equal(unreadCount(page, 20, "me"), 1);
  assert.equal(unreadCount(page, 40, "me"), 0);
  assert.equal(unreadCount([], 0, "me"), 0);
});
