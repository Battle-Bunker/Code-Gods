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
  const { READ_PANES, ROOM_READS, ACCOUNT_READS, NOTICE_READS, SETUP_READS } = await import("../src/core/palette-commands.ts");
  for (const a of Object.values(AFFORDANCES) as { id: string; effect: string; runs: string; kind?: string; contexts: readonly string[] }[]) {
    if (a.effect !== "read" || a.runs === "client" || a.id === "agent.check" || a.id === "room.list") continue;
    const shown = a.id in READ_PANES || ROOM_READS.has(a.id) || ACCOUNT_READS.has(a.id) || NOTICE_READS.has(a.id) || SETUP_READS.has(a.id);
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

test("the room's settings open the configure page (v1's \"Configure the room's setup\"), not a note to find the controls", () => {
  const ctx = affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: true, spectator: false }], preset: "lines-beginner", phase: "lobby", game: null } as never });
  const row = paletteCommands(ctx, { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, roomPath: "/rooms/ABCD" } as never).find(r => r.id === "room.settings");
  assert.ok(row, "the owner is offered the room's settings");
  assert.deepEqual(row.performer, { kind: "navigate", to: "/rooms/ABCD/configure" });
  assert.equal(row.confirm, "none", "opening the page asks nothing; its Save confirms");
});

test("each enabled panel of yours is a typed-only row, 'Open your panel: <title>', and the pane pick lists it (v1)", async () => {
  const ctx = affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: true, spectator: false }], preset: "lines-beginner" } as never, header: { phase: "live", me: "m1" } as never });
  const opened: string[] = [];
  const host = {
    perform: async () => ({ ok: true as const, result: {} }), navigate() {}, panes: { open: async (p: string) => { opened.push(p); }, close: async () => {} },
    storedPanels: [{ slug: "my-stats", title: "My stats", enabled: true }, { slug: "off-one", title: "Off one", enabled: false }],
  };
  const rows = paletteCommands(ctx, host as never);
  const mine = rows.find(r => r.human.title === "Open your panel: My stats");
  assert.ok(mine && mine.typedOnly && mine.performer.kind === "submit");
  await mine.performer.run();
  assert.deepEqual(opened, ["panel:my-stats"]);
  assert.equal(rows.some(r => r.human.title.includes("Off one")), false, "a panel turned off is not offered");
  const open = rows.find(r => r.id === "view.openPane")!.performer;
  assert.ok(open.kind === "form" && open.page.kind === "pick");
  const options = await open.page.options("");
  assert.ok(options.some(o => o.id === "panel:my-stats" && o.label === "My stats"), "the pane pick lists your panels");
});

test("safe mode is a typed-only row that reloads the page with your panels off, and back (v1)", () => {
  const ctx = affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: true, spectator: false }], preset: "lines-beginner" } as never, header: { phase: "live", me: "m1" } as never });
  const host = (safeMode: boolean) => ({ perform: async () => ({ ok: true as const, result: {} }), navigate() {}, panes: { open: async () => {}, close: async () => {} }, storedPanels: [], safeMode, setSafeMode() {} });
  const off = paletteCommands(ctx, host(false) as never).find(r => r.id === "safe-mode")!;
  assert.ok(off.typedOnly && off.human.title === "Safe mode: your panels off" && off.performer.kind === "local");
  const on = paletteCommands(ctx, host(true) as never).find(r => r.id === "safe-mode")!;
  assert.equal(on.human.title, "Leave safe mode: run your panels");
});

test("a room code typed in the palette offers “Open room CODE”, which goes there (v1 parity: cmd-site-dyn-room-open)", async () => {
  const { codeCommands } = await import("../src/core/palette-commands.ts");
  const [row, ...rest] = codeCommands(" k7qx2 ");
  assert.equal(rest.length, 0);
  assert.equal(row!.human.title, "Open room K7QX2");
  assert.deepEqual(row!.performer, { kind: "navigate", to: "/rooms/K7QX2" });
  assert.deepEqual(codeCommands("summon an agent"), [], "a phrase is not a code");
  assert.deepEqual(codeCommands("ab"), [], "too short");
});

test("a command's status reads as words: applied, or safe to send again (v1's 'Check a command's status…')", async () => {
  const { receiptWords } = await import("../src/core/palette-commands.ts");
  assert.equal(receiptWords({ applied: true, operation: "chat.send", result: null }), "That command (chat.send) went through.");
  assert.match(receiptWords({ applied: false, operation: null, result: null }), /safe to send it again/);
});

test("each file panel (src/panels/*.tsx) is a typed-only row, 'Open file panel: <id>', and the pane pick lists it (v1)", async () => {
  const ctx = affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: true, spectator: false }], preset: "lines-beginner" } as never, header: { phase: "live", me: "m1" } as never });
  const opened: string[] = [];
  const host = { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, panes: { open: async (p: string) => { opened.push(p); }, close: async () => {} }, filePanels: ["my-bits"] };
  const rows = paletteCommands(ctx, host as never);
  const row = rows.find(r => r.human.title === "Open file panel: my-bits");
  assert.ok(row && row.typedOnly && row.performer.kind === "submit");
  await row.performer.run();
  assert.deepEqual(opened, ["file:my-bits"]);
  const open = rows.find(r => r.id === "view.openPane")!.performer;
  assert.ok(open.kind === "form" && open.page.kind === "pick");
  assert.ok((await open.page.options("")).some(o => o.id === "file:my-bits"));
});

