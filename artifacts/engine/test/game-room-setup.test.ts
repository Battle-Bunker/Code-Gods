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
import { api, gods, roomWith, touch } from "./game-helpers.ts";

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string } }).data?.code ?? `untyped: ${(error as Error).message}`; }
  return "no error";
}
const setupId = async (c: any, seedId: string): Promise<string> => (await c.query(api.setups.list, {})).find((s: any) => s.seedId === seedId).id;

test("a new room runs First steps and can turn the assistant on in the same call", async () => {
  const [host] = await gods("Origin Host");
  await touch(host);
  const { roomId } = await host.c.mutation(api.rooms.create, { assistantBudget: 150_000, assistantModel: "claude-sonnet-5-5" });
  const room = await host.c.query(api.rooms.get, { room: roomId });
  const first = await setupId(host.c, "grid-first-steps");
  assert.deepEqual(room.settings, seedSetupSettings("grid-first-steps"));
  assert.deepEqual(room.setup, { id: first, name: "First steps", deleted: false });
  assert.equal(room.assistantBudget, 150_000);
  assert.equal(room.assistantModel, "claude-sonnet-5-5");
  assert.equal((await host.c.query(api.assistant.status, { roomId })).enabled, true, "the assistant is on from the start");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { assistantBudget: -1 })), "BAD_REQUEST");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { assistantBudget: 1.5 })), "BAD_REQUEST");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { assistantModel: "gpt-nope" })), "BAD_REQUEST");
  const plain = await host.c.mutation(api.rooms.create, {});
  assert.equal((await host.c.query(api.rooms.get, { room: plain.roomId })).assistantBudget, 0, "off unless asked");
  const rows = await host.c.query(api.rooms.list, {});
  assert.equal(rows.find((r: any) => r.id === roomId)?.setupName, "First steps");
});

test("a settings change moves only what the game ties to it: no retuning on a new world, the language's grammar, nothing else", { timeout: 60_000 }, async () => {
  const [host] = await gods("Model Host");
  await touch(host);
  const { roomId } = await roomWith([host]);
  const revision = async () => (await host.c.query(api.rooms.get, { room: roomId })).revision;
  const before = seedSetupSettings("grid-first-steps");
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { objectType: "Int" } });
  let room = await host.c.query(api.rooms.get, { room: roomId });
  // Hand-derived: Int's default instantiation, the Grid families no longer exist, every tuned Grid value stays the owner's.
  assert.deepEqual(room.settings, { ...before, objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, excludedFamilies: [] });
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { language: "typescript" } });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settings, { ...before, objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, excludedFamilies: [],
    language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform" });
  // Refused: an instantiation not offered, an option the language lacks, an unknown field, a family the world lacks,
  // and defence goals in a world with no defence families (Int has none).
  for (const settings of [{ typeArgs: { min: 0, max: 5 } }, { grammarId: "python-agent-v1" }, { colour: "red" }, { excludedFamilies: ["sudoku_scholar"] },
    { defenceGoals: true }, { defenceRate: 0.5 }]) {
    assert.equal(await errorCode(host.c.action(api.owner.settings, { roomId, revision: await revision(), settings })), "BAD_REQUEST", JSON.stringify(settings));
  }
  // Out-of-bounds numbers are the validator's refusal.
  assert.equal(await errorCode(host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { halfLifeSeconds: 0 } })), "BAD_REQUEST");
  // The room's settings sent back whole with one field edited: the stale arguments follow the new world.
  const whole = (await host.c.query(api.rooms.get, { room: roomId })).settings;
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { ...whole, objectType: "Grid" } });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([room.settings.typeArgs, room.settings.startingObjectCount], [{ size: 4, symbols: "base10", colours: "rgb" }, before.startingObjectCount]);
});

test("a change edits the room's setup when the owner owns it, else their copy, which the room then runs; the game keeps its setup", { timeout: 120_000 }, async () => {
  const [host, ada, bo] = await gods("Change Owner", "Change Ada", "Change Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo]);
  const first = await setupId(host.c, "grid-first-steps");
  const revision = async () => (await host.c.query(api.rooms.get, { room: roomId })).revision;
  const mine = async () => Promise.all((await host.c.query(api.setups.list, {})).filter((s: any) => s.mine).map((s: any) => host.c.query(api.setups.get, { setupId: s.id })));

  // On the system's First steps: the change goes to a new setup of the owner's, and the room runs it.
  const copied = await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { interactionRateHz: 10 } });
  assert.deepEqual([copied.setup.name, copied.setup.created], ["First steps's copy", true]);
  assert.match(copied.setup.note, /"First steps" is a system setup/);
  let room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.setup, { id: copied.setup.id, name: "First steps's copy", deleted: false });
  assert.deepEqual(room.settings, { ...seedSetupSettings("grid-first-steps"), interactionRateHz: 10 });
  assert.deepEqual((await host.c.query(api.setups.get, { setupId: first })).settings, seedSetupSettings("grid-first-steps"), "the system's is untouched");
  // Now the owner's own: the next change edits it in place, no new copy.
  const edited = await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { planningSeconds: 120 } });
  assert.deepEqual([edited.setup.id, edited.setup.created], [copied.setup.id, false]);
  assert.deepEqual((await mine()).map((s: any) => [s.name, s.settings.interactionRateHz, s.settings.planningSeconds]), [["First steps's copy", 10, 120]]);
  // The same settings again change nothing (no copy, no edit); only the AI budget leaves the setup alone.
  const same = await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { planningSeconds: 120 } });
  assert.equal(same.setup, undefined);
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), aiBudget: 1000 });
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
  const game = await host.c.action(api.owner.start, { roomId });
  const view = await ada.c.query(api.games.view, { code: game.shortCode });
  assert.deepEqual(view.setup, { id: fromDeleted.setup.id, name: "Ada's board's copy 2" });
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const [record] = await ada.c.query(api.rooms.history, { room: roomId });
  assert.equal(record.shortCode, game.shortCode);
  assert.deepEqual(record.setup, { id: fromDeleted.setup.id, name: "Ada's board's copy 2" });
});
