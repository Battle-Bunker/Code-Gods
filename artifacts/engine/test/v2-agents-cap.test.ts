/**
 * v1's limit of 200 agents per player, restored (coordinator's call 35): a player can hold more than 20 agents and is
 * refused the 201st; destroying one frees a place. The caller's agents list is paginated (R1: a page of at most 50 from
 * an index of the live agents) and pages through all 200 without a destroyed agent; `agents.list` pages the same way;
 * the tick reads every live agent of the game (a page at a time).
 *
 * What would break: a cap below 200 (or none), a list that stops at a fixed take, a list that counts destroyed agents,
 * or a tick that drops agents beyond its first read.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { startersFor } from "@workspace/v2-agents";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, roomId: string, gameId: string;
const scope = () => ({ gameId });
const me = () => ada.query("v2/playState:me", { gameId });
/** Inserts `count` live agents for Ada without paying (a summon each would take minutes). */
const seed = async (count: number) => await admin.mutation("v2/testing:seedAgents", { gameId, userId: ada.userId, count }) as string[];

async function allAgents(numItems: number) {
  const pages: { agentId: string }[][] = [];
  let cursor: string | null = null;
  for (;;) {
    const r: any = await ada.query("v2/playState:agents", { gameId, paginationOpts: { numItems, cursor } });
    pages.push(r.page);
    if (r.isDone) return pages;
    cursor = r.continueCursor;
    assert.ok(pages.length < 50, "the list ends");
  }
}

before(async () => {
  [ada] = await humans("Cap Ada");
  const created = await perform(ada!, "room.create", { name: "Cap room" });
  roomId = created.result.roomId;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  await perform(ada!, "room.settings", { overrides: { planningSeconds: 600, worldSeconds: 600, startingEnergy: 2000 } }, { roomId });
  gameId = (await perform(ada!, "game.start", {}, { roomId })).result.gameId;
}, { timeout: 120_000 });

test("a player holds more than 20 agents, up to 200, and the list pages through them", { timeout: 180_000 }, async () => {
  const rule = await ada.query("v2/play:myRule", { gameId });
  const [simple] = startersFor(rule.family, "typescript", rule.tieBreaker);
  const summon = (name: string) => perform(ada, "agent.summon", { language: "typescript", source: simple!.source, name, share: 0.01 }, scope(), "action");

  await seed(20);
  const twentyFirst = await summon("Twenty-first");
  assert.equal(twentyFirst.ok, true, `the 21st agent is summoned: ${JSON.stringify(twentyFirst.error)}`);
  assert.equal((await me()).agents, 21);

  await seed(179);
  assert.equal((await me()).agents, 200);
  const refused = await summon("Too many");
  assert.equal(refused.ok, false, "the 201st is refused");
  assert.match(refused.error.message, /200 agents/);

  // Pages of at most 50 (the server's page, whatever the client asks), every live agent once.
  const pages = await allAgents(1000);
  assert.ok(pages.every(p => p.length <= 50), `pages of ≤ 50: ${pages.map(p => p.length)}`);
  const ids = pages.flat().map(a => a.agentId);
  assert.equal(ids.length, 200);
  assert.equal(new Set(ids).size, 200, "no agent twice");
  assert.ok(ids.includes(twentyFirst.result.agentId));
  const small = await allAgents(7);
  assert.deepEqual(small.flat().map(a => a.agentId).sort(), [...ids].sort(), "any page size reads the same agents");

  // The affordance pages the same way.
  const listed: string[] = [];
  let cursor: string | null = null;
  do {
    const r = await perform(ada, "agents.list", { limit: 100, ...(cursor ? { cursor } : {}) }, scope(), "query");
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.ok(r.result.page.length <= 50);
    listed.push(...r.result.page.map((a: { agentId: string }) => a.agentId));
    cursor = r.result.nextCursor;
  } while (cursor);
  assert.deepEqual(listed.sort(), [...ids].sort());

  // A destroyed agent leaves the list and frees a place.
  assert.equal((await perform(ada, "agent.destroy", { agentId: twentyFirst.result.agentId }, scope())).ok, true);
  const after = (await allAgents(50)).flat().map(a => a.agentId);
  assert.equal(after.length, 199);
  assert.ok(!after.includes(twentyFirst.result.agentId));
  assert.equal((await summon("Back to 200")).ok, true, "a place freed by a destroy can be filled");
  assert.equal((await me()).agents, 200);

  // The tick reads every live agent of the game, a page at a time (as tick.ts reads on from the snapshot's cursor):
  // Ada's 200 and the practice partners'.
  const live: { agentId: string; source: string }[] = [];
  let at: string | null = null, pagesRead = 0;
  do {
    const r: any = await admin.query("v2/loop:tickAgents", { gameId, cursor: at });
    live.push(...r.agents);
    at = r.cursor;
    assert.ok(++pagesRead < 40, "the tick's read ends");
  } while (at !== null);
  assert.ok(pagesRead >= 2, "200 agents take more than one of the tick's pages");
  const own = new Set((await allAgents(50)).flat().map(a => a.agentId));
  assert.equal(live.filter(a => own.has(a.agentId)).length, 200);
  assert.equal(new Set(live.map(a => a.agentId)).size, live.length, "no agent twice in the tick's read");
  assert.ok(live.every(a => a.source.length > 0), "every agent's program reaches the tick");
});
