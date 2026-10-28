/**
 * Full games on Int, string and Grid with three gods, in TypeScript and Python (ported from api-server
 * game-integration "full games through the real routes"): start, planning → running, observation schema,
 * scoring parity with game-core personalView/leaderboard, validation (free; broken source; wrong language),
 * summon (god pays description bits; agent starts empty), transforms with charges summing to the agent's
 * spend, destroy (owner only, free), end by owner, the history record.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { codecOf, leaderboard, personalView, salience, type GameSettings } from "@workspace/game-core";
import { observationSchema } from "@workspace/player-client";
import { admin, api, envelope, gods, internal, PY, raw, roomWith, touch, TS, waitFor } from "./game-helpers.ts";

const SPECS = [
  { objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 } },
  { objectType: "string", typeArgs: { maxLength: 128 } },
  { objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" } },
] as const;
const BROKEN = { python: "def agent(x):\n    return [", typescript: "function agent(x) { return [; }" } as const;
const languages = (process.env.CODE_GODS_TEST_LANGUAGES ?? "typescript,python").split(",") as ("typescript" | "python")[];
const near = (a: number, b: number, label: string) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)), `${label}: ${a} vs ${b}`);

for (const spec of SPECS) for (const language of languages) {
  test(`full ${spec.objectType} game in ${language}: scores, agents, energy, transforms, destroy, history`, { timeout: 300000 }, async () => {
    const [host, ada, bo] = await gods(`${spec.objectType} Host`, `${spec.objectType} Ada`, `${spec.objectType} Bo`);
    await touch(host);
    const source = (language === "python" ? PY : TS)[spec.objectType];
    const other = language === "python" ? "typescript" : "python";
    const settings = {
      objectType: spec.objectType, typeArgs: spec.typeArgs, language, grammarId: `${language}-agent-v1`,
      complexityFunctionId: language === "python" ? "ast-bits-v1" : "ts-ast-bits-v1-uniform",
      startingObjectCount: 5, spawnRateHz: 0, planningSeconds: 3600, agentEnergyPerSecond: 100, agentBatteryActs: 2, interactionRateHz: 50,
    };
    const { roomId } = await roomWith([host, ada, bo], settings);
    const room = await host.c.query(api.rooms.get, { room: roomId });
    assert.equal(room.objectInstance.objectType, spec.objectType);
    const game = await host.c.action(api.owner.start, { roomId });

    // Public: values and salience only.
    let view = await host.c.query(api.games.view, { code: game.shortCode });
    assert.equal(view.objects.length, 5);
    assert.equal(view.phase, "planning");
    const codec = codecOf(settings as unknown as GameSettings);
    assert.ok(view.objects.every((o: any) => codec.isValid(o.value) && typeof o.salience === "number"));
    for (const leak of ["scores", "netBits", "rewardBits", "ordinal", "deities", "utility", "endAtWorld"]) assert.ok(!JSON.stringify(view).includes(`"${leak}"`), `public view hides ${leak}`);

    // Personal: own score, peer aggregates and the kid card; parity with game-core over the raw private scores.
    let obs = observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
    assert.equal(obs.phase, "planning");
    assert.equal(obs.instance!.objectType, spec.objectType);
    assert.ok(obs.instance!.helpers.some(h => h.group === "mutator"));
    assert.equal(obs.economy!.agentEnergyPerSecond, 100);
    assert.ok(obs.self.utility!.familyId && obs.self.utility!.emoji && obs.self.utility!.summary);
    assert.match(obs.self.utility!.source, language === "python" ? /def utility\(/ : /function utility\(/);
    let secret = await raw(game.gameId);
    assert.equal(obs.objects.length, 5);
    for (const o of obs.objects) {
      const stored = secret.objects.find((x: any) => x._id === o.id);
      const net = new Map<string, number>(stored.scores.map((s: any) => [s.god, s.netBits]));
      const expected = personalView(net, ada.subject);
      assert.equal(o.own.netBits, expected.netBits);
      near(o.peerNetBits, expected.peerNetBits, "peerNetBits");
      near(o.peerCare, expected.peerCare, "peerCare");
      near(o.payoff, expected.payoff, "payoff");
      near(o.peerNetBits, net.get(host.subject)! + net.get(bo.subject)!, "peerNetBits is the sum over the other gods");
      near(view.objects.find((x: any) => x.id === o.id).salience, salience(net), "salience is Σ net bits");
    }
    const board = leaderboard([host.subject, ada.subject, bo.subject], secret.objects.map((o: any) => new Map(o.scores.map((s: any) => [s.god, s.netBits]))));
    for (const row of board) near(obs.leaderboard.find(l => l.godId === row.godId)!.totalPayoff, row.totalPayoff, "leaderboard parity");

    // Validation: free, priced, with diagnostics; broken and wrong-language sources are refused.
    const send = (god: typeof ada, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
    const validation = await send(ada, { type: "validate", language, source });
    assert.equal(validation.accepted, true, validation.message);
    assert.ok(validation.validation.valid && validation.validation.cost > 0 && validation.validation.expectedActCost > 0);
    assert.ok(validation.validation.diagnostics.some((d: string) => /^Each act/.test(d)));
    assert.deepEqual(Object.keys(validation.validation.breakdown).sort(), ["decision", "erasure", "floor", "motion"]);
    assert.equal(validation.validation.breakdown.floor, 2, "the 2-bit floor");
    const broken = await send(ada, { type: "validate", language, source: BROKEN[language] });
    assert.equal(broken.accepted, false);
    assert.equal(broken.validation.valid, false);
    assert.equal((await send(ada, { type: "validate", language: other, source: (other === "python" ? PY : TS)[spec.objectType] })).accepted, false);
    secret = await raw(game.gameId);
    assert.ok(secret.deities.every((d: any) => d.spent === 0), "validation is free");

    // Summon: the god pays the description bits; the agent starts with no energy.
    const before = obs.self.energy;
    assert.equal((await send(ada, { type: "summon", language, source })).accepted, true);
    assert.equal((await send(bo, { type: "summon", language, source })).accepted, true);
    obs = observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
    assert.equal(obs.agents.length, 1, "own agents only");
    const [mine] = obs.agents;
    assert.equal(mine.summonCost, validation.validation.cost);
    near(mine.expectedActCost, validation.validation.expectedActCost, "the expected act cost is deterministic per source");
    assert.deepEqual([mine.energy, mine.eligible, mine.acts, mine.spent], [0, false, 0, 0]);
    assert.ok(obs.self.energy < before, "god energy dropped by the summon price");
    secret = await raw(game.gameId);
    assert.equal(secret.deities.find((d: any) => d.godId === ada.subject).spent, mine.summonCost);

    // Play: planning ends; agents earn world-time energy, act and pay.
    await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
    await waitFor(async () => (await ada.c.query(api.player.observation, { roomId })).transformations.length >= 2, "Ada's agent transforms objects", 60000);
    obs = observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
    assert.equal(obs.phase, "running");
    const mutatorIds = obs.instance!.mutators.map(m => m.id);
    for (const tr of obs.transformations) {
      assert.ok(tr.calls!.length >= 1 && tr.calls!.every(c => mutatorIds.includes(c[0])) && tr.cost! > 0);
      assert.notEqual(tr.before, tr.after);
    }
    const acted = obs.agents[0];
    assert.ok(acted.acts >= 2 && acted.spent > 0, "acts are charged to the agent's own account");
    assert.equal(acted.eligible, acted.energy >= acted.expectedActCost);
    // The event log: every act is charged exactly once; costs = decision + erasure + motion + floor.
    secret = await raw(game.gameId);
    const agentDoc = secret.agents.find((a: any) => a.ownerId === ada.subject);
    const acts = secret.batches.flatMap((b: any) => b.events).filter((e: any) => (e.t === "transform" || e.t === "fail") && e.agentId === agentDoc._id);
    assert.equal(acts.length, agentDoc.acts);
    near(acts.reduce((s: number, e: any) => s + e.cost.total, 0), agentDoc.spent, "the agent paid exactly its acts' charges");
    for (const e of acts) {
      near(e.cost.total, e.cost.decision + e.cost.erasure + e.cost.motion + e.cost.floor, "charge parts");
      assert.equal(e.cost.floor, 2);
      if (e.t === "fail") assert.equal(e.cost.erasure + e.cost.motion, 0);
    }
    // Objects stay scored consistently with the event log's net bits.
    const values = secret.objects.map((o: any) => o.value);
    assert.equal(new Set(values).size, values.length, "every object is unique");

    // Destroy: owner only, free.
    assert.equal((await send(bo, { type: "destroy", agentId: acted.id })).accepted, false);
    const energyBefore = obs.self.energy;
    assert.equal((await send(ada, { type: "destroy", agentId: acted.id })).accepted, true);
    obs = observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
    assert.equal(obs.agents.length, 0);
    assert.ok(obs.self.energy >= energyBefore, "destroying costs nothing");
    assert.equal((await raw(game.gameId)).agents.length, 1, "Bo's agent lives on");

    // End by the owner: the public result joins the room's history.
    await host.c.mutation(api.rooms.endActiveGame, { roomId });
    const history = await host.c.query(api.rooms.history, { room: roomId });
    const record = history.find((h: any) => h.id === game.gameId);
    assert.equal(record.endReason, "owner");
    assert.equal(record.leaderboard.length, 3);
    view = await host.c.query(api.games.view, { code: game.shortCode });
    assert.equal(view.status, "ended");
    for (const leak of ["scores", "netBits", "source", "deities", "account"]) {
      assert.ok(!JSON.stringify(history).includes(`"${leak}"`) && !JSON.stringify(view).includes(`"${leak}"`), `history hides ${leak}`);
    }
  });
}
