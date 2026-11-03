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
import { URL_, admin, api, internal, rejects, waitFor } from "./game-helpers.ts";

const id = () => randomUUID().replace(/-/g, "").slice(0, 16);
const anonymous = new ConvexHttpClient(URL_);
let live: Record<string, { build: string } | null> = {};
before(async () => { live = await admin.query(api.version.current, {}); });
after(async () => {
  for (const site of ["app", "functions"]) if (live[site]) await admin.mutation(internal.version.record, { site, build: live[site]!.build });
});

test("version: records per site; the same build again is no deploy; a rollback is; any recorded build stays known", async () => {
  const [a, b] = [id(), id()];
  await admin.mutation(internal.version.record, { site: "app", build: a });
  assert.deepEqual(await admin.mutation(internal.version.record, { site: "app", build: b }), { recorded: true });
  assert.deepEqual(await admin.mutation(internal.version.record, { site: "app", build: b }), { recorded: false });
  const v = await anonymous.query(api.version.current, { own: { site: "app", build: a } });
  assert.deepEqual([v.app.build, v.known], [b, true], "readable signed out: the page may not have a session yet");
  assert.equal((await anonymous.query(api.version.current, { own: { site: "functions", build: a } })).known, false, "sites are separate");
  assert.equal((await anonymous.query(api.version.current, { own: { site: "app", build: id() } })).known, false, "a build never deployed here");
  assert.equal((await anonymous.query(api.version.current, {})).known, undefined);
  await admin.mutation(internal.version.record, { site: "app", build: a });
  const back = await anonymous.query(api.version.current, { own: { site: "app", build: b } });
  assert.deepEqual([back.app.build, back.known], [a, true], "after a rollback to A, a page on B is outdated");
  for (let i = 0; i < 25; i++) await admin.mutation(internal.version.record, { site: "app", build: id() });
  assert.equal((await anonymous.query(api.version.current, { own: { site: "app", build: b } })).known, true, "a page open across many deploys is still recognised");
});

test("version: only a deploy (the admin key) records a build", async () => {
  // (Test identities act through the admin key, so the outside caller here is a plain client.)
  const message = await rejects(anonymous.mutation(internal.version.record, { site: "app", build: id() }));
  assert.match(message, /Could not find public function/);
  assert.match(await rejects(admin.mutation(internal.version.record, { site: "nope", build: id() })), /alidator/);
  assert.match(await rejects(admin.mutation(internal.version.record, { site: "functions", build: "a b" })), /build id/);
});

test("version: a page of a retired site (engine UI, /client/) is told it is outdated, so it reloads into the app", async () => {
  const old = id();
  await admin.mutation(internal.testing.retiredSiteBuild, { site: "player", build: old });
  const v = await anonymous.query(api.version.current, { own: { site: "player", build: old } }) as Record<string, any>;
  // Catches: the old page's query refused (it would never learn of the deploy), or its site missing from the answer.
  assert.equal(v.known, true);
  assert.deepEqual(v.player, v.app, "its site answers with the app's live build");
  assert.notEqual(v.player?.build, old);
  assert.equal((await anonymous.query(api.version.current, { own: { site: "engine", build: id() } }) as Record<string, any>).known, true, "even once its rows are migrated away");
});

test("version: the migration deletes the retired sites' build rows and keeps the live ones", async () => {
  await admin.mutation(internal.testing.retiredSiteBuild, { site: "engine", build: id() });
  await admin.mutation(internal.testing.retiredSiteBuild, { site: "player", build: id() });
  const before = await admin.query(internal.testing.siteBuildCounts, {}) as Record<string, number>;
  assert.ok(before.engine && before.player && before.app, JSON.stringify(before));
  const since = Date.now();
  await admin.mutation(internal.migrations.runAll, { reset: true });
  await waitFor(async () => {
    const statuses = await admin.query(internal.migrations.status, {}) as { name: string; state: string; latestStart?: number }[];
    assert.ok(!statuses.some(s => s.state === "failed" || s.state === "canceled"), JSON.stringify(statuses));
    return statuses.some(s => s.name === "migrations:dropRetiredSiteBuilds") && statuses.every(s => s.state === "success" && (s.latestStart ?? 0) >= since);
  }, "every migration reports success", 120_000, 250);
  const after = await admin.query(internal.testing.siteBuildCounts, {}) as Record<string, number>;
  assert.deepEqual([after.engine, after.player], [undefined, undefined]);
  assert.equal(after.app, before.app, "the app's builds stay (pages open on them still update)");
});
