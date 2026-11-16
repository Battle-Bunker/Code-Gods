/**
 * "Server info" (v1's sheet over manifest.get; v1 audit A14): `server.info` answers any signed-in human with the deployed
 * builds, each agent language's sandbox readiness and the tick cadence, and a signed-out caller nothing.
 *
 * What would break: the read missing a language, or answering a signed-out caller.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { anonymous, humans, perform } from "./v2-helpers.ts";

test("server.info: builds, every language's sandbox, the tick; never signed out", async () => {
  const [ada] = await humans("Server Info Ada");
  const r = await perform(ada!, "server.info", {}, {}, "query");
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.result.sandboxes.map((s: any) => s.language).sort(), ["python", "typescript"]);
  for (const s of r.result.sandboxes) assert.ok(["warming", "ready", "failed", "cold"].includes(s.state) && s.runtime.length > 0, JSON.stringify(s));
  assert.ok(r.result.engine.tickMs > 0 && r.result.engine.maxSecondsPerTick > 0);
  assert.ok("app" in r.result.builds && "functions" in r.result.builds);
  assert.equal((await perform(anonymous, "server.info", {}, {}, "query")).ok, false, "sign-in first");
});
