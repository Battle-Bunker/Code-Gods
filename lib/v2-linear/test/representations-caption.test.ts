/** The crossing's caption never says "off by 0" (annotations-design.md §10): "on the whole number −3" instead. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { q } from "@workspace/v2-core";
import { fromMC, lineType } from "../src/index.ts";

test("crossing caption: on a whole number says so; otherwise the nearest whole number and how far off", () => {
  const rep = lineType.representations.find(r => r.id === "crossing")!;
  const cap = (m: number, c: number) => JSON.stringify((rep.layout({ lines: [fromMC(q(m), q(c))] }, 0) as { caption: unknown }).caption);
  assert.match(cap(4, 12), /on the whole number/);
  assert.doesNotMatch(cap(4, 12), /off by/);
  assert.match(cap(3, 7), /nearest whole number.*off by/);
});
