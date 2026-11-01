/**
 * Historic games (the player client's /client/rooms/:room/games/:game read-only mode): a room's ended game that is no
 * longer its current game is readable only by the gods who played in it and the room's owner. The engine enforces this
 * on every per-game read (player.game, player.history, player.events, player.trajectories), never the UI; what the
 * participant gets discloses nothing another god's live projection would not.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, gods, internal, playerClient, raw, rejects, roomWith, startGame, touch } from "./game-helpers.ts";
import { disclosureChecker } from "./disclosure.ts";

const INT_TS = { language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int", spawnRateHz: 0, startingObjectCount: 3, halfLifeSeconds: 100000 };

test("a historic game opens read-only for its participants and the owner, and for nobody else", { timeout: 180000 }, async () => {
  const [host, ada, bo, cy] = await gods("Historic Host", "Historic Ada", "Historic Bo", "Historic Cy Latecomer");
  await touch(host);
  const { roomId, shortCode } = await roomWith([host, ada, bo], INT_TS);
  const game1 = await startGame(host, roomId);
  const SECRET = "historic_bo_marker";
  const summon = await bo.c.action(api.commands.submit, { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), gameId: game1.gameId,
    command: { type: "summon", language: "typescript", source: `function agent(n) { const ${SECRET} = 1; return [add(${SECRET})]; }` } } });
  assert.equal(summon.accepted, true, summon.message);
  // Cy joins mid-game: a member who never plays game 1.
  await cy.c.mutation(api.rooms.join, { room: shortCode });

  // While game 1 is the room's current game (live, then ended until the next launch), every member reads it.
  const live = await cy.c.query(api.player.game, { roomId, gameId: game1.gameId });
  assert.equal(live.status, "active");
  assert.equal(live.current, true);
  assert.equal(live.seated, false);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  assert.equal((await cy.c.query(api.player.game, { roomId, gameId: game1.shortCode })).current, true, "the just-ended current game stays readable to members");

  // Game 2 starts: game 1 is now historic.
  const game2 = await startGame(host, roomId);

  // A participant opens it, by id or short code, as its final state.
  const final = await ada.c.query(api.player.game, { roomId, gameId: game1.shortCode });
  assert.equal(final.id, game1.gameId);
  assert.equal(final.shortCode, game1.shortCode);
  assert.equal(final.roomShortCode, shortCode);
  assert.equal(final.status, "ended");
  assert.equal(final.current, false);
  assert.equal(final.seated, true);
  assert.equal(final.endReason, "owner");
  assert.equal(final.objects.length, 3);
  assert.deepEqual(final.roster.map((m: any) => m.id).sort(), [host.subject, ada.subject, bo.subject].sort());
  assert.ok(final.winners.length >= 1);
  const record = (await ada.c.query(api.rooms.history, { room: roomId })).find((g: any) => g.id === game1.gameId);
  assert.deepEqual(final.leaderboard, record.leaderboard, "the final standings are the recorded result");
  assert.equal(final.endedAt, record.endedAt);
  // Its event log stays readable to the participant, from a player credential too.
  assert.ok((await ada.c.query(api.player.history, { roomId, gameId: game1.gameId, afterSeq: -1, limit: 50 })).events.length > 0);
  const app = await playerClient(ada, roomId, "read");
  assert.equal((await app.query(api.player.game, { roomId, gameId: game1.gameId })).id, game1.gameId);

  // Disclosure: nothing of another god's private data.
  const check = disclosureChecker(game1.gameId, ada.subject, [SECRET]);
  await check("historic player.game", final);

  // A member who did not play game 1 is refused by every per-game read.
  for (const name of ["game", "history", "events", "trajectories"]) {
    assert.match(await rejects(cy.c.query(api.player[name], { roomId, gameId: game1.gameId })), /played in it/, name);
  }
  const cyApp = await playerClient(cy, roomId, "read");
  assert.match(await rejects(cyApp.query(api.player.game, { roomId, gameId: game1.gameId })), /played in it/);
  // The engine UI's public game page and its link resolver follow the same rule for a past game...
  assert.match(await rejects(cy.c.query(api.games.view, { code: game1.shortCode })), /played in it/);
  assert.match(await rejects(cy.c.query(api.games.resolve, { code: game1.shortCode })), /played in it/);
  assert.equal((await ada.c.query(api.games.view, { code: game1.shortCode })).status, "ended");
  assert.equal((await ada.c.query(api.games.resolve, { code: game1.shortCode })).status, "historical");
  // ...and stay open to any signed-in viewer for the room's current game.
  const [stranger] = await gods("Historic Stranger");
  assert.equal((await stranger.c.query(api.games.view, { code: game2.shortCode })).status, "active");
  assert.match(await rejects(stranger.c.query(api.games.view, { code: game1.shortCode })), /played in it/);
  // ...but reads the room's current game.
  assert.equal((await cy.c.query(api.player.game, { roomId, gameId: game2.gameId })).seated, true);

  // A participant's credential for another room cannot reach it.
  const other = await roomWith([ada, host, bo]);
  const elsewhere = await playerClient(ada, other.roomId, "read");
  assert.match(await rejects(elsewhere.query(api.player.game, { roomId, gameId: game1.gameId })), /room/i);
  // A game is only found in its own room.
  assert.match(await rejects(ada.c.query(api.player.game, { roomId: other.roomId, gameId: game1.gameId })), /not found/i);

  // The room owner reads it even without a seat in it.
  const secret = await raw(game1.gameId);
  await admin.mutation(internal.testing.patchGame, { gameId: game1.gameId, patch: { roster: secret.game.roster.filter((m: any) => m.id !== host.subject) } });
  const asOwner = await host.c.query(api.player.game, { roomId, gameId: game1.gameId });
  assert.equal(asOwner.seated, false);
  assert.equal(asOwner.id, game1.gameId);
  assert.equal((await host.c.query(api.games.view, { code: game1.gameId })).id, game1.gameId);
});
