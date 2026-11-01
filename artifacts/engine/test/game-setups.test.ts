/**
 * The shared catalogue of game setups (convex/setups.ts) against the live local backend. What would break: a system
 * setup edited or deleted by anyone (admins included) or drifting from the code, a setup hidden from other humans (they
 * are shared), a human changing or deleting another's, a copy named wrongly or colliding with one of the duplicator's
 * names, a read-only credential writing, an incomplete or unplayable setup stored, or a new room not running First steps.
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SEED_SETUPS, SETUP_NAME_MAX, seedSetupSettings } from "@workspace/game-core";
import { admin, api, clientFor, gods, internal, playerClient, roomWith, touch, type God } from "./game-helpers.ts";

async function errorOf(promise: Promise<unknown>): Promise<{ code?: string; message?: string }> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string; message?: string } }).data ?? { message: (error as Error).message }; }
  return { code: "no error" };
}
const errorCode = async (promise: Promise<unknown>) => (await errorOf(promise)).code ?? "untyped";
/** An admin: a verified ADMIN_EMAILS address on the test-only "fake" provider (scripts/dev.mjs). */
async function adminGod(name: string): Promise<God> {
  const subject = `test|${randomUUID()}`;
  const sid = await admin.mutation(internal.testing.seedUser, { subject, name, email: "admin@example.test", emailVerified: true, provider: "fake" });
  return { subject, name, sid, c: clientFor(subject, "browser", { sessionId: sid }) };
}
type Setup = { id: string; name: string; summary: string; settings: Record<string, unknown>; system: boolean; seedId?: string; ownerName: string; mine: boolean; editable: boolean };
/** The list rows carry no settings (the catalogue is shared and may be long); `get` has them. */
const list = (g: God): Promise<Omit<Setup, "settings">[]> => g.c.query(api.setups.list, {});
const get = (g: God, setupId: string): Promise<Setup> => g.c.query(api.setups.get, { setupId });
const classic = () => seedSetupSettings("grid-classic");

before(async () => { await admin.mutation(internal.testing.resetSeedSetups, {}); });
after(async () => { await admin.mutation(internal.testing.resetSeedSetups, {}); });

test("system setups: seeded once in the shipped order, owned by the system, and kept equal to the code", async () => {
  await admin.mutation(internal.setups.ensureSeeded, {});
  await admin.mutation(internal.setups.ensureSeeded, {});
  const [ann] = await gods("Seed Ann");
  const system = (await list(ann)).filter(r => r.system);
  assert.deepEqual(system.map(d => d.seedId), SEED_SETUPS.map(s => s.seedId), "each seed exactly once, in order, first");
  assert.deepEqual(system.map(d => d.name), ["First steps", "Classic", "Low income", "Big board", "Master"]);
  for (const d of system) {
    assert.ok(!("settings" in d), "a list row has no settings");
    assert.deepEqual((await get(ann, d.id)).settings, seedSetupSettings(d.seedId!), `${d.name}: the complete shipped settings`);
    assert.deepEqual([d.ownerName, d.mine, d.editable], ["System", false, false]);
  }
  // A stored seed that drifted (an admin edit from before setups were immutable, or older settings) is put back.
  const big = system.find(d => d.seedId === "grid-big")!;
  await admin.mutation(internal.testing.makeLegacy, { setupId: big.id as never, settings: { ...seedSetupSettings("grid-big"), planningSeconds: 999 } });
  await admin.mutation(internal.setups.ensureSeeded, {});
  assert.deepEqual((await get(ann, big.id)).settings, seedSetupSettings("grid-big"));
});

test("nobody edits or deletes a system setup, admins and owner credentials included: they duplicate it", { timeout: 60_000 }, async () => {
  const root = await adminGod("Setup Admin");
  const master = (await list(root)).find(r => r.seedId === "grid-master")!;
  assert.equal(master.editable, false, "not even for an admin");
  const edit = await errorOf(root.c.action(api.setups.save, { setupId: master.id, name: "Master", settings: seedSetupSettings("grid-master") }));
  assert.deepEqual([edit.code, edit.message], ["FORBIDDEN", "System setups cannot be edited: duplicate it"]);
  assert.equal(await errorCode(root.c.mutation(api.setups.remove, { setupId: master.id })), "FORBIDDEN");
  const { roomId } = await roomWith([root]);
  const app = await playerClient(root, roomId, "owner");
  assert.equal(await errorCode(app.action(api.setups.save, { setupId: master.id, name: "Master", settings: seedSetupSettings("grid-master") })), "FORBIDDEN");
  assert.deepEqual((await get(root, master.id)).settings, seedSetupSettings("grid-master"), "unchanged");
});

