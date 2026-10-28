// Int/string behaviour must stay byte-for-byte unchanged by the Grid object type. These costs and
// outputs were recorded from the runtime BEFORE Grid support was added (commit 975fa2a).
import { test } from "node:test";
import assert from "node:assert/strict";
import { GameRuntime } from "../index.mjs";

const ints = { objectType: "Int", intMin: -1000, intMax: 1000, stringMaxLength: 256 };
const strings = { ...ints, objectType: "string" };
const GOLDEN = {
  python: [["lambda x: x", 5, "Int", 6, 5], ["lambda x: x + 1", 41, "Int", 9, 42], ["lambda x: -x * 3", 7, "Int", 11, -21],
    ["lambda x: x[::-1]", "hello", "string", 12, "olleh"], ["lambda x: x.upper() + str(len(x))", "abc", "string", 19, "ABC3"],
    ["(lambda n: lambda x: x+n)(3)", 2, "Int", 15, 5], ["lambda x: ''.join(sorted(x))", "banana", "string", 12, "aaabnn"],
    ["lambda x: __import__('math').isqrt(x)", 81, "Int", 16, 9], ['lambda x: "é" and x', "q", "string", 10, "q"]],
  typescript: [["(x)=>x", 5, "Int", 5, 5], ["(x: number) => x + 1", 41, "Int", 9, 42], ["(x)=>-x*3", 7, "Int", 9, -21],
    ["(x: string) => x.split('').reverse().join('')", "hello", "string", 15, "olleh"],
    ["(x)=>x.toUpperCase()+x.length", "abc", "string", 13, "ABC3"],
    ["((n: number) => (x: number) => x+n)(3)", 2, "Int", 17, 5], ["(x)=>[...x].sort().join('')", "banana", "string", 13, "aaabnn"],
    ["(x)=>Math.floor(Math.sqrt(x))", 81, "Int", 13, 9], ['(x)=>"é".length + x', "q", "string", 11, "1q"]],
};

for (const [language, probes] of Object.entries(GOLDEN)) {
  test(`${language} Int/string costs and outputs are unchanged`, { timeout: 120000 }, async () => {
    const r = new GameRuntime({ language });
    try {
      for (const [source, input, objectType, cost, value] of probes) {
        const settings = objectType === "Int" ? ints : strings;
        assert.deepEqual(await r.inspect(source, settings), { cost }, source);
        assert.deepEqual(await r.execute(source, input, settings), { value }, source);
      }
      // Requests for scalar types are forwarded with exactly the fields they always had.
      const seen = [];
      const write = r.slots[0].child.stdin.write.bind(r.slots[0].child.stdin);
      r.slots[0].child.stdin.write = line => { seen.push(JSON.parse(line).settings); return write(line); };
      await r.execute(probes[0][0], 1, { ...ints, gridSize: 5, gridSymbols: "base10", gridColours: "rgb" });
      assert.deepEqual(seen, [{ objectType: "Int", intMin: -1000, intMax: 1000, stringMaxLength: 256, interactionComputeMs: 5 }]);
    } finally { r.close(); }
  });
}
