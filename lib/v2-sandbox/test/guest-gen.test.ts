/** The embedded guest sources (src/guest.gen.ts) match guest/ and python/guest.py: what runs is what is reviewed. */
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

test("src/guest.gen.ts is up to date", () => {
  execFileSync(process.execPath, [join(import.meta.dirname, "..", "scripts", "gen-guest.mjs"), "--check"]);
});
