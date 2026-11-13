/**
 * Power (docs/energy-model.md §6) end to end: each deity's fixed budget is split into its agents' shares, the rest is its
 * own income. A summon takes half the unallocated power by default (or the share it names), allocatePower re-allocates
 * within the budget, destroying an agent returns its share, and every change is in the event log.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationSchema } from "@workspace/player-client";
import { admin, api, envelope, gods, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

test("power: shares out of a fixed budget, re-allocation, destroy returns the share; incomes follow", { timeout: 180000 }, async () => {
  const [host, ada, bo] = await gods("Power Host", "Power Ada", "Power Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], {
    objectType: "Int", typeArgs: { min: -1000000, max: 1000000 }, languages: ["typescript"],
    startingObjectCount: 3, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 40, startingEnergy: 5000, interactionRateHz: 5,
    fullChargeSeconds: 3600,   // a store far larger than this test fills: capacity has its own test below
  });
  const game = await startGame(host, roomId);
  const send = (command: Record<string, unknown>) => ada.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const observe = async () => observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));

  const first = await send({ type: "summon", name: "One", language: "typescript", source: "function agent(n) { return []; }" });
  assert.equal(first.accepted, true, first.message);
  const second = await send({ type: "summon", name: "Two", language: "typescript", source: "function agent(n) { return [add(1)]; }", powerShare: 0.3 });
  assert.equal(second.accepted, true, second.message);
  let obs = await observe();
  const [one, two] = ["One", "Two"].map(n => obs.agents.find(a => a.name === n)!);
  assert.equal(one.powerShare, 0.5, "the default: half of the unallocated power");
  assert.equal(two.powerShare, 0.3, "or the share the summon names");
  assert.equal(obs.economy!.powerPerSecond, 40);
  assert.equal(obs.self.allocated, 0.8);
  assert.ok(Math.abs(obs.self.income! - 8) < 1e-9, "the deity keeps 20% of 40 bits/s");
  assert.ok(Math.abs(one.income! - 20) < 1e-9 && Math.abs(two.income! - 12) < 1e-9);

  // The budget binds: shares total at most 1.
  const over = await send({ type: "summon", name: "Three", language: "typescript", source: "function agent(n) { return [add(2)]; }", powerShare: 0.5 });
  assert.equal(over.accepted, false);
  assert.match(over.message, /unallocated/);
  const tooMuch = await send({ type: "allocatePower", agentId: two.id, share: 0.6 });
  assert.equal(tooMuch.accepted, false);
  assert.match(tooMuch.message, /at most 50%/);
  // Re-allocate: Two takes everything One gives up.
  assert.equal((await send({ type: "allocatePower", agentId: one.id, share: 0.1 })).accepted, true);
  assert.equal((await send({ type: "allocatePower", agentId: two.id, share: 0.7 })).accepted, true);
  obs = await observe();
  assert.equal(obs.agents.find(a => a.id === two.id)!.powerShare, 0.7);
  assert.equal(obs.self.allocated, 0.8);
  // Only the owner allocates its agents.
  const stolen = await bo.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "allocatePower", agentId: one.id, share: 0 }, game.gameId) });
  assert.equal(stolen.accepted, false);

  // Destroying returns the share; the deity's income rises.
  assert.equal((await send({ type: "destroy", agentId: one.id })).accepted, true);
  obs = await observe();
  assert.equal(obs.self.allocated, 0.7);
  assert.ok(Math.abs(obs.self.income! - 12) < 1e-9);

  // Running: the deity's own energy grows at its income on world time; the log has every share.
  const before = obs.self.energy;
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).game.worldSeconds >= 3, "the world runs", 60000, 250);
  obs = await observe();
  assert.ok(obs.self.energy > before + 2 * 12, `${obs.self.energy} vs ${before}`);
  const events = (await raw(game.gameId)).batches.flatMap((b: any) => b.events);
  assert.deepEqual(events.filter((e: any) => e.t === "power").map((e: any) => e.share), [0.1, 0.7]);
  assert.deepEqual(events.filter((e: any) => e.t === "summon").map((e: any) => e.powerShare), [0.5, 0.3]);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

/**
 * Capacity (docs/energy-model.md §6.1): every account holds at most its power × fullChargeSeconds. Hand-derived: P = 40
 * bits/s and T = 10 s, so a god with nothing allocated holds 400 bits, an agent with half the power 200, and the god's
 * own account then 200. Lowering a share drops what is held above the new capacity at once. A game stored without the
 * setting has no capacity.
 */
