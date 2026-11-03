/**
 * Spectators (docs/unify-apps-plan.md §2): a room member who watches the next game instead of playing it. The owner
 * starts as one; a member sets it for themselves, the owner for any human; AI seats always play. Only players are
 * dealt in and count toward the 3 to 8. A game's spectators (everyone not dealt in at launch, and whoever joins while it
 * runs) may open it once it is past, like its players.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { api, gods, raw, rejects, sandboxesWarm, startGame, touch, makeAdmin } from "./game-helpers.ts";

const INT_TS = { language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int", spawnRateHz: 0, startingObjectCount: 3, halfLifeSeconds: 100000 };
const roles = async (c: any, roomId: string) => Object.fromEntries((await c.query(api.rooms.get, { room: roomId })).members.map((m: any) => [m.name, m.spectator]));

test("the owner spectates by default; only players are dealt in and count toward three", { timeout: 180000 }, async () => {
  await sandboxesWarm();
  const [host, ada, bo, cy] = await gods("Spec Host", "Spec Ada", "Spec Bo", "Spec Cy");
  await touch(host);
  const { roomId, shortCode } = await host.c.mutation(api.rooms.create, {});
  const room = await host.c.query(api.rooms.get, { room: roomId });
  await host.c.action(api.owner.settings, { roomId, revision: room.revision, settings: INT_TS });
  await ada.c.mutation(api.rooms.join, { room: shortCode });
  await bo.c.mutation(api.rooms.join, { room: shortCode });
  // Catches: the owner seated by default, or a spectator counted toward the minimum.
  assert.deepEqual(await roles(host.c, roomId), { "Spec Host": true, "Spec Ada": false, "Spec Bo": false });
  assert.match(await rejects(host.c.action(api.owner.start, { roomId })), /three players/);

  await cy.c.mutation(api.rooms.join, { room: shortCode });
  const game = await startGame(host, roomId);
  const stored = (await raw(game.gameId)).game;
  assert.deepEqual(stored.roster.map((m: any) => m.id).sort(), [ada.subject, bo.subject, cy.subject].sort(), "the spectating owner is not dealt in");
  assert.deepEqual(stored.spectators, [host.subject]);
  // The owner watches: the spectator's projection (unseated), and still runs the game.
  const seen = await host.c.query(api.player.game, { roomId, gameId: game.gameId });
  assert.equal(seen.seated, false);
  assert.deepEqual((await host.c.query(api.games.header, { code: game.shortCode })).spectators, [host.subject]);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("who may set it: a member for themselves, the owner for any human, never an AI seat; it applies from the next game", { timeout: 180000 }, async () => {
  await sandboxesWarm();
  const [host, ada, bo, cy] = await gods("Set Host", "Set Ada", "Set Bo", "Set Cy");
  await touch(host);
  const { roomId, shortCode } = await host.c.mutation(api.rooms.create, {});
  const room = await host.c.query(api.rooms.get, { room: roomId });
  await host.c.action(api.owner.settings, { roomId, revision: room.revision, settings: INT_TS });
  for (const g of [ada, bo, cy]) await g.c.mutation(api.rooms.join, { room: shortCode });

  // A member for themselves; their ready state goes with it, and a spectator cannot be ready.
  await ada.c.mutation(api.rooms.setReady, { roomId, ready: true });
  await ada.c.mutation(api.rooms.setSpectator, { roomId, spectator: true });
  const adaRow = (await host.c.query(api.rooms.get, { room: roomId })).members.find((m: any) => m.id === ada.subject);
  assert.deepEqual([adaRow.spectator, adaRow.ready], [true, false]);
  assert.match(await rejects(ada.c.mutation(api.rooms.setReady, { roomId, ready: true })), /Spectators have no ready state/);
  // Catches: any member moving another one.
  assert.match(await rejects(bo.c.mutation(api.rooms.setSpectator, { roomId, spectator: false, godId: ada.subject })), /owner/i);
  // The owner for anyone human: themselves and Ada into the game.
  await host.c.mutation(api.rooms.setSpectator, { roomId, spectator: false });
  await host.c.mutation(api.rooms.setSpectator, { roomId, spectator: false, godId: ada.subject });
  assert.deepEqual(await roles(host.c, roomId), { "Set Host": false, "Set Ada": false, "Set Bo": false, "Set Cy": false });
  // AI seats always play (in a room an administrator owns: AI is used only there).
  await makeAdmin(host);
  const { agents } = await host.c.query(api.aiTemplates.catalog, {});
  {
    assert.ok(agents.length, "the AI catalogue is seeded");
    const ai = await host.c.mutation(api.rooms.addAi, { roomId, templateId: agents[0].id });
    assert.match(await rejects(host.c.mutation(api.rooms.setSpectator, { roomId, spectator: true, godId: ai.godId })), /AI seats always play/);
    await host.c.mutation(api.rooms.removeAi, { roomId, godId: ai.godId });
  }

  // During a game the choice is recorded for the next one; the running roster never changes.
  const game = await startGame(host, roomId);
  await cy.c.mutation(api.rooms.setSpectator, { roomId, spectator: true });
  assert.ok((await raw(game.gameId)).game.roster.some((m: any) => m.id === cy.subject), "Cy still plays this game");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const next = await startGame(host, roomId);
  const stored = (await raw(next.gameId)).game;
  assert.ok(!stored.roster.some((m: any) => m.id === cy.subject), "Cy watches the next one");
  assert.deepEqual(stored.spectators, [cy.subject]);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("a game's spectators, mid-game joiners included, open it once it is past; a later member does not", { timeout: 240000 }, async () => {
  await sandboxesWarm();
  const [host, ada, bo, cy, dee, eve] = await gods("Past Host", "Past Ada", "Past Bo", "Past Cy", "Past Dee Midgame", "Past Eve Later");
  await touch(host);
  const { roomId, shortCode } = await host.c.mutation(api.rooms.create, {});
  const room = await host.c.query(api.rooms.get, { room: roomId });
  await host.c.action(api.owner.settings, { roomId, revision: room.revision, settings: INT_TS });
  for (const g of [ada, bo, cy]) await g.c.mutation(api.rooms.join, { room: shortCode });
  await host.c.mutation(api.rooms.setSpectator, { roomId, spectator: true, godId: cy.subject });
  await host.c.mutation(api.rooms.setSpectator, { roomId, spectator: false });
  const game1 = await startGame(host, roomId);
  // Dee joins while game 1 runs: she watches it.
  await dee.c.mutation(api.rooms.join, { room: shortCode });
  assert.deepEqual([...(await raw(game1.gameId)).game.spectators].sort(), [cy.subject, dee.subject].sort());
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  // Eve joins between games; game 2 makes game 1 historic.
  await eve.c.mutation(api.rooms.join, { room: shortCode });
  await host.c.mutation(api.rooms.setSpectator, { roomId, spectator: true, godId: dee.subject });
  await host.c.mutation(api.rooms.setSpectator, { roomId, spectator: true, godId: eve.subject });
  await startGame(host, roomId);

  for (const watcher of [cy, dee]) {
    assert.equal((await watcher.c.query(api.player.game, { roomId, gameId: game1.gameId })).id, game1.gameId, `${watcher.name} opens the past game`);
    const replay = await watcher.c.query(api.player.replay, { roomId, gameId: game1.gameId });
    assert.ok(replay.batches.length > 0, `${watcher.name} opens its replay`);
  }
  // Catches: the past-game rule opened to every member.
  assert.match(await rejects(eve.c.query(api.player.game, { roomId, gameId: game1.gameId })), /played in it or watched it/);
  assert.match(await rejects(eve.c.query(api.player.replay, { roomId, gameId: game1.gameId })), /played in it or watched it/);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("eight players fill the next game; more members join as spectators", { timeout: 120000 }, async () => {
  const [host, ...rest] = await gods("Cap Host", "Cap 1", "Cap 2", "Cap 3", "Cap 4", "Cap 5", "Cap 6", "Cap 7", "Cap 8", "Cap 9");
  const { roomId, shortCode } = await host.c.mutation(api.rooms.create, {});
  for (const g of rest.slice(0, 8)) await g.c.mutation(api.rooms.join, { room: shortCode });
  // The spectating owner is not one of the eight; a ninth player is refused, a ninth spectator is not.
  assert.match(await rejects(rest[8].c.mutation(api.rooms.join, { room: shortCode })), /eight players; join as a spectator/);
  await rest[8].c.mutation(api.rooms.join, { room: shortCode, spectator: true });
  assert.match(await rejects(host.c.mutation(api.rooms.setSpectator, { roomId, spectator: false })), /already has eight players/);
  assert.equal((await host.c.query(api.rooms.get, { room: roomId })).members.length, 10);
});
