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
const rec = (name: string) => (...args: unknown[]) => { calls.push(`${name}${args.length ? ` ${JSON.stringify(args)}` : ""}`); return Promise.resolve(); };
const actions: Actions = {
  submit: rec("submit"), wake: rec("wake"), join: rec("join"), whoami: rec("whoami"), receipt: rec("receipt"), copyObservation: rec("copyObservation"),
  owner: { start: rec("start"), resume: rec("resume"), endGame: rec("endGame"), addAi: rec("addAi"), removeAi: rec("removeAi"), preset: rec("preset"),
    aiCatalog: async () => [{ id: "sonnet", label: "Sonnet" }] },
  panels: { open: rec("openPanel"), openFile: rec("openFile"), setEnabled: rec("setEnabled"), remove: rec("removePanel"), rollback: rec("rollback") },
  assistant: { cancel: rec("cancel"), setAutoApprove: rec("autoApprove"), threads: async () => [{ id: "t1", label: "Earlier" }], openThread: rec("openThread"),
    newThread: rec("newThread"), setPermission: rec("setPermission"), focus: rec("focusAssistant"), handoff: rec("handoff") },
  dock: { show: rec("show"), change: rec("change"), close: rec("close"), dockAssistant: rec("dockAssistant"), preset: rec("layoutPreset"), reset: rec("reset"),
    maximise: rec("maximise"), forgeEdit: rec("forgeEdit") },
  links: { roomPage: () => "/rooms/ABCD", gamePage: () => "/games/WXYZ", copyRoomLink: rec("copyRoomLink"), safeMode: rec("safeMode") },
  objects: { setGridRenderer: rec("gridRenderer") },
  notify: rec("notify"),
};
const state = (over: Partial<State> = {}): State => ({
  phase: "running", hasObservation: true, permission: "act", isOwner: false, seated: true, ready: false, pauseUsed: false,
  agents: [{ id: "agent-1", label: "agent-1 · python" }], unknownOutcome: false, busy: false, assistantOn: true, roomCode: "ABCD", gameCode: "WXYZ",
  panes: [{ id: "p1", kind: "panel", label: "Where am I", closable: false }, { id: "p2", kind: "assistant", label: "Your assistant", closable: false }],
  scopePaneId: "p1", storedPanels: [{ slug: "race-plus", title: "Race plus", enabled: true, currentVersion: 2 }], filePanels: [], safeMode: false,
  presets: [{ id: "grid-classic", label: "Classic" }], aiSeats: [{ id: "ai-1", label: "Sonnet" }], gridRenderer: "digits", ...over,
});
const ctx = (over: Partial<PaletteContext> = {}): PaletteContext => ({ role: "seated", admin: false, permission: "act", phase: "running", assistantOn: true, scope: { paneId: "p1" }, ...over });
const find = (commands: Command[], id: string) => { const c = commands.find(x => x.id === id); assert.ok(c, `no command ${id}`); return c; };
const ok = (commands: Command[], id: string, c = ctx()) => find(commands, id).available(c).ok;
const reason = (commands: Command[], id: string, c = ctx()) => { const a = find(commands, id).available(c); return a.ok ? "" : a.reason; };
async function perform(command: Command) {
  const p = command.performer;
  if (p.kind === "submit") await p.run();
  else if (p.kind === "local") p.run();
  else if (p.kind === "form") { if (p.page.kind === "pick") { const options = await p.page.options(); await p.page.onPick(options[0].id); } else await p.page.onSubmit("x"); }
  else if (p.kind === "handoff") calls.push(`handoff-draft ${p.draft}`);
}

test("every catalogue entry offered on the player surface has its command, titled by the catalogue", () => {
  const commands = playerCommands(state(), actions);
  for (const { path, palette } of paletteEntries("player")) assert.equal(find(commands, path).human.title, palette.label, path);
  assert.equal(new Set(commands.map(c => c.id)).size, commands.length, "unique ids");
  for (const c of commands) assert.ok(c.human.title && c.human.tooltip, `${c.id} has a title and a tooltip`);
});

test("the dock commands: add any panel, change this pane's panel, close it, move the assistant, the presets, reset, focus, maximise", () => {
  const commands = playerCommands(state(), actions);
  for (const id of PANEL_IDS) assert.ok(commands.some(c => c.id === `ui.panel.add.${id}`), id);
  for (const id of ["ui.pane.change", "ui.pane.close", "ui.assistant.right", "ui.assistant.bottom", "ui.assistant.left", "ui.layout.stacked", "ui.layout.side-by-side",
    "ui.layout.two-panels", "ui.layout.reset", "ui.assistant.focus", "ui.pane.maximise", "ui.assistant.new", "ui.assistant.settings", "ui.room.copy-link",
    "ui.room.open", "ui.game.open", "ui.safe-mode", "ui.glossary", "ui.forge.edit"]) find(commands, id);
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
  assert.match(reason(single, "ui.pane.close", ctx({ scope: { paneId: "p2" } })), /assistant/);
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
