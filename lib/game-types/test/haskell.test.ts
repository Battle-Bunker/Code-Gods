import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OBJECT_TYPES, availableMutators, withCommitClause, objectType, instantiate } from "../src/index.ts";
import { sha256 } from "../src/util.ts";
import { HS_PRELUDE_NAMES, hs, hsConstructors, hsHiddenPrelude, parseDtsFunctions, withHaskellDocs } from "../src/haskell.ts";

test("hsConstructors: required parameters, a primed variant with every parameter, typed by the TypeScript types", () => {
  const dts = `declare function slide(line: LineRef, steps?: number, what?: Layer): MutatorCall;
declare function swapNumbers(where: Area, a: string | number, b: string | number): MutatorCall;
declare function reflect(): MutatorCall;
declare function row(i: number): AreaRef;
`;
  assert.equal(hsConstructors(dts, "MutatorCall"), `slide :: AreaLike a => a -> Call
slide line = Call "slide" [areaJ line]

slide' :: AreaLike a => a -> Int -> String -> Call
slide' line steps what = Call "slide" [areaJ line, toJ steps, toJ what]

swapNumbers :: (AreaLike a, ToJ b, ToJ c) => a -> b -> c -> Call
swapNumbers where_ a b = Call "swapNumbers" [areaJ where_, toJ a, toJ b]

reflect :: Call
reflect = Call "reflect" []
`);
  assert.equal(hsConstructors(dts, "AreaRef"), `row :: Int -> Area\nrow i = Area (JCall "row" [toJ i])\n`);
  assert.throws(() => hsConstructors("declare function f(x: Map<string, number>): MutatorCall;\n", "MutatorCall"), /No Haskell type/u);
  // The helper docs (read by every language's rooms) leave such a function out instead of failing.
  const doc = { name: { python: "f", typescript: "f" }, signature: { python: "f(x)", typescript: "f(x)" }, kid: "", group: "mutator" as const };
  assert.deepEqual(withHaskellDocs([doc], "declare function f(x: Map<string, number>): MutatorCall;\n"), [doc]);
  assert.deepEqual(parseDtsFunctions("declare function f(a: number, b?: string | null): MutatorCall;\n")[0].params,
    [{ name: "a", type: "number", optional: false }, { name: "b", type: "string | null", optional: true }]);
});

test("hs literals: ASCII only, escapes that end cleanly before digits", () => {
  assert.equal(hs("K♥"), '"K\\9829\\&"');
  assert.equal(hs('a"b\\'), '"a\\"b\\\\"');
  assert.equal(hs([1, -2, true]), "[1, (-2), True]");
});

test("every room's Haskell module offers one constructor per available move helper and hides only Prelude names it redefines", () => {
  const prelude = new Set(HS_PRELUDE_NAMES);
  for (const T of OBJECT_TYPES) {
    for (const args of T.representatives().slice(0, 12)) {
      const inst = T.instantiate(args), room = T.prelude(inst).haskell;
      assert.match(room, /^-- Room helpers for .*\nmodule Room where\n/u);
      assert.match(room, /^type Obj = /mu);
      assert.match(room, /^cgDecode :: String -> Obj$/mu);
      for (const m of availableMutators(inst))
        for (const f of parseDtsFunctions(m.guest.dts).filter(f => f.returns === "MutatorCall"))
          assert.match(room, new RegExp(`^${f.name} ::`, "mu"), `${inst.key}: ${f.name}`);
      for (const name of hsHiddenPrelude(room)) assert.ok(prelude.has(name));
      assert.ok(/[^\x00-\x7f]/u.test(room) === false, `${inst.key}: ASCII`);
      // Every helper the instance documents has a Haskell name the Room module defines, with its signature.
      for (const h of T.prelude(inst).helpers) {
        assert.ok(h.name.haskell && h.signature.haskell, `${inst.key}: ${h.name.typescript} has a Haskell form`);
        assert.match(room, new RegExp(`^(?:${h.name.haskell}\\b[^\\n]*::|\\s*[{,] ${h.name.haskell} ::)`, "mu"), `${inst.key}: ${h.name.haskell} defined`);
      }
    }
  }
  const str = objectType("string").prelude(instantiate("string", { maxLength: 8 })).haskell;
  assert.match(str, /^import Prelude hiding \(reverse, truncate\)$/mu);
});

test("the commit clause adds onlyIfBetter to the Haskell module", () => {
  const inst = instantiate("Int", {}), base = objectType("Int").prelude(inst);
  assert.doesNotMatch(base.haskell, /^onlyIfBetter ::/mu);
  assert.match(withCommitClause(base).haskell, /^onlyIfBetter :: \[Call\] -> \[Call\]$/mu);
  // The Haskell module is not part of the prelude hash (calibration keys do not move).
  assert.equal(base.hash, sha256(`${base.python}\0${base.js}\0${base.dts}`));
});

test("the Haskell sandbox's room fixtures are current (lib/game-runtime/test/haskell/rooms.json)", async () => {
  const { rooms } = await import("../../game-runtime/test/haskell/make-rooms.mjs");
  const stored = JSON.parse(readFileSync(new URL("../../game-runtime/test/haskell/rooms.json", import.meta.url), "utf8"));
  assert.deepEqual(rooms(), stored, "run: node --experimental-strip-types lib/game-runtime/test/haskell/make-rooms.mjs");
});
