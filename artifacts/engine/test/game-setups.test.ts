/**
 * The shared catalogue of game setups (convex/setups.ts) against the live local backend. What would break: a system
 * setup edited or deleted by anyone (admins included) or drifting from the code, a setup hidden from other humans (they
 * are shared), a human changing or deleting another's, a copy named wrongly or colliding with one of the duplicator's
 * names, a read-only credential writing, an incomplete or unplayable setup stored, or a new room not running First steps.
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SEED_SETUPS, SETUP_NAME_MAX, isLabSeedId, seedSetupSettings } from "@workspace/game-core";
import { admin, api, clientFor, envelope, gods, internal, playerClient, raw, roomWith, setupEntries, startGame, touch, waitFor, type God } from "./game-helpers.ts";

async function errorOf(promise: Promise<unknown>): Promise<{ code?: string; message?: string }> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string; message?: string } }).data ?? { message: (error as Error).message }; }
  return { code: "no error" };
}
const errorCode = async (promise: Promise<unknown>) => (await errorOf(promise)).code ?? "untyped";
/** An admin: a verified ADMIN_EMAILS address on the test-only "fake" provider (scripts/dev.mjs). */
async function adminGod(name: string): Promise<God> {
  const subject = `test|${randomUUID()}`;
  const sid = await admin.mutation(internal.testing.seedUser, { subject, name, email: "admin@example.test", emailVerified: true, provider: "fake" });
  return { subject, name, sid, c: clientFor(subject, "browser", { sessionId: sid }) };
}
type Setup = { id: string; name: string; summary: string; settings: Record<string, unknown>; system: boolean; seedId?: string; ownerName: string; mine: boolean; editable: boolean };
/** The catalogue as the Setup list shows it: every page (setups.page), each entry's row (setups.row); no settings (`get` has them). */
async function list(g: God): Promise<Omit<Setup, "settings">[]> {
  const entries = await setupEntries(g.c), rows: Omit<Setup, "settings">[] = [];
  // Ten at a time, as a list's visible rows would: a shared local backend times out on hundreds at once.
  for (let i = 0; i < entries.length; i += 10) rows.push(...await Promise.all(entries.slice(i, i + 10).map(e => g.c.query(api.setups.row, { setupId: e.id }))));
  return rows;
}
const get = (g: God, setupId: string): Promise<Setup> => g.c.query(api.setups.get, { setupId });
const classic = () => seedSetupSettings("grid-classic");
/** The system setups everyone sees, and the Lab ones only administrators do (game-core isLabSeedId). */
const ORDINARY = SEED_SETUPS.filter(s => !isLabSeedId(s.seedId)), LAB = SEED_SETUPS.filter(s => isLabSeedId(s.seedId));

before(async () => { await admin.mutation(internal.testing.resetSeedSetups, {}); });
after(async () => { await admin.mutation(internal.testing.resetSeedSetups, {}); });

test("system setups: seeded once in the shipped order, owned by the system, and kept equal to the code", async () => {
  await admin.mutation(internal.setups.ensureSeeded, {});
  await admin.mutation(internal.setups.ensureSeeded, {});
  const [ann] = await gods("Seed Ann");
  const system = (await list(ann)).filter(r => r.system);
  assert.deepEqual(system.map(d => d.seedId), ORDINARY.map(s => s.seedId), "each ordinary seed exactly once, in order, first (no Lab setup)");
  const [root] = [await adminGod("Seed Admin")];
  assert.deepEqual((await list(root)).filter(r => r.system).map(d => d.seedId), SEED_SETUPS.map(s => s.seedId), "an administrator: every seed once, in order");
  assert.deepEqual(system.map(d => d.name), ["First steps", "Annotated basics", "Annotated colours", "Classic", "Low income", "Big board", "Master"]);
  for (const d of system) {
    assert.ok(!("settings" in d), "a list row has no settings");
    assert.deepEqual((await get(ann, d.id)).settings, seedSetupSettings(d.seedId!), `${d.name}: the complete shipped settings`);
    assert.deepEqual([d.ownerName, d.mine, d.editable], ["System", false, false]);
  }
  // A stored seed that drifted (an admin edit from before setups were immutable, or older settings) is put back.
  const big = system.find(d => d.seedId === "grid-big")!;
  await admin.mutation(internal.testing.makeLegacy, { setupId: big.id as never, settings: { ...seedSetupSettings("grid-big"), planningSeconds: 999 } });
  await admin.mutation(internal.setups.ensureSeeded, {});
  assert.deepEqual((await get(ann, big.id)).settings, seedSetupSettings("grid-big"));
});

