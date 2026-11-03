/**
 * The player client's command palette list (src/core/palette/commands.ts): the human repertoire must cover every
 * catalogue entry offered on the player surface (docs/ui-redesign.md §2.5), add the dock and help commands, run the
 * same paths the panels use, and refuse exactly what the old console's buttons refused (read-only, an outcome still
 * unknown, nothing to destroy, the pause used or not running, owner powers).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { paletteEntries } from "@workspace/player-client/catalog";
import { PANEL_IDS } from "@workspace/player-client/panels";
import type { Command, PaletteContext } from "@workspace/ui-kit";

register("./support/ui-kit-hook.mjs", import.meta.url);
const { playerCommands } = await import("../src/core/palette/commands.ts");
type State = Parameters<typeof playerCommands>[0];
type Actions = Parameters<typeof playerCommands>[1];

const calls: string[] = [];
/** What the receipts.get subscription holds for each command id (stands in for the shared useLive hook). */
const receipts = new Map<string, readonly string[]>();
const rec = (name: string) => (...args: unknown[]) => { calls.push(`${name}${args.length ? ` ${JSON.stringify(args)}` : ""}`); return Promise.resolve(); };
const actions: Actions = {
  submit: rec("submit"), wake: rec("wake"), join: rec("join"), whoami: rec("whoami"), useReceipt: id => receipts.get(id) ?? ["Loading…"], copyObservation: rec("copyObservation"),
  owner: { start: rec("start"), resume: rec("resume"), endGame: rec("endGame"), addAi: rec("addAi"), removeAi: rec("removeAi"), setup: rec("setup"),
    useAiCatalog: () => ({ options: [{ id: "sonnet", label: "Sonnet" }] }) },
  panels: { open: rec("openPanel"), openFile: rec("openFile"), setEnabled: rec("setEnabled"), remove: rec("removePanel"), rollback: rec("rollback") },
  assistant: { cancel: rec("cancel"), setAutoApprove: rec("autoApprove"), useThreads: () => ({ options: [{ id: "t1", label: "Earlier" }] }), openThread: rec("openThread"),
    newThread: rec("newThread"), setPermission: rec("setPermission"), focus: rec("focusAssistant"), handoff: rec("handoff") },
  dock: { show: rec("show"), change: rec("change"), close: rec("close"), dockAssistant: rec("dockAssistant"), openAssistant: rec("openAssistant"), preset: rec("layoutPreset"), reset: rec("reset"),
    maximise: rec("maximise"), forgeEdit: rec("forgeEdit") },
  links: { roomPage: () => "/rooms/ABCD", copyRoomLink: rec("copyRoomLink"), safeMode: rec("safeMode") },
  objects: { setGridRenderer: rec("gridRenderer") },
  replay: { watch: rec("watchReplay"), toggle: rec("replayToggle"), start: rec("replayStart"), end: rec("replayEnd") },
  notify: rec("notify"),
};
const state = (over: Partial<State> = {}): State => ({
  phase: "running", hasObservation: true, permission: "act", isOwner: false, seated: true, ready: false, pauseUsed: false,
  agents: [{ id: "agent-1", label: "agent-1 · python" }], unknownOutcome: false, busy: false, assistantOn: true, assistantAvailable: true, roomCode: "ABCD", gameCode: "WXYZ",
  panes: [{ id: "p1", kind: "panel", label: "Where am I", closable: false }, { id: "p2", kind: "assistant", label: "Your assistant", closable: true }],
  scopePaneId: "p1", storedPanels: [{ slug: "race-plus", title: "Race plus", enabled: true, currentVersion: 2 }], filePanels: [], safeMode: false,
  setups: [{ id: "setup-classic", label: "Classic" }], aiSeats: [{ id: "ai-1", label: "Sonnet" }], gridRenderer: "digits", ...over,
});
const ctx = (over: Partial<PaletteContext> = {}): PaletteContext => ({ role: "seated", admin: false, permission: "act", phase: "running", assistantOn: true, scope: { paneId: "p1" }, ...over });
const find = (commands: Command[], id: string) => { const c = commands.find(x => x.id === id); assert.ok(c, `no command ${id}`); return c; };
const ok = (commands: Command[], id: string, c = ctx()) => find(commands, id).available(c).ok;
const reason = (commands: Command[], id: string, c = ctx()) => { const a = find(commands, id).available(c); return a.ok ? "" : a.reason; };
async function perform(command: Command) {
  const p = command.performer;
  if (p.kind === "submit") await p.run();
  else if (p.kind === "local") p.run();
  else if (p.kind === "form") {
    if (p.page.kind === "pick") { const options = p.page.useOptions ? p.page.useOptions().options! : await p.page.options(); await p.page.onPick(options[0].id); }
    else if (p.page.kind === "field") await p.page.onSubmit("x");
  }
  else if (p.kind === "handoff") calls.push(`handoff-draft ${p.draft}`);
}

