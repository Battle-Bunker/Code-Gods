/**
 * New rooms, settings changes through the settings model, and the settings origin (docs/ui-redesign.md §2.4) against
 * the live local backend. What would break: a new room not starting on First steps, the assistant staying off after a
 * creation that asked for it, an invalid allowance accepted, a change moving fields the game does not tie to it (the
 * old retuning), a room that cannot say which setup it is on, or a history row that forgot it.
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

test("a new room starts on First steps and can turn the assistant on in the same call", async () => {
  const [host] = await gods("Origin Host");
  await touch(host);
  const { roomId } = await host.c.mutation(api.rooms.create, { assistantBudget: 150_000, assistantModel: "claude-sonnet-5-5" });
  const room = await host.c.query(api.rooms.get, { room: roomId });
  const first = await setupId(host.c, "grid-first-steps");
  assert.deepEqual(room.settings, seedSetupSettings("grid-first-steps"));
  assert.deepEqual(room.settingsOrigin, { kind: "setup", id: first, modified: false });
  assert.equal(room.assistantBudget, 150_000);
  assert.equal(room.assistantModel, "claude-sonnet-5-5");
  assert.equal((await host.c.query(api.assistant.status, { roomId })).enabled, true, "the assistant is on from the start");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { assistantBudget: -1 })), "BAD_REQUEST");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { assistantBudget: 1.5 })), "BAD_REQUEST");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { assistantModel: "gpt-nope" })), "BAD_REQUEST");
  const plain = await host.c.mutation(api.rooms.create, {});
  assert.equal((await host.c.query(api.rooms.get, { room: plain.roomId })).assistantBudget, 0, "off unless asked");
  const rows = await host.c.query(api.rooms.list, {});
  assert.deepEqual(rows.find((r: any) => r.id === roomId)?.settingsOrigin, { kind: "setup", id: first, modified: false });
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
  // Refused: an instantiation not offered, an option the language lacks, an unknown field, a family the world lacks.
  for (const settings of [{ typeArgs: { min: 0, max: 5 } }, { grammarId: "python-agent-v1" }, { colour: "red" }, { excludedFamilies: ["sudoku_scholar"] }]) {
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

test("owner.settings records the origin: a setup is unmodified, edits mark it modified, and the game snapshot keeps it", { timeout: 120_000 }, async () => {
  const [host, ada, bo] = await gods("Origin Owner", "Origin Ada", "Origin Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo]);
  const first = await setupId(host.c, "grid-first-steps"), classic = await setupId(host.c, "grid-classic");
  const revision = async () => (await host.c.query(api.rooms.get, { room: roomId })).revision;
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { interactionRateHz: 10 } });
  let room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settingsOrigin, { kind: "setup", id: first, modified: true });
  assert.equal(room.settings.interactionRateHz, 10);
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), setupId: classic });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settingsOrigin, { kind: "setup", id: classic, modified: false });
  assert.deepEqual(room.settings, seedSetupSettings("grid-classic"));
  // The setup's own settings sent whole keep it unmodified; a language change is a modification like any other.
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: seedSetupSettings("grid-classic") });
  assert.deepEqual((await host.c.query(api.rooms.get, { room: roomId })).settingsOrigin, { kind: "setup", id: classic, modified: false });
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { language: "typescript" } });
  assert.deepEqual((await host.c.query(api.rooms.get, { room: roomId })).settingsOrigin, { kind: "setup", id: classic, modified: true });
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { language: "python" } });
  assert.deepEqual((await host.c.query(api.rooms.get, { room: roomId })).settingsOrigin, { kind: "setup", id: classic, modified: false }, "back to the setup");
  // Only the AI budget: the origin is untouched.
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), aiBudget: 1000 });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settingsOrigin, { kind: "setup", id: classic, modified: false });
  // A started game snapshots the origin; the ended game's record and the public view carry it.
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { planningSeconds: 3600, halfLifeSeconds: 1e9, startingObjectCount: 3, spawnRateHz: 0 } });
  assert.equal((await host.c.query(api.rooms.get, { room: roomId })).settingsOrigin.modified, true);
  const game = await host.c.action(api.owner.start, { roomId });
  const view = await ada.c.query(api.games.view, { code: game.shortCode });
  assert.deepEqual(view.settingsOrigin, { kind: "setup", id: classic, modified: true });
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const [record] = await ada.c.query(api.rooms.history, { room: roomId });
  assert.equal(record.shortCode, game.shortCode);
  assert.deepEqual(record.settingsOrigin, { kind: "setup", id: classic, modified: true });
});
