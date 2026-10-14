import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type GameSettings } from "@workspace/game-core";
import { generate, evaluatePreference, type Domain, type Preference } from "@workspace/game-values";
import { createHash } from "node:crypto";
import { createValuesAdapter, requireAdapters } from "../src/game/adapters.ts";
import { initializeRuntimeAdapters, shutdownRuntimeAdapters } from "../src/game/runtime-setup.ts";

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

test("values serialize and rehydrate without executable closures, in both domains and languages", () => {
  const adapter = createValuesAdapter();
  const seed = "integration-seed";
  const numericSeed = createHash("sha256").update(seed).digest().readUInt32BE(0);
  for (const language of ["python", "typescript"] as const) {
    for (const objectType of ["Int", "string"] as const) {
      const settings: GameSettings = {
        ...DEFAULT_SETTINGS, language, objectType, grammarId: `${language}-standard-v1`,
      };
      for (const count of [3, 8]) {
        const generated = adapter.generate(settings, count, seed);
        const expected = generate(objectType === "Int"
          ? { objectType, intMin: settings.intMin, intMax: settings.intMax, seed: numericSeed, deityCount: count }
          : { objectType, stringMaxLength: settings.stringMaxLength, seed: numericSeed, deityCount: count });
        assert.equal(generated.length, count);
        generated.forEach((god, index) => {
          assert.equal(god.source, expected.gods[index].source[language]);
          assert.match(god.source, language === "python" ? /def value\(x\):/ : /export function value/);
          const restored = JSON.parse(JSON.stringify(god.descriptor)) as { domain: Domain; preference: Preference };
          const fresh = createValuesAdapter();
          for (const value of objectType === "Int" ? [settings.intMin, -37, 0, 37, settings.intMax]
            : ["", "hello", "\0\n", "a".repeat(settings.stringMaxLength)]) {
            assert.equal(fresh.evaluate(restored, value), adapter.evaluate(god.descriptor, value));
            assert.equal(fresh.evaluate(restored, value), expected.gods[index].evaluate(value));
            assert.equal(fresh.evaluate(restored, value), evaluatePreference(value, restored.domain, restored.preference));
          }
        });
      }
    }
  }
  assert.throws(() => adapter.generate(DEFAULT_SETTINGS, 2, seed), /3–8/);
  assert.throws(() => adapter.generate(DEFAULT_SETTINGS, 9, seed), /3–8/);
  assert.throws(() => adapter.generate({ ...DEFAULT_SETTINGS, intMin: 0, intMax: 1 }, 3, seed), /cannot use this domain.*consecutive integers/);
  assert.throws(() => adapter.generate({ ...DEFAULT_SETTINGS, objectType: "string", stringMaxLength: 3 }, 3, seed), /cannot use this domain.*length cap/);
  assert.throws(() => adapter.evaluate({}, 0), /descriptor/);
  assert.throws(() => adapter.evaluate(JSON.parse(JSON.stringify(adapter.generate(DEFAULT_SETTINGS, 3, seed)[0].descriptor)), "wrong"), /integer/);
});
