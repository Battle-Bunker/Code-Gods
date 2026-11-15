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
import { readLeave, startersFor } from "@workspace/v2-agents";
import { presetOf } from "../convex/v2/presets.ts";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, bo: Human, roomId: string, gameId: string;
const scope = () => ({ gameId });

before(async () => {
  [ada, bo] = await humans("Play Ada", "Play Bo");
  const created = await perform(ada!, "room.create", { name: "Play room" });
  roomId = created.result.roomId;
  await perform(bo!, "room.join", { code: created.result.code });
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  // Starting energy with room for the planning test's summons, replaces and put-backs (each priced by its program).
  // Exact sums (variance 0, as the beginner preset): this file checks that an agent is told the server's values, which
  // under noise differ by design (every agent read is a measurement of its own: disclose.ts actReadings).
  await perform(ada!, "room.settings", { overrides: { planningSeconds: 600, worldSeconds: 600, startingEnergy: 1200, peerNoiseVariance: 0 } }, { roomId });
  gameId = (await perform(ada!, "game.start", {}, { roomId })).result.gameId;
});

const me = (h: Human) => h.query("v2/play:me", { gameId });

test("planning: check, summon, replace, put back, split power, destroy", async () => {
  const rule = await ada!.query("v2/play:myRule", { gameId });
  const [simple] = startersFor(rule.family, "typescript");
  // It tells its owner what the line was worth to it (myScore's bits, from the value function the tick passes).
  // And what the line is worth to the others now (othersAfter's `before`, from their value functions the tick passes).
  const tiny = "function agent(offer) {\n  offer.note(\"bits \" + offer.myScore().bits);\n  offer.note(\"others \" + offer.othersAfter([call(\"si.shift\", { k: 1 })]).before);\n  return [call(\"si.shift\", { k: 1 })];\n}\n";
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

  const tooDear = await perform(bo!, "agent.summon", { language: "python", source: `def agent(offer):\n  ${"x = 1\n  ".repeat(2000)}return None\n` }, scope(), "action");
  assert.equal(tooDear.error.code, "failed", "a program dearer than the store is refused");
  assert.ok(tooDear.error.data.price > tooDear.error.data.store, JSON.stringify(tooDear.error.data));

  const replaced = await perform(ada!, "agent.replace", { agentId, language: "typescript", source: tiny }, scope(), "action");
  assert.deepEqual(replaced.result.version, 1);
  // An edit costs only the change (owner decision 21): check quotes it, and replace charges exactly that.
  const edited = tiny.replace("k: 1", "k: 2");
  const quoted = await perform(ada!, "agent.check", { language: "typescript", source: edited, agentId }, scope(), "action");
  assert.ok(quoted.result.editPrice > 0 && quoted.result.editPrice < quoted.result.price, JSON.stringify(quoted.result));
  assert.equal((await perform(ada!, "agent.check", { language: "typescript", source: edited }, scope(), "action")).result.editPrice, null, "no agent named: no edit price");
  const beforeEdit = (await me(ada!)).energy;
  await perform(ada!, "agent.replace", { agentId, language: "typescript", source: edited }, scope(), "action");
  assert.ok(Math.abs(beforeEdit - (await me(ada!)).energy - quoted.result.editPrice) < 1e-6, "the replace charged the quoted edit price");
  const otherLanguage = await perform(ada!, "agent.check", { language: "python", source: "def agent(offer):\n  return []\n", agentId }, scope(), "action");
  assert.ok(Math.abs(otherLanguage.result.editPrice - otherLanguage.result.price) < 1e-9, "a new language is a new program: the full price");
  const notMine = await perform(bo!, "agent.check", { language: "typescript", source: edited, agentId }, scope(), "action");
  assert.equal(notMine.error?.code, "failed", "another player's agent cannot be quoted");
  const back = await perform(ada!, "agent.putBack", { agentId, version: 1 }, scope(), "action");
  assert.equal(back.result.version, 3, JSON.stringify(back));
  const versions = await ada!.query("v2/play:agentPrograms", { agentId });
  assert.deepEqual(versions.map((p: any) => p.version), [3, 2, 1, 0]);
  assert.equal(versions[0].source, tiny, "version 1 is running again");

  const second = await perform(ada!, "agent.summon", { language: "typescript", source: tiny, name: "Second" }, scope(), "action");
  assert.equal(second.ok, true, JSON.stringify(second));
  // Absolute shares: each named agent gets that fraction of Ada's power; what no agent holds feeds Ada's own store.
  assert.equal((await perform(ada!, "power.allocate", { shares: { [agentId]: 0.6, [second.result.agentId]: 0.2 } }, scope())).ok, true);
  const agents = await ada!.query("v2/play:agents", { gameId });
  assert.deepEqual(agents.map((a: any) => a.share).sort(), [0.2, 0.6]);
  const kept = await me(ada!);
  assert.ok(Math.abs(kept.ownPerSecond - kept.power * 0.2) < 1e-6, `the store keeps the 20% no agent holds: ${JSON.stringify(kept)}`);
  // Pulling power back to pay for something: the store's share (and so its income and capacity) grows.
  const energyOf = async (id: string) => await ada!.query("v2/play:agentEnergy", { agentId: id });
  await perform(ada!, "power.allocate", { shares: { [agentId]: 0.1 } }, scope());
  assert.ok(Math.abs((await me(ada!)).ownPerSecond - kept.power * 0.7) < 1e-6, "lowering an agent's share returns that power to the store");
  const over = await perform(ada!, "power.allocate", { shares: { [agentId]: 0.9 } }, scope()).catch((e: any) => e.data);
  assert.equal(over.error.code, "failed", "with the other agent's 20%, 90% is more than all of Ada's power");
  assert.equal((await perform(ada!, "power.allocate", { shares: { [agentId]: 0 } }, scope())).error.code, "invalid_args", "a zero share is a destroy, not an allocation");
  assert.equal((await perform(ada!, "agent.destroy", { agentId: second.result.agentId }, scope())).ok, true);
  assert.equal((await ada!.query("v2/play:agents", { gameId })).length, 1);

  assert.equal((await perform(bo!, "agent.destroy", { agentId }, scope())).error.code, "refused", "another player's agent");
});

