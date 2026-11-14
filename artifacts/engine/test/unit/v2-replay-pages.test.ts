/** The replay build's page reader (convex/v2/replayFormat.ts): a page that times out is read again, smaller. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_BYTES, SHRINKS, pageAfter } from "../../convex/v2/replayFormat.ts";

test("a failing page is read again at half the size until it fits", async () => {
  const asked: number[] = [];
  const page = await pageAfter(async maxBytes => { asked.push(maxBytes); if (maxBytes > PAGE_BYTES / 4) throw new Error("timed out"); return maxBytes; });
  assert.deepEqual(asked, [PAGE_BYTES, PAGE_BYTES / 2, PAGE_BYTES / 4]);
  assert.equal(page, PAGE_BYTES / 4);
});

test("a page that keeps failing fails the build after SHRINKS smaller tries", async () => {
  let tries = 0;
  await assert.rejects(pageAfter(async () => { tries++; throw new Error("timed out"); }), /timed out/);
  assert.equal(tries, SHRINKS + 1);
});
