/** The palette is generated from the affordance directory: every offered affordance is a row, run the same way. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { paletteFor } from "@workspace/v2-affordances";
import { affordanceContext } from "../src/core/affordance-context.ts";
import { nouned, paletteCommands } from "../src/core/palette-commands.ts";

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
  assert.ok(join.kind === "form" && join.page.kind === "field" && join.page.label === "Room code");
});

test("every read the palette offers in a game opens where the app shows it live (playtest: 'Show the auction's result' failed)", async () => {
  const { AFFORDANCES } = await import("@workspace/v2-affordances");
  const { READ_PANES, ROOM_READS, ACCOUNT_READS } = await import("../src/core/palette-commands.ts");
  for (const a of Object.values(AFFORDANCES) as { id: string; effect: string; runs: string; kind?: string; contexts: readonly string[] }[]) {
    if (a.effect !== "read" || a.runs === "client" || a.id === "agent.check" || a.id === "room.list") continue;
    const shown = a.id in READ_PANES || ROOM_READS.has(a.id) || ACCOUNT_READS.has(a.id);
    assert.ok(shown, `${a.id}: the palette has nowhere to show it`);
  }
});

test("each pane is a typed-only row by its own title, which opens it (playtest round 2: search found no pane)", () => {
  const ctx = affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: true, spectator: false }], preset: "lines-beginner" } as never, header: { phase: "live", me: "m1" } as never });
  const opened: string[] = [];
  const host = { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, panes: { open: async (p: string) => { opened.push(p); }, close: async () => {} } };
  const rows = paletteCommands(ctx, host as never);
  const lines = rows.find(r => r.human.title === "Open Lines");
  assert.ok(lines && lines.typedOnly, "Open Lines is a typed-only row");
  assert.ok(lines.performer.kind === "submit");
  void lines.performer.run();
  assert.deepEqual(opened, ["objects"]);
});

test("in a room without AI, none of the assistant's operations is listed", () => {
  const ctx = affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: false, spectator: false }], preset: "lines-beginner" } as never, header: { phase: "live", me: "m1" } as never, aiOff: "AI is only available in rooms run by an administrator." });
  const ids = paletteCommands(ctx, { perform: async () => ({ ok: true as const, result: {} }), navigate() {} } as never).map(r => r.id);
  assert.deepEqual(ids.filter(id => id.startsWith("assistant.") || id === "pitch.draft"), []);
});

test("leave alone opens Agent code at its control, not a page that says to find it (playtest round 7)", async () => {
  const opened: string[] = [];
  const host = { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, panes: { open: async (p: string) => { opened.push(p); }, close: async () => {} } };
  const rows = paletteCommands(ctx, host as never);
  for (const id of ["agent.leaveAlone"]) {
    // It only opens the control (its Save prices and confirms the edit): no confirmation page first (round 10).
    assert.equal(rows.find(r => r.id === id)?.confirm, "none", `${id}: no confirmation to open a control`);
    const p = rows.find(r => r.id === id)?.performer;
    assert.equal(p?.kind, "submit", id);
    if (p?.kind === "submit") await p.run();
  }
  assert.deepEqual(opened, ["forge"]);
  assert.equal(rows.find(r => r.id === "agent.hold"), undefined, "no hold operation");
});

test("a grid game's palette says grids, not objects (round 8b)", () => {
  const host = { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, noun: { one: "grid", many: "grids" } };
  const rows = paletteCommands(ctx, host as never);
  assert.equal(rows.find(r => r.id === "agent.leaveAlone")!.human.title, "Leave grids alone");
  for (const r of rows) assert.doesNotMatch(`${r.human.title} ${r.human.tooltip}`, /\bobjects?\b/i, r.id);
  assert.equal(nouned("Objects and an object", { one: "line", many: "lines" }), "Lines and a line");
});