test("capacity: accounts fill to power × fullChargeSeconds and stop; lowering a share loses the excess", { timeout: 180000 }, async () => {
  const [host, ada, bo] = await gods("Cap Host", "Cap Ada", "Cap Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], {
    objectType: "Int", typeArgs: { min: -1000000, max: 1000000 }, languages: ["typescript"],
    startingObjectCount: 3, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 40, startingEnergy: 5000, interactionRateHz: 5,
    fullChargeSeconds: 10,
  });
  const game = await startGame(host, roomId);
  const send = (command: Record<string, unknown>) => ada.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const observe = async () => observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
  const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);

  let obs = await observe();
  assert.equal(obs.economy!.fullChargeSeconds, 10);
  near(obs.self.capacity!, 400, "nothing allocated: 40 bits/s × 10 s");
  near(obs.self.energy, 400, "startingEnergy above the capacity is not held");

  // A summon far above what the unallocated power can ever store is refused, and says why.
  const huge = await send({ type: "summon", name: "Huge", language: "typescript",
    source: `function agent(n) { const table = [${Array.from({ length: 400 }, (_, i) => 7919 * (i + 3)).join(", ")}]; return [add(table[0])]; }` });
  assert.equal(huge.accepted, false);
  assert.match(huge.message, /holds at most 400 bits/);

  const first = await send({ type: "summon", name: "Saver", language: "typescript", source: "function agent(n) { return []; }" });
  assert.equal(first.accepted, true, first.message);
  obs = await observe();
  const saver = obs.agents.find(a => a.name === "Saver")!;
  assert.equal(saver.powerShare, 0.5);
  near(saver.capacity!, 200, "half of 40 bits/s × 10 s");
  assert.equal(saver.energy, 0, "an agent starts empty");
  near(obs.self.capacity!, 200, "the god keeps the other half");
  near(obs.self.energy, 200, "what the god held above its new capacity is lost");

  // Running: both fill to their capacity and stop there (the saver never acts: it pays at most the price of its offers).
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).game.worldSeconds >= 12, "the world runs past a full charge", 90000, 250);
  obs = await observe();
  const full = obs.agents.find(a => a.id === saver.id)!;
  assert.ok(full.energy <= 200 + 1e-6 && full.energy > 180, `the saver is full: ${full.energy}`);
  near(obs.self.energy, 200, "the god's own energy stays at its capacity");

  // Lowering the saver's share to 10% (4 bits/s: holds 40) loses the rest at once; the god's capacity rises to 360.
  assert.equal((await send({ type: "allocatePower", agentId: saver.id, share: 0.1 })).accepted, true);
  obs = await observe();
  const lowered = obs.agents.find(a => a.id === saver.id)!;
  near(lowered.capacity!, 40, "10% of 40 bits/s × 10 s");
  assert.ok(lowered.energy <= 40 + 1e-6, `energy above the new capacity is lost: ${lowered.energy}`);
  near(obs.self.capacity!, 360, "90% unallocated");
  assert.ok(obs.self.energy >= 200 - 1e-6 && obs.self.energy <= 360 + 1e-6, `the god keeps what it had and refills: ${obs.self.energy}`);
  const world = (await raw(game.gameId)).game.worldSeconds;
  await waitFor(async () => (await raw(game.gameId)).game.worldSeconds >= world + 6, "the god's store refills", 60000, 250);
  near((await observe()).self.energy, 360, "full again: 160 bits at 36 bits/s takes under 5 s");

  // A game stored without the setting (started before it existed) has no capacity: nothing is reported, energy keeps growing.
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: {}, unsetSettings: ["fullChargeSeconds"] });
  const then = (await raw(game.gameId)).game.worldSeconds;
  await waitFor(async () => (await raw(game.gameId)).game.worldSeconds >= then + 3, "the legacy game runs", 60000, 250);
  obs = await observe();
  assert.equal(obs.self.capacity, undefined);
  assert.equal(obs.economy!.fullChargeSeconds, undefined);
  assert.equal(obs.agents.find(a => a.id === saver.id)!.capacity, undefined);
  assert.ok(obs.self.energy > 360 + 2 * 36, `no capacity: ${obs.self.energy}`);
  // Such a game is still examined and summoned into: its settings validate without the field.
  const checked = await send({ type: "validate", language: "typescript", source: "function agent(n) { return [add(3)]; }" });
  assert.equal(checked.accepted, true, checked.message);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