test("everyone sees every setup with its owner; only the owner changes or deletes it; read credentials only read", { timeout: 60_000 }, async () => {
  const [ann, bob] = await gods("Owner Ann", "Other Bob");
  const quick = { ...classic(), planningSeconds: 30 };
  const saved: Setup = await ann.c.action(api.setups.save, { name: "  Quick   classic ", settings: quick });
  assert.deepEqual([saved.name, saved.ownerName, saved.mine, saved.editable, saved.system], ["Quick classic", "Owner Ann", true, true, false], "the name is trimmed");
  assert.match(saved.summary, /Grid 5×5/);
  const seenByBob = (await list(bob)).find(r => r.id === saved.id);
  assert.deepEqual([seenByBob?.ownerName, seenByBob?.mine, seenByBob?.editable], ["Owner Ann", false, false], "shared, but not Bob's");
  assert.deepEqual((await get(bob, saved.id)).settings, quick, "and its settings");
  assert.equal(await errorCode(bob.c.query(api.setups.get, { setupId: "nope" })), "NOT_FOUND");
  const annRows = await list(ann);
  assert.ok(annRows.findIndex(r => r.id === saved.id) >= SEED_SETUPS.length, "after the system's");

  // Bob may not change or delete Ann's setup, and is told whose it is.
  const edit = await errorOf(bob.c.action(api.setups.save, { setupId: saved.id, name: "Mine now", settings: quick }));
  assert.deepEqual([edit.code, edit.message], ["FORBIDDEN", "Only Owner Ann can edit this setup: duplicate it"]);
  assert.equal(await errorCode(bob.c.mutation(api.setups.remove, { setupId: saved.id })), "FORBIDDEN");
  assert.equal(await errorCode(bob.c.mutation(api.setups.remove, { setupId: "not-an-id" })), "NOT_FOUND");

  // Names: 1–40 characters, unique among one's own (edit by id instead); another human may use the same name.
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "QUICK CLASSIC", settings: quick })), "CONFLICT");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "   ", settings: quick })), "BAD_REQUEST");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "x".repeat(41), settings: quick })), "BAD_REQUEST");
  const bobs: Setup = await bob.c.action(api.setups.save, { name: "Quick classic", settings: quick });
  // Settings: complete, valid, a playable shape (3×3 is retired) and within the server's limits; defence goals need one allowed family.
  const { language: _l, ...incomplete } = quick;
  assert.match((await errorOf(ann.c.action(api.setups.save, { name: "Partial", settings: incomplete }))).message ?? "", /missing: language/);
  assert.match((await errorOf(ann.c.action(api.setups.save, { name: "Extra", settings: { ...quick, colour: "red" } }))).message ?? "", /Unknown settings: colour/);
  assert.match((await errorOf(ann.c.action(api.setups.save, { name: "Old", settings: { ...quick, defenceRate: 0 } }))).message ?? "", /Unknown settings: defenceRate/);
  assert.match((await errorOf(ann.c.action(api.setups.save, { name: "Odd board", settings: { ...quick, typeArgs: { size: 3, symbols: "base10", colours: "rgb" } } }))).message ?? "", /not playable|retired/);
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "Negative", settings: { ...quick, planningSeconds: -1 } })), "BAD_REQUEST");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "Huge", settings: { ...quick, startingObjectCount: 5000 } })), "BAD_REQUEST");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "Mixed", settings: { ...quick, grammarId: "typescript-agent-v1" } })), "BAD_REQUEST");
  const hates = ["hate_colour", "hate_value", "hate_blob", "hate_takeover", "hate_big_blob", "hate_same_corners", "hate_repeat_row", "hate_symbol_takeover"];
  const noDefence = await errorOf(ann.c.action(api.setups.save, { name: "No defence left", settings: { ...quick, defenceGoals: true, excludedDefenceFamilies: hates } }));
  assert.deepEqual([noDefence.code, noDefence.message], ["BAD_REQUEST", "Defence goals need at least one defence goal allowed in this world"]);
  const oneLeft: Setup = await ann.c.action(api.setups.save, { name: "One defence", settings: { ...quick, defenceGoals: true, excludedDefenceFamilies: hates.slice(1) } });
  await ann.c.mutation(api.setups.remove, { setupId: oneLeft.id });

  // Edit (rename too) by id.
  const over: Setup = await ann.c.action(api.setups.save, { setupId: saved.id, name: "Quick classic 2", settings: { ...quick, planningSeconds: 45 } });
  assert.equal(over.id, saved.id);
  assert.deepEqual((await list(ann)).filter(r => r.mine).map(r => r.name), ["Quick classic 2"]);
  assert.equal((await get(ann, saved.id)).settings.planningSeconds, 45);

  // Credentials: read lists only; act may save, duplicate and remove (setups belong to the human, across rooms).
  const { roomId } = await roomWith([ann]);
  const reader = await playerClient(ann, roomId, "read");
  assert.ok((await reader.query(api.setups.list, {})).some((r: Setup) => r.id === saved.id));
  assert.equal(await errorCode(reader.action(api.setups.save, { name: "From a reader", settings: quick })), "FORBIDDEN");
  assert.equal(await errorCode(reader.mutation(api.setups.duplicate, { setupId: saved.id })), "FORBIDDEN");
  assert.equal(await errorCode(reader.mutation(api.setups.remove, { setupId: saved.id })), "FORBIDDEN");
  const actor = await playerClient(ann, roomId, "act");
  const fromApp: Setup = await actor.action(api.setups.save, { name: "From my app", settings: quick });
  assert.equal(fromApp.mine, true);

  await ann.c.mutation(api.setups.remove, { setupId: saved.id });
  await actor.mutation(api.setups.remove, { setupId: fromApp.id });
  await bob.c.mutation(api.setups.remove, { setupId: bobs.id });
  assert.equal(await errorCode(ann.c.mutation(api.setups.remove, { setupId: saved.id })), "NOT_FOUND", "gone");
  assert.ok(!(await list(bob)).some(r => r.id === saved.id), "gone for everyone");
});

