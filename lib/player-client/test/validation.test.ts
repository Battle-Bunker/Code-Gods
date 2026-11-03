/**
 * The validate_agent assessment (src/validation.ts). What would break: a receipt whose agent raises on every reference
 * object reading as a success ("Accepted"), so the model re-validates instead of fixing or reporting; the price and
 * the player's energy missing from what the model reads next.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessValidation } from "../src/validation.ts";
import type { CommandResult } from "../src/protocol.ts";

const commandId = "6a1f8b7e-3c2d-4e5f-8a9b-0c1d2e3f4a5b";
const receipt = (validation: Partial<NonNullable<CommandResult["validation"]>>, accepted = true): CommandResult =>
  ({ commandId, accepted, message: accepted ? "Accepted" : "SyntaxError: invalid syntax (line 1)",
    validation: { valid: accepted, cost: 147.74, expectedActCost: 3.4786, diagnostics: [], ...validation } });

test("an agent that raises on every reference object fails, naming the first error, even though the receipt says valid", () => {
  // The 1WB8 receipt: valid true, invalid or failing 100%.
  const a = assessValidation(receipt({ changeRate: 0, invalidRate: 1, diagnostics: [
    "Summon price 74.2 bits (ast-bits-v1: structure 48.2, names 11.4, literals 14.3, literal moves 0.0).",
    "Measured on 208 reference objects: changes 0%, invalid or failing 100% (agent raised an error ×208); mutators none.",
    "On object 1 it fails: agent raised an error: NameError: name 'cell_at' is not defined (line 2)"] }));
  assert.equal(a.verdict, "fails");
  assert.match(a.summary, /^Fails or is invalid on 100% of reference objects: agent raised an error: NameError: name 'cell_at' is not defined/);
  assert.match(a.next, /^Do not summon it/);
});

test("without a sample error the measurement line's errors are named", () => {
  const a = assessValidation(receipt({ changeRate: 0, invalidRate: 0.75, diagnostics: [
    "Measured on 208 reference objects: changes 0%, invalid or failing 75% (\"region\" cannot be [0,0,1] here ×156); mutators none."] }));
  assert.equal(a.verdict, "fails");
  assert.match(a.summary, /75% of reference objects: "region" cannot be \[0,0,1\] here ×156\./);
});

test("an agent that never changes an object is not a working agent", () => {
  const a = assessValidation(receipt({ changeRate: 0, invalidRate: 0 }));
  assert.equal(a.verdict, "no_change");
  assert.match(a.next, /^Do not summon it/);
});

test("a working, affordable agent: the price against the energy, and stop validating", () => {
  const a = assessValidation(receipt({ changeRate: 0.67, invalidRate: 0, energy: 565.1, affordable: true }));
  assert.equal(a.verdict, "works");
  assert.equal(a.summary, "Works: changes 67% of reference objects. Summon price 147.7 bits; the player had 565.1 bits of energy when it was validated (affordable). Each act costs about 3.48 bits.");
  assert.match(a.next, /^Stop validating/);
  assert.deepEqual([a.cost, a.energy, a.affordable], [147.74, 565.1, true]);
});

test("a working agent the player cannot afford yet says so and suggests a cheaper version", () => {
  const a = assessValidation(receipt({ changeRate: 0.4, invalidRate: 0.1, energy: 100, affordable: false }));
  assert.equal(a.verdict, "works");
  assert.match(a.summary, /changes 40% of reference objects, 10% invalid or failing\. .*not affordable yet/);
  assert.match(a.next, /could not afford it when validated \(100\.0 bits of 147\.7 bits/);
});

test("a source that does not compile is rejected with the engine's message", () => {
  const a = assessValidation({ commandId, accepted: false, message: "SyntaxError: invalid syntax (line 1)" });
  assert.equal(a.verdict, "rejected");
  assert.equal(a.summary, "Rejected: SyntaxError: invalid syntax (line 1)");
});

test("a validate answered while the sandbox warms is not a rejection: nothing ran, so the next step is the identical retry", () => {
  const a = assessValidation({ commandId, accepted: false, message: "The Python agent sandbox is warming up; try again in a moment.",
    notReady: { language: "python", state: "warming", retryAfterMs: 1500 } });
  assert.equal(a.verdict, "not_ready");
  assert.match(a.summary, /warming up/);
  assert.match(a.next, /1\.5 s/);
  assert.doesNotMatch(a.next, /fix/i, "the code is not at fault");
});

test("a constant agent warns: the success rate and the warning come first, and the player hears them before any summon", () => {
  const warning = "It gives every object the same result, so only one object can ever hold this value; every other act will collide (in a sample world of 16 objects, 3% of its acts succeed). Make the result depend on the object.";
  const a = assessValidation(receipt({ changeRate: 0.99, invalidRate: 0, expectedSuccessRate: 1 / 32, energy: 500, affordable: true,
    futility: { deterministic: true, constant: true, idempotent: true, identity: false, firstPass: 1 / 16, secondPass: 0, successRate: 1 / 32 },
    warnings: [warning] }));
  assert.equal(a.verdict, "warns");
  assert.match(a.summary, /^About 3% of its acts would succeed: It gives every object the same result/);
  assert.deepEqual(a.warnings, [warning]);
  assert.match(a.next, /^Tell the player/);
  assert.match(a.next, /depends on the object it is given/);
});

test("copies of a working agent warn without changing a works verdict's advice to summon", () => {
  const copies = "You already have an agent with this exact code: a copy acts the same way on the objects it is given, so it adds speed only when they cannot keep up.";
  const a = assessValidation(receipt({ changeRate: 1, invalidRate: 0, expectedSuccessRate: 1, energy: 500, affordable: true, warnings: [copies] }));
  assert.equal(a.verdict, "warns");
  assert.match(a.summary, /You already have an agent/);
});
