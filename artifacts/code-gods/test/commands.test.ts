/**
 * The engine UI's palette commands: every engine catalogue entry is bound or excluded with a reason; every next step
 * is a command; unavailable commands explain themselves (and offer the fix); AI is hidden when the server has none.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { paletteRows } from "@workspace/ui-kit/core";
import { EXCLUDED, STEP_IDS, allCatalogEnginePaths, codeCommands, engineCommands, paletteContextFor, tooltipFor, type EngineActions, type EngineScope } from "../src/lib/commands.ts";

const nothing = async () => undefined;
const act: EngineActions = {
  navigate() {}, openTab() {}, copy() {}, login() {}, logout() {}, createRoom() {}, join: nothing, leave: nothing, setReady: nothing, start: nothing,
  resume: nothing, endGame: nothing, addAi: nothing, removeAi: nothing, applyPreset: nothing, templates: async () => [], adminTemplates: async () => [],
  pastGames: async () => [], credentials: async () => [], revoke: nothing, openSheet() {}, rulesText: () => "rules", serverInfo: () => [], whoAmI: () => [], origin: "https://cg.test",
  setGridRenderer: id => { gridCalls.push(id); },
};
const gridCalls: string[] = [];
const ada = { id: "ada", name: "Ada Lovelace", isAdmin: false };
const room = (members: string[], activeGame: NonNullable<EngineScope["room"]>["activeGame"] = null): NonNullable<EngineScope["room"]> => ({
  id: "r1", shortCode: "K7QX", ownerId: "ada", ownerName: "Ada Lovelace", aiBudget: 0, assistantBudget: 0, activeGame,
  members: members.map(id => ({ id, name: id, kind: id.startsWith("ai:") ? "ai" : "human", ready: false })),
});
const scope = (s: Partial<EngineScope>): EngineScope => ({ user: ada, presets: [], minPlayers: 3, maxPlayers: 8, aiConfigured: true, ...s });
const find = (s: EngineScope, id: string) => engineCommands(s, act).find(c => c.id === id)!;
const avail = (s: EngineScope, id: string) => find(s, id).available(paletteContextFor(s));

test("every engine catalogue entry is a command or a stated exclusion; every next step is a command", () => {
  const ids = new Set(engineCommands(scope({ room: room(["ada"]) }), act).map(c => c.id));
  for (const path of allCatalogEnginePaths()) assert.ok(ids.has(path) || EXCLUDED[path], `${path} is bound or excluded`);
  for (const path of Object.keys(EXCLUDED)) assert.ok(!ids.has(path), `${path} is excluded, not bound`);
  for (const id of STEP_IDS) assert.ok(ids.has(id), `next step ${id} is a palette command`);
  assert.equal(tooltipFor("rooms.join"), "Takes a seat; joining mid-game makes you a spectator until the next game.", "tooltips come from the catalogue");
});

test("Start game explains what is missing and offers the fix; a member sees who can", () => {
  assert.deepEqual(avail(scope({ room: room(["ada", "bob"]) }), "owner.start"), { ok: false, reason: "Needs 3 players; 2 have joined.", fix: "rooms.addAi" });
  assert.deepEqual(avail(scope({ room: room(["ada", "bob", "ai:x"]) }), "owner.start"), { ok: true });
  assert.deepEqual(avail(scope({ user: { ...ada, id: "bob" }, room: room(["ada", "bob", "cy"]) }), "owner.start"), { ok: false, reason: "Only the owner, Ada Lovelace, can do this." });
  const rows = paletteRows(engineCommands(scope({ user: { ...ada, id: "bob" }, room: room(["ada", "bob", "cy"]) }), act), paletteContextFor(scope({ user: { ...ada, id: "bob" }, room: room(["ada", "bob", "cy"]) })), { query: "start" }).flatMap(s => s.rows);
  assert.equal(rows.find(r => r.command.id === "owner.start")?.availability.ok, false, "searched, it is listed dimmed");
});

test("without AI on the server, AI commands are hidden; seats freeze while a game runs", () => {
  assert.equal((avail(scope({ room: room(["ada"]), aiConfigured: false }), "rooms.addAi") as { hidden?: boolean }).hidden, true);
  assert.deepEqual(avail(scope({ room: room(["ada"]), aiConfigured: false }), "owner.start"), { ok: false, reason: "Needs 3 players; 1 has joined." }, "no AI fix offered");
  const g = { shortCode: "G9TQ", phase: "running", roster: [{ id: "ada" }] };
  assert.deepEqual(avail(scope({ room: room(["ada", "ai:x"], g) }), "rooms.removeAi"), { ok: false, reason: "Changes wait until game G9TQ ends." });
  assert.deepEqual(avail(scope({ room: room(["ada"], g) }), "rooms.endActiveGame"), { ok: true });
});

test("joining and leaving: only for whom it applies", () => {
  const visitor = scope({ user: { ...ada, id: "zed" }, room: room(["ada"]) });
  assert.deepEqual(avail(visitor, "rooms.join"), { ok: true });
  assert.equal((avail(scope({ room: room(["ada"]) }), "rooms.join") as { hidden?: boolean }).hidden, true, "already a member");
  assert.equal((avail(scope({ room: room(["ada"]) }), "rooms.leave") as { hidden?: boolean }).hidden, true, "the owner cannot leave");
  assert.equal(find(scope({ user: { ...ada, id: "bob" }, room: { ...room(["ada", "bob"]), members: [{ id: "bob", name: "Bob", kind: "human", ready: true }] } }), "rooms.setReady").human.title, "Mark me not ready");
  assert.equal(paletteContextFor(visitor).role, "signed-in");
  assert.equal(paletteContextFor(scope({ user: null, room: room(["ada"]) })).role, "visitor");
});

test("a code-shaped query opens a room or a game", () => {
  assert.deepEqual(codeCommands("k7qx", act).map(c => c.human.title), ["Open room K7QX", "Open game K7QX"]);
  assert.deepEqual(codeCommands("hi", act), []);
  assert.deepEqual(codeCommands("not a code", act), []);
});

test("outside a room (the landing page, your rooms) every command answers availability without a room", () => {
  for (const s of [scope({ user: null }), scope({})]) {
    for (const c of engineCommands(s, act)) assert.doesNotThrow(() => c.available(paletteContextFor(s)), c.id);
    const ids = paletteRows(engineCommands(s, act), paletteContextFor(s), { query: "start game" }).flatMap(x => x.rows).map(r => r.command.id);
    assert.ok(!ids.includes("owner.start"), "room commands are hidden where there is no room");
  }
});

test("grids switch between coloured digits and tiles for this viewer, anywhere, signed in or not", () => {
  for (const s of [scope({ user: null }), scope({ room: room(["ada"]) })]) {
    const c = find(s, "ui.objects.renderer");
    assert.equal(c.human.title, "Show grids as tiles", "digits is the default");
    assert.equal(c.group, "view");
    assert.deepEqual(c.available(paletteContextFor(s)), { ok: true });
  }
  gridCalls.length = 0;
  const toTiles = find(scope({}), "ui.objects.renderer").performer;
  const toDigits = find(scope({ gridRenderer: "tiles" }), "ui.objects.renderer");
  assert.equal(toDigits.human.title, "Show grids as coloured digits");
  for (const p of [toTiles, toDigits.performer]) { assert.equal(p.kind, "local"); if (p.kind === "local") p.run(); }
  assert.deepEqual(gridCalls, ["tiles", "digits"]);
});
