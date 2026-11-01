/**
 * Room lobby lifecycle (ported from api-server game-integration "room lobby lifecycle"): create, join,
 * owner name and creation date, settings with revision concurrency, launch, latecomer spectating, leave
 * rules, chat, end by lifetime with the history record, a second game in the same room, end by owner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, gods, internal, rejects, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

const INT_TS = { languages: ["typescript"], objectType: "Int", spawnRateHz: 0 };

test("room lobby lifecycle: launch, spectate, end by lifetime, history, second game, end by owner", { timeout: 180000 }, async () => {
  const [host, ada, bo, cy] = await gods("Lobby Host", "Ada Seated", "Bo Seated", "Cy Latecomer");
  await touch(host);
  const { roomId, shortCode } = await roomWith([host, ada, bo]);
  assert.match(shortCode, /^[0-9A-HJKMNP-TV-Z]{4,26}$/);

  let room = await host.c.query(api.rooms.get, { room: shortCode });
  assert.equal(room.id, roomId);
  assert.equal(room.activeGame, null, "a new room is a lobby");
  assert.equal(room.ownerName, "Lobby Host");
  assert.equal(typeof room.createdAt, "number");
  assert.equal("name" in room, false, "rooms have no name");
  assert.equal(room.members.length, 3);
  const listed = (await ada.c.query(api.rooms.list, {})).find((r: any) => r.id === roomId);
  assert.deepEqual([listed.ownerName, listed.phase, listed.memberCount, listed.shortCode], ["Lobby Host", "lobby", 3, shortCode]);
  await waitFor(async () => (await host.c.query(api.rooms.get, { room: roomId })).utilityCatalog, "catalog computed after creation", 30000);

  // Settings: optimistic on the revision; owner only; invalid instantiations refused (any valid one is playable: its
  // tables are prepared on its first game).
  assert.match(await rejects(host.c.action(api.owner.settings, { roomId, revision: room.revision + 7, settings: { ...INT_TS } })), /refresh/);
  assert.match(await rejects(ada.c.action(api.owner.settings, { roomId, revision: room.revision, settings: { ...INT_TS } })), /owner/i);
  assert.match(await rejects(host.c.action(api.owner.settings, { roomId, revision: room.revision, settings: { ...INT_TS, typeArgs: { min: 5, max: 0 } } })), /typeArgs/);
  const first = await host.c.action(api.owner.settings, { roomId, revision: room.revision, settings: { ...INT_TS, startingObjectCount: 4 } });
  assert.equal(first.revision, room.revision + 1);
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.equal(room.settings.startingObjectCount, 4);
  assert.equal(room.objectInstance.objectType, "Int");

  assert.match(await rejects(ada.c.action(api.owner.start, { roomId })), /owner/i);
  const two = await gods("Lonely Owner", "Only Friend");
  const small = await roomWith(two);
  assert.match(await rejects(two[0].c.action(api.owner.start, { roomId: small.roomId })), /three gods/);

  // Launch.
  const requestId = crypto.randomUUID();
  const game1 = await startGame(host, roomId, { requestId });
  const again = await host.c.action(api.owner.start, { roomId, requestId });
  assert.deepEqual([again.gameId, again.shortCode, again.guid], [game1.gameId, game1.shortCode, game1.guid], "start is idempotent per requestId"); // start-result-ok: game1 has begun, so the repeat names it
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.equal(room.activeGame.id, game1.gameId);
  assert.deepEqual(room.activeGame.roster.map((m: any) => m.id).sort(), [host.subject, ada.subject, bo.subject].sort());
  let view = await host.c.query(api.games.view, { code: game1.shortCode });
  assert.equal(view.status, "active");
  assert.equal(view.roomShortCode, shortCode);
  assert.equal(view.objects.length, 4);
  assert.deepEqual(view.winners, []);
  assert.equal((await host.c.query(api.games.resolve, { code: game1.shortCode.toLowerCase() })).status, "current");
  assert.match(await rejects(host.c.action(api.owner.start, { roomId })), /already a live game/);
  assert.match(await rejects(host.c.action(api.owner.settings, { roomId, revision: room.revision, settings: { ...INT_TS } })), /frozen/);
  assert.match(await rejects(host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" })), /frozen/);

  // A latecomer joins mid-game: a member who spectates and is dealt in next game.
  await cy.c.mutation(api.rooms.join, { room: shortCode });
  const spectator = await cy.c.query(api.player.observation, { roomId });
  assert.equal(spectator.seated, false);
  assert.equal(spectator.gameShortCode, game1.shortCode);
  assert.equal(spectator.self.utility, undefined);
  assert.deepEqual(spectator.objects, []);
  assert.equal(await cy.c.query(api.player.myUtility, { roomId }), null);
  assert.equal((await ada.c.query(api.player.observation, { roomId })).seated, true);
  assert.match(await rejects(ada.c.mutation(api.rooms.leave, { roomId })), /seated in the active game/);
  assert.match(await rejects(host.c.mutation(api.rooms.leave, { roomId })), /owner cannot leave/);
  const chat = await bo.c.action(api.commands.submit, { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), command: { type: "chat", text: "Treaty proposal during game one" } } });
  assert.equal(chat.accepted, true);

  // End by lifetime: the result is recorded in the room's history; the room is a lobby again.
  await admin.mutation(internal.testing.patchGame, { gameId: game1.gameId, patch: { planningEndsAt: Date.now() - 1, endAtWorld: 0.3, nextSpawn: Number.MAX_VALUE }, kick: true });
  await waitFor(async () => (await host.c.query(api.games.view, { code: game1.gameId })).status === "ended", "the loop ends the game when its lifetime elapses", 30000);
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.equal(room.activeGame, null);
  assert.equal((await host.c.query(api.rooms.list, {})).find((r: any) => r.id === roomId).phase, "lobby");
  let history = await host.c.query(api.rooms.history, { room: roomId });
  assert.equal(history.length, 1);
  const [record] = history;
  assert.equal(record.id, game1.gameId);
  assert.equal(record.shortCode, game1.shortCode);
  assert.equal(record.endReason, "lifetime");
  assert.ok(record.endedAt >= record.startedAt);
  assert.equal(record.settings.startingObjectCount, 4, "history keeps the settings the game was played with");
  assert.equal(record.leaderboard.length, 3);
  assert.ok(record.winners.length >= 1 && record.winners.every((w: any) => record.leaderboard.some((s: any) => s.deityId === w.deityId && s.rank === 1)));
  assert.deepEqual(record.roster.map((m: any) => Object.keys(m).sort()), [0, 1, 2].map(() => ["id", "kind", "name"]));
  assert.equal(record.scoring, "information-v1");
  assert.match(record.seasonCommitment, /^[0-9a-f]{64}$/);
  for (const leak of ["scores", "netBits", "utility", "deities", "aiAgent", "endAtWorld", "source", "prompt"]) {
    assert.ok(!JSON.stringify(history).includes(`"${leak}"`), `history never discloses ${leak}`);
  }
  view = await host.c.query(api.games.view, { code: game1.shortCode });
  assert.equal(view.status, "ended");
  assert.deepEqual(view.winners, record.winners);
  assert.ok(view.chat.some((m: any) => m.text === "Treaty proposal during game one"), "the game page shows chat sent during play");
  const ended = await ada.c.query(api.player.observation, { roomId });
  assert.equal(ended.phase, "ended", "observations show the final state until the next launch");

  // Between games: members leave and rejoin; the owner edits the next game's settings.
  await cy.c.mutation(api.rooms.leave, { roomId });
  await cy.c.mutation(api.rooms.join, { room: shortCode });
  room = await host.c.query(api.rooms.get, { room: roomId });
  await host.c.action(api.owner.settings, { roomId, revision: room.revision, settings: { startingObjectCount: 2 } });
  await cy.c.action(api.commands.submit, { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), command: { type: "chat", text: "Lobby talk after game one" } } });

  // Second game, the latecomer dealt in.
  const game2 = await startGame(host, roomId);
  assert.notEqual(game2.gameId, game1.gameId);
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.equal(room.activeGame.roster.length, 4, "the latecomer is dealt into the next game");
  assert.equal((await cy.c.query(api.player.observation, { roomId })).seated, true);
  view = await host.c.query(api.games.view, { code: game2.shortCode });
  assert.equal(view.objects.length, 2);
  assert.ok(!view.chat.some((m: any) => m.text === "Treaty proposal during game one"), "each game page shows only its own chat");
  const old = await host.c.query(api.games.view, { code: game1.guid });
  assert.equal(old.status, "ended", "a previous game stays viewable as its final state");
  assert.equal(old.roomActiveGame.id, game2.gameId, "an old game's page points to the room's newer game");
  assert.equal((await host.c.query(api.games.resolve, { code: game1.shortCode })).status, "historical");

  // The owner ends the second game early.
  assert.match(await rejects(ada.c.mutation(api.rooms.endActiveGame, { roomId })), /owner/i);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  history = await host.c.query(api.rooms.history, { room: roomId });
  assert.deepEqual(history.map((g: any) => g.id), [game2.gameId, game1.gameId], "history is newest first");
  assert.equal(history[0].endReason, "owner");
  assert.equal(history[0].settings.startingObjectCount, 2);
  assert.equal(history[0].roster.length, 4);
  assert.match(await rejects(host.c.mutation(api.rooms.endActiveGame, { roomId })), /no active game/);
});

test("AI seats and budgets in the lobby: library snapshot, owner-only seats, budget approval", { timeout: 60000 }, async () => {
  const [host, ada] = await gods("Seat Host", "Seat Guest");
  await touch(host);
  const { roomId } = await roomWith([host, ada]);
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  const catalog = await ada.c.query(api.aiTemplates.catalog, {});
  const template = catalog.agents.find((a: any) => a.id === "sonnet-strategist");
  assert.ok(template && template.model === "claude-sonnet-5-5", "Sonnet 5.5 is the seeded default");
  assert.equal("prompt" in template, false, "the public catalog has no prompts");
  assert.match(await rejects(ada.c.mutation(api.rooms.addAi, { roomId, templateId: template.id })), /owner/i);
  const { godId } = await host.c.mutation(api.rooms.addAi, { roomId, templateId: template.id });
  assert.match(godId, /^ai:/);
  const room = await ada.c.query(api.rooms.get, { room: roomId });
  const seat = room.members.find((m: any) => m.id === godId);
  assert.deepEqual([seat.kind, seat.aiAgentId, seat.provider, seat.model], ["ai", template.id, "anthropic", "claude-sonnet-5-5"]);
  assert.ok(!JSON.stringify(room).includes("Play strategically"), "the seat's strategy prompt is not public room data");
  assert.match(await rejects(host.c.action(api.owner.start, { roomId })), /AI token budget/);
  assert.match(await rejects(ada.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 5000 })), /owner/i);
  await host.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 5000 });
  assert.equal((await host.c.query(api.rooms.get, { room: roomId })).aiBudget, 5000);
  await host.c.mutation(api.rooms.removeAi, { roomId, godId });
  assert.equal((await host.c.query(api.rooms.get, { room: roomId })).members.length, 2);
});