test("leave alone: a deal honoured by setting only the code's leave-alone list, priced as that edit", async () => {
  const rule = await bo!.query("v2/play:myRule", { gameId });
  const [simple] = startersFor(rule.family, "typescript", rule.tieBreaker);
  const summoned = await perform(bo!, "agent.summon", { language: "typescript", source: simple!.source, name: "Dealer" }, scope(), "action");
  assert.equal(summoned.ok, true, JSON.stringify(summoned));
  const agentId = summoned.result.agentId;
  const left = await perform(bo!, "agent.leaveAlone", { agentId, numbers: [19, 3, 3] }, scope(), "action");
  assert.equal(left.ok, true, JSON.stringify(left));
  assert.ok(left.result.price > 0 && left.result.price < summoned.result.price / 4, `the edit costs a little: ${left.result.price} vs ${summoned.result.price}`);
  const versions = (await perform(bo!, "agent.programs", { agentId }, scope(), "query")).result.versions;
  assert.deepEqual(readLeave(versions[0].source), [3, 19]);
  assert.equal(versions[0].source.split("\n").length, simple!.source.split("\n").length, "nothing else changed");
  // A program without the knob says what to do instead.
  await perform(bo!, "agent.replace", { agentId, language: "typescript", source: "function agent(offer) {\n  return null;\n}\n" }, scope(), "action");
  const none = await perform(bo!, "agent.leaveAlone", { agentId, numbers: [3] }, scope(), "action");
  assert.equal(none.ok, false);
  assert.match(none.error.message, /no leave-alone list/);
  assert.equal((await perform(bo!, "agent.destroy", { agentId }, scope())).ok, true);
});

test("ready: the world starts when every human is ready", async () => {
  await perform(ada!, "game.ready", { ready: true }, scope());
  assert.equal((await ada!.query("v2/games:header", { gameId })).phase, "planning", "Bo is not ready yet");
  await perform(bo!, "game.ready", { ready: true }, scope());
  const header = await ada!.query("v2/games:header", { gameId });
  assert.equal(header.phase, "live");
  const e0 = (await me(bo!)).energy;
  const mine = await me(bo!);
  assert.ok(mine.ownPerSecond > 0 && mine.capacity > mine.ownPerSecond && mine.energy <= mine.capacity + 1e-9, `the store holds at most its capacity: ${JSON.stringify(mine)}`);
  // World time moves with the tick (the first one can be slow: a sandbox's cold start), so wait for the store to grow.
  for (let i = 0; (await me(bo!)).energy <= e0; i++) {
    assert.ok(i < 60, "the own store accrues while the world runs, read as of now");
    await new Promise(r => setTimeout(r, 500));
  }
  // The preset's starting objects, born at world second 0 (a slow first tick may already have added a birth).
  const ids = (await ada!.query("v2/spectate:objectIds", { gameId, paginationOpts: { numItems: 50, cursor: null } })).page;
  const born = await Promise.all(ids.map((o: any) => ada!.query("v2/spectate:object", { objectId: o.objectId })));
  assert.equal(born.filter((o: any) => o.bornAt === 0).length, presetOf("lines-beginner").startingObjects);
});

