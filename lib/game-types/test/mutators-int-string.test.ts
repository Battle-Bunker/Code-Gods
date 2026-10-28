import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { INT, STRING, availableOf, seededRng, type Instantiation, type MutatorDef, type Rng } from "../src/index.ts";
import { applyCalls } from "../src/mutators.ts";
import { INT_MUTATORS } from "../src/int/mutators.ts";
import { STRING_MUTATORS } from "../src/string/mutators.ts";

const ints = [[-50, 150], [0, 9], [5, 12], [-999, 999], [0, 9999], [-2147483648, 2147483647], [3, 3]]
  .map(([min, max]) => INT.instantiate({ min, max }));
const SMALL_INTS = ints.filter(i => (i.args.max as number) - (i.args.min as number) < 5000);
const strs = [0, 1, 2, 5, 128].map(maxLength => STRING.instantiate({ maxLength }));
const S2 = STRING.instantiate({ maxLength: 2 });
const byId = <V>(ms: readonly MutatorDef<V, any>[], id: string) => ms.find(m => m.id === id)!;

function domainInts(inst: Instantiation): number[] {
  const { min, max } = inst.args as { min: number; max: number };
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}
const ALL_S2 = (() => {
  const out = [""];
  for (let a = 0; a < 128; a++) {
    out.push(String.fromCharCode(a));
    for (let b = 0; b < 128; b++) out.push(String.fromCharCode(a, b));
  }
  return out;
})();

/** Sample params, but for types whose parse may legitimately reject (e.g. no valid places). */
function laws<V>(name: string, ms: readonly MutatorDef<V, any>[], insts: Instantiation[], spawn: (i: Instantiation, r: Rng) => V,
  domain?: (i: Instantiation) => V[], nonIdempotent: readonly string[] = []) {
  test(`${name}: deterministic, idempotent or injective, pointwise erasure exact, costs ≥ 0`, () => {
    const rng = seededRng(`${name}-laws`);
    for (const inst of insts) {
      const all = domain?.(inst);
      for (const m of availableOf(ms, inst)) {
        for (let s = 0; s < 12; s++) {
          const p = m.sample(rng, inst);
          assert.deepEqual(m.parse(JSON.parse(JSON.stringify(p)), inst), JSON.parse(JSON.stringify(p)), `${m.id} parse`);
          assert.ok(m.describeBits(p, inst) >= 0 && Number.isFinite(m.describeBits(p, inst)));
          const xs = Array.from({ length: 4 }, () => spawn(inst, rng));
          for (const x of xs) {
            const y = m.apply(x, p, inst);
            assert.deepEqual(m.apply(x, p, inst), y, `nondeterministic ${m.id}`);
            if (y === null) continue;
            assert.doesNotThrow(() => (inst.objectType === "Int" ? INT : STRING).codec(inst).encode(y as never), `${m.id} invalid output`);
            const e = m.erasureBits(x, p, inst);
            assert.ok(Number.isFinite(e) && e >= 0, `${m.id} erasure ${e}`);
            if (m.kind === "bijective") assert.equal(e, 0);
            else if (!nonIdempotent.includes(m.id)) assert.deepEqual(m.apply(y, p, inst), y, `${m.id} ${JSON.stringify(p)} is not idempotent`);
            if (all && m.kind === "overwrite" && y !== x) {
              const pre = all.filter(v => { const w = m.apply(v, p, inst); return w !== null && w === y; }).length;
              assert.ok(Math.abs(e - Math.log2(pre)) < 1e-9, `${m.id} ${JSON.stringify(p)} on ${JSON.stringify(x)}: ${e} vs log2 ${pre} (${inst.key})`);
            }
          }
          if (all && m.kind === "bijective") {
            const outs = all.map(v => m.apply(v, p, inst)).filter(w => w !== null);
            assert.equal(new Set(outs).size, outs.length, `${m.id} ${JSON.stringify(p)} is not injective on ${inst.key}`);
          }
        }
      }
    }
  });
}

laws("Int", INT_MUTATORS, ints, (i, r) => INT.spawn(i, r), i => (SMALL_INTS.includes(i) ? domainInts(i) : undefined as never));
laws("string", STRING_MUTATORS, strs, (i, r) => STRING.spawn(i, r), i => (i === S2 ? ALL_S2 : undefined as never), ["delete"]);

