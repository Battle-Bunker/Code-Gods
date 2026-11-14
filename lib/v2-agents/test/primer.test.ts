/** The primer stays true to the code and short. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lineType, lineZ } from "@workspace/v2-linear";
import { AGENT_PRIMER, HELPERS } from "../src/index.ts";

const guest = (f: string) => readFileSync(new URL(`../../v2-sandbox/guest/${f}`, import.meta.url), "utf8");

test("every helper the primer names is defined in both guest libraries", () => {
  const js = guest("helpers.js"), py = guest("helpers.py");
  for (const h of HELPERS) {
    assert.match(js, new RegExp(`^    ${h.name}: `, "m"), `${h.name} in helpers.js`);
    assert.match(py, new RegExp(`^def ${h.name}\\(`, "m"), `${h.name} in helpers.py`);
  }
});

test("the primer lists every view and every move of the beginner board, uses the player's words, and is short", () => {
  for (const r of lineType.representations) assert.ok(AGENT_PRIMER.includes(`- ${r.id}: `), r.id);
  for (const m of lineZ.mutators) assert.match(AGENT_PRIMER, new RegExp(`^- ${m.replace(".", "\\.")}\\([a-z0-9]`, "m"), `${m} with its arguments`);
  assert.match(AGENT_PRIMER, /cart\.pivot\(x0, k\)/);
  assert.match(AGENT_PRIMER, /cart\.mirror\(axis: x \| y \| origin \| diagonal\)/);
  assert.equal(AGENT_PRIMER.match(/\bbits\b/g)?.length, 1, "\"bits\" only where it says never to say it");
  assert.ok(AGENT_PRIMER.length < 9000, `${AGENT_PRIMER.length} characters`);
});
