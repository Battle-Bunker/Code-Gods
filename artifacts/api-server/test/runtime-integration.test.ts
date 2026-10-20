import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type GameSettings } from "@workspace/game-core";
import { RoomActionBody } from "../../../lib/api-zod/src/generated/api.ts";
import type { GameRuntime } from "@workspace/game-runtime";
import { card, utility } from "@workspace/game-utilities";
import { createRuntimeAdapter, createUtilitiesAdapter, requireAdapters } from "../src/game/adapters.ts";
import { initializeRuntimeAdapters, shutdownRuntimeAdapters } from "../src/game/runtime-setup.ts";

test("room mutation schema validates compute budgets and the product dispatch ceiling", () => {
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
  const { interactionRateHz: _rate, ...missingRate } = DEFAULT_SETTINGS;
  assert.equal(RoomActionBody.parse(action(missingRate)).settings?.interactionRateHz, 100);
});

test("runtime adapter propagates the per-room compute budget without dropping settings", async () => {
  const settings = { ...DEFAULT_SETTINGS, interactionComputeMs: 37 };
  const calls: GameSettings[] = [];
  const pool = {
    async inspect(_source: string, received: GameSettings) {
      calls.push(received);
      return { cost: 6 };
    },
    async execute(_source: string, input: number, received: GameSettings) {
      calls.push(received);
      return { value: input };
    },
  } as unknown as GameRuntime;
  const adapter = createRuntimeAdapter({ python: pool });
  assert.deepEqual(await adapter.inspect("lambda x: x", settings), { cost: 6 });
  assert.equal(await adapter.execute("lambda x: x", 42, settings), 42);
  assert.deepEqual(calls.map(s => s.interactionComputeMs), [37, 37]);
  assert.ok(calls.every(s => s === settings));
});

test("isolated adapters: both languages, domain identities, structural source cost and shutdown", { timeout: 90000 }, async t => {
  try {
    await initializeRuntimeAdapters();
    const { runtime } = requireAdapters();
    for (const language of ["python", "typescript"] as const) {
      await t.test(language, async () => {
        assert.ok(runtime.languages.includes(language), `${language} failed its readiness probes`);
        for (const objectType of ["Int", "string"] as const) {
          const settings: GameSettings = {
            ...DEFAULT_SETTINGS, language, objectType, grammarId: `${language}-standard-v1`,
          };
          const source = language === "python" ? "lambda x: x"
            : objectType === "Int" ? "(x: number) => x" : "(x: string) => x";
          assert.equal((await runtime.inspect(source, settings)).cost, 6);
          for (const input of objectType === "Int" ? [-37, 0, 37] : ["", "ASCII\0\n", "hello"]) {
            assert.equal(await runtime.execute(source, input, settings), input);
          }
          if (objectType === "string") {
            const outputNul = language === "python" ? 'lambda x: "A\\x00\\nB"' : '(x: string) => "A\\x00\\nB"';
            assert.equal(await runtime.execute(outputNul, "", settings), "A\0\nB");
            if (language === "typescript") {
              assert.equal(await runtime.execute('(x: string) => { JSON.stringify = () => "tampered"; return x; }', "safe\0\n", settings), "safe\0\n");
            }
          }
          const plusOne = language === "python" ? "lambda x: x + 1" : "(x: number) => x + 1";
          assert.equal((await runtime.inspect(plusOne, { ...settings, objectType: "Int" })).cost, 9);
        }
      });
    }
  } finally { shutdownRuntimeAdapters(); }
  assert.throws(requireAdapters, { code: "RUNNER_UNAVAILABLE" });
});

test("utility functions are dealt as plain data and evaluate identically after a JSON round trip", () => {
  const adapter = createUtilitiesAdapter();
  for (const objectType of ["Int", "string"] as const) {
    const settings: GameSettings = { ...DEFAULT_SETTINGS, objectType };
    for (const count of [3, 8]) {
      const dealt = adapter.deal(settings, count);
      assert.equal(dealt.length, count);
      assert.equal(new Set(dealt.map(d => JSON.stringify(d))).size, count, "no two gods share an identical utility function");
      for (const descriptor of dealt) {
        const restored = JSON.parse(JSON.stringify(descriptor));
        for (const value of objectType === "Int" ? [settings.intMin, -37, 0, 37, settings.intMax]
          : ["", "hello", "\0\n", "a".repeat(settings.stringMaxLength)]) {
          assert.equal(adapter.evaluate(restored, value), utility(descriptor, value));
        }
        const { summary, source } = card(restored);
        assert.ok(summary.length > 40);
        assert.match(source.python, /def utility\(x/);
        assert.match(source.typescript, /function utility\(x/);
      }
    }
  }
  assert.throws(() => adapter.deal({ ...DEFAULT_SETTINGS, intMin: 0, intMax: 1 }, 3), /widen the domain/);
  assert.throws(() => adapter.evaluate({} as never, 0), /descriptor/);
  assert.throws(() => adapter.evaluate({ familyId: "pantheon-of-friction-v1", params: {} }, 0), /Unknown utility family/);
});
