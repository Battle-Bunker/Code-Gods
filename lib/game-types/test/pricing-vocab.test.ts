import test from "node:test";
import assert from "node:assert/strict";
import { OBJECT_TYPES, availableMutators } from "../src/index.ts";

test("every prelude carries a pricing vocabulary consistent with its constructors", () => {
  for (const T of OBJECT_TYPES) {
    for (const args of T.representatives().slice(0, 12)) {
      const inst = T.instantiate(args), parts = T.prelude(inst), avail = availableMutators(inst);
      for (const language of ["python", "typescript"] as const) {
        const v = parts.pricing[language];
        for (const list of [v.api, v.attrs, v.params, v.strings, v.mutators, v.areas]) {
          assert.ok(list.length <= 4096 && list.every(x => typeof x === "string" && x.length >= 1 && x.length <= 128));
          assert.deepEqual([...list], [...new Set(list)].sort(), "sorted and unique");
        }
        assert.ok(v.mutators.every(m => v.api.includes(m)) && v.areas.every(a => v.api.includes(a)));
        assert.equal(v.mutators.some(m => v.areas.includes(m)), false);
        for (const m of avail) assert.ok(v.strings.includes(m.id), `${inst.key} ${language}: mutator id ${m.id}`);
        // Every documented mutator-group helper is a constructor or an area builder.
        for (const h of parts.helpers.filter(h => h.group === "mutator"))
          assert.ok(v.mutators.includes(h.name[language]) || v.areas.includes(h.name[language]), `${inst.key} ${language}: ${h.name[language]}`);
        assert.ok(v.api.every(n => !n.startsWith("_")));
      }
      assert.equal(parts.pricing.python.mutators.length, parts.pricing.typescript.mutators.length);
    }
  }
  const grid = OBJECT_TYPES.find(t => t.id === "Grid")!;
  const v = grid.prelude(grid.instantiate({ size: 5, symbols: "base10", colours: "rgby" })).pricing.python;
  for (const word of ["red", "blue", "both", "colour"]) assert.ok(v.strings.includes(word), word);
  for (const attr of ["cells", "colour", "symbol", "value", "rows"]) assert.ok(v.attrs.includes(attr), attr);
  assert.ok(v.areas.includes("row") && v.mutators.includes("paint"));
});
