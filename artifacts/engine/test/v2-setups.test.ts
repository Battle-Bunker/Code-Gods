/**
 * Saved setups (v1's user setups, restored by coordinator's call 35) on the live local backend: a human saves a preset
 * and its overrides under a name, pages and reads them, copies, removes, and applies one to a room they own, whose
 * next game then runs those settings. As in v1 they are shared: anyone lists, reads, copies and applies any setup;
 * only its owner saves over it or removes it.
 *
 * What would break: an override room.settings refuses being saved anyway; a second save under a name making a twin
 * instead of overwriting; another human changing or removing someone's setup, or not seeing it; an applied setup that
 * the next game ignores; a settings change that drops the room's time scale; the per-human cap not holding.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, bo: Human;

before(async () => {
  [ada, bo] = await humans("Setups Ada", "Setups Bo");
});

const failure = async (p: Promise<any>) => {
  try { const out = await p; return out.ok ? "no error" : out.error.code; } catch (e) { return (e as any).data?.error?.code ?? `untyped: ${(e as Error).message}`; }
};

/** Every page of everyone's setups (the shared list, by name), until `setupId` is found. */
async function findShared(h: Human, setupId: string) {
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const r: any = (await perform(h, "setups.page", { limit: 100, ...(cursor ? { cursor } : {}) }, {}, "query")).result;
    const row = r.page.find((x: any) => x.setupId === setupId);
    if (row || r.nextCursor === null) return row;
    cursor = r.nextCursor;
  }
}

test("save, page, get, overwrite by name, duplicate and remove; another human reads and copies, never changes", async () => {
  const saved = await perform(ada, "setups.save", { name: "Quick lines", preset: "lines-beginner", overrides: { planningSeconds: 20, startingEnergy: 120 } });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.result.created, true);
  const { setupId } = saved.result;

  const got = await perform(ada, "setups.get", { setupId }, {}, "query");
  assert.deepEqual({ ...got.result, createdAt: 0, updatedAt: 0 },
    { setupId, name: "Quick lines", preset: "lines-beginner", overrides: { planningSeconds: 20, startingEnergy: 120 }, createdAt: 0, updatedAt: 0, ownerName: "Setups Ada", mine: true });

  // The same name again (any case) overwrites that setup, never a twin.
  const again = await perform(ada, "setups.save", { name: "quick LINES", preset: "lines-beginner", overrides: { planningSeconds: 25 } });
  assert.deepEqual([again.result.setupId, again.result.created, again.result.name], [setupId, false, "quick LINES"]);
  assert.deepEqual((await perform(ada, "setups.get", { setupId }, {}, "query")).result.overrides, { planningSeconds: 25 });

  // By id: renames it.
  await perform(ada, "setups.save", { setupId, name: "Quick lines", preset: "lines-beginner", overrides: { planningSeconds: 20, startingEnergy: 120 } });
  await perform(ada, "setups.save", { name: "Another", preset: "lines-beginner" });
  // Renaming onto another of hers is refused (that would make two of one name).
  assert.equal(await failure(perform(ada, "setups.save", { setupId, name: "another", preset: "lines-beginner" })), "failed");

  const copy = await perform(ada, "setups.duplicate", { setupId });
  assert.equal(copy.result.name, "Quick lines's copy");
  assert.equal((await perform(ada, "setups.duplicate", { setupId })).result.name, "Quick lines's copy 2");
  assert.deepEqual((await perform(ada, "setups.get", { setupId: copy.result.setupId }, {}, "query")).result.overrides, { planningSeconds: 20, startingEnergy: 120 });

  const page = await perform(ada, "setups.page", { mine: true }, {}, "query");
  assert.deepEqual(page.result.page.map((r: any) => r.name), ["Another", "Quick lines", "Quick lines's copy", "Quick lines's copy 2"], "by name");
  assert.equal(page.result.nextCursor, null);
  assert.deepEqual(page.result.page.map((r: any) => [r.ownerName, r.mine]), page.result.page.map(() => ["Setups Ada", true]));
  const first = await perform(ada, "setups.page", { mine: true, limit: 2 }, {}, "query");
  const rest = await perform(ada, "setups.page", { mine: true, limit: 2, cursor: first.result.nextCursor }, {}, "query");
  assert.equal(rest.ok, true, JSON.stringify(rest));
  assert.deepEqual([...first.result.page, ...rest.result.page].map((r: any) => r.name), page.result.page.map((r: any) => r.name));

  // The live queries the app subscribes to answer the same.
  const skeleton = await ada.query("v2/setups:mine", { paginationOpts: { numItems: 10, cursor: null } });
  assert.deepEqual(skeleton.page.map((r: any) => r.setupId), page.result.page.map((r: any) => r.setupId));
  assert.equal((await ada.query("v2/setups:get", { setupId })).name, "Quick lines");

  // Bo: none of his own yet, but Ada's are in the shared list, readable and copyable, never his to change.
  assert.deepEqual((await perform(bo, "setups.page", { mine: true }, {}, "query")).result.page, []);
  assert.deepEqual((await bo.query("v2/setups:mine", { paginationOpts: { numItems: 10, cursor: null } })).page, []);
  assert.deepEqual(await findShared(bo, setupId), { setupId, name: "Quick lines", preset: "lines-beginner", updatedAt: (await findShared(ada, setupId)).updatedAt, ownerName: "Setups Ada", mine: false });
  const shared = await bo.query("v2/setups:shared", { paginationOpts: { numItems: 100, cursor: null } });
  assert.ok(shared.page.length > 0 && shared.page.every((r: any, i: number) => i === 0 || r.name.toLowerCase() >= shared.page[i - 1].name.toLowerCase()), "the shared list is by name");
  assert.equal((await bo.query("v2/setups:get", { setupId })).name, "Quick lines");
  assert.equal((await perform(bo, "setups.get", { setupId }, {}, "query")).result.mine, false);
  const bos = await perform(bo, "setups.duplicate", { setupId });
  assert.equal(bos.ok, true, JSON.stringify(bos));
  const bosCopy = (await perform(bo, "setups.get", { setupId: bos.result.setupId }, {}, "query")).result;
  assert.deepEqual([bosCopy.name, bosCopy.ownerName, bosCopy.mine, bosCopy.overrides], ["Quick lines's copy", "Setups Bo", true, { planningSeconds: 20, startingEnergy: 120 }]);
  assert.equal(await failure(perform(bo, "setups.remove", { setupId })), "failed");
  assert.equal(await failure(perform(bo, "setups.save", { setupId, name: "Mine now", preset: "lines-beginner" })), "failed");
  assert.equal((await perform(ada, "setups.get", { setupId }, {}, "query")).result.name, "Quick lines", "untouched");
  // Bo's own setup of the same name is his, apart from Ada's.
  assert.equal((await perform(bo, "setups.save", { name: "Quick lines", preset: "lines-beginner" })).result.created, true);

  assert.equal((await perform(ada, "setups.remove", { setupId: copy.result.setupId })).ok, true);
  assert.equal(await failure(perform(ada, "setups.get", { setupId: copy.result.setupId }, {}, "query")), "failed");
  assert.equal((await perform(ada, "setups.page", { mine: true }, {}, "query")).result.page.length, 3);
});

