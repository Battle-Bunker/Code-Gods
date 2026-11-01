/**
 * Object-store keys and load scopes (convex/code/keys.ts). What would break: a key that escapes its namespace in a
 * storage path ("..", "//"), a script writing the engine's run results, or a scope matching keys it does not name.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { keyProblem, scopeProblem, scopeRange, writeProblem } from "../../convex/code/keys.ts";

test("keys: letters, digits, _ - . /, 1-128 characters; no '..', '//', leading '.' or '/', or trailing '/'", () => {
  for (const ok of ["a", "notes/day-1.json", "scripts/top_5", "A".repeat(128)]) assert.equal(keyProblem(ok), null, ok);
  for (const bad of ["", "/abs", "../up", "a/../b", "a//b", "dir/", ".hidden", "sp ace", "é", "A".repeat(129), 7, null]) assert.ok(keyProblem(bad), String(bad));
});

test("writes: runs/ is the engine's", () => {
  assert.ok(writeProblem("runs/abc"));
  assert.equal(writeProblem("runsheet"), null);
  assert.equal(writeProblem("notes/runs/x"), null);
});

test("scopes: an exact key or a prefix with *; the range covers exactly the prefix", () => {
  for (const ok of ["*", "notes/*", "a", "scripts/top5"]) assert.equal(scopeProblem(ok), null, ok);
  for (const bad of ["../*", "a b*", "x**", 3]) assert.ok(scopeProblem(bad), String(bad));
  const [lo, hi] = scopeRange("notes/*");
  for (const k of ["notes/a", "notes/zzz/1"]) assert.ok(k >= lo && k < hi, k);
  for (const k of ["note", "notes", "notez/a"]) assert.ok(!(k >= lo && k < hi), k);
  const [a, b] = scopeRange("k");
  assert.ok("k" >= a && "k" < b && !("k2" < b));
});

test("a run-result object splits back into the run's exact result text and its output", async () => {
  const { splitRunResult } = await import("../../convex/code/keys.ts");
  const result = '{"a":[1,18446744073709551616],"s":"caf\\u00e9","output":"x","n":{"output":1}}';
  const output = 'line,"output":"\n"tricky"';
  const text = `{"result":${result},"output":${JSON.stringify(output)}}`;
  assert.deepEqual(splitRunResult(text), { result, output });
  assert.deepEqual(splitRunResult(JSON.stringify({ result, output }), true), { result, output });
});