/**
 * Debt within capacity, and debt moves with power (docs/energy-model.md §7.2). P = 40 bits/s, T = 10 s. Both agents
 * add 11111 (five digit adds: more than 40 bits, less than 360).
 *  - "Small" has 5% of the power: it holds 20 bits and may owe 20, so it can never commit that change. Each try fails
 *    as "unaffordable" and pays only its reads.
 *  - "Big" has 90%: it holds 360 and may owe 360, so it commits with almost nothing and then owes. Its god keeps 10%
 *    (holds 40). Taking half of Big's power moves half its debt to the god; destroying it moves the rest. The god then
 *    owes, cannot summon, and repays from its own income: the debt the exploit used to erase is paid in full.
 */
test("debt: an agent may owe at most what it holds, and what it owes follows its power to its god", { timeout: 240000 }, async () => {
  const [host, ada, bo] = await gods("Debt Host", "Debt Ada", "Debt Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], {
    objectType: "Int", typeArgs: { min: -1000000, max: 1000000 }, languages: ["typescript"],
    startingObjectCount: 6, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 40, startingEnergy: 5000, interactionRateHz: 20, fullChargeSeconds: 10,
  });
  const game = await startGame(host, roomId);
  const send = (god: typeof ada, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const observe = async (god: typeof ada) => observationSchema.parse(await god.c.query(api.player.observation, { roomId }));
  const source = "function agent(n) { return [add(11111)]; }";
  const small = await send(ada, { type: "summon", name: "Small", language: "typescript", source, powerShare: 0.05 });
  assert.equal(small.accepted, true, small.message);
  const big = await send(bo, { type: "summon", name: "Big", language: "typescript", source, powerShare: 0.9 });
  assert.equal(big.accepted, true, big.message);
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  const agentOf = async (god: typeof ada) => (await raw(game.gameId)).agents.find((a: any) => a.ownerId === god.subject);
  await waitFor(async () => (await agentOf(bo))?.transforms >= 1 && ((await agentOf(ada))?.failures?.unaffordable ?? 0) >= 3, "Big commits and Small is refused", 120000, 250);

  // Small: refused every time, paying only for its turn; it never owes more than it can hold.
  const state = await raw(game.gameId);
  const events = state.batches.flatMap((b: any) => b.events);
  const offer = Math.log2(6) / 32;   // each turn's own read: which of the 6 objects
  const price = events.find((e: any) => e.t === "transform").cost.total;
  assert.ok(price > 40 && price < 360, `the act costs ${price}: more than Small may ever pay (20 held + 20 owed), less than Big may owe`);
  const smallAgent = state.agents.find((a: any) => a.ownerId === ada.subject);
  assert.equal(smallAgent.transforms ?? 0, 0, "Small never commits");
  const refused = events.filter((e: any) => e.t === "fail" && e.agentId === smallAgent._id);
  assert.ok(refused.length >= 3);
  for (const e of refused) {
    assert.match(e.reason, /^could not afford this change: it costs \d+\.\d bits, the agent had -?\d+\.\d and may owe at most 20\.0$/);
    assert.ok(e.cost.change === 0 && Math.abs(e.cost.total - offer) < 1e-9, `a refusal pays its reads only: ${JSON.stringify(e.cost)}`);
  }
  const memo = await admin.query(internal.testing.futileActs, { gameId: game.gameId });
  assert.ok(memo.every((m: any) => m.agentId !== smallAgent._id || m.entries.length === 0), "a refusal is not remembered as futile: it commits once the agent holds more");
  for (const a of state.agents) assert.ok(a.account.balance >= -(a.powerShare * 40 * 10) - 1e-6, `${a.name} owes at most its capacity: ${a.account.balance}`);
  const adaSees = await observe(ada);
  assert.ok((adaSees.agents[0].outcomes?.failures.unaffordable ?? 0) >= 3);
  assert.match(adaSees.agents[0].diagnosis!.hint!, /bigger power share/);

  // Big owes right after an act. Take half its power: half of what it owes moves to Bo's own account.
  const inDebt = async () => { const a = await agentOf(bo); return a.account.balance < -60 ? a : null; };
  let bigAgent = await waitFor(inDebt, "Big is in debt", 60000, 50);
  const lowered = await send(bo, { type: "allocatePower", agentId: bigAgent._id, share: 0.45 });
  assert.equal(lowered.accepted, true, lowered.message);
  const half = lowered.owed;
  assert.ok(half > 20 && half < 180, `half of Big's debt moved: ${half}`);
  let boSees = await observe(bo);
  assert.ok(boSees.self.energy < 40 - half + 25, `it came out of Bo's own energy (at most 40 held): ${boSees.self.energy}`);
  // Destroy it while it still owes: the rest moves too, Bo now owes, and cannot summon until its income has repaid it.
  bigAgent = await agentOf(bo);
  if (bigAgent.account.balance < -5) {
    const before = (await observe(bo)).self.energy;
    const destroyed = await send(bo, { type: "destroy", agentId: bigAgent._id });
    assert.equal(destroyed.accepted, true, destroyed.message);
    const rest = destroyed.owed;
    assert.ok(rest > 0, "what it still owed moved to Bo");
    boSees = await observe(bo);
    // All of Bo's power is its own again (40 bits/s): allow a second of income between the reads.
    assert.ok(boSees.self.energy <= before - rest + 60, `Bo's own energy fell by the debt: ${before} − ${rest} → ${boSees.self.energy}`);
    if (boSees.self.energy < -20) {
      const again = await send(bo, { type: "summon", name: "Again", language: "typescript", source, powerShare: 0.9 });
      assert.equal(again.accepted, false, "an owing god cannot summon");
      assert.match(again.message, /you owe \d+ bits/);
    }
  }
  // The log records what moved, for the replay.
  const log = (await raw(game.gameId)).batches.flatMap((b: any) => b.events);
  assert.ok(Math.abs(log.find((e: any) => e.t === "power").owed - half) < 1e-9);
  // Bo's own income (all 40 bits/s now) repays it: within its capacity time Bo is out of debt and can summon again.
  await waitFor(async () => (await observe(bo)).self.energy >= 60, "Bo's income repays the debt", 60000, 250);
  const again = await send(bo, { type: "summon", name: "Again", language: "typescript", source: "function agent(n) { return []; }", powerShare: 0.5 });
  assert.equal(again.accepted, true, again.message);
  // A re-summoned agent starts empty (here: at most a second or two of its own 20 bits/s): nothing was gained.
  assert.ok((await observe(bo)).agents.find(a => a.name === "Again")!.energy < 60, "a re-summoned agent starts empty");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

/**
 * Debt moves with power, from a god to an agent (docs/energy-model.md §7.2; game-core movePower). P = 40 bits/s,
 * T = 10 s. Bo keeps 10% for itself (holds 40), gives "Big" 80% (it adds 111111111 on credit: holds 320, may owe 320) and
 * "Idle" 10% (it never acts: holds 40). Big's change is nine digit adds (about 210 bits). Bo destroys Big while it owes more than 150, so Bo itself owes more than 110
 * and has 90% unallocated. Bo then gives Idle half of that unallocated power (10% → 55%): Idle takes exactly half of
 * what Bo owes, so what Bo still owes equals what moved. Giving it the rest moves the rest: Bo owes nothing, Idle owes
 * it all, and nothing was lost on the way. What would break: a god shedding its debt by re-allocating (the amount
 * vanishing), or an agent taking a different fraction of the debt than of the power.
 */
test("debt: a god that owes gives an agent power, and the same fraction of its debt goes with it", { timeout: 240000 }, async () => {
  const [host, ada, bo] = await gods("Owing Host", "Owing Ada", "Owing Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], {
    objectType: "Int", typeArgs: { min: -2000000000, max: 2000000000 }, languages: ["typescript"],
    startingObjectCount: 6, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 40, startingEnergy: 5000, interactionRateHz: 20, fullChargeSeconds: 10,
  });
  const game = await startGame(host, roomId);
  const send = (command: Record<string, unknown>) => bo.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const big = await send({ type: "summon", name: "Big", language: "typescript", source: "function agent(n) { return [add(111111111)]; }", powerShare: 0.8 });
  assert.equal(big.accepted, true, big.message);
  const idle = await send({ type: "summon", name: "Idle", language: "typescript", source: "function agent(n) { return []; }", powerShare: 0.1 });
  assert.equal(idle.accepted, true, idle.message);
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  const stored = async () => {
    const state = await raw(game.gameId);
    return { state, deity: state.deities.find((d: any) => d.godId === bo.subject), idle: state.agents.find((a: any) => a.name === "Idle"), big: state.agents.find((a: any) => a.name === "Big") };
  };
  const owing = await waitFor(async () => { const s = await stored(); return s.big.account.balance < -150 ? s : null; }, "Big owes more than 150", 120000, 30);
  const idleId = owing.idle._id;
  const destroyed = await send({ type: "destroy", agentId: owing.big._id });
  assert.equal(destroyed.accepted, true, destroyed.message);
  assert.ok(destroyed.owed > 150, `Big's debt moved to Bo: ${destroyed.owed}`);

  // Half of Bo's unallocated power (90%) to Idle: half of what Bo owes at that moment goes with it.
  const half = await send({ type: "allocatePower", agentId: idleId, share: 0.55 });
  assert.equal(half.accepted, true, half.message);
  assert.ok(half.owed < -20, `debt moved from Bo onto Idle (negative: towards the agent): ${half.owed}`);
  assert.ok(half.owed > -destroyed.owed / 2 - 1e-6, `at most half of what Bo took over: ${half.owed} of ${destroyed.owed}`);
  let s = await stored();
  assert.ok(Math.abs(s.deity.account.balance - half.owed) < 1e-6, `Bo keeps the other half: ${s.deity.account.balance} against ${half.owed} moved`);
  // Idle held at most its old capacity (40) and never acts: its balance is that minus the debt it took.
  assert.ok(s.idle.account.balance >= half.owed - 1e-6 && s.idle.account.balance <= half.owed + 40 + 1e-6, `Idle: ${s.idle.account.balance}`);

  // The rest of Bo's power (45% of 45% unallocated): the rest of the debt. Bo owes nothing; nothing was lost.
  const rest = await send({ type: "allocatePower", agentId: idleId, share: 1 });
  assert.equal(rest.accepted, true, rest.message);
  s = await stored();
  if (rest.owed !== undefined) {
    assert.ok(rest.owed < 0);
    assert.ok(Math.abs(s.deity.account.balance) < 1e-6, `Bo gave all its power and all its debt: ${s.deity.account.balance}`);
  }
  // The log records what moved in each direction, for the replay: + onto the god, − onto the agent.
  const events = s.state.batches.flatMap((b: any) => b.events);
  assert.ok(Math.abs(events.find((e: any) => e.t === "destroy").owed - destroyed.owed) < 1e-9);
  assert.deepEqual(events.filter((e: any) => e.t === "power").map((e: any) => e.owed), [half.owed, ...(rest.owed !== undefined ? [rest.owed] : [])]);
  // Idle now has all of Bo's power (40 bits/s) and repays what it took within the capacity time.
  await waitFor(async () => (await stored()).idle.account.balance > 0 || ((await bo.c.query(api.player.observation, { roomId })) as any).agents[0].energy > 0, "Idle's income repays the debt", 60000, 250);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
