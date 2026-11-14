/**
 * A seated player's operations on the live local backend (W3-4), each through `defineOp`: check and summon an agent
 * (paying its summon price, power moving with energy), read an object in a representation, one element, a quote and
 * a score (the same answers an agent pays for, free for a human), a representation's mutators, replace and put back a
 * program, split power, destroy, ready (the world starts when every human is), pause once, resume, end.
 *
 * What would break: a summon that does not pay or exceeds the store; a read that differs from what an agent is told;
 * a second pause; an end that leaves the room busy.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { startersFor } from "@workspace/v2-agents";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, bo: Human, roomId: string, gameId: string;
const scope = () => ({ gameId });

before(async () => {
  [ada, bo] = await humans("Play Ada", "Play Bo");
  const created = await perform(ada!, "room.create", { name: "Play room" });
  roomId = created.result.roomId;
  await perform(bo!, "room.join", { code: created.result.code });
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  await perform(ada!, "room.settings", { overrides: { planningSeconds: 600, worldSeconds: 600 } }, { roomId });
  gameId = (await perform(ada!, "game.start", {}, { roomId })).result.gameId;
});

const me = (h: Human) => h.query("v2/play:me", { gameId });

test("planning: check, summon, replace, put back, split power, destroy", async () => {
  const rule = await ada!.query("v2/play:myRule", { gameId });
  const [simple] = startersFor(rule.family, "typescript");
  const tiny = "function agent(offer) {\n  return [call(\"si.shift\", { k: 1 })];\n}\n";
  const checked = await perform(ada!, "agent.check", { language: "typescript", source: simple!.source }, scope(), "action");
  assert.equal(checked.ok, true, JSON.stringify(checked));
  assert.ok(["works", "warns"].includes(checked.result.verdict), checked.result.summary);
  const broken = await perform(ada!, "agent.check", { language: "python", source: "def agent(offer):\n  return (" }, scope(), "action");
  assert.equal(broken.result.verdict, "rejected");

  const before = await me(ada!);
  const summoned = await perform(ada!, "agent.summon", { language: "typescript", source: simple!.source, name: "First" }, scope(), "action");
  assert.equal(summoned.ok, true, JSON.stringify(summoned));
  assert.ok(Math.abs(summoned.result.price - checked.result.price) < 1e-9, "check quotes the summon price");
  const after = await me(ada!);
  assert.ok(Math.abs(before.energy - summoned.result.price - after.energy) < 1e-6, "the price is paid from the own store");
  assert.equal(after.agents, 1);
  const agentId = summoned.result.agentId;

  const tooDear = await perform(bo!, "agent.summon", { language: "python", source: `def agent(offer):\n  ${"x = 1\n  ".repeat(600)}return None\n` }, scope(), "action");
  assert.equal(tooDear.error.code, "failed", "a program dearer than the store is refused");

  const replaced = await perform(ada!, "agent.replace", { agentId, language: "typescript", source: tiny }, scope(), "action");
  assert.deepEqual(replaced.result.version, 1);
  await perform(ada!, "agent.replace", { agentId, language: "typescript", source: tiny.replace("k: 1", "k: 2") }, scope(), "action");
  const back = await perform(ada!, "agent.putBack", { agentId, version: 1 }, scope(), "action");
  assert.equal(back.result.version, 3, JSON.stringify(back));
  const versions = await ada!.query("v2/play:agentPrograms", { agentId });
  assert.deepEqual(versions.map((p: any) => p.version), [3, 2, 1, 0]);
  assert.equal(versions[0].source, tiny, "version 1 is running again");

  const second = await perform(ada!, "agent.summon", { language: "typescript", source: tiny, name: "Second" }, scope(), "action");
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal((await perform(ada!, "power.allocate", { shares: { [agentId]: 3, [second.result.agentId]: 1 } }, scope())).ok, true);
  const agents = await ada!.query("v2/play:agents", { gameId });
  assert.deepEqual(agents.map((a: any) => a.share).sort(), [0.25, 0.75]);
  // Naming one agent gives it what the others leave: the total never passes the player's whole power.
  await perform(ada!, "power.allocate", { shares: { [agentId]: 1 } }, scope());
  const shares = (await ada!.query("v2/play:agents", { gameId })).map((a: any) => a.share);
  assert.ok(Math.abs(shares.reduce((t: number, s: number) => t + s, 0) - 1) < 1e-6, `shares ${shares}`);
  try { await perform(ada!, "power.allocate", { shares: { [agentId]: 0 } }, scope()); assert.fail("a zero share is a destroy"); } catch (e) {
    assert.equal((e as any).data?.error?.code, "failed");
  }
  assert.equal((await perform(ada!, "agent.destroy", { agentId: second.result.agentId }, scope())).ok, true);
  assert.equal((await ada!.query("v2/play:agents", { gameId })).length, 1);
  assert.equal((await perform(bo!, "agent.destroy", { agentId }, scope())).error.code, "refused", "another player's agent");
});

test("ready: the world starts when every human is ready", async () => {
  await perform(ada!, "game.ready", { ready: true }, scope());
  assert.equal((await ada!.query("v2/games:header", { gameId })).phase, "planning", "Bo is not ready yet");
  await perform(bo!, "game.ready", { ready: true }, scope());
  const header = await ada!.query("v2/games:header", { gameId });
  assert.equal(header.phase, "live");
  const e0 = (await me(bo!)).energy;
  await new Promise(r => setTimeout(r, 3000));
  assert.ok((await me(bo!)).energy > e0, "the own store accrues while the world runs, read as of now");
  assert.equal((await ada!.query("v2/spectate:objectIds", { gameId, paginationOpts: { numItems: 100, cursor: null } })).page.length, 24);
});

test("reads: a representation, an element, a quote and a score, as an agent is told them", async () => {
  const [first] = (await ada!.query("v2/play:objectIds", { gameId, sort: "born", paginationOpts: { numItems: 1, cursor: null } })).page;
  const objectId = first.objectId;
  const si = await perform(ada!, "object.read", { objectId, rep: "si" }, scope(), "query");
  assert.equal(si.ok, true, JSON.stringify(si));
  assert.ok(si.result.elements.m && si.result.bits > 0);
  const c = await perform(ada!, "object.element", { objectId, rep: "si", name: "c" }, scope(), "query");
  assert.deepEqual(c.result.value, si.result.elements.c);
  const mutators = await perform(ada!, "rep.mutators", { rep: "si" }, scope(), "query");
  assert.ok(mutators.result.mutators.some((m: any) => m.id === "si.shift" && m.args.length > 0), JSON.stringify(mutators.result));
  const quote = await perform(ada!, "object.quote", { objectId, calls: [{ mutator: "si.shift", args: { k: "1" } }] }, scope(), "query");
  assert.equal(quote.result.valid, true, JSON.stringify(quote.result));
  assert.ok(quote.result.total > 0 && quote.result.after);
  const bad = await perform(ada!, "object.quote", { objectId, calls: [{ mutator: "si.shift", args: { k: "0" } }] }, scope(), "query");
  assert.equal(bad.result.valid, false);
  const score = await perform(ada!, "object.score", { objectId }, scope(), "query");
  const mine = await ada!.query("v2/play:object", { objectId });
  assert.deepEqual([score.result.level, score.result.rarityBits], [mine.value.level, mine.value.rarityBits]);
  assert.equal((await perform(ada!, "object.read", { objectId, rep: "nope" }, scope(), "query")).error.code, "failed");
});

test("pause once, resume by the owner, end by the owner", async () => {
  const [late] = await humans("Play Late");
  await perform(late!, "room.join", { code: (await ada!.query("v2/rooms:get", { roomId })).code });
  assert.equal((await ada!.query("v2/rooms:get", { roomId })).members.find((m: any) => m.name === "Play Late").spectator, true, "joining mid-game: watching");
  assert.equal((await perform(bo!, "game.pause", {}, scope())).ok, true);
  const paused = await ada!.query("v2/games:header", { gameId });
  assert.deepEqual([paused.phase, paused.endsAt], ["paused", null], "no countdown while paused");
  assert.equal((await perform(bo!, "game.resume", {}, scope())).error.code, "refused", "only the owner resumes");
  await perform(ada!, "game.resume", {}, scope());
  const resumed = await ada!.query("v2/games:header", { gameId });
  assert.ok(resumed.phase === "live" && resumed.endsAt > Date.now(), "the end is set again on resume");
  assert.equal((await perform(bo!, "game.pause", {}, scope())).error.code, "refused", "one pause each");
  await new Promise(r => setTimeout(r, 4000));
  const moves = await ada!.query("v2/play:moves", { gameId, paginationOpts: { numItems: 50, cursor: null } });
  const energy = await ada!.query("v2/play:agentEnergy", { agentId: (await ada!.query("v2/play:agents", { gameId }))[0].agentId });
  assert.ok(energy.acts > 0 || moves.page.length > 0, "Ada's agent acts once the world runs");
  assert.equal((await perform(ada!, "game.end", {}, scope())).ok, true);
  const header = await ada!.query("v2/games:header", { gameId });
  assert.equal(header.phase, "ended");
  assert.ok(header.summary);
  assert.ok((await ada!.query("v2/games:standings", { gameId })).rows.length === 3);
  assert.equal((await ada!.query("v2/rooms:get", { roomId })).game, null);
  const seated = (await ada!.query("v2/rooms:get", { roomId })).members.find((m: any) => m.name === "Play Late");
  assert.equal(seated.spectator, false, "who joined mid-game is seated for the next one");
  void admin;
});