test("nobody edits or deletes a system setup, admins and owner credentials included: they duplicate it", { timeout: 60_000 }, async () => {
  const root = await adminGod("Setup Admin");
  const master = (await list(root)).find(r => r.seedId === "grid-master")!;
  assert.equal(master.editable, false, "not even for an admin");
  const edit = await errorOf(root.c.action(api.setups.save, { setupId: master.id, name: "Master", settings: seedSetupSettings("grid-master") }));
  assert.deepEqual([edit.code, edit.message], ["FORBIDDEN", "System setups cannot be edited: duplicate it"]);
  assert.equal(await errorCode(root.c.mutation(api.setups.remove, { setupId: master.id })), "FORBIDDEN");
  const { roomId } = await roomWith([root]);
  const app = await playerClient(root, roomId, "owner");
  assert.equal(await errorCode(app.action(api.setups.save, { setupId: master.id, name: "Master", settings: seedSetupSettings("grid-master") })), "FORBIDDEN");
  assert.deepEqual((await get(root, master.id)).settings, seedSetupSettings("grid-master"), "unchanged");
});

test("everyone sees every setup with its owner; only the owner changes or deletes it; read credentials only read", { timeout: 60_000 }, async () => {
  const [ann, bob] = await gods("Owner Ann", "Other Bob");
  const quick = { ...classic(), planningSeconds: 30 };
  const saved: Setup = await ann.c.action(api.setups.save, { name: "  Quick   classic ", settings: quick });
  assert.deepEqual([saved.name, saved.ownerName, saved.mine, saved.editable, saved.system], ["Quick classic", "Owner Ann", true, true, false], "the name is trimmed");
  assert.match(saved.summary, /Grid 5×5/);
  const seenByBob = (await list(bob)).find(r => r.id === saved.id);
  assert.deepEqual([seenByBob?.ownerName, seenByBob?.mine, seenByBob?.editable], ["Owner Ann", false, false], "shared, but not Bob's");
  assert.deepEqual((await get(bob, saved.id)).settings, quick, "and its settings");
  assert.equal(await errorCode(bob.c.query(api.setups.get, { setupId: "nope" })), "NOT_FOUND");
  const annRows = await list(ann);
  assert.ok(annRows.findIndex(r => r.id === saved.id) >= ORDINARY.length, "after the system's");

  // Bob may not change or delete Ann's setup, and is told whose it is.
  const edit = await errorOf(bob.c.action(api.setups.save, { setupId: saved.id, name: "Mine now", settings: quick }));
  assert.deepEqual([edit.code, edit.message], ["FORBIDDEN", "Only Owner Ann can edit this setup: duplicate it"]);
  assert.equal(await errorCode(bob.c.mutation(api.setups.remove, { setupId: saved.id })), "FORBIDDEN");
  assert.equal(await errorCode(bob.c.mutation(api.setups.remove, { setupId: "not-an-id" })), "NOT_FOUND");

  // Names: 1–40 characters, unique among one's own (edit by id instead); another human may use the same name.
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "QUICK CLASSIC", settings: quick })), "CONFLICT");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "   ", settings: quick })), "BAD_REQUEST");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "x".repeat(41), settings: quick })), "BAD_REQUEST");
  const bobs: Setup = await bob.c.action(api.setups.save, { name: "Quick classic", settings: quick });
  // Settings: complete, valid, a playable shape (3×3 is retired) and within the server's limits; defence goals need one allowed family.
  const { languages: _l, ...incomplete } = quick;
  assert.match((await errorOf(ann.c.action(api.setups.save, { name: "Partial", settings: incomplete }))).message ?? "", /missing: languages/);
  for (const languages of [[], ["cobol"], ["python", "python"]]) {
    assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "Languages", settings: { ...quick, languages } })), "BAD_REQUEST", JSON.stringify(languages));
  }
  // A setup in the old single-language shape is saved as that one language.
  const single: Setup = await ann.c.action(api.setups.save, { name: "Single language", settings: {
    ...incomplete, language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform" } });
  assert.deepEqual(single.settings, { ...quick, languages: ["typescript"] });
  await ann.c.mutation(api.setups.remove, { setupId: single.id });
  assert.match((await errorOf(ann.c.action(api.setups.save, { name: "Extra", settings: { ...quick, colour: "red" } }))).message ?? "", /Unknown settings: colour/);
  assert.match((await errorOf(ann.c.action(api.setups.save, { name: "Old", settings: { ...quick, defenceRate: 0 } }))).message ?? "", /Unknown settings: defenceRate/);
  assert.match((await errorOf(ann.c.action(api.setups.save, { name: "Odd board", settings: { ...quick, typeArgs: { size: 3, symbols: "base10", colours: "rgb" } } }))).message ?? "", /not playable|retired/);
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "Negative", settings: { ...quick, planningSeconds: -1 } })), "BAD_REQUEST");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "Huge", settings: { ...quick, startingObjectCount: 5000 } })), "BAD_REQUEST");
  assert.equal(await errorCode(ann.c.action(api.setups.save, { name: "Mixed", settings: { ...quick, grammarId: "typescript-agent-v1" } })), "BAD_REQUEST");
  const hates = ["hate_colour", "hate_value", "hate_blob", "hate_takeover", "hate_big_blob", "hate_same_corners", "hate_repeat_row", "hate_symbol_takeover"];
  const noDefence = await errorOf(ann.c.action(api.setups.save, { name: "No defence left", settings: { ...quick, defenceGoals: true, excludedDefenceFamilies: hates } }));
  assert.deepEqual([noDefence.code, noDefence.message], ["BAD_REQUEST", "Defence goals need at least one defence goal allowed in this world"]);
  const oneLeft: Setup = await ann.c.action(api.setups.save, { name: "One defence", settings: { ...quick, defenceGoals: true, excludedDefenceFamilies: hates.slice(1) } });
  await ann.c.mutation(api.setups.remove, { setupId: oneLeft.id });

  // Edit (rename too) by id.
  const over: Setup = await ann.c.action(api.setups.save, { setupId: saved.id, name: "Quick classic 2", settings: { ...quick, planningSeconds: 45 } });
  assert.equal(over.id, saved.id);
  assert.deepEqual((await list(ann)).filter(r => r.mine).map(r => r.name), ["Quick classic 2"]);
  assert.equal((await get(ann, saved.id)).settings.planningSeconds, 45);

  // Credentials: read lists only; act may save, duplicate and remove (setups belong to the human, across rooms).
  const { roomId } = await roomWith([ann]);
  const reader = await playerClient(ann, roomId, "read");
  assert.ok((await setupEntries(reader)).some((r: Setup) => r.id === saved.id));
  assert.equal(await errorCode(reader.action(api.setups.save, { name: "From a reader", settings: quick })), "FORBIDDEN");
  assert.equal(await errorCode(reader.mutation(api.setups.duplicate, { setupId: saved.id })), "FORBIDDEN");
  assert.equal(await errorCode(reader.mutation(api.setups.remove, { setupId: saved.id })), "FORBIDDEN");
  const actor = await playerClient(ann, roomId, "act");
  const fromApp: Setup = await actor.action(api.setups.save, { name: "From my app", settings: quick });
  assert.equal(fromApp.mine, true);

  await ann.c.mutation(api.setups.remove, { setupId: saved.id });
  await actor.mutation(api.setups.remove, { setupId: fromApp.id });
  await bob.c.mutation(api.setups.remove, { setupId: bobs.id });
  assert.equal(await errorCode(ann.c.mutation(api.setups.remove, { setupId: saved.id })), "NOT_FOUND", "gone");
  assert.ok(!(await list(bob)).some(r => r.id === saved.id), "gone for everyone");
});

