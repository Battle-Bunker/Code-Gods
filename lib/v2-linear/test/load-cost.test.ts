/**
 * The package loads inside Convex's module budget. The server evaluates every module it pushes, with what it imports,
 * in an isolate of 64 MB; work at module load (a table built when the file is imported) counts against it in every
 * module that imports this package. 16 Nov: Square Area's witness roots (7.6 million BigInts, ~430 MB) were built at
 * load, and develop's deploy failed ("JavaScript execution ran out of memory (maximum memory usage: 64 MB)").
 *
 * What would break: a table built at import time rather than on first use.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

test("importing the package fits in a 64 MB heap (Convex's module budget)", () => {
  const entry = path.join(import.meta.dirname, "..", "src", "index.ts");
  const r = spawnSync(process.execPath, ["--max-old-space-size=64", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "-e", `await import(${JSON.stringify(entry)})`, "--input-type=module"], { encoding: "utf8", timeout: 60_000 });
  assert.equal(r.status, 0, `import failed: ${(r.stderr || "").split("\n").slice(-5).join("\n")}`);
});
