/**
 * AI seat names (convex/lib/aiNames.ts) through the engine: each seat gets its own name, fixed for its life and
 * shown wherever the seat appears; the ai-seat-names migration renames seats added before names existed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, gods, internal, roomWith, touch } from "./game-helpers.ts";

async function roomWithTwoAis() {
  const [host] = await gods("Names Host");
  await touch(host);
  const { roomId } = await roomWith([host]);
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  const a = await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  const b = await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  return { host, roomId, a, b };
}

test("two seats from one template get distinct names, not the template's, shown in the room", async () => {
  // Catches: seats copying template.name (the two "Sonnet Strategist" rows).
  const { host, roomId, a, b } = await roomWithTwoAis();
  assert.ok(a.name && b.name, "addAi returns the seat's name (the add_ai tool shows it)");
  assert.notEqual(a.name, b.name);
  const room = await host.c.query(api.rooms.get, { room: roomId });
  const seats = room.members.filter((m: any) => m.kind === "ai");
  assert.deepEqual(seats.map((m: any) => m.name).sort(), [a.name, b.name].sort());
  for (const seat of seats) {
    assert.notEqual(seat.name, "Sonnet Strategist");
    assert.equal(seat.aiAgentId, "sonnet-strategist", "the template stays visible separately");
    assert.ok(seat.model, "and so does the model");
  }
  // Fixed for the seat's life: removing one seat leaves the other's name as it was.
  await host.c.mutation(api.rooms.removeAi, { roomId, godId: a.godId });
  const after = await host.c.query(api.rooms.get, { room: roomId });
  assert.equal(after.members.find((m: any) => m.id === b.godId).name, b.name);
});

test("the migration renames legacy same-named seats and their chat, once", async () => {
  // Catches: rooms created before seat names keeping two indistinguishable "Sonnet Strategist" seats.
  const { host, roomId, a, b } = await roomWithTwoAis();
  await admin.mutation(internal.testing.legacyAiSeat, { roomId, godId: a.godId, chat: "hello from a" });
  await admin.mutation(internal.testing.legacyAiSeat, { roomId, godId: b.godId });
  const before = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(before.members.filter((m: any) => m.kind === "ai").map((m: any) => m.name), ["Sonnet Strategist", "Sonnet Strategist"]);
  await admin.action(internal.migrations.aiSeatNames, {});
  const room = await host.c.query(api.rooms.get, { room: roomId });
  const names = room.members.filter((m: any) => m.kind === "ai").map((m: any) => m.name);
  assert.equal(new Set(names).size, 2, `distinct: ${names.join(", ")}`);
  assert.ok(!names.includes("Sonnet Strategist"));
  const line = room.chat.find((m: any) => m.text === "hello from a");
  assert.equal(line.authorName, room.members.find((m: any) => m.id === a.godId).name, "chat follows the new name");
  await admin.action(internal.migrations.aiSeatNames, {});
  const again = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(again.members.map((m: any) => m.name), room.members.map((m: any) => m.name), "idempotent");
});
