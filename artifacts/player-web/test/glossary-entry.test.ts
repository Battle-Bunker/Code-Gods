/** "Explain a term" finds its entry (src/site/lib/glossary-entry.ts); the glossary keeps the owner's names. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { glossaryEntry } from "../src/site/lib/glossary-entry.ts";

test("a request names an entry by id or by its term, in any case; nothing names the index", () => {
  assert.equal(glossaryEntry(""), null);
  assert.equal(glossaryEntry("points"), "points");
  assert.equal(glossaryEntry("Rarity (bits)"), "bits");
  assert.equal(glossaryEntry("utility function"), "utility-function");
  assert.equal(glossaryEntry("ener"), "energy", "a term's start");
  assert.equal(glossaryEntry("no such word"), null);
});