test("what room.settings refuses, a save refuses too", async () => {
  for (const args of [
    { name: "Bad preset", preset: "nope" },
    { name: "Bad planning", preset: "lines-beginner", overrides: { planningSeconds: 1 } },
    { name: "Bad noise", preset: "lines-beginner", overrides: { peerNoiseVariance: 5 } },
    { name: "Unknown field", preset: "lines-beginner", overrides: { colour: "red" } },
    { name: "Time scale is not offered", preset: "lines-beginner", overrides: { timeScale: 10 } },
    { name: "", preset: "lines-beginner" },
    { name: "x".repeat(41), preset: "lines-beginner" },
  ]) {
    const code = await failure(perform(bo, "setups.save", args));
    assert.ok(code === "invalid_args" || code === "failed", `${JSON.stringify(args)}: ${code}`);
  }
  assert.equal((await perform(bo, "setups.page", { mine: true }, {}, "query")).result.page.some((r: any) => !["Quick lines", "Quick lines's copy"].includes(r.name)), false, "nothing invalid was stored");
});

test("applying a setup to a room: the room's owner, anyone's setup; the next game runs it; the time scale stays", { timeout: 120_000 }, async () => {
  const [cy, di] = await humans("Setups Cy", "Setups Di");
  const created = await perform(cy, "room.create", { name: "Setups room" });
  const { roomId, code } = created.result;
  await perform(di, "room.join", { code });
  const mine = await perform(cy, "setups.save", { name: "Slow start", preset: "lines-beginner", overrides: { planningSeconds: 45, startingEnergy: 140 } });
  const dis = await perform(di, "setups.save", { name: "Di's", preset: "lines-beginner", overrides: { planningSeconds: 60 } });

  assert.equal(await failure(perform(di, "room.settings", { setupId: dis.result.setupId }, { roomId })), "refused", "only the room's owner");
  assert.equal(await failure(perform(cy, "room.settings", { setupId: "no-such-setup" }, { roomId })), "failed", "an existing setup");
  // Anyone's setup (v1): Cy applies Di's, then his own.
  assert.equal((await perform(cy, "room.settings", { setupId: dis.result.setupId }, { roomId })).ok, true);
  assert.deepEqual((await cy.query("v2/rooms:get", { roomId })).overrides, { planningSeconds: 60 });
  assert.equal(await failure(perform(cy, "room.settings", { setupId: mine.result.setupId, preset: "lines-beginner" }, { roomId })), "failed", "a setup or settings, not both");

  assert.equal((await perform(cy, "room.settings", { setupId: mine.result.setupId }, { roomId })).ok, true);
  let room = await cy.query("v2/rooms:get", { roomId });
  assert.deepEqual([room.preset, room.overrides, room.setup], ["lines-beginner", { planningSeconds: 45, startingEnergy: 140 }, { setupId: mine.result.setupId, name: "Slow start" }]);

  // The room keeps what it applied: a later change to the setup does not reach it.
  await perform(cy, "setups.save", { name: "Slow start", preset: "lines-beginner", overrides: { planningSeconds: 90 } });
  assert.deepEqual((await cy.query("v2/rooms:get", { roomId })).overrides, { planningSeconds: 45, startingEnergy: 140 });

  await perform(cy, "seats.fillPracticePartners", {}, { roomId });
  const started = await perform(cy, "game.start", {}, { roomId });
  assert.equal(started.ok, true, JSON.stringify(started));
  const { gameId } = started.result;
  assert.equal((await cy.query("v2/games:header", { gameId })).planningSeconds, 45);
  assert.equal((await cy.query("v2/playState:me", { gameId })).energy, 140);
  await perform(cy, "game.end", {}, { gameId });

  // A change by hand afterwards leaves the setup behind.
  await perform(cy, "room.settings", { overrides: { planningSeconds: 30 } }, { roomId });
  room = await cy.query("v2/rooms:get", { roomId });
  assert.equal(room.setup, null);

  // A playtest room's time scale (decision 37, set by an admin, never offered in room.settings) survives every save.
  await admin.mutation("v2/lobby:setTimeScale", { roomId, factor: 10 });
  await perform(cy, "room.settings", { overrides: { planningSeconds: 40 } }, { roomId });
  assert.deepEqual((await cy.query("v2/rooms:get", { roomId })).overrides, { planningSeconds: 40, timeScale: 10 });
  await perform(cy, "room.settings", { setupId: mine.result.setupId }, { roomId });
  assert.deepEqual((await cy.query("v2/rooms:get", { roomId })).overrides, { planningSeconds: 90, timeScale: 10 });
  await perform(cy, "room.settings", { preset: "lines-beginner", overrides: {} }, { roomId });
  assert.deepEqual((await cy.query("v2/rooms:get", { roomId })).overrides, { timeScale: 10 });
});

