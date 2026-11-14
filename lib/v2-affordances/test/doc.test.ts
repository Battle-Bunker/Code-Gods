/** docs/engine-v2/affordances.md lists the directory as it is: regenerate with `pnpm --filter @workspace/v2-affordances gen:doc`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { directoryTable } from "../src/doc.ts";

const DOC = join(import.meta.dirname, "..", "..", "..", "docs", "engine-v2", "affordances.md");
const START = "<!-- directory:start -->", END = "<!-- directory:end -->";

test("the contract document lists the directory as declared", () => {
  const text = readFileSync(DOC, "utf8");
  const [before, rest] = text.split(START) as [string, string];
  const after = rest.split(END)[1]!;
  const want = `${before}${START}\n${directoryTable()}\n${END}${after}`;
  if (process.env.UPDATE_DOC) { writeFileSync(DOC, want); return; }
  assert.equal(text, want, "run `pnpm --filter @workspace/v2-affordances gen:doc`");
});
