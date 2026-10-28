// Python on V8 ≡ the former Wasmtime host. test/parity/cases.json (make-cases.mjs) holds 364 requests:
// the fixture prelude (calls, usedRandom, steps, clock, entropy, errors, the output boundary,
// capabilities, the module inventory), the 17 ast-bits-v1 vectors under both schemes plus literal-move
// cases, the universal codes, and every object type's default prelude (and a 5×5 rgby Grid) with
// realistic agents. test/parity/golden.json holds what python/runner.py (wasmtime-py 49.0.0, deleted
// after this port) returned for each. Results must be identical: calls, usedRandom, steps, every
// inspection bit and literal move, error codes and messages. The only accepted differences are listed
// in DIFFERENCES, with the reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unpack } from "../engine/bundle.mjs";
import { PythonEngine } from "../engine/python.mjs";

const read = name => JSON.parse(readFileSync(new URL(`./parity/${name}`, import.meta.url), "utf8"));
const { settings, cases } = read("cases.json");
const { results: golden } = read("golden.json");

/** Accepted differences from the Wasmtime host. */
const DIFFERENCES = {
  // The old host read the guest's inspection JSON through its 2,000-byte error-message reader, so a
  // program with many literal moves (this one: 10+) failed with a JSON error, at inspection and at every
  // act. The port reads it whole (its acts then fail on the agent's own `globals()` call, as expected).
  "types/Grid/all": "old host truncated long inspections",
  "types/Grid-5-base10-rgby/all": "old host truncated long inspections",
  // CPython object addresses: deterministic in both hosts, but the old host's heap layout depended on
  // the host file system's directory order (Wasmtime passed readdir through); the new one is sorted.
  "fixture/objectRepr/act": "object address",
};
const accepted = id => Object.keys(DIFFERENCES).find(prefix => id === prefix || id.startsWith(prefix + "/"));

test("python parity with the Wasmtime host", { timeout: 600000 }, () => {
  const files = unpack(readFileSync(new URL("../dist/python-runtime.bin.gz", import.meta.url)));
  const engine = new PythonEngine({ files });
  const mismatches = [];
  let compared = 0;
  for (const c of cases) {
    let got;
    if (c.mode === "codes") {
      got = { ok: true, result: {
        gamma: engine.trustedEval(`[_AB['gamma_bits'](n) for n in ${JSON.stringify(c.gamma)}]`),
        string: engine.trustedEval(`[_AB['string_bits'](s) for s in json.loads(${JSON.stringify(JSON.stringify(c.strings))})]`),
      } };
    } else {
      const { id, ...request } = c;
      request.settings = settings[c.settings];
      try { got = { ok: true, result: engine.run(request) }; }
      catch (error) { got = { ok: false, code: error.code ?? "EXECUTION", error: error.message }; }
    }
    const want = golden[c.id];
    assert.ok(want, `golden result for ${c.id}`);
    if (accepted(c.id)) {
      if (c.id.startsWith("types/") && c.id.endsWith("/all/inspect")) {
        assert.equal(got.ok, true, `${c.id} now succeeds: ${got.error}`);
        assert.ok(got.result.literalMoves.length >= 10, `${got.result.literalMoves.length} literal moves`);
      }
      continue;
    }
    compared++;
    try { assert.deepStrictEqual(got, want); }
    catch { mismatches.push({ id: c.id, got, want }); }
  }
  assert.deepEqual(mismatches, [], `${mismatches.length} of ${compared} results differ`);
  assert.equal(compared, 349);
});
