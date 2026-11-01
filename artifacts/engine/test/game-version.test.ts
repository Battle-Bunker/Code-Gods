/**
 * The deployed-build signal (convex/version.ts): deploy-static records each uploaded build, and every client
 * subscribes to `version:current` to learn that it is outdated (lib/player-client/src/update.ts). What would break:
 * a re-upload of the same build counting as a deploy, a rollback not making the newer build outdated, unbounded
 * history, a player able to forge a deploy, or a signed-out page unable to read the signal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { URL_, admin, api, internal, rejects } from "./game-helpers.ts";

const id = () => randomUUID().replace(/-/g, "").slice(0, 16);
const anonymous = new ConvexHttpClient(URL_);

test("version: records per site, newest first; the same build again is no deploy; a rollback is", async () => {
  const [a, b] = [id(), id()];
  await admin.mutation(internal.version.record, { site: "player", build: a });
  await admin.mutation(internal.version.record, { site: "player", build: b });
  await admin.mutation(internal.version.record, { site: "player", build: b });
  const v = await anonymous.query(api.version.current, {});
  assert.equal(v.player.build, b, "readable signed out: the page may not have a session yet");
  assert.deepEqual(v.player.recent.slice(0, 2), [b, a], "one row per deploy");
  assert.notEqual(v.engine?.build, b, "sites are separate");
  await admin.mutation(internal.version.record, { site: "player", build: a });
  const back = await anonymous.query(api.version.current, {});
  assert.deepEqual([back.player.build, back.player.recent.slice(0, 3)], [a, [a, b, a]], "a rollback makes the newer build outdated");
});

test("version: history is bounded per site", async () => {
  for (let i = 0; i < 25; i++) await admin.mutation(internal.version.record, { site: "functions", build: id() });
  const v = await anonymous.query(api.version.current, {});
  assert.equal(v.functions.recent.length, 20);
});

test("version: only a deploy (the admin key) records a build", async () => {
  // (Test identities act through the admin key, so the outside caller here is a plain client.)
  const message = await rejects(anonymous.mutation(internal.version.record, { site: "engine", build: id() }));
  assert.match(message, /Could not find public function/);
  assert.match(await rejects(admin.mutation(internal.version.record, { site: "nope", build: id() })), /Validator|validator/);
});