// What would break: the Setup list reading the whole catalogue (a page is at most 50), losing its order across pages (the
// system's first in seed order, then everyone's by name, case and accents folded), a search missing a setup by its name,
// owner or summary, or a row without its owner's name.
test("the catalogue pages in order, at most 30 a page; search finds by name, owner and summary; a row has its owner", { timeout: 60_000 }, async () => {
  const [ann, bob] = await gods("Pager Ann", `Pager Bob ${randomUUID().slice(0, 6)}`);
  const tag = randomUUID().slice(0, 8);
  const names = [`zz ${tag} b`, `ZZ ${tag} a`, `zz ${tag} Äc`];
  const made: Setup[] = [];
  for (const name of names) made.push(await bob.c.action(api.setups.save, { name, settings: classic(), summary: `Pager summary ${tag}` }));
  const first = await ann.c.query(api.setups.page, { paginationOpts: { numItems: 500, cursor: null } });
  assert.ok(first.page.length <= 30, "a page holds at most 30 (a page of setups with their settings stays within 64 KiB)");
  const all = await setupEntries(ann.c);
  assert.deepEqual(all.slice(0, ORDINARY.length).map(e => e.seedId), ORDINARY.map(s => s.seedId), "the system's first, in seed order");
  const others = all.slice(ORDINARY.length);
  assert.ok(others.every(e => !e.system), "then everyone's");
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  others.forEach((e, i) => { if (i) assert.ok(fold(others[i - 1].name) <= fold(e.name), `by name: ${others[i - 1].name} before ${e.name}`); });
  assert.deepEqual(others.filter(e => e.name.includes(tag)).map(e => e.name), [`ZZ ${tag} a`, `zz ${tag} Äc`, `zz ${tag} b`], "case and accents folded");
  assert.ok(all.every(e => !("settings" in e) && !("ownerName" in e)), "an entry carries no settings and no owner: its row has the owner");
  // Search: by a word of the name, of the owner's name or of the summary.
  const found = async (q: string) => (await setupEntries(ann.c, q)).filter(e => e.name.includes(tag)).length;
  assert.equal(await found(tag), 3, "by name");
  assert.equal(await found(bob.name.split(" ").at(-1)!), 3, "by owner");
  assert.equal(await found(`Pager summary ${tag}`), 3, "by summary");
  assert.deepEqual((await setupEntries(ann.c, "Annotated basics")).map(e => e.seedId)[0], "grid-annotated-basics", "a system setup by name, best first");
  // A row: what the list shows, with the owner's name; null once deleted.
  const row = await ann.c.query(api.setups.row, { setupId: made[0].id });
  assert.deepEqual([row.name, row.ownerName, row.mine, row.editable, row.system], [names[0], bob.name, false, false, false]);
  for (const s of made) await bob.c.mutation(api.setups.remove, { setupId: s.id });
  assert.equal(await ann.c.query(api.setups.row, { setupId: made[0].id }), null);
  assert.equal(await ann.c.query(api.setups.row, { setupId: "nope" }), null);
  // uniqueName: a new setup takes the first free name instead of CONFLICT.
  const kept: Setup = await bob.c.action(api.setups.save, { name: `Kept ${tag}`, settings: classic() });
  const again: Setup = await bob.c.action(api.setups.save, { name: `Kept ${tag}`, settings: classic(), uniqueName: true });
  assert.equal(again.name, `Kept ${tag} 2`);
  for (const s of [kept, again]) await bob.c.mutation(api.setups.remove, { setupId: s.id });
});