test("duplicate: any setup becomes the duplicator's own \"<name>'s copy\", deduplicated among theirs and within 40 characters", { timeout: 60_000 }, async () => {
  const [ann, bob] = await gods("Copy Ann", "Copy Bob");
  const classicRow = (await list(ann)).find(r => r.seedId === "grid-classic")!;
  const first: Setup = await ann.c.mutation(api.setups.duplicate, { setupId: classicRow.id });
  assert.deepEqual([first.name, first.ownerName, first.mine, first.editable, first.system], ["Classic's copy", "Copy Ann", true, true, false]);
  assert.deepEqual(first.settings, seedSetupSettings("grid-classic"), "starting from the duplicated setup's values");
  assert.equal(first.summary, classicRow.summary);
  const second: Setup = await ann.c.mutation(api.setups.duplicate, { setupId: classicRow.id });
  const third: Setup = await ann.c.mutation(api.setups.duplicate, { setupId: classicRow.id });
  assert.deepEqual([second.name, third.name], ["Classic's copy 2", "Classic's copy 3"]);
  // Another human's names do not count; another human's setup can be copied too.
  const bobsCopy: Setup = await bob.c.mutation(api.setups.duplicate, { setupId: first.id });
  assert.equal(bobsCopy.name, "Classic's copy's copy");
  assert.equal((await bob.c.mutation(api.setups.duplicate, { setupId: classicRow.id })).name, "Classic's copy");
  // A long name is shortened so "'s copy" (and " 2") still fit.
  const long: Setup = await ann.c.action(api.setups.save, { name: "L".repeat(SETUP_NAME_MAX), settings: classic() });
  const longCopy: Setup = await ann.c.mutation(api.setups.duplicate, { setupId: long.id });
  const longCopy2: Setup = await ann.c.mutation(api.setups.duplicate, { setupId: long.id });
  assert.deepEqual([longCopy.name, longCopy2.name], [`${"L".repeat(SETUP_NAME_MAX - 7)}'s copy`, `${"L".repeat(SETUP_NAME_MAX - 9)}'s copy 2`]);
  // An explicit name is used as given (deduplicated the same way).
  assert.equal((await ann.c.mutation(api.setups.duplicate, { setupId: classicRow.id, name: "Classic's copy" })).name, "Classic's copy 4");
  assert.equal(await errorCode(ann.c.mutation(api.setups.duplicate, { setupId: "nope" })), "NOT_FOUND");
});

test("a new room runs the system's First steps; owner.settings applies anyone's setup and names it in the room", { timeout: 60_000 }, async () => {
  const [host, ada] = await gods("Setup Host", "Setup Ada");
  await touch(host);
  const { roomId, shortCode } = await roomWith([host]);
  await ada.c.mutation(api.rooms.join, { room: shortCode });
  const setups = await list(host);
  const first = setups.find(r => r.seedId === "grid-first-steps")!, master = setups.find(r => r.seedId === "grid-master")!;
  let room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settings, seedSetupSettings("grid-first-steps"));
  assert.deepEqual(room.setup, { id: first.id, name: "First steps", deleted: false });

  // Ada's setup, in another language: applied whole by the room's owner (setups are shared).
  const adas: Setup = await ada.c.action(api.setups.save, { name: "TypeScript Master", settings: {
    ...seedSetupSettings("grid-master"), language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", planningSeconds: 300 } });
  const applied = await host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: adas.id });
  assert.equal(applied.setup.created, false);
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([room.settings, room.setup], [adas.settings, { id: adas.id, name: "TypeScript Master", deleted: false }]);
  await host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: master.id });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([room.settings, room.setup], [seedSetupSettings("grid-master"), { id: master.id, name: "Master", deleted: false }]);
  assert.equal(await errorCode(host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: master.id, settings: { planningSeconds: 5 } })), "BAD_REQUEST",
    "a setup or settings, not both");
  assert.equal(await errorCode(host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: "not-an-id" })), "NOT_FOUND");
  // A setup applied and later deleted: the room keeps its snapshot and shows the setup as deleted.
  await host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: adas.id });
  await ada.c.mutation(api.setups.remove, { setupId: adas.id });
  room = await ada.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([room.settings, room.setup], [adas.settings, { id: adas.id, name: "TypeScript Master", deleted: true }]);
});
