/**
 * The deployed-build signal (convex/version.ts): deploy-static records each uploaded build, and every client
 * subscribes to `version:current` with its own build to learn that it is outdated (lib/v2-client/src/update.ts).
 * What would break: a re-upload of the same build counting as a deploy, a rollback not making the newer build
 * outdated, a page open across many deploys no longer recognised as old, a player able to forge a deploy, or a
 * signed-out page unable to read the signal. The live builds are restored afterwards, so pages deployed to the
 * local engine stay current. Needs the local engine (test/v2-helpers.ts).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admin, anonymous } from "./v2-helpers.ts";

const id = () => randomUUID().replace(/-/g, "").slice(0, 16);
const rejects = async (p: Promise<unknown>) => { try { await p; } catch (e) { return (e as Error).message; } return assert.fail("expected a rejection"); };
let live: Record<string, { build: string } | null> = {};
before(async () => { live = await admin.query("version:current", {}); });
after(async () => {
  for (const site of ["app", "functions"]) if (live[site]) await admin.mutation("version:record", { site, build: live[site]!.build });
});

test("version: records per site; the same build again is no deploy; a rollback is; any recorded build stays known", async () => {
  const [a, b] = [id(), id()];
  await admin.mutation("version:record", { site: "app", build: a });
  assert.deepEqual(await admin.mutation("version:record", { site: "app", build: b }), { recorded: true });
  assert.deepEqual(await admin.mutation("version:record", { site: "app", build: b }), { recorded: false });
  const v = await anonymous.query("version:current", { own: { site: "app", build: a } });
  assert.deepEqual([v.app.build, v.known], [b, true], "readable signed out: the page may not have a session yet");
  assert.equal((await anonymous.query("version:current", { own: { site: "functions", build: a } })).known, false, "sites are separate");
  assert.equal((await anonymous.query("version:current", { own: { site: "app", build: id() } })).known, false, "a build never deployed here");
  assert.equal((await anonymous.query("version:current", {})).known, undefined);
  await admin.mutation("version:record", { site: "app", build: a });
  const back = await anonymous.query("version:current", { own: { site: "app", build: b } });
  assert.deepEqual([back.app.build, back.known], [a, true], "after a rollback to A, a page on B is outdated");
  for (let i = 0; i < 25; i++) await admin.mutation("version:record", { site: "app", build: id() });
  assert.equal((await anonymous.query("version:current", { own: { site: "app", build: b } })).known, true, "a page open across many deploys is still recognised");
});

test("version: only a deploy (the admin key) records a build", async () => {
  assert.match(await rejects(anonymous.mutation("version:record", { site: "app", build: id() })), /Could not find public function/);
  assert.match(await rejects(admin.mutation("version:record", { site: "nope", build: id() })), /alidator/);
  assert.match(await rejects(admin.mutation("version:record", { site: "functions", build: "a b" })), /build id/);
});