test("duplicate: any setup becomes the duplicator's own \"<name>'s copy\", deduplicated among theirs and within 40 characters", { timeout: 60_000 }, async () => {
  const [ann, bob] = await gods("Copy Ann", "Copy Bob");
  const classicRow = (await list(ann)).find(r => r.seedId === "grid-classic")!;
  const first: Setup = await ann.c.mutation(api.setups.duplicate, { setupId: classicRow.id });
  assert.deepEqual([first.name, first.ownerName, first.mine, first.editable, first.system], ["Classic's copy", "Copy Ann", true, true, false]);
  assert.deepEqual(first.settings, seedSetupSettings("grid-classic"), "starting from the duplicated setup's values");
  assert.equal(first.summary, classicRow.summary);
  const second: Setup = await ann.c.mutation(api.setups.duplicate, { setupId: classicRow.id });
  const third: Setup = await ann.c.mutation(api.setups.duplicate, { setupId: classicRow.id });
  assert.deepEqual([second.name, third.name], ["Classic's copy 2", "Classic's copy 3"]);
  // Another human's names do not count; another human's setup can be copied too.
  const bobsCopy: Setup = await bob.c.mutation(api.setups.duplicate, { setupId: first.id });
  assert.equal(bobsCopy.name, "Classic's copy's copy");
  assert.equal((await bob.c.mutation(api.setups.duplicate, { setupId: classicRow.id })).name, "Classic's copy");
  // A long name is shortened so "'s copy" (and " 2") still fit.
  const long: Setup = await ann.c.action(api.setups.save, { name: "L".repeat(SETUP_NAME_MAX), settings: classic() });
  const longCopy: Setup = await ann.c.mutation(api.setups.duplicate, { setupId: long.id });
  const longCopy2: Setup = await ann.c.mutation(api.setups.duplicate, { setupId: long.id });
  assert.deepEqual([longCopy.name, longCopy2.name], [`${"L".repeat(SETUP_NAME_MAX - 7)}'s copy`, `${"L".repeat(SETUP_NAME_MAX - 9)}'s copy 2`]);
  // An explicit name is used as given (deduplicated the same way).
  assert.equal((await ann.c.mutation(api.setups.duplicate, { setupId: classicRow.id, name: "Classic's copy" })).name, "Classic's copy 4");
  assert.equal(await errorCode(ann.c.mutation(api.setups.duplicate, { setupId: "nope" })), "NOT_FOUND");
});

