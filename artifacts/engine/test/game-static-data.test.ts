/**
 * Static server data the app reads by subscription (docs/convex-read-architecture.md R6): the settings manifest is a
 * query over a stored document (convex/manifest.ts), written by manifest/node:refresh (deploys, calibration uploads,
 * manifest.node.warm); a seat's calibration tables come from GET /api/calibration/<roomId>/<gameId>/<godId>, checked
 * against the caller's Convex JWT, immutable for that game and god.
 *
 * What would break: reading the manifest booting sandboxes (a read with a side effect; warm-up is manifest.node.warm's job),
 * the manifest not following its stored document or the sandboxes' state, a signed-out caller reading either, and a
 * caller getting another god's tables while the game runs (they name its goal), or after it ends without the replay's
 * access.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { SITE_, URL_, admin, api, gods, httpJwt, internal, rejects, roomWith, startGame, waitFor } from "./game-helpers.ts";

const pythonRow = async () => (await admin.query(internal.testing.sandboxes, {})).find((r: any) => r.language === "python");

test("the settings manifest is a query over a stored document; reading it never warms a sandbox; manifest.node.warm does", { timeout: 180_000 }, async () => {
  const [alice] = await gods("Manifest Alice");
  assert.match(await rejects(new ConvexHttpClient(URL_).query(api.manifest.get, {})), /sign/i, "signed out: refused");

  const warmed = await alice.c.action(api.manifest.node.warm, {});
  assert.ok(warmed.sandboxes.some((s: any) => s.language === "python"));
  const manifest = await alice.c.query(api.manifest.get, {});
  assert.ok(manifest, "manifest.node.warm stored it");
  assert.ok(manifest.objectTypes.some((t: any) => t.id === "Int" && t.playable.length > 0), "object types with their playable shapes");
  assert.ok(manifest.priors.includes("uniform"));
  for (const field of ["defaults", "options", "languages", "runtimes", "sandboxes", "aiFunding", "engine"]) assert.ok(field in manifest, field);
  await waitFor(async () => (await pythonRow())?.state === "ready" || undefined, "python ready", 120_000, 200);

  // A read leaves the sandboxes alone, and shows their state as it is stored (live, as rows change).
  const due = { state: "failed", reason: "test: a failed boot long ago", attemptAt: Date.now() - 3_600_000, attempts: 1 };
  await admin.mutation(internal.testing.setSandbox, { language: "python", patch: due });
  try {
    const read = await alice.c.query(api.manifest.get, {});
    const row = await pythonRow();
    assert.equal(row.attemptAt, due.attemptAt, "reading the manifest scheduled no boot");
    assert.equal(row.state, "failed");
    assert.equal(read.sandboxes.find((s: any) => s.language === "python").state, "failed", "the row's state, as stored");
    assert.ok(!read.runtimes.includes("python"), "a failed runtime is not offered");
  } finally {
    // Warming is explicit: the action schedules the boot the read did not.
    await alice.c.action(api.manifest.node.warm, {});
    assert.ok((await pythonRow()).attemptAt > due.attemptAt, "manifest.node.warm scheduled a boot");
    await waitFor(async () => (await pythonRow())?.state === "ready" || undefined, "python ready again", 120_000, 200);
  }

  // The answer follows the stored document (a deploy's or an upload's refresh rewrites it).
  const stored = await admin.query(internal.manifest.stored, {});
  try {
    await admin.mutation(internal.manifest.store, { body: JSON.stringify({ ...JSON.parse(stored), priors: ["uniform", "test-prior"] }) });
    assert.deepEqual((await alice.c.query(api.manifest.get, {})).priors, ["uniform", "test-prior"]);
  } finally {
    await admin.action(internal.manifest.node.refresh, {});
  }
  assert.deepEqual((await alice.c.query(api.manifest.get, {})).priors, manifest.priors, "refresh writes the computed manifest back");
});

const INT = { objectType: "Int", typeArgs: { min: 0, max: 9999 }, priorId: "uniform", spawnRateHz: 0, planningSeconds: 3600, startingObjectCount: 3 };

test("a seat's calibration tables: GET /api/calibration/<room>/<game>/<god>, the caller's own live, any seat in a replay", { timeout: 180_000 }, async () => {
  const [host, ada, bo, late, after] = await gods("Tables Host", "Tables Ada", "Tables Bo", "Tables Late", "Tables After");
  const { roomId, shortCode } = await roomWith([host, ada, bo], INT);
  await startGame(host, roomId);
  const mine = await ada.c.query(api.player.myUtility, { roomId });
  const url = (gameId = mine.gameId, godId = mine.godId, room = roomId) =>
    `${SITE_}/api/calibration/${encodeURIComponent(room)}/${encodeURIComponent(gameId)}/${encodeURIComponent(godId)}`;
  const get = (token?: string, path = url()) => fetch(path, token ? { headers: { authorization: `Bearer ${token}` } } : {});
  const adaJwt = await httpJwt(ada, roomId);

  assert.equal((await get()).status, 401, "signed out");
  assert.equal((await get("not-a-jwt")).status, 401, "a malformed token is no sign-in");

  const response = await get(adaJwt);
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get("cache-control") ?? "", /private/, "never in a shared cache");
  assert.match(response.headers.get("cache-control") ?? "", /immutable/, "one game's tables never change");
  const tables = await response.json() as { reward: { key: string; instance: string; levels: unknown[] }; penalty?: { key: string } };
  const probe = await admin.action(internal.calibration.node.probe, { settings: mine.settings, draw: { familyId: mine.utility.familyId, params: mine.utility.params } });
  assert.equal(tables.reward.key, probe.key, "the engine's own table for ada's draw");
  assert.equal(tables.reward.instance, "Int(0,9999)");
  assert.equal(!!tables.penalty, !!mine.utility.penalty, "the defence goal's table when there is one");

  // Another god's tables name their goal: never, even to another player of the game.
  assert.equal((await get(await httpJwt(bo, roomId))).status, 403);
  // A member without a seat has no tables; an unknown game has none.
  await late.c.mutation(api.rooms.join, { room: shortCode });
  const lateJwt = await httpJwt(late, roomId);
  assert.equal((await get(lateJwt, url(mine.gameId, late.subject))).status, 404);
  assert.equal((await get(adaJwt, url("no-such-game"))).status, 404);
  assert.equal((await get(adaJwt, `${SITE_}/api/calibration/${roomId}/%E0%A4%A/x`)).status, 400);

  // Ended, the replay reveals every goal: its players get each other's tables (the replay's what-if and "How this
  // scores" for any point of view), and so do its spectators (late watched it); a member who joined after gets none.
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const fromBo = await get(await httpJwt(bo, roomId));
  assert.equal(fromBo.status, 200, await fromBo.clone().text());
  assert.equal((await fromBo.json() as typeof tables).reward.key, tables.reward.key);
  assert.equal((await get(lateJwt)).status, 200, "a spectator of the game");
  await after.c.mutation(api.rooms.join, { room: shortCode });
  assert.equal((await get(await httpJwt(after, roomId))).status, 403, "joined after the game");

  // The action it replaces is gone (a one-off read the app cached per module).
  assert.ok(await rejects(ada.c.action(api.calibration.node.tables, { settings: mine.settings, draws: [mine.utility] })));
});

test("one draw's table by instantiation: GET /api/rule-tables, for any signed-in caller (the rule gallery)", { timeout: 120_000 }, async () => {
  const [host, ada, bo] = await gods("Gallery Host", "Gallery Ada", "Gallery Bo");
  const { roomId } = await roomWith([host, ada, bo], INT);
  const jwt = await httpJwt(ada, roomId);
  const url = (instance: string, family: string, params: unknown) =>
    `${SITE_}/api/rule-tables?instance=${encodeURIComponent(instance)}&family=${encodeURIComponent(family)}&params=${encodeURIComponent(JSON.stringify(params))}`;
  const get = (path: string, token?: string) => fetch(path, token ? { headers: { authorization: `Bearer ${token}` } } : {});
  const ok = url("Grid(4,base10,rgb)", "set_spotter", { diag: false });

  assert.equal((await get(ok)).status, 401, "signed out");
  const response = await get(ok, jwt);
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get("cache-control") ?? "", /private.*immutable/, "per caller, never changes");
  const { reward } = await response.json() as { reward: { key: string; instance: string } };
  const settings = { objectType: "Grid", typeArgs: { size: 4, symbols: "base10", colours: "rgb" }, priorId: "uniform" };
  const probe = await admin.action(internal.calibration.node.probe, { settings, draw: { familyId: "set_spotter", params: { diag: false } } });
  assert.equal(reward.instance, "Grid(4,base10,rgb)");
  assert.equal(reward.key, probe.key, "the engine's own table for that draw");

  // Anything that names no dealable draw is refused before any table is looked up.
  for (const bad of [url("Grid(3,base10,rgb)", "set_spotter", { diag: false }), url("Grid(4,base10,rgb)", "no_such_family", {}),
    url("Grid(4,base10,rgb)", "set_spotter", [1]), `${SITE_}/api/rule-tables?instance=Grid(4,base10,rgb)`]) {
    assert.equal((await get(bad, jwt)).status, 400, bad);
  }
});
