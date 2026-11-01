/**
 * The deployed-build signal (convex/version.ts): deploy-static records each uploaded build, and every client
 * subscribes to `version:current` with its own build to learn that it is outdated (lib/player-client/src/update.ts).
 * What would break: a re-upload of the same build counting as a deploy, a rollback not making the newer build
 * outdated, a page open across many deploys no longer recognised as old, a player able to forge a deploy, or a
 * signed-out page unable to read the signal. The live builds are restored afterwards, so pages deployed to the
 * local engine stay current.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { URL_, admin, api, internal, rejects } from "./game-helpers.ts";

const id = () => randomUUID().replace(/-/g, "").slice(0, 16);
const anonymous = new ConvexHttpClient(URL_);
let live: Record<string, { build: string } | null> = {};
before(async () => { live = await admin.query(api.version.current, {}); });
after(async () => {
  for (const site of ["player", "functions"]) if (live[site]) await admin.mutation(internal.version.record, { site, build: live[site]!.build });
});

test("version: records per site; the same build again is no deploy; a rollback is; any recorded build stays known", async () => {
  const [a, b] = [id(), id()];
  await admin.mutation(internal.version.record, { site: "player", build: a });
  assert.deepEqual(await admin.mutation(internal.version.record, { site: "player", build: b }), { recorded: true });
  assert.deepEqual(await admin.mutation(internal.version.record, { site: "player", build: b }), { recorded: false });
  const v = await anonymous.query(api.version.current, { own: { site: "player", build: a } });
  assert.deepEqual([v.player.build, v.known], [b, true], "readable signed out: the page may not have a session yet");
  assert.equal((await anonymous.query(api.version.current, { own: { site: "engine", build: a } })).known, false, "sites are separate");
  assert.equal((await anonymous.query(api.version.current, { own: { site: "player", build: id() } })).known, false, "a build never deployed here");
  assert.equal((await anonymous.query(api.version.current, {})).known, undefined);
  await admin.mutation(internal.version.record, { site: "player", build: a });
  const back = await anonymous.query(api.version.current, { own: { site: "player", build: b } });
  assert.deepEqual([back.player.build, back.known], [a, true], "after a rollback to A, a page on B is outdated");
  for (let i = 0; i < 25; i++) await admin.mutation(internal.version.record, { site: "player", build: id() });
  assert.equal((await anonymous.query(api.version.current, { own: { site: "player", build: b } })).known, true, "a page open across many deploys is still recognised");
});

test("version: only a deploy (the admin key) records a build", async () => {
  // (Test identities act through the admin key, so the outside caller here is a plain client.)
  const message = await rejects(anonymous.mutation(internal.version.record, { site: "engine", build: id() }));
  assert.match(message, /Could not find public function/);
  assert.match(await rejects(admin.mutation(internal.version.record, { site: "nope", build: id() })), /alidator/);
  assert.match(await rejects(admin.mutation(internal.version.record, { site: "functions", build: "a b" })), /build id/);
});
