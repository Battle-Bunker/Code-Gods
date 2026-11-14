/** The forge's hold control: targets, words (src/panes/hold.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineType } from "@workspace/v2-linear";
import { gridType } from "@workspace/v2-grid";
import { holdChanged, holdLine, lineText, targetOf } from "../src/panes/hold.ts";

test("an object's state as a target: a whole-number line's m and c, a board's 16 digits", () => {
  const l = lineType.decode(lineType.encode(lineType.decode("2,1,-59") as never) as never);   // whatever the wire form is
  const t = targetOf(l, "line");
  assert.ok(t && typeof t === "object", JSON.stringify(t));
  const g = gridType.decode("0274/0223/0415/0100");
  assert.equal(targetOf(g, "grid"), "0274022304150100");
});

test("y = mx + c and the sentence, in the game's noun", () => {
  assert.equal(lineText({ m: -1, c: 59 }), "y = −x + 59");
  assert.equal(lineText({ m: 3, c: 0 }), "y = 3x");
  assert.equal(lineText({ m: 0, c: -7 }), "y = −7");
  assert.equal(lineText({ m: -2, c: -3 }), "y = −2x − 3");
  assert.equal(holdLine({ agent: "Simple", numbers: [2, 5], target: { m: -1, c: 59 }, one: "line", many: "lines", price: 4.2 }),
    "Simple will hold lines 2 and 5 at y = −x + 59, moving them back whenever anyone moves them away: only those settings change, for 4.20 ⚡.");
  assert.equal(holdLine({ agent: "Simple", numbers: [12], target: "9779855879979779", one: "grid", many: "grids", price: null }),
    "Simple holds grid 12 at the board 9779 8558 7997 9779, moving it back whenever anyone moves it away.");
});

test("a hold read back from the code is not a change, whatever its key order", () => {
  assert.equal(holdChanged({ numbers: [2, 5], target: { m: -1, c: 59 } }, { target: { m: -1, c: 59 }, numbers: [2, 5] } as never), false);
  assert.equal(holdChanged({ numbers: [2], target: "9779855879979779" }, { numbers: [2], target: null }), true);
  assert.equal(holdChanged({ numbers: [], target: null }, null), true);
});
