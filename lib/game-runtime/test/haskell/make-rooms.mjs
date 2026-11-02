// Generates test/haskell/rooms.json: real rooms (lib/game-types preludes, the Haskell Room module included)
// and sample objects for the Haskell sandbox tests. Rerun after a change to the preludes; the game-types suite
// checks that this file is current.
// Run: node --experimental-strip-types test/haskell/make-rooms.mjs [--check]
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { objectType, instantiate, withCommitClause } from "../../../game-types/src/index.ts";
import { seededRng } from "../../../game-types/src/util.ts";

const ROOMS = [
  ["int", "Int", {}, false, 2],
  ["intCommit", "Int", { min: 0, max: 9999 }, true, 2],
  ["string", "string", { maxLength: 16 }, false, 2],
  ["grid", "Grid", { size: 4, symbols: "base10", colours: "rgby" }, false, 3],
  ["cards", "Grid", { size: 3, symbols: "cards", colours: "rainbow6" }, false, 2],
];

export function rooms() {
  const out = {};
  for (const [name, type, args, commit, samples] of ROOMS) {
    const T = objectType(type), inst = instantiate(type, args);
    const base = T.prelude(inst), p = commit ? withCommitClause(base) : base;
    const rng = seededRng(7), codec = T.codec(inst);
    out[name] = {
      settings: {
        objectType: inst.objectType, wireMaxLength: codec.maxLength, interactionComputeMs: 1000, stepBudget: 500000,
        prelude: { key: p.hash, python: p.python, js: p.js, dts: p.dts, haskell: p.haskell,
          pricing: { python: p.pricing.python, typescript: p.pricing.typescript } },
      },
      samples: Array.from({ length: samples }, () => codec.encode(T.spawn(inst, rng))),
    };
  }
  return out;
}

const path = new URL("./rooms.json", import.meta.url);
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const text = `${JSON.stringify(rooms(), null, 1)}\n`;
  if (process.argv.includes("--check")) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== text) {
      console.error("test/haskell/rooms.json is stale: run node --experimental-strip-types test/haskell/make-rooms.mjs");
      process.exit(1);
    }
  } else writeFileSync(path, text);
}
