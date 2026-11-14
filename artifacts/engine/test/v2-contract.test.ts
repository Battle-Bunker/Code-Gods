/**
 * The v2 API contract (W3-1) on the live local backend: every live query of plan §2.2 answers a seeded game within its
 * `returns` validator (Convex checks it on every call), sign-in is required everywhere, a player sees only their own
 * rule, values and agents, and server affordances run through `defineOp` (session and delegated twin, receipts,
 * refusals, a stub's failure as a value).
 *
 * What would break: a query whose answer drifts from its validator; a query that answers a signed-out caller or
 * leaks another player's value; an operation that bypasses the directory's checks or applies a retry twice.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admin, anonymous, errorCode, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, bo: Human, cy: Human, sy: Human;
let roomId: string, gameId: string, objects: string[];
const page = { numItems: 50, cursor: null };

before(async () => {
  [ada, bo, cy, sy] = await humans("Contract Ada", "Contract Bo", "Contract Cy", "Contract Sy");
  ({ roomId, gameId, objects } = await admin.mutation("v2/testing:seedGame", {
    owner: ada.userId, humans: [bo.userId, cy.userId], spectators: [sy.userId], objects: 12,
  }));
});

test("every live query answers a seated player within its validator", async () => {
  const list = await ada.query("v2/rooms:list", { paginationOpts: page });
  assert.ok(list.page.some((r: any) => r.roomId === roomId));
  const room = await ada.query("v2/rooms:get", { roomId });
  assert.equal(room.members.length, 4);
  assert.equal(room.members.filter((m: any) => m.me).length, 1);
  assert.equal(room.phase, "live");
  assert.equal(room.game.gameId, gameId);
  assert.equal((await ada.query("v2/rooms:history", { roomId, paginationOpts: page })).page.length, 0);
  assert.equal((await ada.query("v2/rooms:chat", { roomId, paginationOpts: page })).page.length, 0);

  const header = await ada.query("v2/games:header", { gameId });
  assert.equal(header.phase, "live");
  assert.equal(header.roster.length, 3);
  assert.ok(header.me);
  const standings = await ada.query("v2/games:standings", { gameId });
  assert.deepEqual(standings.rows.map((r: any) => r.rank), [1, 2, 3]);
  assert.equal((await ada.query("v2/games:standingsHistory", { gameId, after: -1 })).length, 3);
  assert.equal((await ada.query("v2/games:standingsHistory", { gameId, after: 1 })).length, 1);

  const rule = await ada.query("v2/play:myRule", { gameId });
  assert.equal(rule.family, "prime-gradient");
  assert.ok(rule.ladder.length > 2 && rule.card.length > 0);
  const me = await ada.query("v2/play:me", { gameId });
  assert.equal(me.memberId, header.me);
  for (const sort of ["points", "rarity", "want", "born", "recent"]) {
    const ids = await ada.query("v2/play:objectIds", { gameId, sort, paginationOpts: page });
    assert.equal(ids.page.length, 12, sort);
  }
  const byPoints = (await ada.query("v2/play:objectIds", { gameId, sort: "points", paginationOpts: page })).page;
  const first = await ada.query("v2/play:object", { objectId: byPoints[0].objectId });
  const last = await ada.query("v2/play:object", { objectId: byPoints.at(-1).objectId });
  assert.ok(first.value.points >= last.value.points, "sorted by the caller's points, best first");
  assert.match(first.state, /^-?\d+,-?\d+,-?\d+$/, "a line-z state on the wire");

  const agents = await ada.query("v2/play:agents", { gameId });
  assert.equal(agents.length, 1);
  assert.equal((await ada.query("v2/play:agentEnergy", { agentId: agents[0].agentId })).acts, 3);
  assert.equal((await ada.query("v2/play:agentPrograms", { agentId: agents[0].agentId })).length, 1);
  const moves = await ada.query("v2/play:moves", { gameId, paginationOpts: page });
  assert.deepEqual(moves.page.map((m: any) => m.seq), [2, 1, 0], "newest first");
  assert.equal((await ada.query("v2/play:digest", { gameId })).packed.length, 36);

  assert.equal((await ada.query("v2/spectate:objectIds", { gameId, paginationOpts: page })).page.length, 12);
  assert.equal((await ada.query("v2/spectate:object", { objectId: objects[0] })).number, 1);
  assert.equal(await ada.query("v2/layout:current", { roomId }), null);
  assert.deepEqual(await ada.query("v2/replays:stored", { gameId }), { stored: false, url: null });
  assert.equal((await ada.query("v2/bids:state", { roomId })).open, false);
  await admin.mutation("v2/testing:setBidding", { roomId, open: true });
  const bids = await ada.query("v2/bids:state", { roomId });
  assert.ok(bids.open && bids.families.length > 0 && bids.players.length === 3);
  assert.ok(bids.families.every((f: any) => f.card.length > 0 && f.top > 0), "each family on offer with its card and top");
  await admin.mutation("v2/testing:setBidding", { roomId, open: false });
});

test("a player sees only their own rule, values and agents; a spectator sees no values", async () => {
  const [adaRule, boRule] = [await ada.query("v2/play:myRule", { gameId }), await bo.query("v2/play:myRule", { gameId })];
  assert.notEqual(adaRule.family, boRule.family, "each is told their own rule");
  const a = await ada.query("v2/play:object", { objectId: objects[0] });
  const b = await bo.query("v2/play:object", { objectId: objects[0] });
  assert.equal(a.state, b.state, "the state is shared");
  const adaPlayer = await ada.query("v2/play:me", { gameId }), boPlayer = await bo.query("v2/play:me", { gameId });
  assert.notEqual(adaPlayer.memberId, boPlayer.memberId);
  const adaAgent = (await ada.query("v2/play:agents", { gameId }))[0].agentId;
  assert.equal(await errorCode(bo.query("v2/play:agentEnergy", { agentId: adaAgent })), "FORBIDDEN");
  assert.equal(await errorCode(bo.query("v2/play:agentPrograms", { agentId: adaAgent })), "FORBIDDEN");

  assert.equal((await sy.query("v2/games:header", { gameId })).me, null);
  assert.equal((await sy.query("v2/play:object", { objectId: objects[0] })).value, null);
  for (const q of ["v2/play:me", "v2/play:myRule", "v2/play:digest", "v2/play:agents"])
    assert.equal(await errorCode(sy.query(q, { gameId })), "FORBIDDEN", q);
  const [outsider] = await humans("Contract Outsider");
  assert.equal(await errorCode(outsider!.query("v2/rooms:get", { roomId })), "FORBIDDEN");
  assert.equal(await errorCode(outsider!.query("v2/play:object", { objectId: objects[0] })), "FORBIDDEN");
});

test("every live query refuses a signed-out caller", async () => {
  const agentId = (await ada.query("v2/play:agents", { gameId }))[0].agentId;
  const calls: [string, Record<string, unknown>][] = [
    ["v2/rooms:list", { paginationOpts: page }], ["v2/rooms:get", { roomId }], ["v2/rooms:chat", { roomId, paginationOpts: page }],
    ["v2/rooms:history", { roomId, paginationOpts: page }], ["v2/games:header", { gameId }], ["v2/games:standings", { gameId }],
    ["v2/games:standingsHistory", { gameId, after: -1 }], ["v2/play:myRule", { gameId }], ["v2/play:me", { gameId }],
    ["v2/play:objectIds", { gameId, sort: "points", paginationOpts: page }], ["v2/play:object", { objectId: objects[0] }],
    ["v2/play:agents", { gameId }], ["v2/play:agentEnergy", { agentId }], ["v2/play:agentPrograms", { agentId }],
    ["v2/play:moves", { gameId, paginationOpts: page }], ["v2/play:digest", { gameId }],
    ["v2/spectate:objectIds", { gameId, paginationOpts: page }], ["v2/spectate:object", { objectId: objects[0] }],
    ["v2/layout:current", { roomId }], ["v2/replays:stored", { gameId }], ["v2/bids:state", { roomId }],
  ];
  for (const [q, args] of calls) assert.equal(await errorCode(anonymous.query(q, args)), "UNAUTHENTICATED", q);
});

test("operations run through defineOp: results, receipts, refusals, delegates and stubs", async () => {
  const created = await perform(ada, "room.create", { name: "Ops room" });
  assert.equal(created.ok, true, JSON.stringify(created));
  const { roomId: opsRoom, code } = created.result;
  assert.deepEqual((await perform(bo, "room.join", { code })).result, { roomId: opsRoom });
  assert.equal((await bo.query("v2/rooms:get", { roomId: opsRoom })).members.length, 2);

  const requestId = randomUUID();
  const sent = await perform(bo, "chat.send", { text: "hello", requestId }, { roomId: opsRoom });
  const again = await perform(bo, "chat.send", { text: "hello", requestId }, { roomId: opsRoom });
  assert.deepEqual([sent.ok, again.replayed], [true, true]);
  assert.equal((await ada.query("v2/rooms:chat", { roomId: opsRoom, paginationOpts: page })).page.length, 1, "a retry is not applied twice");

  const refused = await perform(bo, "game.start", {}, { roomId: opsRoom });
  assert.equal(refused.error.code, "refused", "only the owner starts the game");
  const bad = await perform(ada, "chat.send", { text: "" }, { roomId: opsRoom });
  assert.equal(bad.error.code, "invalid_args");
  assert.equal((await perform(anonymous, "room.get", {}, { roomId: opsRoom }, "query")).error.code, "refused");

  // A stub mutation's failure rolls back and reaches the client as the outcome in the ConvexError's data.
  try { await perform(ada, "seats.removeAi", { memberId: "x" }, { roomId: opsRoom }); assert.fail("a stub fails"); } catch (e) {
    assert.equal((e as { data?: { error?: { code?: string } } }).data?.error?.code, "failed");
  }
  // An action resolves its caller through a query and returns its failure as a value.
  const check = await perform(ada, "agent.check", { language: "typescript", source: "export function agent() { return null; }" }, { gameId }, "action");
  assert.equal(check.error.code, "failed");

  // The internal twin acts for a human, narrowed by the credential's grant and bound room.
  const asAda = await admin.query("v2/ops/room:getAs", { args: {}, roomId: opsRoom, delegate: { userId: ada.userId, roomId: opsRoom, grant: "read", via: "mcp" } });
  assert.equal(asAda.ok, true);
  assert.equal(asAda.result.name, "Ops room");
  // A credential bound to one room acts there only, whatever room it names, and lists only that room.
  const named = await admin.query("v2/ops/room:getAs", { args: {}, roomId, delegate: { userId: ada.userId, roomId: opsRoom, grant: "read", via: "mcp" } });
  assert.equal(named.result.roomId, opsRoom);
  const boundList = await admin.query("v2/ops/room:listAs", { args: {}, delegate: { userId: ada.userId, roomId: opsRoom, grant: "read", via: "mcp" } });
  assert.equal(boundList.error.code, "refused", "a bound credential is always in its room, where room.list is not offered");
  const boundWho = await admin.query("v2/ops/account:whoamiAs", { args: {}, delegate: { userId: ada.userId, roomId: opsRoom, grant: "act", via: "mcp" } });
  assert.deepEqual([boundWho.result.roomId, boundWho.result.grant], [opsRoom, "act"]);
  const readOnly = await admin.mutation("v2/ops/chat:sendAs", { args: { text: "hi" }, delegate: { userId: ada.userId, roomId: opsRoom, grant: "read", via: "mcp" } });
  assert.equal(readOnly.error.code, "refused", "a read grant cannot write");

  const whoami = await perform(ada, "account.whoami", {}, {}, "query");
  assert.deepEqual(whoami.result, { userId: ada.userId, name: ada.name, roomId: null, grant: null });
  const rule = await perform(cy, "rule.explain", {}, { gameId }, "query");
  assert.equal(rule.result.family, "m-meets-c");
  const listed = await perform(cy, "objects.list", { sort: "points", limit: 5 }, { gameId }, "query");
  assert.equal(listed.result.page.length, 5);
  assert.ok(listed.result.nextCursor);
});
