/**
 * The examination cache (convex/lib/examinationCache.ts): an agent program's deterministic sandbox runs are remembered,
 * so a summon after its validate runs nothing, and the same program in another game runs only that game's own objects.
 * What it must never do: change an estimate, or hold anything but the program's own answers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { admin, api, envelope, gods, internal, roomWith, startGame, touch } from "./game-helpers.ts";

const settings = { languages: ["typescript", "python"], objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 6, spawnRateHz: 0, planningSeconds: 3600 };
const latest = () => admin.query(internal.testing.latestExaminationRuns, {});

async function game(label: string) {
  const trio = await gods(`${label} a`, `${label} b`, `${label} c`);
  await touch(trio[0]);
  const { roomId } = await roomWith(trio, settings);
  const { gameId } = await startGame(trio[0], roomId);
  const send = (god: typeof trio[number], command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, gameId) });
  return { trio, send };
}

for (const language of ["typescript", "python"] as const) {
  test(`${language}: a summon after its validate runs nothing; another game runs only its own objects; the estimate never changes`, { timeout: 240000 }, async () => {
    // A program nobody examined before (the constant is in its text, so in its key).
    const k = randomInt(2, 1_000_000);
    const source = language === "typescript" ? `function agent(x) { return [add(${k})]; }` : `def agent(x):\n    return [add(${k})]`;
    const first = await game(`Cache ${language} 1`);
    const [ada, bo] = first.trio;

    const validated = await first.send(ada, { type: "validate", language, source });
    assert.equal(validated.accepted, true, JSON.stringify(validated));
    const afterValidate = await latest();
    // The reference mixture alone is 192 objects, each run once; the game's objects and the futility probe add more.
    assert.ok(afterValidate.runs >= 192, `the validate's runs are remembered: ${afterValidate.runs}`);
    // No player, room, game or goal: only the key (a hash), the inspection and the runs.
    assert.deepEqual(afterValidate.fields, ["_creationTime", "_id", "inspection", "key", "runs", "usedAt"]);

    // The summon of the same program on the same board: answered from memory. The entry is written only when an
    // examination ran something new, so an untouched entry means the sandbox ran nothing.
    const summoned = await first.send(ada, { type: "summon", name: "Cached", language, source });
    assert.equal(summoned.accepted, true, JSON.stringify(summoned));
    assert.deepEqual(await latest(), afterValidate, "the summon ran nothing new");

    // An entry answered from memory is still in use: once a day's old it is marked used, so the prune keeps it.
    await admin.mutation(internal.testing.ageExaminationRuns, { key: afterValidate.key, ageMs: 25 * 3600_000 });
    assert.equal((await first.send(bo, { type: "validate", language, source })).accepted, true);
    const touched = await latest();
    assert.ok(touched.key === afterValidate.key && touched.runs === afterValidate.runs && Date.now() - touched.usedAt < 60_000, "marked used, nothing run");
    const stable = { ...afterValidate, usedAt: touched.usedAt };

    // Another player validating the same text on the same board gets the same numbers (they are the program's).
    const again = await first.send(bo, { type: "validate", language, source });
    assert.deepEqual(again.validation, validated.validation);
    assert.deepEqual(await latest(), stable);

    // Another game (another board): only that board's objects and their probe run; the reference runs are reused.
    const second = await game(`Cache ${language} 2`);
    const elsewhere = await second.send(second.trio[0], { type: "validate", language, source });
    assert.equal(elsewhere.accepted, true, JSON.stringify(elsewhere));
    const afterSecond = await latest();
    assert.equal(afterSecond.key, afterValidate.key, "the same program, the same entry");
    const added = afterSecond.runs - afterValidate.runs;
    assert.ok(added > 0 && added <= 60, `only the new board's runs were added: ${added}`);
    // The summon price is the program's own, whatever the board.
    assert.equal(elsewhere.validation.cost, validated.validation.cost);
  });
}
