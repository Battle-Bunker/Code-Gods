/**
 * The first-agent examples (lib/game-utilities/src/example-agents.ts) in the real agent sandbox, on the default setup's
 * board. What would break: a new player's pre-filled agent that does not compile, calls a mutator the board's prelude
 * does not offer, makes moves the engine refuses, costs more than a new player's starting energy, or does not raise
 * the score of the rule it was written for; and a family joining the default pool without an example of its own.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETUP_SEED_ID, seedSetupSettings, instantiationOf, codecOf, type GameSettings } from "@workspace/game-core";
import { applyCalls, instanceInfo, objectType, seededRng, type Instantiation, type ObjectValue } from "@workspace/game-types";
import { createRuntime, type ActSettings, type GameRuntime, type PricingVocab } from "@workspace/game-runtime";
import {
  available, canonicalSupport, compareOrdinals, context, evaluator, familiesFor, type Ordinal, type Params,
} from "@workspace/game-utilities";
import {
  EXAMPLE_AGENT_FAMILIES, buildExampleAgent, exampleAgent, exampleMutator, mutatorNames, starterAgents, starterAgentsFor, type ExampleLanguage,
} from "@workspace/game-utilities/example-agents";

const settings: GameSettings = seedSetupSettings(DEFAULT_SETUP_SEED_ID);
const inst: Instantiation = instantiationOf(settings);
const typeDef = objectType(inst.objectType);
const ctx = context(inst);
const LANGUAGES: readonly ExampleLanguage[] = ["python", "typescript"];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const ACTS = 12;

/** The default setup's pool: the reward families its board can deal, minus the setup's exclusions. */
const dealable = familiesFor(inst.objectType, "reward").filter(f => available(f, inst).ok);
const pool = dealable.filter(f => !settings.excludedFamilies.includes(f.id));
/** The families behaviour-tested below: the pool, then the other families of this board that have a recipe (other setups deal them). */
const tested = [...pool, ...dealable.filter(f => settings.excludedFamilies.includes(f.id) && EXAMPLE_AGENT_FAMILIES.includes(f.id))];

// The room's own act settings (convex/engine/runtime.ts actSettings), without the Convex action around them.
const parts = typeDef.prelude(inst);
const room = {
  objectType: inst.objectType, wireMaxLength: codecOf(settings).maxLength,
  interactionComputeMs: settings.interactionComputeMs, stepBudget: settings.stepBudget,
  prelude: { key: parts.hash, python: parts.python, js: parts.js, dts: parts.dts,
    pricing: parts.pricing as unknown as { python: PricingVocab; typescript: PricingVocab } },
} as ActSettings;

const runtimes = new Map<ExampleLanguage, GameRuntime>();
const runtime = (language: ExampleLanguage): GameRuntime => {
  let r = runtimes.get(language);
  if (!r) runtimes.set(language, r = createRuntime({ language, workers: 1, queueLimit: 64 }));
  return r;
};
after(() => { for (const r of runtimes.values()) r.close(); });

/**
 * The summon price is the description length of the code's syntax tree in bits (ast-bits-v1 for Python, ts-ast-bits-v1
 * for TypeScript: lib/game-runtime, priced by convex/engine/pricing.ts summonPrice): every statement, operator, name
 * and number costs bits; comments, blank lines and the length of a name cost nothing; nothing is measured by running.
 * TypeScript's tree has more node kinds per statement (declarations, blocks, strict comparisons), so the same agent
 * costs about twice as much there.
 *
 * Today's Python prices on the default setup (2026-11-11), each budget set just above its number so a dearer example
 * is noticed. A new player pays from the starting energy (200) in planning, so the pre-filled example of each family
 * is its "tiny" variant where one exists under PAYABLE; the full recipe is the "thorough" starter, payable a few
 * seconds into the running phase. Starting energy and pricing are owned elsewhere.
 */
