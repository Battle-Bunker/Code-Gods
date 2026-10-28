import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, defaultSettingsFor, instantiationOf, type GameSettings } from "@workspace/game-core";
import { objectType } from "@workspace/game-types";
import { card, context } from "@workspace/game-utilities";
import { RoomActionBody } from "../../../lib/api-zod/src/generated/api.ts";
import type { ActSettings, GameRuntime } from "@workspace/game-runtime";
import { actSettings, createRuntimeAdapter, createUtilitiesAdapter, probeValue, requireAdapters } from "../src/game/adapters.ts";
import { initializeRuntimeAdapters, shutdownRuntimeAdapters } from "../src/game/runtime-setup.ts";

test("room mutation schema validates compute budgets, the dispatch ceiling and the new economy knobs", () => {
  const action = (settings: unknown) => ({ action: "settings", requestId: "settings-budget", revision: 0, settings });
  for (const interactionComputeMs of [1, 5, 1000]) {
    const parsed = RoomActionBody.parse(action({ ...DEFAULT_SETTINGS, interactionComputeMs }));
    assert.equal(parsed.settings?.interactionComputeMs, interactionComputeMs);
  }
  for (const interactionComputeMs of [0, -1, 1.5, 1001, NaN, Infinity, -Infinity, "5", null]) {
    assert.equal(RoomActionBody.safeParse(action({ ...DEFAULT_SETTINGS, interactionComputeMs })).success, false);
  }
  assert.equal(RoomActionBody.safeParse(action({ ...DEFAULT_SETTINGS, interactionRateHz: 1000 })).success, true);
  assert.equal(RoomActionBody.safeParse(action({ ...DEFAULT_SETTINGS, interactionRateHz: 1000.1 })).success, false);
  const { interactionRateHz: _rate, agentEnergyPerSecond: _income, agentBatteryActs: _battery, ...missing } = DEFAULT_SETTINGS;
  const parsed = RoomActionBody.parse(action(missing)).settings!;
  assert.deepEqual([parsed.interactionRateHz, parsed.agentEnergyPerSecond, parsed.agentBatteryActs], [100, 2, 2]);
  const { typeArgs: _args, ...untyped } = DEFAULT_SETTINGS;
  assert.equal(RoomActionBody.safeParse(action(untyped)).success, false, "typeArgs is required");
  assert.equal(RoomActionBody.safeParse(action({ ...DEFAULT_SETTINGS, agentBatteryActs: 0.5 })).success, false);
  const stripped = RoomActionBody.parse(action({ ...DEFAULT_SETTINGS, intMin: 0, stringMaxLength: 5 })).settings as Record<string, unknown>;
  assert.equal("intMin" in stripped || "stringMaxLength" in stripped, false, "removed fields are not part of the schema");
});

test("runtime adapter builds ActSettings from the instantiation: prelude, pricing vocabulary, budgets, seed", async () => {
  const settings = { ...DEFAULT_SETTINGS, interactionComputeMs: 37, stepBudget: 1234 };
  const calls: ActSettings[] = [], seeds: string[] = [];
  const pool = {
    async inspect(_source: string, received: ActSettings) { calls.push(received); return { cost: 8 }; },
    async act(_source: string, _input: number, received: ActSettings, seed: string) { calls.push(received); seeds.push(seed); return { calls: "[]", usedRandom: false, steps: 3 }; },
  } as unknown as GameRuntime;
  const adapter = createRuntimeAdapter({ python: pool });
  assert.deepEqual(await adapter.inspect("def agent(x):\n    return []", settings), { cost: 8 });
  assert.deepEqual(await adapter.act("def agent(x):\n    return []", 42, settings, 2n ** 63n + 5n), { calls: "[]", usedRandom: false, steps: 3 });
  assert.deepEqual(seeds, [(2n ** 63n + 5n).toString()], "the 64-bit seed crosses as a decimal string");
  const inst = instantiationOf(settings), parts = objectType("Int").prelude(inst);
  for (const received of calls) {
    assert.equal(received.interactionComputeMs, 37);
    assert.equal(received.stepBudget, 1234);
    assert.equal(received.objectType, "Int");
    assert.equal(received.wireMaxLength, 0);
    assert.deepEqual(received.prelude, { key: parts.hash, python: parts.python, js: parts.js, dts: parts.dts, pricing: parts.pricing });
    assert.ok(received.prelude.pricing.python.mutators.includes("add"));
    assert.equal("typeArgs" in received || "startingEnergy" in received, false, "only the runtime's view crosses the boundary");
  }
  const grid = actSettings(defaultSettingsFor("Grid"));
  assert.equal(grid.wireMaxLength, objectType("Grid").codec(instantiationOf(defaultSettingsFor("Grid"))).maxLength);
});

