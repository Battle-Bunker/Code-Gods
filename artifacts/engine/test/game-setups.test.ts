/**
 * The catalogue of game setups (convex/setups.ts) against the live local backend. What would break: defaults seeded
 * twice or recreated after an admin removed one, an admin's edit lost on re-seeding, one human seeing or changing
 * another's setup, a read-only credential saving, an incomplete or unplayable setup stored, a room applied a setup it
 * may not see, or a new room not starting on First steps.
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SEED_SETUPS, seedSetupSettings } from "@workspace/game-core";
import { admin, api, clientFor, gods, internal, playerClient, roomWith, touch, type God } from "./game-helpers.ts";

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string } }).data?.code ?? `untyped: ${(error as Error).message}`; }
  return "no error";
}
async function errorOf(promise: Promise<unknown>): Promise<{ code?: string; message?: string }> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string; message?: string } }).data ?? { message: (error as Error).message }; }
  return { code: "no error" };
}
/** An admin: a verified ADMIN_EMAILS address on the test-only "fake" provider (scripts/dev.mjs). */
async function adminGod(name: string): Promise<God> {
  const subject = `test|${randomUUID()}`;
  const sid = await admin.mutation(internal.testing.seedUser, { subject, name, email: "admin@example.test", emailVerified: true, provider: "fake" });
  return { subject, name, sid, c: clientFor(subject, "browser", { sessionId: sid }) };
}
type Setup = { id: string; name: string; summary: string; settings: Record<string, unknown>; seeded: boolean; seedId?: string; mine: boolean; editable: boolean };
const list = (g: God): Promise<Setup[]> => g.c.query(api.setups.list, {});
const classic = () => seedSetupSettings("grid-classic");

before(async () => { await admin.mutation(internal.testing.resetSeedSetups, {}); });
after(async () => { await admin.mutation(internal.testing.resetSeedSetups, {}); });

test("the defaults are seeded once, in the shipped order, and every human sees the same ones", async () => {
  await admin.mutation(internal.setups.ensureSeeded, {});
  await admin.mutation(internal.setups.ensureSeeded, {});
  const [ann, bob] = await gods("Seed Ann", "Seed Bob");
  const rows = await list(ann);
  const defaults = rows.filter(r => r.seeded);
  assert.deepEqual(defaults.map(d => d.seedId), SEED_SETUPS.map(s => s.seedId), "each seed exactly once, in order");
  assert.deepEqual(defaults.map(d => d.name), ["First steps", "Classic", "Low income", "Big board", "Master"]);
  for (const d of defaults) {
    assert.deepEqual(d.settings, seedSetupSettings(d.seedId!), `${d.name}: the complete shipped settings`);
    assert.equal(d.summary, SEED_SETUPS.find(s => s.seedId === d.seedId)!.summary);
    assert.deepEqual([d.mine, d.editable], [false, false], "a default is nobody's and only admins change it");
  }
  assert.deepEqual((await list(bob)).map(r => r.id), defaults.map(d => d.id), "a human with no setups sees just the defaults");
});

test("own setups: save, list, overwrite and remove; another human can neither see nor touch them; read credentials only read", { timeout: 60_000 }, async () => {
  const [ann, bob] = await gods("Owner Ann", "Other Bob");
  const quick = { ...classic(), planningSeconds: 30 };
  const saved: Setup = await ann.c.action(api.setups.save, { name: "  Quick   classic ", settings: quick });
  assert.deepEqual([saved.name, saved.mine, saved.editable, saved.seeded], ["Quick classic", true, true, false], "the name is trimmed");
  assert.match(saved.summary, /Grid 5×5/);
  const annRows = await list(ann);
  assert.deepEqual(annRows.at(-1), { ...saved, updatedAt: (annRows.at(-1) as any).updatedAt }, "own setups come after the defaults");
  assert.deepEqual(annRows.at(-1)!.settings, quick);
  assert.ok(!(await list(bob)).some(r => r.id === saved.id), "Bob never sees Ann's setup");

  // Another human: NOT_FOUND, whether saving over it, deleting it or applying it to a room.
  assert.equal(await errorCode(bob.c.action(api.setups.save, { setupId: saved.id, name: "Mine now", settings: quick })), "NOT_FOUND");
  assert.equal(await errorCode(bob.c.mutation(api.setups.remove, { setupId: saved.id })), "NOT_FOUND");
  const bobRoom = await roomWith([bob]);
  const bobRevision = (await bob.c.query(api.rooms.get, { room: bobRoom.roomId })).revision;
  assert.equal(await errorCode(bob.c.action(api.owner.settings, { roomId: bobRoom.roomId, revision: bobRevision, setupId: saved.id })), "NOT_FOUND");
  assert.equal(await errorCode(bob.c.action(api.owner.settings, { roomId: bobRoom.roomId, revision: bobRevision, setupId: "not-an-id" })), "NOT_FOUND");

  // Names: 1–40 characters, unique among one's own (overwrite by id instead).
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "QUICK CLASSIC", settings: quick })), "CONFLICT");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "   ", settings: quick })), "BAD_REQUEST");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "x".repeat(41), settings: quick })), "BAD_REQUEST");
  // Settings: complete, valid, offered and within the server's limits.
  const { language: _l, ...incomplete } = quick;
  assert.match((await errorOf(ann.c.action(api.setups.save, { name: "Partial", settings: incomplete }))).message ?? "", /missing: language/);
  assert.match((await errorOf(ann.c.action(api.setups.save, { name: "Extra", settings: { ...quick, colour: "red" } }))).message ?? "", /Unknown settings: colour/);
  assert.match((await errorOf(ann.c.action(api.setups.save, { name: "Odd board", settings: { ...quick, typeArgs: { size: 3, symbols: "base10", colours: "rgb" } } }))).message ?? "", /not offered/);
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "Negative", settings: { ...quick, planningSeconds: -1 } })), "BAD_REQUEST");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "Huge", settings: { ...quick, startingObjectCount: 5000 } })), "BAD_REQUEST");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "Mixed", settings: { ...quick, grammarId: "typescript-agent-v1" } })), "BAD_REQUEST");

  // Overwrite (rename too) by id; a default is not hers to change.
  const over: Setup = await ann.c.action(api.setups.save, { setupId: saved.id, name: "Quick classic 2", settings: { ...quick, planningSeconds: 45 } });
  assert.equal(over.id, saved.id);
  assert.deepEqual((await list(ann)).filter(r => r.mine).map(r => [r.name, r.settings.planningSeconds]), [["Quick classic 2", 45]]);
  const classicId = (await list(ann)).find(r => r.seedId === "grid-classic")!.id;
  assert.equal(await errorCode(ann.c.action(api.setups.save, { setupId: classicId, name: "Classic", settings: quick })), "FORBIDDEN");
  assert.equal(await errorCode(ann.c.mutation(api.setups.remove, { setupId: classicId })), "FORBIDDEN");

  // Credentials: read lists only; act may save and remove (setups belong to the human, across rooms).
  const { roomId } = await roomWith([ann]);
  const reader = await playerClient(ann, roomId, "read");
  assert.ok((await reader.query(api.setups.list, {})).some((r: Setup) => r.id === saved.id));
  assert.equal(await errorCode(reader.action(api.setups.save, { name: "From a reader", settings: quick })), "FORBIDDEN");
  assert.equal(await errorCode(reader.mutation(api.setups.remove, { setupId: saved.id })), "FORBIDDEN");
  const actor = await playerClient(ann, roomId, "act");
  const fromApp: Setup = await actor.action(api.setups.save, { name: "From my app", settings: quick });
  assert.equal(fromApp.mine, true);

  await ann.c.mutation(api.setups.remove, { setupId: saved.id });
  await actor.mutation(api.setups.remove, { setupId: fromApp.id });
  assert.deepEqual((await list(ann)).filter(r => r.mine), []);
  assert.equal(await errorCode(ann.c.mutation(api.setups.remove, { setupId: saved.id })), "NOT_FOUND", "gone");
});

