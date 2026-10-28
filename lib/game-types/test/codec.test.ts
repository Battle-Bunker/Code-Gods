import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GRID, INT, OBJECT_TYPES, STRING, decodeGrid, encodeGrid, glyphForCode, gridTypeKey, instantiate, objectType,
  parseGridForDisplay, seededRng, type GridValue,
} from "../src/index.ts";

const ASCII = /^[\x00-\x7f]*$/;

for (const type of OBJECT_TYPES) {
  for (const args of type.representatives()) {
    const inst = type.instantiate(args), codec = type.codec(inst), rng = seededRng(`codec:${inst.key}`);
    test(`codec laws ${inst.key}`, () => {
      assert.ok(codec.maxLength <= 1024);
      assert.equal(instantiate(type.id, args), inst, "instantiations are interned by key");
      for (let k = 0; k < 40; k++) {
        const v = type.spawn(inst, rng), wire = codec.encode(v);
        assert.ok(codec.isValid(wire));
        codec.assert(wire);
        assert.deepEqual(codec.decode(wire), v, "round trip");
        assert.equal(codec.encode(codec.decode(wire)), wire, "canonical");
        if (typeof wire === "string") {
          assert.ok(ASCII.test(wire) && wire.length <= codec.maxLength);
          for (const bad of [wire + "/", " " + wire, wire.toLowerCase(), wire.replace(",", ", "), wire + "é"]) {
            if (bad !== wire && !(type.id === "string" && codec.isValid(bad))) {
              assert.ok(!codec.isValid(bad), `rejects ${JSON.stringify(bad)}`);
              assert.throws(() => codec.decode(bad));
            }
          }
        } else assert.ok(Number.isSafeInteger(wire));
      }
      for (const bad of [null, undefined, {}, [], 1.5, NaN, true]) assert.ok(!codec.isValid(bad));
      assert.throws(() => codec.assert(type.id === "Int" ? "1" : 1));
    });
  }
}

test("grid encodings reach maxLength and decode strictly", () => {
  for (const args of GRID.representatives()) {
    const inst = GRID.instantiate(args), codec = GRID.codec(inst), n = inst.args.size as number;
    const full: GridValue = { size: n, sym: new Uint8Array(n * n), col: new Uint8Array(n * n) };
    assert.equal((codec.encode(full) as string).length, codec.maxLength);
    assert.throws(() => codec.encode({ size: n, sym: new Uint8Array(n * n).fill(60), col: new Uint8Array(n * n) }));
    assert.throws(() => codec.decode(codec.encode(full) + ",0R"));
  }
  const t = { size: 3, symbols: "cards", colours: "rgb" } as const;
  assert.equal(gridTypeKey(t), "Grid(3,cards,rgb)");
  const g = decodeGrid("AS,TH,KC/2D,3S,QH/JC,9D,AH".replace(/([A-Z0-9]{2})/g, "$1R"), t);
  assert.deepEqual([...g.sym.slice(0, 3)], [0, 13 + 9, 39 + 12]);
  assert.equal(encodeGrid(g, t), "ASR,THR,KCR/2DR,3SR,QHR/JCR,9DR,AHR");
  assert.throws(() => decodeGrid("ASR,THR,KCR/2DR,3SR,QHR/JCR,9DR,AHX", t));
  assert.throws(() => decodeGrid("7R,3G,0B/1R,2R,9B/4G,4G,8R", t));
});

test("display helpers", () => {
  assert.equal(glyphForCode("TH"), "10♥");
  assert.equal(glyphForCode("7"), "7");
  assert.deepEqual(parseGridForDisplay("7R,3G/AY,BV"), [[{ code: "7", letter: "R" }, { code: "3", letter: "G" }], [{ code: "A", letter: "Y" }, { code: "B", letter: "V" }]]);
  assert.equal(parseGridForDisplay("7R,3G/AY"), null);
  assert.equal(parseGridForDisplay(42), null);
});

test("Int and string domains", () => {
  const big = INT.instantiate({}), small = INT.instantiate({ min: 0, max: 9999 });
  assert.equal(big.key, "Int(-2147483648,2147483647)");
  assert.equal(small.key, "Int(0,9999)");
  assert.ok(!INT.codec(small).isValid(10000) && !INT.codec(small).isValid(-1) && INT.codec(small).isValid(0));
  assert.ok(!INT.codec(big).isValid(2147483648));
  assert.throws(() => INT.instantiate({ min: 5, max: 4 }));
  assert.throws(() => INT.instantiate({ min: 0, max: 2 ** 31 }));
  assert.throws(() => INT.instantiate({ bits: 3 }));
  const s = STRING.instantiate({}), short = STRING.instantiate({ maxLength: 16 });
  assert.equal(s.key, "string(128)");
  assert.equal(STRING.codec(s).maxLength, 128);
  assert.ok(STRING.codec(short).isValid("\u0000\u007f") && !STRING.codec(short).isValid("x".repeat(17)) && !STRING.codec(short).isValid("é"));
  assert.throws(() => STRING.instantiate({ maxLength: 1025 }));
  assert.throws(() => objectType("Chess"));
  assert.throws(() => GRID.instantiate({ size: 8 }));
  assert.throws(() => GRID.instantiate({ symbols: "emoji" }));
});