test("a new room runs the system's Annotated basics; owner.settings applies anyone's setup and names it in the room", { timeout: 60_000 }, async () => {
  const [host, ada] = await gods("Setup Host", "Setup Ada");
  await touch(host);
  const { roomId, shortCode } = await roomWith([host]);
  await ada.c.mutation(api.rooms.join, { room: shortCode });
  const setups = await list(host);
  const first = setups.find(r => r.seedId === "grid-annotated-basics")!, master = setups.find(r => r.seedId === "grid-master")!;
  let room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual(room.settings, seedSetupSettings("grid-annotated-basics"));
  assert.deepEqual(room.setup, { id: first.id, name: "Annotated basics", deleted: false });

  // Ada's setup, in another language: applied whole by the room's owner (setups are shared).
  const adas: Setup = await ada.c.action(api.setups.save, { name: "TypeScript Master", settings: {
    ...seedSetupSettings("grid-master"), languages: ["typescript"], planningSeconds: 300 } });
  const applied = await host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: adas.id });
  assert.equal(applied.setup.created, false);
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([room.settings, room.setup], [adas.settings, { id: adas.id, name: "TypeScript Master", deleted: false }]);
  await host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: master.id });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([room.settings, room.setup], [seedSetupSettings("grid-master"), { id: master.id, name: "Master", deleted: false }]);
  assert.equal(await errorCode(host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: master.id, settings: { planningSeconds: 5 } })), "BAD_REQUEST",
    "a setup or settings, not both");
  assert.equal(await errorCode(host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: "not-an-id" })), "NOT_FOUND");
  // A setup applied and later deleted: the room keeps its snapshot and shows the setup as deleted.
  await host.c.action(api.owner.settings, { roomId, revision: room.revision, setupId: adas.id });
  await ada.c.mutation(api.setups.remove, { setupId: adas.id });
  room = await ada.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([room.settings, room.setup], [adas.settings, { id: adas.id, name: "TypeScript Master", deleted: true }]);
});