test("an admin edits a default and the edit survives re-seeding; a removed default is never recreated", { timeout: 60_000 }, async () => {
  const root = await adminGod("Setup Admin");
  const [ann] = await gods("Seeing Ann");
  const big = (await list(root)).find(r => r.seedId === "grid-big")!;
  assert.equal(big.editable, true, "admins may change defaults");
  const edited = { ...seedSetupSettings("grid-big"), planningSeconds: 120 };
  await root.c.action(api.setups.save, { setupId: big.id, name: "Big board", settings: edited, summary: "6×6 with a longer planning phase" });
  await admin.mutation(internal.setups.ensureSeeded, {});
  const after = (await list(ann)).find(r => r.seedId === "grid-big")!;
  assert.deepEqual([after.id, after.settings.planningSeconds, after.summary], [big.id, 120, "6×6 with a longer planning phase"], "kept, not re-seeded");

  await root.c.mutation(api.setups.remove, { setupId: big.id });
  await admin.mutation(internal.setups.ensureSeeded, {});
  assert.ok(!(await list(ann)).some(r => r.seedId === "grid-big"), "a removed default stays removed");
  // A credential never carries admin rights.
  const { roomId } = await roomWith([root]);
  const app = await playerClient(root, roomId, "owner");
  const master = (await list(root)).find(r => r.seedId === "grid-master")!;
  assert.equal(await errorCode(app.action(api.setups.save, { setupId: master.id, name: "Master", settings: seedSetupSettings("grid-master") })), "FORBIDDEN");
});

test("a new room starts on the seeded First steps setup; owner.settings applies a whole setup and records it", { timeout: 60_000 }, async () => {
  const [host, ada] = await gods("Setup Host", "Setup Ada");
  await touch(host);
  const { roomId, shortCode } = await roomWith([host]);
  await ada.c.mutation(api.rooms.join, { room: shortCode });
  const setups = await list(host);
  const first = setups.find(r => r.seedId === "grid-first-steps")!, master = setups.find(r => r.seedId === "grid-master")!;
  let room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settings, first.settings);
  assert.deepEqual(room.settingsOrigin, { kind: "setup", id: first.id, modified: false });

  // A setup in another language replaces the language too: its settings are applied whole.
  const mine: Setup = await host.c.action(api.setups.save, { name: "TypeScript Master", settings: {
    ...seedSetupSettings("grid-master"), language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", planningSeconds: 300 } });
  await host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: mine.id });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settings, mine.settings);
  assert.deepEqual(room.settingsOrigin, { kind: "setup", id: mine.id, modified: false });
  await host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: master.id });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([room.settings, room.settingsOrigin], [master.settings, { kind: "setup", id: master.id, modified: false }]);
  assert.equal(await errorCode(host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: master.id, settings: { planningSeconds: 5 } })), "BAD_REQUEST",
    "a setup or settings, not both");
  // A member reads the origin's id, never another human's setup through it.
  const seen = await ada.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(seen.settingsOrigin, { kind: "setup", id: master.id, modified: false });
  assert.ok(!(await list(ada)).some(r => r.id === mine.id));
  await host.c.mutation(api.setups.remove, { setupId: mine.id });
});
