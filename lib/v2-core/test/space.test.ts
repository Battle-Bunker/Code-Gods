import { test } from "node:test";
import assert from "node:assert/strict";
import { readFields, spaceHas, writeFields, type ParamSpace } from "../src/index.ts";

test("a parameter space's fields are typed on one line, named or in order, and its labels parse back", () => {
  assert.deepEqual(readFields("d = 2, u = 3/4", ["d", "u"]), { d: "2", u: "3/4" });
  assert.deepEqual(readFields("2 3/4", ["d", "u"]), { d: "2", u: "3/4" });
  assert.ok("invalid" in readFields("d = 2", ["d", "u"]));
  assert.ok("invalid" in readFields("2 3 4", ["d", "u"]));
  assert.equal(writeFields({ d: 2, u: "3/4" }, ["d", "u"]), "d = 2, u = 3/4");
  const space: ParamSpace<{ k: number }> = {
    size: 9, hint: "k from 1 to 9", draw: r => ({ k: 1 + r.below(9) }), label: p => String(p.k),
    parse: t => (/^[1-9]$/.test(t.trim()) ? { k: Number(t) } : { invalid: "k from 1 to 9" }),
  };
  assert.equal(spaceHas(space, { k: 3 }), true);
  assert.equal(spaceHas(space, { k: 12 }), false);
  assert.equal(spaceHas(space, { k: 3, j: 1 }), false);
  assert.equal(spaceHas(space, null), false);
});
