/** The palette is generated from the affordance directory: every offered affordance is a row, run the same way. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { paletteFor } from "@workspace/v2-affordances";
import { affordanceContext } from "../src/core/affordance-context.ts";
import { paletteCommands } from "../src/core/palette-commands.ts";

const ctx = affordanceContext({ signedIn: true, admin: false, room: { preset: "lines-beginner", bidding: null, members: [{ memberId: "m", name: "A", kind: "human", spectator: false, owner: true, me: true }] } as never,
  header: { phase: "live", me: "m" } as never, me: { energy: 50, pauseUsed: false, agents: 1 } as never });

test("one row per offered affordance, with the directory's availability", () => {
  const calls: [string, unknown][] = [];
  const host = { perform: async (id: string, args: unknown) => { calls.push([id, args]); return { ok: true as const, result: {} }; }, navigate() {}, dock: true };
  const rows = paletteCommands(ctx, host as never);
  assert.deepEqual(rows.map(r => r.id).sort(), paletteFor(ctx).map(e => e.id).sort());
  for (const r of rows) assert.deepEqual(r.available({} as never), paletteFor(ctx).find(e => e.id === r.id)!.availability);
});

test("a read opens the pane that shows it live, through the dock's pane plan; a message asks for its text", async () => {
  const opened: string[] = [];
  const host = { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, panes: { open: async (p: string) => { opened.push(p); }, close: async () => {} } };
  const rows = paletteCommands(ctx, host as never);
  const standings = rows.find(r => r.id === "game.standings")!;
  assert.equal(standings.performer.kind, "submit");
  if (standings.performer.kind === "submit") await standings.performer.run();
  assert.deepEqual(opened, ["race"]);
  const chat = rows.find(r => r.id === "chat.send")!.performer;
  assert.ok(chat.kind === "form" && chat.page.kind === "field", "a message needs its text");
});

test("joining by code asks for the code (a minimum length is not mistaken for no field)", () => {
  const home = affordanceContext({ signedIn: true, admin: false });
  const join = paletteCommands(home, { perform: async () => ({ ok: true as const, result: {} }), navigate() {} } as never).find(r => r.id === "room.join")!.performer;
  assert.ok(join.kind === "form" && join.page.kind === "field" && join.page.label === "code");
});
