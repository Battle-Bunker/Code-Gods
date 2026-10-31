/**
 * New rooms and the settings origin (docs/ui-redesign.md §2.4) against the live local backend. What would break: a
 * new room starting on an unpresented Int world, the assistant staying off after a creation that asked for it, an
 * invalid allowance accepted, a room that cannot say which preset it is on, or a history row that forgot it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { presetSettings } from "@workspace/game-core";
import { api, gods, roomWith, touch } from "./game-helpers.ts";

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string } }).data?.code ?? `untyped: ${(error as Error).message}`; }
  return "no error";
}

test("a new room starts on First steps and can turn the assistant on in the same call", async () => {
  const [host] = await gods("Origin Host");
  await touch(host);
  const { roomId } = await host.c.mutation(api.rooms.create, { assistantBudget: 150_000, assistantModel: "claude-sonnet-5-5" });
  const room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settings, presetSettings("grid-first-steps", "python"));
  assert.deepEqual(room.settingsOrigin, { kind: "preset", id: "grid-first-steps", modified: false });
  assert.equal(room.assistantBudget, 150_000);
  assert.equal(room.assistantModel, "claude-sonnet-5-5");
  assert.equal((await host.c.query(api.assistant.status, { roomId })).enabled, true, "the assistant is on from the start");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { assistantBudget: -1 })), "BAD_REQUEST");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { assistantBudget: 1.5 })), "BAD_REQUEST");
  assert.equal(await errorCode(host.c.mutation(api.rooms.create, { assistantModel: "gpt-nope" })), "BAD_REQUEST");
  const plain = await host.c.mutation(api.rooms.create, {});
  assert.equal((await host.c.query(api.rooms.get, { room: plain.roomId })).assistantBudget, 0, "off unless asked");
  const rows = await host.c.query(api.rooms.list, {});
  assert.deepEqual(rows.find((r: any) => r.id === roomId)?.settingsOrigin, { kind: "preset", id: "grid-first-steps", modified: false });
});

test("owner.settings records the origin: a preset is unmodified, edits mark it modified, and the game snapshot keeps it", { timeout: 120_000 }, async () => {
  const [host, ada, bo] = await gods("Origin Owner", "Origin Ada", "Origin Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo]);
  const revision = async () => (await host.c.query(api.rooms.get, { room: roomId })).revision;
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { interactionRateHz: 10 } });
  let room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settingsOrigin, { kind: "preset", id: "grid-first-steps", modified: true });
  assert.equal(room.settings.interactionRateHz, 10);
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), preset: "grid-classic" });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settingsOrigin, { kind: "preset", id: "grid-classic", modified: false });
  assert.deepEqual(room.settings, presetSettings("grid-classic", "python"));
  // The same settings sent explicitly keep the preset unmodified; a language change keeps the preset too.
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { language: "typescript" } });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settingsOrigin, { kind: "preset", id: "grid-classic", modified: false });
  assert.deepEqual(room.settings, presetSettings("grid-classic", "typescript"));
  // Only the AI budget: the origin is untouched.
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), aiBudget: 1000 });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settingsOrigin, { kind: "preset", id: "grid-classic", modified: false });
  // A started game snapshots the origin; the ended game's record and the public view carry it.
  await host.c.action(api.owner.settings, { roomId, revision: await revision(), settings: { planningSeconds: 3600, halfLifeSeconds: 1e9, startingObjectCount: 3, spawnRateHz: 0 } });
  assert.equal((await host.c.query(api.rooms.get, { room: roomId })).settingsOrigin.modified, true);
  const game = await host.c.action(api.owner.start, { roomId });
  const view = await ada.c.query(api.games.view, { code: game.shortCode });
  assert.deepEqual(view.settingsOrigin, { kind: "preset", id: "grid-classic", modified: true });
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const [record] = await ada.c.query(api.rooms.history, { room: roomId });
  assert.equal(record.shortCode, game.shortCode);
  assert.deepEqual(record.settingsOrigin, { kind: "preset", id: "grid-classic", modified: true });
});