test("each human keeps at most 50 setups", { timeout: 120_000 }, async () => {
  const [eve] = await humans("Setups Eve");
  for (let i = 0; i < 50; i++) await perform(eve, "setups.save", { name: `Setup ${i}`, preset: "lines-beginner" });
  assert.equal(await failure(perform(eve, "setups.save", { name: "One too many", preset: "lines-beginner" })), "failed");
  assert.equal(await failure(perform(eve, "setups.duplicate", { setupId: (await perform(eve, "setups.page", { mine: true, limit: 1 }, {}, "query")).result.page[0].setupId })), "failed");
  // Overwriting one by name still works at the cap.
  assert.equal((await perform(eve, "setups.save", { name: "Setup 0", preset: "lines-beginner", overrides: { planningSeconds: 30 } })).result.created, false);
});

test("the setup picker's search (v1's combobox): everyone's setups whose name matches, a page at a time", async () => {
  const tag = `Zebra${Date.now() % 100000}`;
  await perform(ada!, "setups.save", { name: `${tag} slow lines`, preset: "lines-beginner", overrides: { planningSeconds: 120 } });
  await perform(bo!, "setups.save", { name: `${tag} quick grids`, preset: "grids-beginner" });
  const found = async (q: string) => {
    for (let i = 0; i < 20; i++) {
      const r = await ada!.query("v2/setups:search", { q, paginationOpts: { numItems: 20, cursor: null } });
      if (r.page.length) return r.page;
      await new Promise(res => setTimeout(res, 250));   // the search index catches up
    }
    return [];
  };
  const both = await found(tag);
  assert.deepEqual(both.map((r: any) => r.name).sort(), [`${tag} quick grids`, `${tag} slow lines`]);
  const bos = both.find((r: any) => r.name === `${tag} quick grids`);
  assert.deepEqual([bos.ownerName, bos.mine], ["Setups Bo", false]);
  assert.deepEqual((await found(`${tag} quick`)).map((r: any) => r.name)[0], `${tag} quick grids`, "best match first");
});