test("every catalogue entry offered on the player surface has its command, titled by the catalogue", () => {
  const commands = playerCommands(state(), actions);
  for (const { path, palette } of paletteEntries("dock")) assert.equal(find(commands, path).human.title, palette.label, path);
  assert.equal(new Set(commands.map(c => c.id)).size, commands.length, "unique ids");
  for (const c of commands) assert.ok(c.human.title && c.human.tooltip, `${c.id} has a title and a tooltip`);
});

test("the dock commands: add any panel, change this pane's panel, close it, move the assistant, the presets, reset, focus, maximise", () => {
  const commands = playerCommands(state(), actions);
  for (const id of PANEL_IDS) assert.ok(commands.some(c => c.id === `ui.panel.add.${id}`), id);
  for (const id of ["ui.pane.change", "ui.pane.close", "ui.assistant.right", "ui.assistant.bottom", "ui.assistant.left", "ui.layout.stacked", "ui.layout.side-by-side",
    "ui.layout.two-panels", "ui.layout.reset", "ui.assistant.focus", "ui.pane.maximise", "ui.assistant.new", "ui.assistant.settings", "ui.room.copy-link",
    "ui.room.open", "ui.safe-mode", "ui.glossary", "ui.forge.edit"]) find(commands, id);
  assert.equal(find(commands, "ui.assistant.focus").shortcut, "Ctrl+`");
  assert.equal(find(commands, "ui.panel.add.race").human.title, "Add panel: Leaderboard race");
});

test("dock commands act on the pane the palette was opened for", async () => {
  calls.length = 0;
  const commands = playerCommands(state({ scopePaneId: "p3", panes: [...state().panes, { id: "p3", kind: "panel", label: "Leaderboard race", closable: true }] }), actions);
  assert.ok(ok(commands, "ui.pane.close", ctx({ scope: { paneId: "p3" } })));
  await perform(find(commands, "ui.pane.close"));
  await perform(find(commands, "ui.pane.change"));
  await perform(find(commands, "ui.panel.add.feed"));
  await perform(find(commands, "ui.assistant.right"));
  assert.deepEqual(calls, ['close ["p3"]', 'change ["p3","overview"]', 'show ["feed"]', 'dockAssistant ["right"]']);
  const single = playerCommands(state(), actions);
  assert.match(reason(single, "ui.pane.close"), /last panel/, "the last built-in panel stays");
  assert.ok(ok(single, "ui.pane.close", ctx({ scope: { paneId: "p2" } })), "the assistant pane closes like any other");
  await perform(find(single, "ui.assistant.open"));
  assert.equal(calls.at(-1), "openAssistant", "Open assistant reopens it");
});

test("game commands go through the same submit path, and are refused like the old console's buttons", async () => {
  calls.length = 0;
  const commands = playerCommands(state(), actions);
  await perform(find(commands, "ui.pause"));
  await perform(find(commands, "ui.ready"));
  await perform(find(commands, "ui.destroy"));
  assert.deepEqual(calls, ['submit [{"type":"pause"}]', 'submit [{"type":"ready","ready":true}]', 'submit [{"type":"destroy","agentId":"agent-1"}]']);
  assert.equal(find(commands, "ui.pause").confirm, "modal", "a one-time pause asks first");
  assert.equal(find(commands, "ui.destroy").confirm, "inline");

  const game = ["ui.pause", "ui.ready", "ui.destroy", "ui.chat", "commands.submit"];
  const readOnly = playerCommands(state({ permission: "read" }), actions);
  for (const id of game) assert.match(reason(readOnly, id, ctx({ permission: "read" })), /read-only/, id);
  const unknown = playerCommands(state({ unknownOutcome: true }), actions);
  for (const id of game) assert.match(reason(unknown, id), /unknown/, id);
  const loading = playerCommands(state({ hasObservation: false }), actions);
  for (const id of game) assert.ok(!ok(loading, id), id);
  const busy = playerCommands(state({ busy: true }), actions);
  for (const id of game) assert.ok(!ok(busy, id), id);

  assert.ok(!ok(playerCommands(state({ pauseUsed: true }), actions), "ui.pause"), "one pause a game");
  assert.ok(!ok(playerCommands(state({ phase: "planning" }), actions), "ui.pause", ctx({ phase: "planning" })), "only while running");
  assert.ok(!ok(playerCommands(state({ agents: [] }), actions), "ui.destroy"), "nothing to destroy");
  assert.equal(find(playerCommands(state({ ready: true }), actions), "ui.ready").human.title, "Mark me not ready");
});

