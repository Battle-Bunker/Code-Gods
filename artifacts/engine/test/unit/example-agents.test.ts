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
  EXAMPLE_AGENT_FAMILIES, buildExampleAgent, exampleAgent, exampleMutator, mutatorNames, type ExampleLanguage,
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

/** The most an example may cost to summon (description bits), per language: TypeScript's price function charges about twice Python's. */
const PRICE_CEILING: Readonly<Record<ExampleLanguage, number>> = { python: 260, typescript: 480 };
/**
 * Known gap (2026-11-11): the default setup's starting energy is 200 bits, and the cheapest readable agent for Magic
 * Accountant (two loops and a clamp) costs about 257. It can be summoned a few seconds into the running phase, not in
 * planning. Every other default-pool example fits.
 */
const OVER_STARTING_ENERGY: readonly string[] = ["magic_accountant"];

const cellsChanged = (a: ObjectValue, b: ObjectValue) => {
  const x = String(a).split(/[/,]/), y = String(b).split(/[/,]/);
  return x.filter((cell, i) => cell !== y[i]).length;
};
const better = (a: Ordinal, b: Ordinal) => compareOrdinals(a, b) > 0;

/** `acts` turns of one agent on one object, as the tick runs them: act, validate and apply; a refused act is an error here. */
async function play(language: ExampleLanguage, source: string, start: ObjectValue, acts: number, seed: number) {
  let value = start, changes = 0, spent = 0;
  for (let i = 0; i < acts; i++) {
    const result = await runtime(language).act(source, value, room, String(seed * 1000 + i));
    if (result.calls === "[]" || result.calls === "null") continue;
    const outcome = applyCalls(typeDef, inst, value, result.calls);
    assert.ok(outcome.ok, `the engine accepts the move ${result.calls}: ${!outcome.ok && outcome.reason}`);
    assert.equal(cellsChanged(value, outcome.value), 1, "one small change per act");
    value = outcome.value;
    spent += outcome.cost.total;
    changes++;
  }
  return { value, changes, spent };
}

test("the default pool is not empty, and every family in it has an example of its own", () => {
  assert.ok(pool.length > 0);
  assert.deepEqual(pool.map(f => f.id).filter(id => !EXAMPLE_AGENT_FAMILIES.includes(id)), [],
    "add a recipe in lib/game-utilities/src/example-agents.ts for each family the default setup deals");
  for (const f of pool) for (const p of f.support(ctx)) for (const language of LANGUAGES) {
    assert.equal(exampleAgent(f.id, p, inst, language).specific, true, `${f.id} ${language}`);
  }
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

test("the generator follows the prelude: add when it is offered, write otherwise, and a skip when there is neither", () => {
  for (const language of LANGUAGES) for (const familyId of [...EXAMPLE_AGENT_FAMILIES, "no_such_family"]) {
    const withAdd = buildExampleAgent({ familyId, language, mutators: ["write", "add", "paint"] }).source;
    assert.ok(withAdd.includes("add(") && !withAdd.includes("write("), `${familyId} ${language}: add replaces write`);
    const withWrite = buildExampleAgent({ familyId, language, mutators: ["write", "paint"] }).source;
    assert.ok(withWrite.includes("write(") && !withWrite.includes("add("), `${familyId} ${language}: write`);
    const neither = buildExampleAgent({ familyId, language, mutators: ["paint"] });
    assert.equal(neither.specific, false);
    assert.ok(!/\b(add|write)\(/.test(neither.source), `${familyId} ${language}: nothing to call`);
  }
});

test("the generator is total: every family the board can deal, and an unknown one, gets a named agent that the sandbox accepts", async () => {
  const cases: { id: string; params: Params }[] = [...dealable.map(f => ({ id: f.id, params: canonicalSupport(f, ctx)[0]! })), { id: "no_such_family", params: {} }];
  const tooDear: string[] = [];
  for (const language of LANGUAGES) for (const c of cases) {
    const example = exampleAgent(c.id, c.params, inst, language);
    assert.ok(example.name.trim() && example.name.length <= 40, `${c.id}: a name`);
    assert.ok(example.source.split("\n").some(l => /Try this:/.test(l)), `${c.id} ${language}: invites the first edit`);
    if (c.id !== "no_such_family") assert.ok(example.source.includes("My goal: "), `${c.id} ${language}: says the goal`);
    const { cost } = await runtime(language).inspect(example.source, room);
    assert.ok(cost <= PRICE_CEILING[language], `${c.id} ${language}: summon price ${cost.toFixed(1)} is at most ${PRICE_CEILING[language]}`);
    // What a new player can pay in planning (world time is stopped, so there is no income yet): the starting energy.
    if (language === "python" && cost > settings.startingEnergy) tooDear.push(c.id);
    const start = typeDef.codec(inst).encode(typeDef.spawn(inst, seededRng(99)));
    const { changes } = await play(language, example.source, start, 3, 99);
    if (!example.specific) assert.ok(changes > 0, `${c.id} ${language}: the fallback changes the board`);
  }
  assert.deepEqual(tooDear, OVER_STARTING_ENERGY,
    "Python examples a new player cannot pay for in planning on the default setup (shrink the example or raise startingEnergy, then update this list)");
});

for (const f of pool) for (const language of LANGUAGES) {
  test(`${f.id} (${language}): the example raises its own rule's score on every seed, for every dealt setting`, async () => {
    for (const params of f.support(ctx)) {
      const example = exampleAgent(f.id, params, inst, language);
      const score = evaluator({ familyId: f.id, params }, inst);
      for (const seed of SEEDS) {
        const start = typeDef.codec(inst).encode(typeDef.spawn(inst, seededRng(seed)));
        const before = score(start);
        const { value, changes, spent } = await play(language, example.source, start, ACTS, seed);
        const where = `${f.id} ${JSON.stringify(params)} seed ${seed}`;
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
for (const f of pool) for (const language of LANGUAGES) {
  test(`${f.id} (${language}): in a world of ten objects the example keeps scoring and almost never collides`, async () => {
    for (const params of f.support(ctx)) {
      const example = exampleAgent(f.id, params, inst, language);
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
      const where = `${f.id} ${JSON.stringify(params)}`;
      const improved = world.filter((v, k) => better(score(v), score(start[k]!))).length;
      const worse = world.filter((v, k) => better(score(start[k]!), score(v))).length;
      assert.ok(improved >= 8 && worse === 0, `${where}: ${improved} of 10 objects improved, ${worse} got worse`);
      assert.ok(collisions <= changes / 10, `${where}: ${collisions} collisions for ${changes} changes`);
    }
  });
}