test("isolated adapters: both languages, every object type's prelude, agent price, calls and shutdown", { timeout: 180000 }, async t => {
  try {
    await initializeRuntimeAdapters();
    const { runtime } = requireAdapters();
    for (const language of ["python", "typescript"] as const) {
      await t.test(language, async () => {
        assert.ok(runtime.languages.includes(language), `${language} failed its readiness probes`);
        const cases = [
          ["Int", 41, language === "python" ? "def agent(x):\n    return [add(1)]" : "function agent(x) { return [add(1)]; }", '[["add",{"k":1}]]'],
          ["string", "hello\0\n", language === "python" ? "def agent(s):\n    return [rotate(1)]" : "function agent(s) { return [rotate(1)]; }", '[["rotate",{"k":1}]]'],
          ["Grid", undefined, language === "python" ? "def agent(grid):\n    return [paint(row(2), \"red\")]" : "function agent(grid) { return [paint(row(2), \"red\")]; }",
            '[["paint",{"colour":0,"kind":"line","region":[0,2]}]]'],
        ] as const;
        for (const [type, given, source, calls] of cases) {
          const settings: GameSettings = defaultSettingsFor(type, language);
          const input = given ?? probeValue(settings);
          const inspection = await runtime.inspect(source, settings);
          assert.equal(inspection.complexityFunctionId, language === "python" ? "ast-bits-v1" : "ts-ast-bits-v1-uniform");
          assert.ok(inspection.cost > 0 && inspection.literalMoves.length === 1, `${type}: one literal move`);
          assert.equal(JSON.stringify(inspection.literalMoves), calls, `${type}: the literal move is the act's call`);
          const act = await runtime.act(source, input, settings, 7n);
          assert.equal(act.calls, calls);
          assert.equal(act.usedRandom, false);
        }
        const empty = language === "python" ? "def agent(x):\n    return []" : "function agent(x) { return []; }";
        assert.ok((await runtime.inspect(empty, defaultSettingsFor("Int", language))).cost > 0);
        await assert.rejects(runtime.inspect(language === "python" ? "lambda x: x" : "(x: number) => x", defaultSettingsFor("Int", language)),
          (error: any) => error.code === "COMPILE", "a bare callable is not an agent");
      });
    }
  } finally { shutdownRuntimeAdapters(); }
  assert.throws(requireAdapters, { code: "RUNNER_UNAVAILABLE" });
});

test("utility functions are dealt as plain data and score identically after a JSON round trip", () => {
  const adapter = createUtilitiesAdapter();
  for (const type of ["Int", "string", "Grid"] as const) {
    const settings = defaultSettingsFor(type);
    const inst = instantiationOf(settings), T = objectType(type), codec = T.codec(inst);
    for (const count of [3, 8]) {
      const dealt = adapter.deal(settings, count);
      assert.equal(dealt.length, count);
      assert.equal(new Set(dealt.map(d => JSON.stringify(d))).size, count, "no two gods share an identical utility function");
      for (const descriptor of dealt.slice(0, 3)) {
        const restored = JSON.parse(JSON.stringify(descriptor));
        for (let i = 0; i < 3; i++) {
          const value = codec.encode(T.spawn(inst, { int: b => Math.floor(Math.random() * b), big: b => BigInt(Math.floor(Math.random() * Number(b))) }));
          const score = adapter.score(settings, restored, value);
          assert.deepEqual(score, adapter.score(settings, descriptor, value));
          assert.ok(score.rewardBits >= 0 && Number.isFinite(score.netBits));
          if (!descriptor.penalty) assert.equal(score.netBits, score.rewardBits);
        }
        const c = card(restored, context(inst));
        assert.ok(c.summary.length > 10 && c.emoji && c.name);
        assert.match(c.source.python, /def utility\(/);
        assert.match(c.source.typescript, /function utility\(/);
      }
    }
  }
  const withDefence = adapter.deal({ ...defaultSettingsFor("Grid"), defenceRate: 1 }, 3);
  assert.ok(withDefence.every(d => d.penalty), "defenceRate 1 deals a defence goal to every god");
  const settings = { ...defaultSettingsFor("Grid"), defenceRate: 1 }, inst = instantiationOf(settings);
  const value = objectType("Grid").codec(inst).encode(objectType("Grid").spawn(inst, { int: b => Math.floor(Math.random() * b), big: b => 0n * b }));
  const scored = adapter.score(settings, withDefence[0], value);
  assert.ok(scored.penaltyBits !== undefined && scored.penaltyBits >= 0);
  assert.throws(() => adapter.score(DEFAULT_SETTINGS, { familyId: "pantheon-of-friction-v1", params: {} }, 0), /Unknown utility family/);
});