test("owner commands need the owner and the right moment", () => {
  const player = playerCommands(state(), actions);
  for (const id of ["owner.start", "rooms.endActiveGame", "rooms.addAi", "rooms.removeAi", "owner.settings", "rooms.resume"]) assert.ok(!ok(player, id), id);
  const owner = (phase: State["phase"]) => playerCommands(state({ isOwner: true, phase }), actions);
  const as = (phase: NonNullable<State["phase"]>) => ctx({ role: "owner", phase });
  assert.ok(ok(owner("lobby"), "owner.start", as("lobby")));
  assert.ok(!ok(owner("running"), "owner.start", as("running")), "one game at a time");
  const starting = playerCommands(state({ isOwner: true, phase: "lobby", starting: "starting" }), actions);
  assert.match(reason(starting, "owner.start", as("lobby")), /already starting/, "no second start while one is pending");
  const preparing = playerCommands(state({ isOwner: true, phase: "lobby", starting: "preparing" }), actions);
  assert.match(reason(preparing, "owner.start", as("lobby")), /preparing/);
  assert.ok(ok(owner("running"), "rooms.endActiveGame", as("running")));
  assert.ok(!ok(owner("lobby"), "rooms.endActiveGame", as("lobby")));
  assert.ok(ok(owner("lobby"), "rooms.addAi", as("lobby")));
  assert.ok(!ok(owner("running"), "rooms.addAi", as("running")), "seats change between games");
  assert.equal(find(owner("running"), "rooms.endActiveGame").confirm, "modal");
});

test("hand-offs only pre-fill the composer, and need the assistant", async () => {
  calls.length = 0;
  const commands = playerCommands(state(), actions);
  const make = find(commands, "panels.save");
  assert.equal(make.performer.kind, "handoff");
  await perform(make);
  assert.equal(calls.filter(c => c.startsWith("submit")).length, 0, "nothing is sent");
  const off = playerCommands(state({ assistantOn: false }), actions);
  assert.match(reason(off, "panels.save", ctx({ assistantOn: false })), /assistant is off/);
  assert.match(reason(off, "assistant.send", ctx({ assistantOn: false })), /assistant is off/);
});

test("in a room with no assistant (its owner is not an admin) every assistant and AI-seat affordance is hidden, not dimmed", () => {
  const commands = playerCommands(state({ assistantOn: false, assistantAvailable: false, aiEnabled: false, isOwner: true }), actions);
  for (const id of ["assistant.send", "panels.save", "ui.assistant.open", "ui.assistant.right", "ui.assistant.focus", "ui.assistant.new", "ui.assistant.settings", "rooms.addAi"]) {
    const a = find(commands, id).available(ctx({ assistantOn: false, role: "owner" }));
    assert.equal(a.ok, false, `${id} is unavailable`);
    assert.equal((a as { hidden?: boolean }).hidden, true, `${id} is hidden`);
  }
  assert.equal(ok(playerCommands(state({ assistantAvailable: true, aiEnabled: true, phase: "lobby" }), actions), "rooms.addAi", ctx({ role: "owner", phase: "lobby" })), true, "in an admin's room it is offered");
  // AI seats follow the room's aiEnabled, not the assistant's status (which may still be loading).
  assert.equal(ok(playerCommands(state({ assistantAvailable: false, aiEnabled: true, phase: "lobby" }), actions), "rooms.addAi", ctx({ role: "owner", phase: "lobby" })), true);
});

test("pick pages: stored panels open as panes, a glossary term is explained, conversations switch", async () => {
  calls.length = 0;
  const commands = playerCommands(state(), actions);
  await perform(find(commands, "panels.list"));
  await perform(find(commands, "assistant.threads"));
  await perform(find(commands, "ui.stored-panel.race-plus"));
  assert.deepEqual(calls, ['openPanel ["race-plus"]', 'openThread ["t1"]', 'openPanel ["race-plus"]']);
  const glossary = find(commands, "ui.glossary").performer;
  assert.equal(glossary.kind, "form");
  if (glossary.kind === "form" && glossary.page.kind === "pick") assert.ok((await glossary.page.options()).length >= 15);
});

test("a command's status is a live page: it shows the receipt the subscription holds, and follows it when one arrives", async () => {
  // Catches: the status read once (a one-off convex.query) saying "never arrived" for a command still in flight.
  const p = find(playerCommands(state(), actions), "receipts.get").performer;
  assert.ok(p.kind === "form" && p.page.kind === "field");
  const page = await p.page.onSubmit("  cmd-12345678  ");
  assert.ok(page && typeof page === "object" && "kind" in page && page.kind === "info" && page.useLines, "submitting opens a live info page");
  assert.deepEqual(page.useLines(), ["Loading…"]);
  receipts.set("cmd-12345678", ["Accepted: ok"]);
  assert.deepEqual(page.useLines(), ["Accepted: ok"], "the trimmed id's receipt, as it now stands");
});

