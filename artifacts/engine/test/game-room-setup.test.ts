/**
 * New rooms, settings changes through the settings model, and the setup a room runs (docs/ui-redesign.md §2.4) against
 * the live local backend. What would break: a new room not running First steps, the assistant staying off after a
 * creation that asked for it, an invalid allowance accepted, a change moving fields the game does not tie to it (the
 * old retuning), a change editing a setup the owner does not own (the system's or another human's) instead of their
 * copy, a change creating copies when it should edit the owner's own setup, or a game that forgot its setup.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { seedSetupSettings } from "@workspace/game-core";
import { admin, api, gods, internal, roomWith, setupEntries, startGame, touch, adminGods } from "./game-helpers.ts";

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string } }).data?.code ?? `untyped: ${(error as Error).message}`; }
  return "no error";
}
const setupId = async (c: any, seedId: string): Promise<string> => (await setupEntries(c)).find((s: any) => s.seedId === seedId).id;

test("a new room runs Annotated basics and can set its AI quotas in the same call", async () => {
  const [host] = await adminGods("Origin Host");
  await touch(host);
  const { roomId } = await host.c.mutation(api.rooms.create, { assistantQuota: 150_000, aiQuota: 40_000, assistantModel: "claude-sonnet-5-5" });
  const room = await host.c.query(api.rooms.get, { room: roomId });
  const first = await setupId(host.c, "grid-annotated-basics");
  assert.deepEqual(room.settings, seedSetupSettings("grid-annotated-basics"));
  assert.deepEqual(room.setup, { id: first, name: "Annotated basics", deleted: false });
  assert.deepEqual([room.assistantQuota, room.aiQuota], [150_000, 40_000]);
  assert.equal(room.assistantModel, "claude-sonnet-5-5");
  assert.equal((await host.c.query(api.assistant.status, { roomId })).enabled, true, "the assistant is on from the start");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { assistantQuota: -1 })), "BAD_REQUEST");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { aiQuota: 1.5 })), "BAD_REQUEST");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { assistantModel: "gpt-nope" })), "BAD_REQUEST");
  const plain = await host.c.mutation(api.rooms.create, {});
  assert.equal((await host.c.query(api.rooms.get, { room: plain.roomId })).assistantQuota, 300_000, "the default quota");
  const rows = await host.c.query(api.rooms.list, {});
  assert.equal(rows.find((r: any) => r.id === roomId)?.setupName, "Annotated basics");
});

test("a setup saved on a stale view of the room is refused with CONFLICT and leaves the newer change", { timeout: 60_000 }, async () => {
  // Catches: owner.settings dropping its revision guard, so the owner's second tab silently overwrites the first.
  const [host] = await gods("Stale Host");
  await touch(host);
  const { roomId } = await roomWith([host]);
  const seen = (await host.c.query(api.rooms.get, { room: roomId })).revision;
  const classic = await setupId(host.c, "grid-classic");
  const first = await setupId(host.c, "grid-first-steps");
  await host.c.action(api.owner.settings, { roomId, revision: seen, setupId: classic });
  assert.equal(await errorCode(host.c.action(api.owner.settings, { roomId, revision: seen, setupId: first })), "CONFLICT");
  const room = await host.c.query(api.rooms.get, { room: roomId });
  assert.equal(room.setup?.id, classic, "the newer change stands");
  assert.equal(room.revision, seen + 1);
});

test("a settings change moves only what the game ties to it: no retuning on a new board, nothing else; a single language still works", { timeout: 60_000 }, async () => {
  const [host] = await gods("Model Host");
  await touch(host);
  const { roomId } = await roomWith([host]);
  const revision = async () => (await host.c.query(api.rooms.get, { room: roomId })).revision;
  // The room starts on Annotated basics; each change below moves only its own field.
  const before = seedSetupSettings("grid-annotated-basics");
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { languages: ["typescript", "python"] } });
  let room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settings, { ...before, languages: ["typescript", "python"] });
  // The old single-language change (an older client) allows exactly that language.
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { language: "typescript" } });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settings, { ...before, languages: ["typescript"] });
  // Refused: an invalid instantiation, a removed object type, an option the language lacks, an unknown field, a family
  // the world lacks.
  for (const settings of [{ typeArgs: { size: 4, symbols: "base10", colours: "plaid" } }, { objectType: "Int" }, { grammarId: "python-agent-v1" }, { languages: [] },
    { languages: ["cobol"] }, { colour: "red" }, { excludedFamilies: ["no_such_rule"] }, { defenceRate: 0.5 }]) {
    assert.equal(await errorCode(host.c.action(api.owner.settings, { roomId, revision: await revision(), settings })), "BAD_REQUEST", JSON.stringify(settings));
  }
  // Out-of-bounds numbers are the validator's refusal.
  assert.equal(await errorCode(host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { halfLifeSeconds: 0 } })), "BAD_REQUEST");
  // The room's settings sent back whole with one field edited: only the board moves (no retuning on a new board).
  const whole = (await host.c.query(api.rooms.get, { room: roomId })).settings;
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { ...whole, typeArgs: { size: 5, symbols: "base10", colours: "mono" } } });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([room.settings.typeArgs, room.settings.startingObjectCount], [{ size: 5, symbols: "base10", colours: "mono" }, before.startingObjectCount]);
});

test("a change edits the room's setup when the owner owns it, else their copy, which the room then runs; the game keeps its setup", { timeout: 120_000 }, async () => {
  const [host, ada, bo] = await gods("Change Owner", "Change Ada", "Change Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo]);
  const first = await setupId(host.c, "grid-annotated-basics");
  const revision = async () => (await host.c.query(api.rooms.get, { room: roomId })).revision;
  const mine = async () => Promise.all((await setupEntries(host.c)).filter((s: any) => s.mine).map((s: any) => host.c.query(api.setups.get, { setupId: s.id })));

  // On the system's Annotated basics: the change goes to a new setup of the owner's, and the room runs it.
  const copied = await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { interactionRateHz: 10 } });
  assert.deepEqual([copied.setup.name, copied.setup.created], ["Annotated basics's copy", true]);
  assert.match(copied.setup.note, /"Annotated basics" is a system setup/);
  let room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.setup, { id: copied.setup.id, name: "Annotated basics's copy", deleted: false });
  assert.deepEqual(room.settings, { ...seedSetupSettings("grid-annotated-basics"), interactionRateHz: 10 });
  assert.deepEqual((await host.c.query(api.setups.get, { setupId: first })).settings, seedSetupSettings("grid-annotated-basics"), "the system's is untouched");
  // Now the owner's own: the next change edits it in place, no new copy.
  const edited = await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { planningSeconds: 120 } });
  assert.deepEqual([edited.setup.id, edited.setup.created], [copied.setup.id, false]);
  assert.deepEqual((await mine()).map((s: any) => [s.name, s.settings.interactionRateHz, s.settings.planningSeconds]), [["Annotated basics's copy", 10, 120]]);
  // The same settings again change nothing (no copy, no edit); nor does a commit with no settings at all.
  const same = await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { planningSeconds: 120 } });
  assert.equal(same.setup, undefined);
  await host.c.action(api.owner.settings, { roomId, revision: await revision() });
  assert.deepEqual((await host.c.query(api.rooms.get, { room: roomId })).setup.id, copied.setup.id);
  assert.equal((await mine()).length, 1);

  // Another human's setup: applied as is; a change makes the owner's copy, Ada's stays hers.
  const adas = await ada.c.action(api.setups.save, { name: "Ada's board", settings: seedSetupSettings("grid-classic") });
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), setupId: adas.id });
  const fromAda = await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { startingObjectCount: 40 } });
  assert.deepEqual([fromAda.setup.name, fromAda.setup.created], ["Ada's board's copy", true]);
  assert.match(fromAda.setup.note, /belongs to Change Ada/);
  assert.equal((await ada.c.query(api.setups.get, { setupId: adas.id })).settings.startingObjectCount, 80);
  // A deleted setup: the room keeps its snapshot; a change makes a copy named after it.
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), setupId: adas.id });
  await ada.c.mutation(api.setups.remove, { setupId: adas.id });
  const fromDeleted = await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { startingObjectCount: 20 } });
  assert.deepEqual([fromDeleted.setup.name, fromDeleted.setup.created], ["Ada's board's copy 2", true]);
  assert.match(fromDeleted.setup.note, /was deleted/);

  // A started game snapshots the setup; the ended game's record and the public view name it.
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { planningSeconds: 3600, halfLifeSeconds: 1e9, startingObjectCount: 3, spawnRateHz: 0 } });
  const game = await startGame(host, roomId);
  const view = await ada.c.query(api.games.header, { code: game.shortCode });
  assert.deepEqual(view.setup, { id: fromDeleted.setup.id, name: "Ada's board's copy 2" });
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const [record] = await ada.c.query(api.rooms.history, { room: roomId });
  assert.equal(record.shortCode, game.shortCode);
  assert.deepEqual(record.setup, { id: fromDeleted.setup.id, name: "Ada's board's copy 2" });
});

test("a change edits the owner's setup as it is now, not the room's older snapshot of it; a room edit is never blocked by the setup cap", { timeout: 120_000 }, async () => {
  const [host] = await gods("Snapshot Owner");
  await touch(host);
  const a = await roomWith([host]), b = await roomWith([host]);
  const revision = async (roomId: string) => (await host.c.query(api.rooms.get, { room: roomId })).revision;
  const mine = await host.c.action(api.setups.save, { name: "Shared board", settings: seedSetupSettings("grid-classic") });
  for (const roomId of [a.roomId, b.roomId]) await host.c.action(api.owner.settings, { roomId, revision: await revision(roomId), setupId: mine.id });
  // Edited elsewhere (here: saved directly); room A's snapshot still has the old energy.
  await host.c.action(api.setups.save, { setupId: mine.id, name: "Shared board", settings: { ...seedSetupSettings("grid-classic"), startingEnergy: 400 } });
  assert.equal((await host.c.query(api.rooms.get, { room: a.roomId })).settings.startingEnergy, 600);
  const changed = await host.c.action(api.owner.settings, { roomId: a.roomId, revision: await revision(a.roomId), settings: { planningSeconds: 120 } });
  assert.deepEqual([changed.setup.id, changed.setup.created], [mine.id, false]);
  const stored = (await host.c.query(api.setups.get, { setupId: mine.id })).settings;
  assert.deepEqual([stored.startingEnergy, stored.planningSeconds], [400, 120], "the other edit survives");
  assert.deepEqual((await host.c.query(api.rooms.get, { room: a.roomId })).settings, stored);

  // At the cap of own setups, explicit saves and copies are refused, but changing a room on a system setup still works.
  const own = (await setupEntries(host.c)).filter((s: any) => s.mine).length;
  const classic = await setupId(host.c, "grid-classic");
  for (let i = own; i < 50; i++) await host.c.mutation(api.setups.duplicate, { setupId: classic });
  assert.equal(await errorCode(host.c.mutation(api.setups.duplicate, { setupId: classic })), "BAD_REQUEST", "the cap");
  await host.c.action(api.owner.settings, { roomId: b.roomId, revision: await revision(b.roomId), setupId: classic });
  const copied = await host.c.action(api.owner.settings, { roomId: b.roomId, revision: await revision(b.roomId), settings: { planningSeconds: 30 } });
  assert.equal(copied.setup.created, true, "the room's change is kept as the owner's copy even past the cap");
});

test("a room stored on the removed Int type still opens, and starting it says the type is gone", { timeout: 60_000 }, async () => {
  // Catches: the observation, the rules text or the start crashing on a room created before D1 removed Int and string.
  const [host, ada, bo] = await gods("Int Room Host", "Int Room Ada", "Int Room Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo]);
  const legacy = { ...seedSetupSettings("grid-annotated-basics"), objectType: "Int", typeArgs: { min: 0, max: 1000 } };
  await admin.mutation(internal.testing.makeLegacy, { roomId, settings: legacy });
  const observation = await host.c.query(api.player.observation, { roomId });
  assert.equal(observation.instance, undefined, "no instance for a removed type");
  assert.equal((await host.c.query(api.rooms.get, { room: roomId })).settings.objectType, "Int");
  const error = await host.c.action(api.owner.start, { roomId }).then(() => null, (e: any) => e); // start-result-ok: the start is refused, no game
  assert.ok(error && /Int object type was removed/.test(error.data?.message ?? error.message), String(error?.data?.message ?? error));
});