test("Int availability and semantics", () => {
  const i = INT.instantiate({ min: -50, max: 150 }), M = INT_MUTATORS;
  assert.equal(availableOf(M, i).length, 8);
  const ap = (id: string, x: number, p: object) => byId(M, id).apply(x, p, i);
  assert.equal(ap("add", 150, { k: 1 }), -50);
  assert.equal(ap("add", -50, { k: -1 }), 150);
  assert.equal(ap("reflect", 0, {}), 100);
  assert.equal(ap("swap_digits", 12, { i: 0, j: 1 }), 21);
  assert.equal(ap("swap_digits", 19, { i: 0, j: 2 }), null);           // 910 leaves the domain
  assert.equal(ap("reverse_digits", 120, {}), 21);                    // 120 -> 021
  assert.equal(ap("reverse_digits", 12, {}), null);                   // 012 -> 210 > 150
  assert.equal(ap("reverse_digits", -12, {}), null);                  // -210 < -50
  assert.equal(ap("rotate_digits", 12, { k: 1 }), 120);               // 012 -> 120
  assert.equal(ap("set_digit", -37, { place: 0, digit: 0 }), -30);
  assert.equal(ap("round", 145, { places: 1 }), 150);
  assert.equal(ap("round", -45, { places: 1 }), -50);
  assert.equal(ap("round", 4, { places: 1 }), 0);
  assert.equal(ap("set", 7, { value: 42 }), 42);
  const big = INT.instantiate({ min: -2147483648, max: 2147483647 });
  assert.equal(byId(M, "add").apply(2147483647, { k: 1 }, big), -2147483648);
  assert.equal(byId(M, "set").erasureBits(0, { value: 1 }, big), 32);
  assert.equal(byId(M, "add").describeBits({ k: 1 }, big), 2);
  assert.equal(byId(M, "add").describeBits({ k: -5 }, big), 6);
});

test("Int parse rejects junk", () => {
  const i = INT.instantiate({ min: -50, max: 150 });
  const bad: [string, object][] = [
    ["add", { k: 0 }], ["add", { k: 201 }], ["add", { k: "1" }], ["add", { k: 1.5 }], ["add", {}], ["add", { k: 1, x: 2 }],
    ["reflect", { x: 1 }], ["swap_digits", { i: 1, j: 1 }], ["swap_digits", { i: 0, j: 3 }], ["rotate_digits", { k: 3 }],
    ["set_digit", { place: 3, digit: 1 }], ["set_digit", { place: 0, digit: 10 }], ["round", { places: 0 }],
    ["set", { value: 151 }], ["set", { value: null }],
  ];
  for (const [id, raw] of bad) assert.throws(() => byId(INT_MUTATORS, id).parse(raw as never, i), /./, `${id} ${JSON.stringify(raw)}`);
});

test("Int: partial edits are cheaper than overwrites, and erase what they should on average", () => {
  const i = INT.instantiate({ min: 0, max: 9999 }), rng = seededRng("int-erasure"), K = 2000;
  const xs = Array.from({ length: K }, () => INT.spawn(i, rng));
  const mean = (id: string, p: object) => {
    const m = byId(INT_MUTATORS, id), ok = xs.filter(x => m.apply(x, p, i) !== null);
    return ok.reduce((s, x) => s + m.erasureBits(x, p, i), 0) / ok.length;
  };
  assert.ok(Math.abs(mean("set_digit", { place: 1, digit: 3 }) - Math.log2(10)) < 1e-9);
  for (const places of [1, 2, 3]) assert.ok(Math.abs(mean("round", { places }) - places * Math.log2(10)) < 0.1, `round ${places}`);
  const v = INT.codec(i).encode(1234);
  const total = (calls: unknown) => { const o = applyCalls(INT, i, v, JSON.stringify(calls)); assert.ok(o.ok, JSON.stringify(o)); return o.cost.total; };
  const digit = total([["set_digit", { place: 0, digit: 9 }]]), whole = total([["set", { value: 9999 }]]);
  assert.ok(digit < whole / 2, `${digit} vs ${whole}`);
  assert.ok(total([["add", { k: 1 }]]) < digit);
});

test("string semantics", () => {
  const i = STRING.instantiate({ maxLength: 8 }), M = STRING_MUTATORS;
  const ap = (id: string, x: string, p: object) => byId(M, id).apply(x, p, i);
  assert.equal(ap("swap_chars", "hello", { i: 0, j: 4 }), "oellh");
  assert.equal(ap("swap_chars", "hello", { i: 0, j: 5 }), null);
  assert.equal(ap("reverse", "hello", {}), "olleh");
  assert.equal(ap("reverse", "hello", { range: [1, 8] }), "holle");
  assert.equal(ap("reverse", "hello", { range: [5, 8] }), null);
  assert.equal(ap("rotate", "hello", { k: 2 }), "llohe");
  assert.equal(ap("rotate", "hello", { k: 7 }), "llohe");
  assert.equal(ap("shift_chars", "abc", { k: 1 }), "bcd");
  assert.equal(ap("shift_chars", "\x7f", { k: 1 }), "\x00");
  assert.equal(ap("set_char", "abc", { i: 1, c: "X" }), "aXc");
  assert.equal(ap("write", "abcdef", { i: 2, text: "XY" }), "abXYef");
  assert.equal(ap("write", "abc", { i: 2, text: "XY" }), null);
  assert.equal(ap("fill", "abcdef", { c: "-", range: [1, 3] }), "a--def");
  assert.equal(ap("insert", "abc", { i: 3, text: "de" }), "abcde");
  assert.equal(ap("insert", "abcdefg", { i: 0, text: "XY" }), null);
  assert.equal(ap("delete", "abcdef", { range: [1, 3] }), "adef");
  assert.equal(ap("delete", "abc", { range: [1, 8] }), "a");
  assert.equal(ap("truncate", "abcdef", { n: 2 }), "ab");
  assert.equal(ap("truncate", "ab", { n: 2 }), "ab");
  assert.equal(byId(M, "write").erasureBits("abcdef", { i: 2, text: "XY" }, i), 14);
  assert.deepEqual(availableOf(M, STRING.instantiate({ maxLength: 0 })), []);
  assert.deepEqual(availableOf(M, STRING.instantiate({ maxLength: 1 })).map(m => m.id).includes("swap_chars"), false);
});