test("reads: a representation, an element, a quote and a score, as an agent is told them", async () => {
  // A line with a gradient that a shift can move (a vertical line cannot): the newest few, the first that does.
  const newest = (await ada!.query("v2/play:objectIds", { gameId, sort: "born", paginationOpts: { numItems: 10, cursor: null } })).page;
  let objectId = "", si: any = null;
  for (const o of newest) {
    si = await perform(ada!, "object.read", { objectId: o.objectId, rep: "si" }, scope(), "query");
    const shifts = await perform(ada!, "object.quote", { objectId: o.objectId, calls: [{ mutator: "si.shift", args: { k: "1" } }] }, scope(), "query");
    if (si.ok && si.result.elements.m && shifts.result?.valid) { objectId = o.objectId; break; }
  }
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
  assert.deepEqual([score.result.score, score.result.bits], [mine.value.score, mine.value.rarityBits], "the score is the utility the commit valued, with its bits");
  const worth = await perform(ada!, "rule.worth", { score: mine.value.score }, scope(), "query");
  assert.ok(Math.abs(worth.result.bits - mine.value.rarityBits) < 1e-9, "rule.worth answers what the commit stored");
  const curve = await perform(ada!, "rule.values", {}, scope(), "query");
  assert.ok(curve.result.points.length > 2 && curve.result.points[0].bits === 0);
  assert.equal((await perform(ada!, "object.read", { objectId, rep: "nope" }, scope(), "query")).error.code, "failed");
});

