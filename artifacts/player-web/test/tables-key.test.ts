import assert from "node:assert/strict";
import { test } from "node:test";
import { tablesKey } from "../src/sdk/tables-key.ts";

test("a seat's tables are loaded again once the game's hold correction is ready, and only then", () => {
  const mine = { gameId: "g1", godId: "ada" };
  assert.equal(tablesKey(null, "ready"), "");
  assert.equal(tablesKey(mine, undefined), tablesKey(mine, "computing"), "no reload while it is computing");
  assert.equal(tablesKey(mine, "failed"), tablesKey(mine, undefined), "a failed correction scores on static rarity: nothing new to load");
  assert.notEqual(tablesKey(mine, "ready"), tablesKey(mine, "computing"), "ready: load the tables with the correction");
  assert.notEqual(tablesKey({ gameId: "g2", godId: "ada" }, "ready"), tablesKey(mine, "ready"));
});