const PAYABLE = 190;
/** The pre-filled example (the first starter) of each default-pool family. */
const EXAMPLE_PRICE_BUDGET: Readonly<Record<string, number>> = {
  two_pair: 176,          // 174.3 (tiny)
  spread_three: 171,      // 169.2 (tiny)
  mirrormancer: 180,      // 178.3
  leapfrog: 183,          // 181.6 (tiny)
  magic_eighteen: 185,    // 183.7 (tiny)
  opposite_nines: 189,    // 187.4 (tiny)
  crosswise_threes: 370,  // 364.6: no agent under 190 found (the cheapest that scores on every board was 225)
  strangers: 430,         // 424.4: a 189-bit agent (first pair of each row) left one of eight test boards no better
};
/** Default-pool families whose pre-filled example a new player cannot pay for in planning, with today's price. */
const NOT_PAYABLE_IN_PLANNING: Readonly<Record<string, number>> = { crosswise_threes: 364.6, strangers: 424.4 };
/** The thorough starters (the full recipes) of the families that also have a tiny one. */
const THOROUGH_PRICE_BUDGET: Readonly<Record<string, number>> = {
  opposite_nines: 210,    // 206.9
  leapfrog: 240,          // 237.7
  magic_eighteen: 260,    // 256.7
  two_pair: 380,          // 377.1
  spread_three: 575,      // 572.1
};
/** The fallback (133.5 in Python, 239.0 in TypeScript) and the recipes of families outside the default pool. */
const OTHER_PRICE_CEILING: Readonly<Record<ExampleLanguage, number>> = { python: 260, typescript: 1100 };
const withoutComments = (source: string) => source.split("\n").filter(l => !/^\s*(#|\/\/)/.test(l)).map(l => l.replace(/\s+(#|\/\/) .*$/, "")).join("\n");

const cellsChanged = (a: ObjectValue, b: ObjectValue) => {
  const x = String(a).split(/[/,]/), y = String(b).split(/[/,]/);
  return x.filter((cell, i) => cell !== y[i]).length;
};
/** What to do when a family joins the default pool without an example of its own. */
const ADD_RECIPE = (ids: readonly string[]) => `Add a recipe to RECIPES in lib/game-utilities/src/example-agents.ts for: ${ids.join(", ")} `
  + "(Python and TypeScript; it must change one cell per act, raise the rule's score, and not drive every grid to the same few boards).";
const f_support = (id: string): readonly Params[] => pool.find(f => f.id === id)!.support(ctx);
const better = (a: Ordinal, b: Ordinal) => compareOrdinals(a, b) > 0;

/** `acts` turns of one agent on one object, as the tick runs them: act, validate and apply; a refused act is an error here. */
async function play(language: ExampleLanguage, source: string, start: ObjectValue, acts: number, seed: number, cells = 1) {
  let value = start, changes = 0, spent = 0;
  for (let i = 0; i < acts; i++) {
    const result = await runtime(language).act(source, value, room, String(seed * 1000 + i));
    if (result.calls === "[]" || result.calls === "null") continue;
    const outcome = applyCalls(typeDef, inst, value, result.calls);
    assert.ok(outcome.ok, `the engine accepts the move ${result.calls}: ${!outcome.ok && outcome.reason}`);
    assert.ok(cellsChanged(value, outcome.value) <= cells, `at most ${cells} cell(s) change per act`);
    value = outcome.value;
    spent += outcome.cost.total;
    changes++;
  }
  return { value, changes, spent };
}

test("the default pool is not empty, and every family in it has an example of its own", () => {
  assert.ok(pool.length > 0);
  const missing = pool.map(f => f.id).filter(id => !EXAMPLE_AGENT_FAMILIES.includes(id)
    || f_support(id).some(p => LANGUAGES.some(language => !exampleAgent(id, p, inst, language).specific)));
  assert.deepEqual(missing, [], `The default setup deals rules whose first agent is only the fallback. ${ADD_RECIPE(missing)}`);
});

test("examples call only mutators the default board's prelude offers", () => {
  const info = instanceInfo(inst);
  for (const language of LANGUAGES) {
    const offered = mutatorNames(info, language), mutator = exampleMutator(offered);
    assert.ok(mutator && offered.includes(mutator), `${language}: the examples' mutator (${mutator}) is in the prelude`);
    // Every call of a prelude function in an example is the chosen mutator: no other constructor name appears as a call.
    const others = offered.filter(name => name !== mutator);
    for (const f of dealable) for (const p of canonicalSupport(f, ctx)) {
      const { source } = exampleAgent(f.id, p, inst, language);
      const code = source.split("\n").filter(l => !/^\s*(#|\/\/)/.test(l)).join("\n");
      assert.ok(code.includes(`${mutator}(`), `${f.id} ${language} calls ${mutator}`);
      for (const name of others) assert.ok(!new RegExp(`(^|[^.\\w])${name}\\(`).test(code), `${f.id} ${language} must not call ${name}`);
    }
  }
});

test("the generator follows the prelude: write when it is offered, add on a board without it, and a skip when there is neither", () => {
  for (const language of LANGUAGES) for (const familyId of [...EXAMPLE_AGENT_FAMILIES, "no_such_family"]) {
    // Both exist on the default board: `write` reads plainly, costs by distance like the `add` it amounts to, and is
    // the cheaper summon. (The `add` form is generated text only: no ranked board lacks `write`, so no sandbox runs it.)
    const withBoth = buildExampleAgent({ familyId, language, mutators: ["write", "add", "paint"] }).source;
    assert.ok(withBoth.includes("write(") && !withBoth.includes("add("), `${familyId} ${language}: write is preferred`);
    const onlyAdd = buildExampleAgent({ familyId, language, mutators: ["add", "paint"] }).source;
    assert.ok(onlyAdd.includes("add(") && !onlyAdd.includes("write("), `${familyId} ${language}: add where there is no write`);
    // An example never shadows a helper: a top-level `add` or `write` of its own would replace the prelude's.
    assert.ok(!/^(def|function|const|let|var)\s+(add|write)\b/m.test(withBoth + "\n" + onlyAdd), `${familyId} ${language}: defines no add or write of its own`);
    const withWrite = buildExampleAgent({ familyId, language, mutators: ["write", "paint"] }).source;
    assert.ok(withWrite.includes("write(") && !withWrite.includes("add("), `${familyId} ${language}: write`);
    const neither = buildExampleAgent({ familyId, language, mutators: ["paint"] });
    assert.equal(neither.specific, false);
    assert.ok(!/\b(add|write)\(/.test(neither.source), `${familyId} ${language}: nothing to call`);
  }
});

test("the generator is total: every family the board can deal, and an unknown one, gets a named agent that the sandbox accepts", async t => {
  const cases: { id: string; params: Params }[] = [...dealable.map(f => ({ id: f.id, params: canonicalSupport(f, ctx)[0]! })), { id: "no_such_family", params: {} }];
  const payable: string[] = [], inPool = new Set(pool.map(f => f.id));
  for (const language of LANGUAGES) for (const c of cases) {
    const example = exampleAgent(c.id, c.params, inst, language);
    assert.ok(example.name.trim() && example.name.length <= 40, `${c.id}: a name`);
    assert.ok(example.source.split("\n").some(l => /Try this:/.test(l)), `${c.id} ${language}: invites the first edit`);
    if (c.id !== "no_such_family") assert.ok(example.source.includes("My goal: "), `${c.id} ${language}: says the goal`);
    const { cost } = await runtime(language).inspect(example.source, room);
    const budget = language === "python" && inPool.has(c.id) ? EXAMPLE_PRICE_BUDGET[c.id] : OTHER_PRICE_CEILING[language];
    assert.ok(budget !== undefined, `${c.id}: state its Python summon price budget in EXAMPLE_PRICE_BUDGET (today ${cost.toFixed(1)})`);
    assert.ok(cost <= budget, `${c.id} ${language}: summon price ${cost.toFixed(1)} is within its budget ${budget}`);
    if (language === "python" && inPool.has(c.id)) {
      t.diagnostic(`price ${c.id}: ${cost.toFixed(1)}`);
      if (cost <= PAYABLE) payable.push(c.id);
      const thorough = starterAgentsFor(c.id, c.params, inst, language).find(s => s.id === "thorough");
      if (thorough) {
        const price = (await runtime(language).inspect(thorough.source, room)).cost;
        assert.ok(price <= THOROUGH_PRICE_BUDGET[c.id]!, `${c.id} thorough: summon price ${price.toFixed(1)} within ${THOROUGH_PRICE_BUDGET[c.id]}`);
      }
    }
    if (inPool.has(c.id)) {
      const bare = await runtime(language).inspect(withoutComments(example.source), room);
      assert.equal(bare.cost, cost, `${c.id} ${language}: comments and blank lines are free`);
    }
    const start = typeDef.codec(inst).encode(typeDef.spawn(inst, seededRng(99)));
    const { changes } = await play(language, example.source, start, 3, 99);
    if (!example.specific) assert.ok(changes > 0, `${c.id} ${language}: the fallback changes the board`);
  }
  assert.deepEqual(pool.map(f => f.id).filter(id => !payable.includes(id)).sort(), Object.keys(NOT_PAYABLE_IN_PLANNING).sort(),
    `default-pool examples priced above ${PAYABLE} (starting energy ${settings.startingEnergy}) are exactly those listed in NOT_PAYABLE_IN_PLANNING`);
  assert.ok(PAYABLE < settings.startingEnergy, "payable means under the default setup's starting energy");
});

for (const f of tested) for (const language of LANGUAGES) {
  test(`${f.id} (${language}): every starter agent raises its own rule's score on every seed, for every dealt setting`, async () => {
    for (const params of f.support(ctx)) for (const example of starterAgentsFor(f.id, params, inst, language)) {
      const score = evaluator({ familyId: f.id, params }, inst);
      for (const seed of SEEDS) {
        const start = typeDef.codec(inst).encode(typeDef.spawn(inst, seededRng(seed)));
        const before = score(start);
        const { value, changes, spent } = await play(language, example.source, start, ACTS, seed, example.id === "bold" ? 2 : 1);
        const where = `${f.id} ${example.id} ${JSON.stringify(params)} seed ${seed}`;
        assert.ok(changes > 0, `${where}: it acts`);
        assert.ok(better(score(value), before), `${where}: ${JSON.stringify(before)} → ${JSON.stringify(score(value))} after ${changes} changes`);
        assert.ok(spent > 0);
      }
    }
  });
}

/**
 * A small world, as the tick commits acts (convex/engine/tick.ts): each turn offers the agent one object, and a change
 * whose result is another object's value is refused ("another object already has this value"). An example that drove
 * every object to the same few boards would score once and then fail forever.
 */
for (const f of tested) for (const language of LANGUAGES) {
  test(`${f.id} (${language}): in a world of ten objects every starter agent keeps scoring and almost never collides`, async () => {
    for (const params of f.support(ctx)) for (const example of starterAgentsFor(f.id, params, inst, language)) {
      const score = evaluator({ familyId: f.id, params }, inst);
      const rng = seededRng(`${f.id}-world`);
      const codec = typeDef.codec(inst);
      const world: ObjectValue[] = [];
      while (world.length < 10) { const v = codec.encode(typeDef.spawn(inst, rng)); if (!world.includes(v)) world.push(v); }
      const start = world.slice();
      let changes = 0, collisions = 0;
      for (let turn = 0; turn < 200; turn++) {
        const k = rng.int(world.length);
        const result = await runtime(language).act(example.source, world[k]!, room, String(turn));
        if (result.calls === "[]" || result.calls === "null") continue;
        const outcome = applyCalls(typeDef, inst, world[k]!, result.calls);
        assert.ok(outcome.ok, `the engine accepts ${result.calls}: ${!outcome.ok && outcome.reason}`);
        if (world.includes(outcome.value)) { collisions++; continue; }
        world[k] = outcome.value;
        changes++;
      }
      const where = `${f.id} ${example.id} ${JSON.stringify(params)}`;
      const improved = world.filter((v, k) => better(score(v), score(start[k]!))).length;
      const worse = world.filter((v, k) => better(score(start[k]!), score(v))).length;
      // A tiny starter does the simple part of the rule, so it may leave more objects as they were.
      assert.ok(improved >= (example.id === "tiny" ? 6 : 8) && worse === 0, `${where}: ${improved} of 10 objects improved, ${worse} got worse`);
      assert.ok(collisions <= changes / 10, `${where}: ${collisions} collisions for ${changes} changes`);
    }
  });
}

test("starter agents: the first is the example itself; simple then thorough where a tiny one exists; plain words", async () => {
  for (const language of LANGUAGES) {
    for (const f of dealable) for (const params of canonicalSupport(f, ctx)) {
      const starters = starterAgentsFor(f.id, params, inst, language), example = exampleAgent(f.id, params, inst, language);
      assert.deepEqual({ name: starters[0]!.name, source: starters[0]!.source, specific: starters[0]!.specific }, example, `${f.id}: the first starter is the example`);
      const ids = starters.map(s => s.id).join();
      assert.ok(["careful", "careful,bold", "tiny,thorough", "tiny,thorough,bold"].includes(ids), `${f.id}: ${ids}`);
      for (const s of starters) {
        assert.ok(s.title && s.blurb.endsWith(".") && s.name.length <= 40 && !/[—–]/.test(s.blurb + s.source), `${f.id} ${s.id}`);
        if (s.id === "tiny") assert.match(s.source, /Want more\? Summon the thorough version later, when you have more energy\./);
        if (s.id !== "careful") await runtime(language).inspect(s.source, room);
      }
    }
    assert.deepEqual(starterAgentsFor("mirrormancer", { axis: "LR" }, inst, language).map(s => s.title), ["Careful", "Bold"]);
    assert.deepEqual(starterAgentsFor("two_pair", {}, inst, language).map(s => s.title), ["Simple", "Thorough"]);
    assert.deepEqual(starterAgents({ familyId: "no_such_family", language, mutators: ["paint"] }).map(s => s.id), ["careful"], "never empty");
  }
});