test("string parse rejects junk", () => {
  const i = STRING.instantiate({ maxLength: 8 });
  const bad: [string, object][] = [
    ["set_char", { i: 8, c: "a" }], ["set_char", { i: 0, c: "ab" }], ["set_char", { i: 0, c: "é" }], ["set_char", { i: 0, c: 97 }],
    ["write", { i: 6, text: "abc" }], ["write", { i: 0, text: "" }], ["fill", { c: "a", range: [3, 3] }], ["fill", { c: "a", range: [0, 9] }],
    ["fill", { c: "a", range: [0] }], ["reverse", { range: "all" }], ["rotate", { k: 8 }], ["shift_chars", { k: 128 }],
    ["insert", { i: 0, text: "x".repeat(9) }], ["delete", {}], ["truncate", { n: 8 }], ["truncate", { n: 1, extra: true }],
  ];
  for (const [id, raw] of bad) assert.throws(() => byId(STRING_MUTATORS, id).parse(raw as never, i), /./, `${id} ${JSON.stringify(raw)}`);
});

test("string: a run is cheaper than the same characters one by one", () => {
  const i = STRING.instantiate({ maxLength: 128 }), v = STRING.codec(i).encode("a".repeat(100));
  const total = (calls: unknown) => { const o = applyCalls(STRING, i, v, JSON.stringify(calls)); assert.ok(o.ok, JSON.stringify(o)); return o.cost.total; };
  const run = total([["write", { i: 10, text: "hello" }]]);
  const scattered = total([..."hello"].map((c, k) => ["set_char", { i: 10 + k, c }]));
  assert.ok(run < scattered, `${run} vs ${scattered}`);
  assert.ok(total([["shift_chars", { k: 1 }]]) > total([["shift_chars", { k: 1, range: [0, 5] }]]));
  // truncation erases about 7 bits per character position thrown away
  const tr = applyCalls(STRING, i, v, JSON.stringify([["truncate", { n: 90 }]]));
  assert.ok(tr.ok && Math.abs(tr.cost.erasure - 7 * 38) < 0.1, JSON.stringify(tr));
});

// ------------------------------------------------------------------------------------------------
// guest constructors
// ------------------------------------------------------------------------------------------------

function guestRoundTrip(def: typeof INT | typeof STRING, inst: Instantiation, jsBody: string, pyBody: string) {
  const pre = def.prelude(inst);
  const js = new Function(`${pre.js}\nreturn __encode_calls(${jsBody});`)() as string;
  const py = execFileSync("python3", ["-I", "-c", `${pre.python}\nimport sys\nsys.stdout.write(__encode_calls(${pyBody}))\n`], { encoding: "utf8" });
  assert.equal(py, js);
  for (const [id, p] of JSON.parse(js) as [string, Record<string, unknown>][]) {
    assert.doesNotThrow(() => def.mutators.find(m => m.id === id)!.parse(p, inst), `${id} ${JSON.stringify(p)}`);
  }
  return JSON.parse(js);
}

test("Int guest constructors (Python and JS agree, the engine accepts them)", () => {
  const out = guestRoundTrip(INT, INT.instantiate({ min: -999, max: 999 }),
    `[add(-3), reflect(), swapDigits(2, 0), reverseDigits(), rotateDigits(2), setDigit(1, 7), roundOff(2), setTo(-12)]`,
    `[add(-3), reflect(), swap_digits(2, 0), reverse_digits(), rotate_digits(2), set_digit(1, 7), round_off(2), set_to(-12)]`);
  assert.deepEqual(out[2], ["swap_digits", { i: 0, j: 2 }]);
});

test("string guest constructors (Python and JS agree, the engine accepts them)", () => {
  const out = guestRoundTrip(STRING, STRING.instantiate({ maxLength: 16 }),
    `[setChar(0, "a"), write(1, "hi"), fill("-"), fill("-", 2, 4), swapChars(3, 1), reverse(), reverse(2), rotate(3), shiftChars(-1, null, 5), insert(0, "x"), remove(3), remove(1, 4), truncate(5)]`,
    `[set_char(0, "a"), write(1, "hi"), fill("-"), fill("-", 2, 4), swap_chars(3, 1), reverse(), reverse(2), rotate(3), shift_chars(-1, None, 5), insert(0, "x"), remove(3), remove(1, 4), truncate(5)]`);
  assert.deepEqual(out[2], ["fill", { c: "-" }]);
  assert.deepEqual(out[6], ["reverse", { range: [2, 16] }]);
  assert.deepEqual(out[8], ["shift_chars", { k: 127, range: [0, 5] }]);
  assert.deepEqual(out[10], ["delete", { range: [3, 4] }]);
});
