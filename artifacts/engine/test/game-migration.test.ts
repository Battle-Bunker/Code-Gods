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
import { admin, api, gods, internal, roomWith, startGame, touch, waitFor, type God } from "./game-helpers.ts";

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
  const game = await startGame(host, played.roomId);
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

const migrateAssistant = (): Promise<Record<string, number>> => admin.action(internal.migrations.assistantPerGame, {});

test("assistant-per-game: legacy threads and stored objects join the game they belonged to, split where a thread spans games", { timeout: 300_000 }, async () => {
  const [ann, bob, cyd] = await gods("Legacy Ann", "Legacy Bob", "Legacy Cyd");
  await touch(ann);
  const { roomId } = await roomWith([ann, bob, cyd], {
    languages: ["typescript"], objectType: "Int",
    typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 3, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
  });
  await ann.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: 500_000 });
  const say = async (god: God, text: string) => {
    const sent = await god.c.mutation(api.assistant.send, { roomId, text: `/mock ${JSON.stringify({ steps: [{ text }] })}` });
    await waitFor(async () => (await god.c.query(api.assistant.thread, { threadId: sent.threadId })).turns.every((t: any) => t.status === "done") || null, text, 60_000, 150);
    return sent.threadId as string;
  };
  const credentialId = await admin.mutation(internal.testing.seedCredential, { subject: ann.subject, roomId, permission: "act" }) as string;
  const run = (source: string, saveAs?: string) => admin.action(internal.code.execute.runAs, { principal: { credentialId }, roomId, datasetsJson: "[]", language: "typescript", source, ...(saveAs ? { saveAs } : {}) });

  const game1 = await startGame(ann, roomId);
  const thread1 = await say(ann, "in game one");
  assert.equal((await run("function main(d) { store.put('notes/one', 1); return 1; }", "kept")).status, "ok");
  await ann.c.mutation(api.rooms.endActiveGame, { roomId });
  const game2 = await startGame(ann, roomId);
  const thread2 = await say(ann, "in game two");
  assert.equal((await run("function main(d) { store.put('notes/two', 2); return 2; }")).status, "ok");
  // Before (player, game) keys: one conversation continued across both games, objects and usage unpartitioned.
  await admin.mutation(internal.testing.makeAssistantLegacy, { subject: ann.subject, merge: [thread1, thread2] });
  assert.deepEqual(await ann.c.query(api.assistant.threads, { roomId }), [], "an unmigrated thread is in no game");

  const first = await migrateAssistant();
  assert.ok(first.threads >= 1 && first.objects >= 3 && first.usage >= 1, JSON.stringify(first));
  const texts = async (threadId: string) => (await ann.c.query(api.assistant.thread, { threadId })).messages.map((m: any) => m.text);
  assert.deepEqual((await ann.c.query(api.assistant.threads, { roomId, gameId: game1.gameId })).map((t: any) => t._id), [thread1], "the thread stays with the game it started in");
  assert.deepEqual(await texts(thread1), ["/mock {\"steps\":[{\"text\":\"in game one\"}]}", "in game one"]);
  const now = await ann.c.query(api.assistant.threads, { roomId });
  assert.equal(now.length, 1);
  assert.notEqual(now[0]._id, thread1, "game 2's turns moved to a thread of their own");
  assert.deepEqual([now[0].gameId, (await texts(now[0]._id)).at(-1)], [game2.gameId, "in game two"]);
  // Objects: the saved script is the player's, each note its game's.
  const listed = await ann.c.query(api.code.objects.list, { roomId });
  assert.deepEqual(listed.objects.map((o: any) => o.key).filter((k: string) => !k.startsWith("runs/")), ["notes/two", "scripts/kept"]);
  assert.deepEqual(listed.usage, { objects: 2, bytes: listed.objects.filter((o: any) => !o.key.startsWith("runs/")).reduce((n: number, o: any) => n + o.bytes, 0) }, "usage is recounted per partition");
  assert.equal((await ann.c.query(api.code.objects.list, {})).objects.filter((o: any) => o.key.startsWith("notes/")).length, 2, "the whole store still holds game 1's note");

  assert.deepEqual(await migrateAssistant(), { threads: 0, objects: 0, usage: 0 }, "idempotent");
});
