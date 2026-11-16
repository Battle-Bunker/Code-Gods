/**
 * When the phone's assistant sheet rises by itself (src/dock/sheet.ts): when the assistant is opened now, never when the
 * stored view merely arrives with it open (Parity C, e2e-multi-client-21: the sheet rose as the view loaded, so the
 * player's first press on Open lowered it and seemed lost).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sheetStep } from "../src/dock/sheet.ts";

test("the stored view arriving with the assistant does not raise the sheet", () => {
  let s = sheetStep(null, { sheet: false, loading: true });        // drawn while loading: no assistant yet
  assert.equal(s.rise, false);
  s = sheetStep(s.had, { sheet: true, loading: false });            // the stored view arrives, assistant in it
  assert.equal(s.rise, false, "it waits lowered");
});

test("opened now (menu, palette, a model), the sheet rises; closed and opened again, it rises again", () => {
  let s = sheetStep(null, { sheet: false, loading: false });
  s = sheetStep(s.had, { sheet: true, loading: false });
  assert.equal(s.rise, true);
  s = sheetStep(s.had, { sheet: false, loading: false });
  s = sheetStep(s.had, { sheet: true, loading: false });
  assert.equal(s.rise, true);
});
