/**
 * Saved setups (v1's user setups, restored by coordinator's call 35) on the live local backend: a human saves a preset
 * and its overrides under a name, pages and reads their own, copies, removes, and applies one to a room they own, whose
 * next game then runs those settings.
 *
 * What would break: an override room.settings refuses being saved anyway; a second save under a name making a twin
 * instead of overwriting; another human reading, copying, removing or applying someone's setup; an applied setup that
 * the next game ignores; the per-human cap not holding.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, bo: Human;

before(async () => {
  [ada, bo] = await humans("Setups Ada", "Setups Bo");
});

const failure = async (p: Promise<any>) => {
  try { const out = await p; return out.ok ? "no error" : out.error.code; } catch (e) { return (e as any).data?.error?.code ?? `untyped: ${(e as Error).message}`; }
};

test("save, page, get, overwrite by name, duplicate and remove; another human sees none of it", async () => {
  const saved = await perform(ada, "setups.save", { name: "Quick lines", preset: "lines-beginner", overrides: { planningSeconds: 20, startingEnergy: 120 } });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.result.created, true);
  const { setupId } = saved.result;

  const got = await perform(ada, "setups.get", { setupId }, {}, "query");
  assert.deepEqual({ ...got.result, createdAt: 0, updatedAt: 0 },
    { setupId, name: "Quick lines", preset: "lines-beginner", overrides: { planningSeconds: 20, startingEnergy: 120 }, createdAt: 0, updatedAt: 0 });

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

  const page = await perform(ada, "setups.page", {}, {}, "query");
  assert.deepEqual(page.result.page.map((r: any) => r.name), ["Another", "Quick lines", "Quick lines's copy", "Quick lines's copy 2"], "by name");
  assert.equal(page.result.nextCursor, null);
  const first = await perform(ada, "setups.page", { limit: 2 }, {}, "query");
  const rest = await perform(ada, "setups.page", { limit: 2, cursor: first.result.nextCursor }, {}, "query");
  assert.equal(rest.ok, true, JSON.stringify(rest));
  assert.deepEqual([...first.result.page, ...rest.result.page].map((r: any) => r.name), page.result.page.map((r: any) => r.name));

  // The live queries the app subscribes to answer the same.
  const skeleton = await ada.query("v2/setups:mine", { paginationOpts: { numItems: 10, cursor: null } });
  assert.deepEqual(skeleton.page.map((r: any) => r.setupId), page.result.page.map((r: any) => r.setupId));
  assert.equal((await ada.query("v2/setups:get", { setupId })).name, "Quick lines");

  // Bo: sees none of Ada's, and can do nothing to them.
  assert.deepEqual((await perform(bo, "setups.page", {}, {}, "query")).result.page, []);
  assert.deepEqual((await bo.query("v2/setups:mine", { paginationOpts: { numItems: 10, cursor: null } })).page, []);
  assert.equal(await bo.query("v2/setups:get", { setupId }), null);
  assert.equal(await failure(perform(bo, "setups.get", { setupId }, {}, "query")), "failed");
  assert.equal(await failure(perform(bo, "setups.duplicate", { setupId })), "failed");
  assert.equal(await failure(perform(bo, "setups.remove", { setupId })), "failed");
  assert.equal(await failure(perform(bo, "setups.save", { setupId, name: "Mine now", preset: "lines-beginner" })), "failed");
  // Bo's own setup of the same name is his, apart from Ada's.
  assert.equal((await perform(bo, "setups.save", { name: "Quick lines", preset: "lines-beginner" })).result.created, true);

  assert.equal((await perform(ada, "setups.remove", { setupId: copy.result.setupId })).ok, true);
  assert.equal(await failure(perform(ada, "setups.get", { setupId: copy.result.setupId }, {}, "query")), "failed");
  assert.equal((await perform(ada, "setups.page", {}, {}, "query")).result.page.length, 3);
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
  assert.equal((await perform(bo, "setups.page", {}, {}, "query")).result.page.some((r: any) => r.name !== "Quick lines"), false, "nothing invalid was stored");
});

test("applying a setup to a room: owner only, own setups only; the next game runs it", { timeout: 120_000 }, async () => {
  const [cy, di] = await humans("Setups Cy", "Setups Di");
  const created = await perform(cy, "room.create", { name: "Setups room" });
  const { roomId, code } = created.result;
  await perform(di, "room.join", { code });
  const mine = await perform(cy, "setups.save", { name: "Slow start", preset: "lines-beginner", overrides: { planningSeconds: 45, startingEnergy: 140 } });
  const dis = await perform(di, "setups.save", { name: "Di's", preset: "lines-beginner", overrides: { planningSeconds: 60 } });

  assert.equal(await failure(perform(di, "room.settings", { setupId: dis.result.setupId }, { roomId })), "refused", "only the room's owner");
  assert.equal(await failure(perform(cy, "room.settings", { setupId: dis.result.setupId }, { roomId })), "failed", "only the owner's own setups");
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
  assert.equal((await cy.query("v2/play:me", { gameId })).energy, 140);
  await perform(cy, "game.end", {}, { gameId });

  // A change by hand afterwards leaves the setup behind.
  await perform(cy, "room.settings", { overrides: { planningSeconds: 30 } }, { roomId });
  room = await cy.query("v2/rooms:get", { roomId });
  assert.equal(room.setup, null);
});

test("each human keeps at most 50 setups", { timeout: 120_000 }, async () => {
  const [eve] = await humans("Setups Eve");
  for (let i = 0; i < 50; i++) await perform(eve, "setups.save", { name: `Setup ${i}`, preset: "lines-beginner" });
  assert.equal(await failure(perform(eve, "setups.save", { name: "One too many", preset: "lines-beginner" })), "failed");
  assert.equal(await failure(perform(eve, "setups.duplicate", { setupId: (await perform(eve, "setups.page", { limit: 1 }, {}, "query")).result.page[0].setupId })), "failed");
  // Overwriting one by name still works at the cap.
  assert.equal((await perform(eve, "setups.save", { name: "Setup 0", preset: "lines-beginner", overrides: { planningSeconds: 30 } })).result.created, false);
});
