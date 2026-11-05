/**
 * The site pages' palette commands: every engine catalogue entry is bound or excluded with a reason; every next step
 * is a command; unavailable commands explain themselves (and offer the fix); AI is hidden when the server has none.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { paletteRows } from "@workspace/ui-kit/core";
import { EXCLUDED, STEP_IDS, allCatalogSitePaths, codeCommands, engineCommands, paletteContextFor, tooltipFor, type EngineActions, type EngineScope } from "../src/site/lib/commands.ts";

const nothing = async () => undefined;
const act: EngineActions = {
  navigate() {}, openTab() {}, copy() {}, login() {}, logout() {}, createRoom() {}, join: nothing, leave: nothing, setReady: nothing, start: nothing,
  resume: nothing, startWorldNow: nothing, endGame: nothing, addAi: nothing, removeAi: nothing, applySetup: async id => { applied.push(id); }, duplicateSetup: async id => { duplicated.push(id); },
  useTemplates: () => lists.templates, useAdminTemplates: () => lists.adminTemplates, usePastGames: () => lists.pastGames, useCredentials: () => lists.credentials, revoke: nothing, openSheet() {}, rulesText: () => "rules", useServerInfo: () => [], useSetups: query => { searched.push(query); return lists.setups; }, whoAmI: () => [], origin: "https://cg.test",
  setGridRenderer: id => { gridCalls.push(id); },
};
const gridCalls: string[] = [];
// What each palette list's subscription holds right now (the stubs stand in for the shared useLive hook).
const searched: string[] = [];
const lists: Record<"templates" | "adminTemplates" | "pastGames" | "credentials" | "setups", { data: any; error: Error | null }> = {
  setups: { data: [], error: null },
  templates: { data: [], error: null }, adminTemplates: { data: [], error: null }, pastGames: { data: [], error: null }, credentials: { data: [], error: null },
};
const applied: string[] = [], duplicated: string[] = [];
const ada = { id: "ada", name: "Ada Lovelace", isAdmin: false };
const room = (members: string[], activeGame: NonNullable<EngineScope["room"]>["activeGame"] = null): NonNullable<EngineScope["room"]> => ({
  id: "r1", shortCode: "K7QX", ownerId: "ada", ownerName: "Ada Lovelace", aiEnabled: true, aiQuota: 300_000, assistantQuota: 300_000, activeGame,
  members: members.map(id => ({ id, name: id, kind: id.startsWith("ai:") ? "ai" : "human", ready: false })),
});
const scope = (s: Partial<EngineScope>): EngineScope => ({ user: ada, minPlayers: 3, maxPlayers: 8, aiConfigured: true, ...s });
const find = (s: EngineScope, id: string) => engineCommands(s, act).find(c => c.id === id)!;
const avail = (s: EngineScope, id: string) => find(s, id).available(paletteContextFor(s));

test("every engine catalogue entry is a command or a stated exclusion; every next step is a command", () => {
  const ids = new Set(engineCommands(scope({ room: room(["ada"]) }), act).map(c => c.id));
  for (const path of allCatalogSitePaths()) assert.ok(ids.has(path) || EXCLUDED[path], `${path} is bound or excluded`);
  for (const path of Object.keys(EXCLUDED)) assert.ok(!ids.has(path), `${path} is excluded, not bound`);
  for (const id of STEP_IDS) assert.ok(ids.has(id), `next step ${id} is a palette command`);
  assert.equal(tooltipFor("rooms.join"), "Plays the next game or watches it (a game already running, or once eight play, you watch).", "tooltips come from the catalogue");
});

test("Start game explains what is missing and offers the fix; a member sees who can", () => {
  assert.deepEqual(avail(scope({ room: room(["ada", "bob"]) }), "owner.start"), { ok: false, reason: "Needs 3 players; 2 play (spectators don't count).", fix: "rooms.addAi" });
  assert.deepEqual(avail(scope({ room: room(["ada", "bob", "ai:x"]) }), "owner.start"), { ok: true });
  assert.deepEqual(avail(scope({ room: room(["ada", "bob", "ai:x"]), starting: true }), "owner.start"), { ok: false, reason: "The game is already starting." }, "no double start while one is pending");
  assert.deepEqual(avail(scope({ user: { ...ada, id: "bob" }, room: room(["ada", "bob", "cy"]) }), "owner.start"), { ok: false, reason: "Only the owner, Ada Lovelace, can do this." });
  const rows = paletteRows(engineCommands(scope({ user: { ...ada, id: "bob" }, room: room(["ada", "bob", "cy"]) }), act), paletteContextFor(scope({ user: { ...ada, id: "bob" }, room: room(["ada", "bob", "cy"]) })), { query: "start" }).flatMap(s => s.rows);
  assert.equal(rows.find(r => r.command.id === "owner.start")?.availability.ok, false, "searched, it is listed dimmed");
});

test("without AI on the server, AI commands are hidden; seats freeze while a game runs", () => {
  assert.equal((avail(scope({ room: room(["ada"]), aiConfigured: false }), "rooms.addAi") as { hidden?: boolean }).hidden, true);
  assert.deepEqual(avail(scope({ room: room(["ada"]), aiConfigured: false }), "owner.start"), { ok: false, reason: "Needs 3 players; 1 plays (spectators don't count)." }, "no AI fix offered");
  const g = { shortCode: "G9TQ", phase: "running", roster: [{ id: "ada" }] };
  assert.deepEqual(avail(scope({ room: room(["ada", "ai:x"], g) }), "rooms.removeAi"), { ok: false, reason: "Changes wait until game G9TQ ends." });
  assert.deepEqual(avail(scope({ room: room(["ada"], g) }), "rooms.endActiveGame"), { ok: true });
});

test("Start the world now is offered to the owner (also a spectating owner) during planning only, never to others or after the world starts", () => {
  const planning = { shortCode: "G9TQ", phase: "planning", roster: [{ id: "bob" }] }; // ada owns the room and is not in the roster: spectating
  assert.deepEqual(avail(scope({ room: room(["ada", "bob"], planning) }), "rooms.startWorldNow"), { ok: true });
  assert.equal(avail(scope({ room: room(["ada", "bob"], { ...planning, phase: "running" }) }), "rooms.startWorldNow").ok, false, "not after the world starts");
  assert.equal(avail(scope({ room: room(["ada", "bob"]) }), "rooms.startWorldNow").ok, false, "no game");
  assert.deepEqual(avail(scope({ user: { ...ada, id: "bob" }, room: room(["ada", "bob"], planning) }), "rooms.startWorldNow"), { ok: false, reason: "Only the owner, Ada Lovelace, can do this." });
});

test("in a room whose owner is not an admin, AI seats and quotas are hidden and Start offers no AI fix; quotas never freeze during games", () => {
  const plain = { ...room(["ada", "bob"]), aiEnabled: false };
  for (const id of ["rooms.addAi", "rooms.setAiQuotas"]) assert.equal((avail(scope({ room: plain }), id) as { hidden?: boolean }).hidden, true, `${id} is hidden`);
  assert.deepEqual(avail(scope({ room: plain }), "owner.start"), { ok: false, reason: "Needs 3 players; 2 play (spectators don't count)." });
  // AI seats left from an admin owner: Start says why it cannot, and offers their removal.
  const legacy = { ...room(["ada", "bob", "ai:x"]), aiEnabled: false };
  assert.deepEqual(avail(scope({ room: legacy }), "owner.start"),
    { ok: false, reason: "AI is only available in rooms run by an administrator for now. Remove the AI players to start.", fix: "rooms.removeAi" });
  assert.equal(avail(scope({ room: legacy }), "rooms.removeAi").ok, true);
  assert.deepEqual(avail(scope({ room: room(["ada", "bob"]) }), "rooms.setAiQuotas"), { ok: true });
  const g = { shortCode: "G9TQ", phase: "running", roster: [{ id: "ada" }] };
  assert.deepEqual(avail(scope({ room: room(["ada", "bob", "cy"], g) }), "rooms.setAiQuotas"), { ok: true }, "allowed during a game");
  assert.equal(avail(scope({ user: { ...ada, id: "bob" }, room: room(["ada", "bob"]) }), "rooms.setAiQuotas").ok, false, "owner only");
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

test("a code-shaped query opens that room (games open from their room: there is no /games/:code)", () => {
  const [room, ...rest] = codeCommands("k7qx", act);
  assert.deepEqual([room?.human.title, room?.performer, rest.length], ["Open room K7QX", { kind: "navigate", to: "/rooms/K7QX" }, 0]);
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

// What would break: the pick reading a whole catalogue it was handed instead of the server's page, filtering the
// server's search answer again (dropping a setup found by its owner or summary), or losing whose setup a row is.
test("Choose the next game's setup shows the catalogue's first page (the server searches what is typed), marks the current one and applies a pick", async () => {
  lists.setups = { data: [{ id: "s1", name: "First steps", summary: "A small board", system: true, mine: false },
    { id: "s2", name: "My big one", summary: "Grid 7×7", system: false, mine: true },
    { id: "s3", name: "Bo's board", summary: "Grid 5×5", system: false, mine: false }], error: null };
  const c = find(scope({ room: room(["ada"]), currentSetup: "s2" }), "owner.settings");
  assert.equal(c.performer.kind, "form");
  if (c.performer.kind !== "form" || c.performer.page.kind !== "pick" || !c.performer.page.useOptions) return assert.fail("a live pick");
  const listed = c.performer.page.useOptions("");
  assert.deepEqual(listed.options!.map(o => [o.id, o.label, o.detail]), [["s1", "First steps", "System · A small board"], ["s2", "My big one (current)", "You · Grid 7×7"],
    ["s3", "Bo's board", "Grid 5×5"]]);
  assert.equal(listed.searched, false);
  assert.equal(c.performer.page.useOptions("diddley").searched, true, "the server's search answer is shown as it is");
  assert.deepEqual(searched.slice(-2), ["", "diddley"]);
  await c.performer.page.onPick("s1");
  assert.deepEqual(applied, ["s1"]);
});

test("New setup duplicates the room's current setup (no generic Custom: every new setup starts from one)", async () => {
  const c = find(scope({ room: room(["ada"]), currentSetup: "s2" }), "ui.newSetup");
  assert.equal(c.performer.kind, "submit");
  if (c.performer.kind === "submit") await c.performer.run();
  assert.deepEqual(duplicated, ["s2"]);
  assert.deepEqual(avail(scope({ room: room(["ada"]) }), "ui.newSetup"),
    { ok: false, reason: "The room's setup was deleted: open Configure the room's setup to keep its settings as yours.", fix: "ui.nav.configure" });
});
test("while the next game prepares its rule tables the owner can end the preparation, and Start waits for it", () => {
  const preparing = { ...room(["ada", "bob", "cy"]), preparing: {} };
  assert.deepEqual(avail(scope({ room: preparing }), "rooms.endActiveGame"), { ok: true });
  assert.equal(avail(scope({ room: preparing }), "owner.start").ok, false);
  assert.equal(avail(scope({ room: { ...preparing, preparing: { error: "failed" } } }), "owner.start").ok, true, "a failed preparation may be started again");
  assert.equal(avail(scope({ room: room(["ada", "bob", "cy"]) }), "rooms.endActiveGame").ok, false, "nothing to end");
});

test("the palette lists the same commands however it was opened: one list per context (home, room, live game, ended game)", () => {
  const game = (status: "active" | "ended") => ({ id: "g1", shortCode: "7A8P", roomShortCode: "K7QX", status, ownerId: "ada" }) as unknown as NonNullable<EngineScope["game"]>;
  const contexts: Record<string, EngineScope> = {
    home: scope({}), room: scope({ room: room(["ada", "bob", "cy"]) }),
    "live game": scope({ game: game("active") }), "ended game": scope({ game: game("ended") }),
  };
  for (const [name, s] of Object.entries(contexts)) {
    const commands = engineCommands(s, act), ctx = paletteContextFor(s);
    const wanted = commands.filter(c => c.available(ctx).ok && !c.typedOnly).map(c => c.id).sort();
    // The button, the search box and Ctrl+K all open with no init and no query, so they all get these rows; the
    // suggestion and the recent ones only reorder them.
    const opened = (opts: Parameters<typeof paletteRows>[2]) => paletteRows(commands, ctx, opts).flatMap(x => x.rows).map(r => r.command.id);
    assert.deepEqual(opened({ query: "" }).sort(), wanted, `${name}: every available command, none left for a second mode`);
    assert.deepEqual(opened({ query: "", suggested: [wanted[0]], recent: [wanted[1]] }).sort(), wanted, `${name}: pinning does not filter`);
    assert.ok(wanted.length > 3, name);
  }
});

test("connected apps are managed with the engine site's session only: an app's grant gets a pointer there", () => {
  // Catches: the palette calling auth.credentials.* with an account grant (the engine refuses it: FORBIDDEN).
  for (const id of ["auth.credentials.list", "auth.credentials.revoke"]) {
    const site = scope({}), app = scope({ siteSession: false });
    assert.equal(find(site, id).available(paletteContextFor(site)).ok, true, `${id} on the site`);
    const off = find(app, id).available(paletteContextFor(app));
    assert.equal(off.ok, false, `${id} in an app`);
    assert.match((off as { reason: string }).reason, /engine's site/);
  }
});

test("the palette's lists are live subscriptions: a pick page shows loading, then the list, then follows each change", () => {
  // Catches: a pick page reading its list once (a one-off convex.query) and never seeing a template added or a
  // credential revoked while it is open; an error hidden as an empty list.
  const options = (id: string) => {
    const p = find(scope({ room: room(["ada"]) }), id).performer;
    assert.ok(p.kind === "form" && p.page.kind === "pick" && p.page.useOptions, `${id} subscribes`);
    return p.page.useOptions();
  };
  const sonnet = { id: "t1", name: "Sonnet", provider: "anthropic", model: "sonnet" };
  lists.templates = { data: undefined, error: null };
  assert.equal(options("rooms.addAi").options, undefined, "loading");
  lists.templates = { data: [sonnet], error: null };
  assert.deepEqual(options("rooms.addAi").options?.map(o => o.label), ["Sonnet"]);
  lists.templates = { data: [sonnet, { ...sonnet, id: "t2", name: "Opus" }], error: null };
  assert.deepEqual(options("rooms.addAi").options?.map(o => o.id), ["t1", "t2"], "a template added while the page is open appears");
  lists.templates = { data: undefined, error: new Error("Not signed in") };
  assert.equal(options("rooms.addAi").error, "Not signed in");
  lists.adminTemplates = { data: [sonnet], error: null };
  assert.deepEqual(options("aiTemplates.update").options?.map(o => o.detail), ["anthropic · sonnet"]);
  lists.credentials = { data: [{ credentialId: "c1", label: "CLI", permission: "act", roomCode: "ABCD" }], error: null };
  assert.deepEqual(options("auth.credentials.revoke").options?.map(o => [o.id, o.detail]), [["c1", "act · room ABCD"]]);
  lists.credentials = { data: [], error: null };
  assert.deepEqual(options("auth.credentials.revoke").options, [], "a revoked credential leaves the list");
  lists.pastGames = { data: [{ shortCode: "WXYZ", startedAt: 1, winners: [{ name: "Ada" }] }], error: null };
  assert.deepEqual(options("ui.nav.pastGame").options?.map(o => o.detail), ["won by Ada"]);
});

test("Show server info is for signed-in humans only: the engine refuses a signed-out caller (owner decision 2026-11-02)", () => {
  // Catches: the palette offering a command whose engine call answers UNAUTHENTICATED.
  const out = avail(scope({ user: null }), "manifest.get");
  assert.equal(out.ok, false);
  assert.equal(out.hidden, true);
  assert.equal(avail(scope({}), "manifest.get").ok, true);
});
