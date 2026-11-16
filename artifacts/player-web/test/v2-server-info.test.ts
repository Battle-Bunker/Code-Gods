// The palette's answer to server.info (v1's Server info sheet, A14): one line of builds, sandboxes and the tick.
import { test } from "node:test";
import assert from "node:assert/strict";
import { serverInfoWords } from "../src/core/palette-commands.ts";

test("server info reads as one line: builds, sandboxes, tick (v1's Server info)", () => {
  assert.equal(serverInfoWords({ builds: { app: { build: "a1" }, functions: null }, sandboxes: [{ language: "python", state: "failed", reason: "boot timed out" }], engine: { tickMs: 1500 } }),
    "Builds: app a1, functions not recorded. Sandboxes: python failed (boot timed out). A tick every 1.5 s.");
});