test("grids switch between coloured digits and tiles, for this viewer, from the view group", async () => {
  calls.length = 0;
  const digits = find(playerCommands(state(), actions), "ui.objects.renderer");
  assert.equal(digits.human.title, "Show grids as tiles");
  assert.equal(digits.group, "view");
  assert.equal(digits.performer.kind, "local", "no game command: a display preference");
  assert.ok(digits.available(ctx({ permission: "read" })).ok, "a read-only connection may still change how it sees grids");
  await perform(digits);
  const tiles = find(playerCommands(state({ gridRenderer: "tiles" }), actions), "ui.objects.renderer");
  assert.equal(tiles.human.title, "Show grids as coloured digits");
  await perform(tiles);
  assert.deepEqual(calls, ['gridRenderer ["tiles"]', 'gridRenderer ["digits"]']);
});

test("assistant settings offer owner powers only to an owner holding an owner connection (the engine caps the assistant at it)", async () => {
  const choices = async (over: Partial<State>) => {
    const p = find(playerCommands(state(over), actions), "ui.assistant.settings").performer;
    assert.ok(p.kind === "form" && p.page.kind === "pick");
    return (await p.page.options()).map(o => o.id);
  };
  assert.deepEqual(await choices({ isOwner: true, permission: "owner" }), ["act", "read", "owner"]);
  assert.deepEqual(await choices({ isOwner: true, permission: "act" }), ["act", "read"], "an owner on an act connection");
  assert.deepEqual(await choices({ isOwner: false, permission: "owner" }), ["act", "read"]);
});

test("a completed game: the room page offers its replay; in the replay, play/pause and jump to the start or the end", async () => {
  const ended = state({ phase: "ended" });
  const endedCtx = ctx({ phase: "ended" });
  let commands = playerCommands(ended, actions);
  assert.ok(ok(commands, "ui.replay.watch", endedCtx), "the ended room offers its replay");
  assert.ok((find(commands, "ui.replay.watch").defaultScore ?? 0) >= 8, "and leads the empty palette");
  calls.length = 0;
  await perform(find(commands, "ui.replay.watch"));
  assert.deepEqual(calls, ["watchReplay"]);
  for (const id of ["ui.replay.toggle", "ui.replay.start", "ui.replay.end"]) assert.ok(!ok(commands, id, endedCtx), `${id}: only in the replay`);
  assert.ok(!ok(playerCommands(state(), actions), "ui.replay.watch"), "a live game has no replay");
  assert.ok(!ok(playerCommands(state({ phase: "ended", gameCode: undefined }), actions), "ui.replay.watch", endedCtx), "no game to replay");
  assert.ok(!ok(playerCommands(state({ phase: "ended", seated: false }), actions), "ui.replay.watch", endedCtx), "only its players and the owner");

  commands = playerCommands(state({ phase: "ended", replay: { playing: false, atStart: false, atEnd: true } }), actions);
  assert.ok(!ok(commands, "ui.replay.watch", endedCtx), "already watching it");
  assert.equal(find(commands, "ui.replay.toggle").human.title, "Play the replay");
  assert.equal(find(playerCommands(state({ phase: "ended", replay: { playing: true, atStart: false, atEnd: false } }), actions), "ui.replay.toggle").human.title, "Pause the replay");
  assert.ok(ok(commands, "ui.replay.start", endedCtx));
  assert.equal(reason(commands, "ui.replay.end", endedCtx), "The replay is at its end.");
  calls.length = 0;
  for (const id of ["ui.replay.toggle", "ui.replay.start"]) await perform(find(commands, id));
  assert.deepEqual(calls, ["replayToggle", "replayStart"]);
  // A replay acts on nothing: every command that would change the room is off; looking, the dock and the assistant stay.
  const owner = playerCommands(state({ phase: "ended", isOwner: true, replay: { playing: false, atStart: false, atEnd: true } }), actions);
  const ownerCtx = ctx({ phase: "ended", role: "owner" });
  for (const id of ["owner.start", "ui.ready", "ui.chat", "rooms.join"]) assert.ok(!ok(owner, id, ownerCtx), `${id} is off in a replay`);
  for (const id of ["ui.replay.toggle", "ui.layout.reset", "ui.panel.add.objects", "ui.glossary"]) assert.ok(ok(owner, id, ownerCtx), `${id} stays in a replay`);
});