test("in a grid game the palette's “Open a pane” names its panes in grids, as the dock does (playtest: “Lines”, “One line”)", async () => {
  const host = { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, noun: { one: "grid", many: "grids" }, panes: { open() {}, close() {} } };
  const row = paletteCommands(ctx, host as never).find(r => r.id === "view.openPane")!;
  assert.equal(row.performer.kind, "form");
  const options = (row.performer as { page: { options: () => { id: string; label: string; detail?: string }[] } }).page.options();
  assert.equal(options.find(o => o.id === "objects")!.label, "Grids");
  assert.equal(options.find(o => o.id === "object")!.label, "One grid");
  for (const o of options) assert.doesNotMatch(`${o.label} ${o.detail ?? ""}`, /\blines?\b/i, o.id);
});

test("in a grid game the pane rows say grids (baseline-1: 'Open Lines', 'One line' in a grid game)", () => {
  const ctx = affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: true, spectator: false }], preset: "lines-beginner" } as never, header: { phase: "live", me: "m1" } as never });
  const host = { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, noun: { one: "grid", many: "grids" }, panes: { open: async () => {}, close: async () => {} } };
  const titles = paletteCommands(ctx, host as never).map(r => r.human.title);
  assert.ok(titles.includes("Open Grids") && titles.includes("Open One grid"), titles.filter(t => t.startsWith("Open")).join(", "));
  assert.ok(!titles.some(t => /^Open .*\bline/i.test(t)), "no pane named for lines");
});

test("'Focus assistant (Ctrl+`)' is a row in a game with the assistant, and focuses its composer (v1)", async () => {
  const ctx = affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: true, spectator: false }], preset: "lines-beginner" } as never, header: { phase: "live", me: "m1" } as never });
  let focused = 0;
  const host = { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, panes: { open: async () => {}, close: async () => {} }, focusAssistant: async () => { focused++; } };
  const row = paletteCommands(ctx, host as never).find(r => r.id === "assistant-focus");
  assert.ok(row && row.human.title === "Focus assistant (Ctrl+`)" && row.performer.kind === "submit");
  await row.performer.run();
  assert.equal(focused, 1);
  const off = affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: true, spectator: false }], preset: "lines-beginner" } as never, header: { phase: "live", me: "m1" } as never, aiOff: "No AI here." });
  assert.equal(paletteCommands(off, host as never).some(r => r.id === "assistant-focus"), false, "not in a room without AI");
});

test("New setup… (setups.save) opens the configure page at Save as a setup", () => {
  const ctx = affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: true, spectator: false }], preset: "lines-beginner", phase: "lobby", game: null } as never });
  const row = paletteCommands(ctx, { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, roomPath: "/rooms/ABCD" } as never).find(r => r.id === "setups.save");
  assert.ok(row);
  assert.deepEqual(row.performer, { kind: "navigate", to: "/rooms/ABCD/configure#field-save-setup" });
});

test("'New conversation' and 'Switch assistant conversation…' open the assistant so (v1)", async () => {
  const ctx = affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: true, spectator: false }], preset: "lines-beginner" } as never, header: { phase: "live", me: "m1" } as never });
  const asked: unknown[] = [];
  const host = { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, panes: { open: async () => {}, close: async () => {} }, focusAssistant: async (r?: unknown) => { asked.push(r); } };
  const rows = paletteCommands(ctx, host as never);
  for (const [title, req] of [["New conversation", { thread: "new" }], ["Switch assistant conversation…", { thread: "pick" }]] as const) {
    const row = rows.find(r => r.human.title === title);
    assert.ok(row && row.performer.kind === "submit", title);
    await row.performer.run();
    assert.deepEqual(asked.at(-1), req);
  }
});

test("'Who am I' says who you are signed in as and what you are in the room (v1)", async () => {
  const { whoAmI } = await import("../src/core/palette-commands.ts");
  const room = (me: object) => affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, ...me }], preset: "lines-beginner" } as never, header: { phase: "live", me: "m1" } as never });
  assert.equal(whoAmI(room({ owner: true, spectator: false }), { me: { name: "Ada", email: "ada@example.test" }, roomCode: "ABC123" }), "You are Ada (ada@example.test), the owner and a player in room ABC123.");
  assert.match(whoAmI(affordanceContext({ signedIn: true, admin: false, room: { members: [{ me: true, owner: false, spectator: true }], preset: "lines-beginner" } as never }), { me: { name: "Bo" }, roomCode: "ABC123" }), /^You are Bo, a spectator in room ABC123\.$/);
  assert.equal(whoAmI(affordanceContext({ signedIn: false, admin: false }), {}), "You are not signed in.");
  const row = paletteCommands(room({ owner: true, spectator: false }), { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, me: { name: "Ada" }, roomCode: "ABC123" } as never).find(r => r.id === "account.whoami");
  assert.ok(row && row.performer.kind === "form" && row.performer.page.kind === "info" && /You are Ada, the owner and a player in room ABC123/.test(String((row.performer.page as { lines: string[] }).lines[0])));
});

test("'Copy room link' is a row wherever a room is in view (v1)", () => {
  let copied = 0;
  const host = { perform: async () => ({ ok: true as const, result: {} }), navigate() {}, roomCode: "ABC123", copyRoomLink: () => { copied++; } };
  const row = paletteCommands(ctx, host as never).find(r => r.id === "room-copy-link");
  assert.ok(row && row.human.title === "Copy room link" && row.performer.kind === "local");
  row.performer.run();
  assert.equal(copied, 1);
  assert.equal(paletteCommands(affordanceContext({ signedIn: true, admin: false }), host as never).some(r => r.id === "room-copy-link"), false, "not without a room");
});