// What would break: an ordinary player finding an experiment in the Setup list, its search or an agent's list_setups,
// or running one by its id (duplicating it, putting a room on it); an administrator missing one; a Lab setup that is
// not Annotated basics under its cost model; or a room on "multiply and divide" without those helpers or priced as
// another model.
test("Lab setups: only an administrator finds, duplicates or runs them; a room on lab-cost-multiply has multiply and divide and is charged by that model", { timeout: 420_000 }, async () => {
  await admin.mutation(internal.setups.ensureSeeded, {});
  const root = await adminGod("Lab Admin");
  const [ann, bo, cy] = await gods("Lab Ann", "Lab Bo", "Lab Cy");
  const labIds = ["lab-cost-set", "lab-cost-dial", "lab-cost-log", "lab-cost-multiply"];
  assert.deepEqual(LAB.map(s => s.seedId), labIds);
  const seeds = (entries: any[]) => entries.filter(e => e.system).map(e => e.seedId);

  // The catalogue (setups.page): the administrator's has all four, after the ordinary ones; a player's has none.
  const rootEntries = await setupEntries(root.c);
  assert.deepEqual(seeds(rootEntries), SEED_SETUPS.map(s => s.seedId));
  assert.deepEqual(rootEntries.filter(e => isLabSeedId(e.seedId)).map(e => e.name), ["Lab: flat price", "Lab: dial numbers", "Lab: gentle distance", "Lab: multiply and divide"]);
  assert.deepEqual(seeds(await setupEntries(ann.c)), ORDINARY.map(s => s.seedId));
  // A short first page keeps its cursor: the player's next pages follow on (everyone's setups, no Lab one).
  const firstPage = await ann.c.query(api.setups.page, { paginationOpts: { numItems: ORDINARY.length + 2, cursor: null } });
  assert.deepEqual(firstPage.page.map((e: any) => e.seedId), ORDINARY.map(s => s.seedId), "the two Lab rows of this page are left out");
  if (!firstPage.isDone) {
    const next = await ann.c.query(api.setups.page, { paginationOpts: { numItems: 5, cursor: firstPage.continueCursor } });
    assert.ok(next.page.every((e: any) => !isLabSeedId(e.seedId)));
  }
  // The search, by name and by summary.
  for (const q of ["Lab", "multiply divide", "dial"]) {
    assert.deepEqual((await setupEntries(ann.c, q)).filter(e => isLabSeedId(e.seedId)), [], `a player's search for "${q}"`);
    assert.ok((await setupEntries(root.c, q)).some(e => isLabSeedId(e.seedId)), `an administrator's search for "${q}"`);
  }
  // An agent's list_setups (setups.listAs): by whose credential it is, in any room.
  const { roomId: annRoom } = await roomWith([ann]);
  const { roomId } = await roomWith([root, bo, cy]);
  const listAs = async (god: God, room: string) => (await admin.query(internal.setups.listAs, {
    principal: { credentialId: await admin.mutation(internal.testing.seedCredential, { subject: god.subject, roomId: room, permission: "read" }) } }));
  assert.deepEqual(seeds(await listAs(ann, annRoom)), ORDINARY.map(s => s.seedId));
  assert.deepEqual(seeds(await listAs(bo, roomId)), ORDINARY.map(s => s.seedId), "a player in an administrator's room");
  assert.deepEqual(seeds(await listAs(root, roomId)), SEED_SETUPS.map(s => s.seedId));
  // The same page through a credential (the player app's list_setups): the administrator's own app lists them.
  assert.deepEqual(seeds(await setupEntries(await playerClient(root, roomId, "read"))), SEED_SETUPS.map(s => s.seedId));
  assert.deepEqual(seeds(await setupEntries(await playerClient(bo, roomId, "read"))), ORDINARY.map(s => s.seedId));

  // Each is Annotated basics but for its cost model.
  const { costModel: _basics, ...basics } = seedSetupSettings("grid-annotated-basics");
  const lab = Object.fromEntries(rootEntries.filter(e => isLabSeedId(e.seedId)).map(e => [e.seedId, e.id])) as Record<string, string>;
  const models: Record<string, string | undefined> = {};
  for (const seedId of labIds) {
    const { costModel, ...rest } = (await get(root, lab[seedId])).settings;
    assert.deepEqual(rest, basics, seedId);
    models[seedId] = costModel as string | undefined;
  }
  assert.deepEqual(models, { "lab-cost-set": undefined, "lab-cost-dial": "dial-v1", "lab-cost-log": "log-v1", "lab-cost-multiply": "multiply-v1" });

  // A player who has the id (from a room that runs one) may neither copy it nor put a room on it.
  const multiplyId = lab["lab-cost-multiply"];
  const copy = await errorOf(ann.c.mutation(api.setups.duplicate, { setupId: multiplyId }));
  assert.deepEqual([copy.code, copy.message], ["FORBIDDEN", "Lab setups are for administrators"]);
  const annState = await ann.c.query(api.rooms.get, { room: annRoom });
  const apply = await errorOf(ann.c.action(api.owner.settings, { roomId: annRoom, revision: annState.revision, setupId: multiplyId }));
  assert.deepEqual([apply.code, apply.message], ["FORBIDDEN", "Lab setups are for administrators"]);
  const annAfter = await ann.c.query(api.rooms.get, { room: annRoom });
  assert.deepEqual([annAfter.revision, annAfter.setup.name, annAfter.settings.costModel], [annState.revision, "Annotated basics", "distance-v1"], "the room is unchanged");
  assert.ok(!annAfter.objectInstance.helpers.some((h: any) => h.name.python === "multiply"), "no multiply under distance-v1");

  // The administrator runs one: the room's next game has multiply and divide, and its members see the setup's name.
  await touch(root);
  const before_ = await root.c.query(api.rooms.get, { room: roomId });
  const applied = await root.c.action(api.owner.settings, { roomId, revision: before_.revision, setupId: multiplyId });
  assert.deepEqual([applied.setup.id, applied.setup.name, applied.setup.created], [multiplyId, "Lab: multiply and divide", false]);
  const seenByBo = await bo.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([seenByBo.setup.name, seenByBo.settings.costModel], ["Lab: multiply and divide", "multiply-v1"]);
  const mutators = seenByBo.objectInstance.helpers.filter((h: any) => h.group === "mutator").map((h: any) => h.name.python);
  assert.ok(mutators.includes("multiply") && mutators.includes("divide") && mutators.includes("add"), mutators.join(" "));
  assert.equal((await bo.c.query(api.setups.row, { setupId: multiplyId }))?.name, "Lab: multiply and divide", "a row by id stays readable");
  // The administrator may copy it (the copy is an ordinary setup of theirs).
  const mine: Setup = await root.c.mutation(api.setups.duplicate, { setupId: multiplyId });
  assert.deepEqual([mine.name, mine.system, mine.mine, mine.settings.costModel], ["Lab: multiply and divide's copy", false, true, "multiply-v1"]);
  await root.c.mutation(api.setups.remove, { setupId: mine.id });

  // Charged by multiply-v1, by hand (docs/mutation-cost-design.md §0, §4) on the 4×4 numbers board, C = W + 0.05·W²:
  //   add 1:      W = log2 16 cells + 1 bit (add, not multiply) + log2 3 per step = 6.585 → 8.75 (7.14 under distance-v1)
  //   multiply 3: W = 4 + 1 + 1.4963·log2 3 = 7.372 → 10.09 (never cheaper as an add: 3d − d is never ±1 modulo 10)
  const C = (w: number) => w + 0.05 * w * w, want = { add: C(5 + Math.log2(3)), multiply: C(5 + 1.4963 * Math.log2(3)) };
  assert.deepEqual([want.add.toFixed(2), want.multiply.toFixed(2)], ["8.75", "10.09"]);
  const game = await startGame(root, roomId);
  const send = (god: God, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const adder = await send(root, { type: "summon", name: "Adder", language: "python", source: "def agent(g):\n    return [add((0, 0), 1)]" });
  assert.equal(adder.accepted, true, adder.message);
  const tripler = await send(bo, { type: "summon", name: "Tripler", language: "python", source: "def agent(g):\n    return [multiply((0, 1), 3)]" });
  assert.equal(tripler.accepted, true, tripler.message);
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  const transformsOf = async (god: God) => (await raw(game.gameId)).batches.flatMap((b: any) => b.events).filter((e: any) => e.t === "transform" && e.ownerId === god.subject);
  await waitFor(async () => (await transformsOf(root)).length >= 1 && (await transformsOf(bo)).length >= 1, "both agents change an object", 240_000, 500);
  assert.equal((await raw(game.gameId)).game.settings.costModel, "multiply-v1");
  for (const e of await transformsOf(root)) assert.ok(Math.abs(e.cost.change - want.add) < 1e-3 && e.cost.read === 0, `an add of 1 was charged ${JSON.stringify(e.cost)}, by hand ${want.add}`);
  for (const e of await transformsOf(bo)) assert.ok(Math.abs(e.cost.change - want.multiply) < 5e-3, `a multiply by 3 was charged ${JSON.stringify(e.cost)}, by hand ${want.multiply}`);
  await root.c.mutation(api.rooms.endActiveGame, { roomId });
});
