import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { familySection, ruleCode } from "../src/components/rule-code-text.ts";

const text = ["const a = 1;", "", "// ------------------------------------------------------------------ 1. One", "export const oneU = () => 1;",
  "export const one = f({", '  id: "one", title: "One",', "});", "", "// ------------------------------------------------------------------ 2. Two",
  'export const two = f({ id: "two" });'].join("\n");

test("a family's code is its section of the file, heading to heading", () => {
  assert.equal(familySection(text, "one"), text.split("\n").slice(2, 7).join("\n"));
  assert.equal(familySection(text, "two"), text.split("\n").slice(8).join("\n"));
  assert.equal(familySection(text, "three"), null);
});

test("every dealt line family's code is found in its source, with its utility", async () => {
  const { dynamicFamilies } = await import("../../../lib/v2-linear/src/dealt.ts");
  const dir = new URL("../../../lib/v2-linear/src/", import.meta.url);
  const files = Object.fromEntries(["candidate-families.ts", "dynamic-families.ts"].map(f => [f, readFileSync(new URL(f, dir), "utf8")]));
  for (const f of dynamicFamilies) {
    const found = ruleCode(files, f.id);
    assert.ok(found, f.id);
    assert.match(found.code, new RegExp(`id: "${f.id}"`));
    assert.match(found.code, /\bu(: |\()/, `${f.id}: its utility`);
  }
});