test("pause once, resume by the owner, end by the owner", async () => {
  const [late] = await humans("Play Late");
  await perform(late!, "room.join", { code: (await ada!.query("v2/rooms:get", { roomId })).code });
  assert.equal((await ada!.query("v2/rooms:get", { roomId })).members.find((m: any) => m.name === "Play Late").spectator, true, "joining mid-game: watching");
  // Ada's agent stops moving lines for a while, so it saves up energy (for the pay-now summon below, while paused).
  const saver = (await ada!.query("v2/play:agents", { gameId }))[0].agentId;
  assert.equal((await perform(ada!, "agent.replace", { agentId: saver, language: "typescript", source: "function agent(offer) {\n  return null;\n}\n" }, scope(), "action")).ok, true);
  assert.equal((await perform(ada!, "power.allocate", { shares: { [saver]: 0.9 } }, scope())).ok, true);
  await new Promise(r => setTimeout(r, 4000));
  assert.equal((await perform(bo!, "game.pause", {}, scope())).ok, true);
  const paused = await ada!.query("v2/games:header", { gameId });
  assert.deepEqual([paused.phase, paused.endsAt], ["paused", null], "no countdown while paused");
  assert.equal((await perform(bo!, "game.resume", {}, scope())).error.code, "refused", "only the owner resumes");
  const agentId = saver;
  const energyOf = async (id: string) => await ada!.query("v2/play:agentEnergy", { agentId: id });
  const small = "function agent(offer) {\n  return null;\n}\n";
  // While paused (nothing accrues or acts): a summon the store cannot pay: the refusal carries the numbers and the split that pays now; that split does.
  const store = (await me(ada!)).energy, held = await energyOf(agentId);
  assert.ok(held.energy > 0, "the agent holds energy");
  const share = (await ada!.query("v2/play:agents", { gameId }))[0].share, whole = held.capacity / share, release = held.energy - 0.001 * whole;
  const priceOf = async (k: number) => (await perform(ada!, "agent.check", { language: "typescript", source: small + Array.from({ length: k }, (_, i) => `const pad${i} = ${i};\n`).join("") }, scope(), "action")).result.price;
  let lo = 0, hi = 256;   // the fewest padding lines whose price is above the store
  while (lo < hi) { const mid = (lo + hi) >> 1; if (await priceOf(mid) > store + 1) hi = mid; else lo = mid + 1; }
  const big = small + Array.from({ length: lo }, (_, i) => `const pad${i} = ${i};\n`).join(""), price = await priceOf(lo);
  assert.ok(price > store && price < store + release, `a price the agent's energy can cover: ${price} vs ${store} + ${release}`);
  const refused = await perform(ada!, "agent.summon", { language: "typescript", source: big, name: "Big" }, scope(), "action").catch((e: any) => e.data);
  const d = refused.error.data;
  assert.ok(Math.abs(d.price - price) < 1e-6 && Math.abs(d.store - store) < 1e-6 && d.perSecond > 0 && d.capacity > 0, JSON.stringify(d));
  assert.ok(d.secondsToPay === null || Math.abs(d.secondsToPay - (price - store) / d.perSecond) < 1e-6, "seconds at the current split");
  assert.deepEqual(Object.keys(d.payNow.shares), [agentId], "one agent covers it");
  assert.ok(d.payNow.shares[agentId] < share, "by lowering its share");
  assert.equal((await perform(ada!, "power.allocate", { shares: d.payNow.shares }, scope())).ok, true);
  // The energy the agent held above its new capacity moved into the store (movePower), none made or lost (planning:
  // nothing accrues), within the store's new capacity, and now covers the price.
  const [storeNow, heldNow] = [await me(ada!), await energyOf(agentId)];
  assert.ok(Math.abs(heldNow.energy - heldNow.capacity) < 1e-6, `it keeps what its new capacity holds: ${heldNow.energy} / ${heldNow.capacity}`);
  assert.ok(Math.abs(storeNow.energy + heldNow.energy - store - held.energy) < 1e-6, `the rest lands in the store: ${store}+${held.energy} → ${storeNow.energy}+${heldNow.energy}`);
  assert.ok(storeNow.energy >= price && storeNow.energy <= storeNow.capacity + 1e-6, `${storeNow.energy} pays ${price}, within ${storeNow.capacity}`);
  const paid = await perform(ada!, "agent.summon", { language: "typescript", source: big, name: "Big", share: 0.05 }, scope(), "action");
  assert.equal(paid.ok, true, `the split pays: ${JSON.stringify(paid)}`);
  assert.equal((await perform(ada!, "agent.destroy", { agentId: paid.result.agentId }, scope())).ok, true);
  await perform(ada!, "game.resume", {}, scope());
  const resumed = await ada!.query("v2/games:header", { gameId });
  assert.ok(resumed.phase === "live" && resumed.endsAt > Date.now(), "the end is set again on resume");
  assert.equal((await perform(bo!, "game.pause", {}, scope())).error.code, "refused", "one pause each");
  await new Promise(r => setTimeout(r, 4000));
  const moves = await ada!.query("v2/play:moves", { gameId, paginationOpts: { numItems: 50, cursor: null } });
  const energy = await ada!.query("v2/play:agentEnergy", { agentId: (await ada!.query("v2/play:agents", { gameId }))[0].agentId });
  assert.ok(energy.acts > 0 || moves.page.length > 0, "Ada's agent acts once the world runs");
  for (const m of moves.page) {
    // Live, only Ada's own moves name their mover; another player's move is unattributed (v1's public log).
    assert.ok(m.mine ? m.by?.name === "Play Ada" : m.by === null && m.calls.length === 0, `only Ada's own moves are attributed while live: ${JSON.stringify(m.by)}`);
    if (!m.mine) assert.equal(m.charge, null, "another player's spend is theirs");
    assert.ok(Array.isArray(m.notes) && (m.mine || m.notes.length === 0), "notes are the caller's own agent's");
    if (m.mine) {   // Ada's one agent, which notes its bits on every move
      const bits = Number(/^bits (\S+)$/.exec(m.notes[0] ?? "")?.[1]);
      assert.ok(Math.abs(bits - m.before.rarityBits) < 1e-6, `the agent's worth agrees with the server's (decision 23): ${m.notes[0]} vs ${m.before.rarityBits}`);
      const others = Number(/^others (\S+)$/.exec(m.notes[1] ?? "")?.[1]);
      assert.ok(Math.abs(others - m.before.want) < 1e-6, `the others' worth the agent sees is the server's: ${m.notes[1]} vs ${m.before.want}`);
    }
  }
  assert.ok(energy.settledAt >= (energy.lastActAt ?? 0) && energy.perSecond > 0, `an agent's energy is settled to the world clock: ${JSON.stringify(energy)}`);
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
