/**
 * The setups-v2 migration (convex/migrations.ts) on legacy documents against the live local backend. What would break:
 * a room left without a setup, a custom or modified room put on a setup whose settings it does not have, a room's
 * defence goals lost or its excluded defence families mixed back into the reward list, a single stored language not
 * becoming the allowed set of that language, a game that forgot its setup, or a second run changing anything (the
 * deploy runs it on every push).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { complexityFor, grammarFor, seedSetupSettings, type GameSettings } from "@workspace/game-core";
import { admin, api, gods, internal, roomWith, touch } from "./game-helpers.ts";

/**
 * The pre-setups-v2 shape of some settings: a defence rate, defence ids among the excluded families, and one language
 * with its grammar and summon-price ids.
 */
function legacy(settings: GameSettings, defenceRate: number, excludedDefence: string[] = []) {
  const { defenceGoals: _g, excludedDefenceFamilies: _x, languages, ...rest } = settings;
  const language = languages[0]!;
  return { ...rest, defenceRate, excludedFamilies: [...rest.excludedFamilies, ...excludedDefence],
    language, grammarId: grammarFor(language), complexityFunctionId: complexityFor(language) };
}
const migrate = (): Promise<Record<string, number>> => admin.action(internal.migrations.node.setupsV2, {});

test("legacy rooms, games and setups are migrated once: every room runs a setup holding its settings", { timeout: 300_000 }, async () => {
  const [host, ada, bo] = await gods("Legacy Host", "Legacy Ada", "Legacy Bo");
  await touch(host);
  const setups = await host.c.query(api.setups.list, {});
  const classic = setups.find((s: any) => s.seedId === "grid-classic");
  const room = async (roomId: string) => host.c.query(api.rooms.get, { room: roomId });

  // A custom room that dealt defence goals at a rate, with a defence family excluded.
  const custom = await roomWith([host]);
  await admin.mutation(internal.testing.makeLegacy, { roomId: custom.roomId, settings: legacy(seedSetupSettings("grid-classic"), 0.5, ["hate_blob"]), settingsOrigin: { kind: "custom", modified: false } });
  // A room on the unmodified Classic, and one that had modified it.
  const onClassic = await roomWith([host]);
  await admin.mutation(internal.testing.makeLegacy, { roomId: onClassic.roomId, settings: legacy(seedSetupSettings("grid-classic"), 0), settingsOrigin: { kind: "setup", id: classic.id, modified: false } });
  const modified = await roomWith([host]);
  const modifiedSettings = { ...legacy(seedSetupSettings("grid-classic"), 0), planningSeconds: 120 };
  await admin.mutation(internal.testing.makeLegacy, { roomId: modified.roomId, settings: modifiedSettings, settingsOrigin: { kind: "setup", id: classic.id, modified: true } });
  // A legacy preset room with no origin at all.
  const bare = await roomWith([host]);
  await admin.mutation(internal.testing.makeLegacy, { roomId: bare.roomId, settings: legacy(seedSetupSettings("grid-first-steps"), 0) });
  // One of the host's own setups with legacy settings.
  const own = await host.c.action(api.setups.save, { name: "Old defence", settings: seedSetupSettings("grid-classic") });
  await admin.mutation(internal.testing.makeLegacy, { setupId: own.id, settings: legacy(seedSetupSettings("grid-classic"), 1, ["hate_colour"]) });
  // An ended game started from Classic, before setupIds.
  const played = await roomWith([host, ada, bo], { planningSeconds: 3600, halfLifeSeconds: 1e9, startingObjectCount: 3, spawnRateHz: 0 });
  const game = await host.c.action(api.owner.start, { roomId: played.roomId });
  await host.c.mutation(api.rooms.endActiveGame, { roomId: played.roomId });
  await admin.mutation(internal.testing.makeLegacy, { gameId: game.gameId, settings: legacy(seedSetupSettings("grid-classic"), 0.25), settingsOrigin: { kind: "setup", id: classic.id, modified: false } });

  const first = await migrate();
  assert.ok(first.rooms >= 4 && first.games >= 1 && first.setups >= 1, JSON.stringify(first));

  // The custom room: its own new setup, named after the room, holding its (converted) settings.
  const c = await room(custom.roomId);
  assert.equal(c.setup.name, `Room ${custom.shortCode}'s setup`);
  const expected = { ...seedSetupSettings("grid-classic"), defenceGoals: true, excludedDefenceFamilies: ["hate_blob"] };
  assert.deepEqual(c.settings, expected);
  const created = await host.c.query(api.setups.get, { setupId: c.setup.id });
  assert.deepEqual([created.mine, created.settings], [true, expected]);
  assert.ok(!("settingsOrigin" in c));
  // On Classic unmodified: Classic. Modified: a new setup of the owner's with the modified settings.
  assert.deepEqual((await room(onClassic.roomId)).setup, { id: classic.id, name: "Classic", deleted: false });
  const m = await room(modified.roomId);
  assert.equal(m.setup.name, `Room ${modified.shortCode}'s setup`);
  assert.equal(m.settings.planningSeconds, 120);
  assert.equal((await room(bare.roomId)).setup.name, `Room ${bare.shortCode}'s setup`);
  // The setup and the game.
  const ownAfter = await host.c.query(api.setups.get, { setupId: own.id });
  assert.deepEqual([ownAfter.settings.defenceGoals, ownAfter.settings.excludedDefenceFamilies, "defenceRate" in ownAfter.settings], [true, ["hate_colour"], false]);
  const [record] = await host.c.query(api.rooms.history, { room: played.roomId });
  assert.deepEqual(record.setup, { id: classic.id, name: "Classic" });
  assert.equal(record.settings.defenceGoals, true);
  assert.ok(!("defenceRate" in record.settings));
  for (const settings of [c.settings, m.settings, ownAfter.settings, record.settings]) {
    assert.deepEqual(settings.languages, ["python"], "the one stored language is the allowed set");
    for (const gone of ["language", "grammarId", "complexityFunctionId"]) assert.ok(!(gone in settings), gone);
  }

  assert.deepEqual(await migrate(), { setups: 0, rooms: 0, games: 0 }, "idempotent");
});
