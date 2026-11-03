/**
 * The stored replay's file (engine convex/replays.ts: {version, pages} without the caller's place) becomes the pages
 * the replay folds (src/core/replay/stored.ts). What would break: pages without `viewer` (the replay would open on no
 * one's point of view), or a file of another version folded as if it were this one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pagesFromStored } from "../src/core/replay/stored.ts";

const viewer = { godId: "ada", index: 1 };
const page = (n: number, done: boolean) => ({ version: 3, batches: [], chat: [], nextCursor: n, chatCursor: n, latestCursor: 2, done, game: { id: "g1" } });

test("every stored page gets the caller's place, in order", () => {
  const pages = pagesFromStored({ version: 1, pages: [page(0, false), page(2, true)] }, 1, viewer);
  assert.deepEqual(pages.map(p => [p.nextCursor, p.viewer]), [[0, viewer], [2, viewer]]);
});

test("a file of another version, or not a replay, is refused (the page then shows the error, never a wrong game)", () => {
  assert.throws(() => pagesFromStored({ version: 2, pages: [page(0, true)] }, 1, viewer), /version 2/);
  assert.throws(() => pagesFromStored({ version: 1, pages: [] }, 1, viewer), /no pages/);
  assert.throws(() => pagesFromStored({ version: 1, pages: [page(0, false)] }, 1, viewer), /incomplete/);
  assert.throws(() => pagesFromStored("<html>", 1, viewer), /not a stored replay/);
});
