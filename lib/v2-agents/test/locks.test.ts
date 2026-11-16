/**
 * Locks (docs/engine-v2/locks.md): a predicate is a program in the agent runtime, priced as an agent is (description
 * length plus what it read). Here: the ready-made programs in both languages, what a failing program means (it cannot
 * make a lock; on a later check it counts as not met, so a crash neither frees an object nor traps it), the bound on
 * checks, and locks through the agent API with runAct (funds and drains, then each call checked, then new locks).
 *
 * What would break: a predicate priced by anything but the agent's own measures; a crash letting a move through; a
 * lock that cannot be drained; a quote that disagrees with the commit; the commit trusting a lock the act never asked.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fromMC, lineZ, lineType } from "@workspace/v2-linear";
import { actRunner, commitLocks, isInvalid, lockProgram, lockedAct, LOCK_CHECKS_PER_ACT, MAX_LOCK_SOURCE, Qn, type ActLock, type LockProgram, type PredicateRun } from "@workspace/v2-core";
import { EngineHost, predicateBits, predicateBoxes, predicateRunner, READY_PREDICATES, runAct, sandboxes, summonBits } from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());
const line = (m: number, c: number) => ({ lines: [fromMC(Qn.q(m), Qn.q(c))] });
type Line = ReturnType<typeof line>;
const rule = { family: "prime-gradient", params: { ends: 1 }, tieBreaker: "shared-factor" };
const run = predicateRunner<Line>(lineType, lineZ, await predicateBoxes(["typescript", "python"]));
const rates = { createPerBit: 0.05, upkeepPerBit: 0.0002 };
const ready = (id: string, language: "typescript" | "python", args: Record<string, string> = {}) => READY_PREDICATES.find(p => p.id === id)!.make(language, args);
const live = (n: number, program: LockProgram, energy = 5): ActLock => {
  const programBits = predicateBits(program);
  return { n, program, programBits, readBits: 10, bits: programBits + 10, energy, settledAt: 0, rate: 0.1 };
};
const locks = (ls: ActLock[]) => ({ world: 0, live: ls, nextLock: ls.length + 1, rates, run, programBits: predicateBits });
const state = line(-2, 13);
const holds = (p: LockProgram, m: number, c: number) => { const r = run(p, line(m, c)); assert.ok(r.ok, r.ok ? "" : r.error); return r.holds; };

for (const language of ["typescript", "python"] as const) {
  test(`${language}: the ready-made programs are the owner's examples, and are priced as agents are`, () => {
    const prime = ready("prime-intercept", language), grad = ready("gradient-equals", language, { m: "-2" }), floor = ready("floor", language, { reading: "si.c", floor: "1013" });
    assert.equal(holds(prime, 3, 13), true);
    assert.equal(holds(prime, 3, 15), false);
    assert.equal(holds(prime, 3, -13), false, "primes are positive");
    assert.equal(holds(grad, -2, 7), true);
    assert.equal(holds(grad, 2, 7), false);
    assert.equal(holds(floor, 0, 1013), true);
    assert.equal(holds(floor, 0, 1012), false);
    assert.equal(floor.words, "the y-intercept is at least 1013");
    // Description length is the agent's summon bits of the author's source; the reads are what an agent pays for the view.
    assert.equal(predicateBits(prime), summonBits(language, prime.source).bits);
    const r = run(prime, state) as Extract<PredicateRun, { ok: true }>;
    const viewed = new EngineHost({ type: lineType, variant: lineZ, state, rule, energy: 0 }).handle({ op: "view", rep: "si" }, { hostCallsLeft: 1 });
    assert.ok(viewed.ok && r.readBits === viewed.bits && r.readBits > 0, `reads ${r.readBits}`);
  });

  test(`${language}: the shared-defence programs: floors on several allies' readings, a relation to climb along, a sign against the mirror`, () => {
    const floors = ready("floors", language, { floors: "si.c >= 10, si.m >= 1/2" });
    assert.equal(floors.words, "the y-intercept ≥ 10 and the gradient ≥ 1/2");
    assert.equal(holds(floors, 1, 10), true);
    assert.equal(holds(floors, 0, 10), false, "one ally's floor broken breaks the lock");
    assert.equal(holds(floors, 1, 9), false);
    // Reads cost at most one full look of the object, as an agent's do: a conjunction costs more by its description, not its reads.
    const one = ready("floor", language, { reading: "si.c", floor: "10" }), two = ready("floors", language, { floors: "si.c >= 10, tri.area >= 1" });
    const r1 = run(one, line(-1, 10)) as Extract<PredicateRun, { ok: true }>, r2 = run(two, line(-1, 10)) as Extract<PredicateRun, { ok: true }>;
    assert.ok(r1.ok && r2.ok && r2.readBits >= r1.readBits && predicateBits(two) > predicateBits(one));
    const pace = ready("keeps-pace", language, { a: "si.c", b: "si.m", k: "3", d: "-1" });
    assert.equal(pace.words, "the y-intercept stays at least 3 × the gradient − 1");
    assert.equal(holds(pace, 4, 11), true);
    assert.equal(holds(pace, 40, 119), true, "free to climb along the relation");
    assert.equal(holds(pace, 40, 118), false);
    const sign = ready("sign", language, { reading: "si.m", side: "negative" });
    assert.equal(sign.words, "the gradient stays negative");
    assert.equal(holds(sign, -3, 5), true);
    assert.equal(holds(sign, 3, 5), false, "the mirror in the y-axis flips the gradient");
    assert.equal(holds(ready("sign", language, { reading: "si.c", side: "positive" }), -3, 5), true);
    // Bad parameters fall back to the example; a vertical line's gradient is undefined, which a check counts as not met.
    assert.equal(ready("floor", language, { reading: "drop table", floor: "x" }).words, "the y-intercept is at least 10");
  });

  test(`${language}: a program that throws, loops, answers something else, uses randomness or asks for more than the object fails`, () => {
    const py = language === "python";
    const fails = (source: string, why: RegExp) => {
      const r = run({ language, source, words: "broken" }, state);
      assert.equal(r.ok, false, source);
      assert.match((r as { error: string }).error, why);
    };
    fails(py ? "def predicate(offer):\n    return 1 // 0\n" : "function predicate(offer) { throw new Error('no'); }", py ? /ZeroDivision/ : /no/);
    fails(py ? "def predicate(offer):\n    while True:\n        pass\n" : "function predicate(offer) { for (;;) {} }", /Step limit/);
    fails(py ? "def predicate(offer):\n    return 1\n" : "function predicate(offer) { return 1; }", /returns/);
    fails(py ? "import random\ndef predicate(offer):\n    return random.random() < 2\n" : "function predicate(offer) { return Math.random() < 2; }", /randomness/);
    fails(py ? "def predicate(offer):\n    return offer.budget().energy > 0\n" : "function predicate(offer) { return offer.budget().energy > 0; }", /can only read the object/);
    fails(py ? "def other(offer):\n    return True\n" : "function other(offer) { return true; }", /predicate/);
  });
}

test("a program's shape: a language, a source within the size, a one-line description", () => {
  const ok = { language: "typescript", source: "function predicate(o) { return true; }", words: "  always\n true " };
  assert.deepEqual(lockProgram(ok), { ...ok, words: "always true" });
  assert.ok(isInvalid(lockProgram({ ...ok, source: "x".repeat(MAX_LOCK_SOURCE + 1) })));
  assert.ok(isInvalid(lockProgram({ ...ok, words: " " })));
  assert.ok(isInvalid(lockProgram({ ...ok, language: "javascript" })));
});

test("an act's checks are bounded: each (program, state) runs once, and past the cap a check fails", () => {
  let ran = 0;
  const counted = actRunner<Line>(lineType, () => { ran++; return { ok: true, holds: true, readBits: 1 }; });
  const p: LockProgram = { language: "typescript", source: "x", words: "x" };
  for (let c = 0; c < LOCK_CHECKS_PER_ACT + 10; c++) counted(p, line(1, c));
  counted(p, line(1, 0));
  assert.equal(ran, LOCK_CHECKS_PER_ACT);
  assert.deepEqual(counted(p, line(1, 3)), { ok: true, holds: true, readBits: 1 });
  const over = counted(p, line(1, LOCK_CHECKS_PER_ACT + 5));
  assert.ok(!over.ok && /more than 64 lock checks/.test(over.error));
});

test("a crash neither frees nor traps: a program that fails on a state refuses the move there, and the lock still drains", () => {
  // True where it was made (c = 13); it throws on every other state.
  const brittle: LockProgram = { language: "typescript", words: "c is 13, or else it throws",
    source: `function predicate(offer) { if (!Q.eq(look(offer, "si").c, Q.of(13))) throw new Error("boom"); return true; }` };
  const shift = [{ mutator: "si.shift", site: 0, args: { k: "1" } }];
  const base = { type: lineType, variant: lineZ, state, calls: shift, world: 0, nextLock: 2, rates, run, programBits: predicateBits };
  const refused = lockedAct({ ...base, ops: [], locks: [live(1, brittle)] });
  assert.ok(isInvalid(refused) && /breaks lock #1 \(c is 13, or else it throws\): its program failed on that state, which counts as not met \(.*boom/.test(refused.invalid), JSON.stringify(refused));
  const drained = lockedAct({ ...base, ops: [{ op: "drain", lock: 1, amount: 5 }], locks: [live(1, brittle)] });
  assert.ok(!isInvalid(drained) && drained.locks.length === 0 && drained.spend === 5);
  // A program that fails where the lock would be made makes no lock.
  const made = lockedAct({ ...base, calls: [], ops: [{ op: "create", amount: 1, program: { ...brittle, source: "function predicate(offer) { throw new Error('boom'); }" } }], locks: [] });
  assert.ok(isInvalid(made) && /cannot be locked with it: .*boom/.test(made.invalid));
});

test("the commit applies an act's lock changes again without running a program, and refuses a move no lock was asked about", () => {
  const prime = ready("prime-intercept", "typescript"), floor = ready("floor", "typescript", { reading: "si.c", floor: "3" });
  const done = [{ op: "drain" as const, lock: 1, amount: 5, spend: 5 }, { op: "create" as const, lock: 2, program: floor, programBits: 100, readBits: 8, bits: 108, fee: 5.4, amount: 2, rate: 0.02, spend: 7.4 }];
  const same = commitLocks({ locks: [live(1, prime)], done, checked: [], world: 0, nextLock: 2 });
  assert.ok(!isInvalid(same));
  assert.deepEqual(same.locks.map(l => [l.n, l.energy, l.bits]), [[2, 2, 108]]);
  assert.equal(same.spend, 12.4);
  // Someone refilled lock #1 since: the drain is clipped to what the act took, the lock lives, and the move was never checked against it.
  const refilled = commitLocks({ locks: [live(1, prime, 9)], done, checked: [], world: 0, nextLock: 2 });
  assert.ok(isInvalid(refilled) && /lock #1 .* after the act looked/.test(refilled.invalid));
  // A lock made since takes the number: the act's new lock is renumbered, and a skip (no move) needs no check.
  const renumbered = commitLocks({ locks: [live(1, prime), live(2, prime)], done: [done[1]!], checked: null, world: 0, nextLock: 3 });
  assert.ok(!isInvalid(renumbered) && renumbered.done[0]!.lock === 3);
});

const text = (language: "typescript" | "python", p: LockProgram) => JSON.stringify(p.source);
const programs = {
  typescript: {
    shift: (k: number) => `function agent(offer) { return [move("si.shift", { k: ${k} })]; }`,
    drainThenShift: (k: number, x: number) => `function agent(offer) { offer.drain(1, ${x}); return [move("si.shift", { k: ${k} })]; }`,
    list: `function agent(offer) { const ls = offer.locks(); offer.note(ls.map(l => l.lock + ":" + l.words + ":" + l.language + ":" + l.source.length).join("|")); return null; }`,
    lockAfter: (k: number, p: LockProgram) => `function agent(offer) { const q = offer.lock(${text("typescript", p)}, 10, ${JSON.stringify(p.words)}); offer.note(String(q.holdsNow)); return [move("si.shift", { k: ${k} })]; }`,
    fundOnly: `function agent(offer) { offer.fund(1, 3); return null; }`,
  },
  python: {
    shift: (k: number) => `def agent(offer):\n    return [move("si.shift", k=${k})]\n`,
    drainThenShift: (k: number, x: number) => `def agent(offer):\n    offer.drain(1, ${x})\n    return [move("si.shift", k=${k})]\n`,
    list: `def agent(offer):\n    offer.note("|".join(f"{l.lock}:{l.words}:{l.language}:{len(l.source)}" for l in offer.locks()))\n    return None\n`,
    lockAfter: (k: number, p: LockProgram) => `def agent(offer):\n    q = offer.lock(${text("python", p)}, 10, ${JSON.stringify(p.words)})\n    offer.note(str(q.holdsNow).lower())\n    return [move("si.shift", k=${k})]\n`,
    fundOnly: `def agent(offer):\n    offer.fund(1, 3)\n    return None\n`,
  },
};

for (const language of ["typescript", "python"] as const) {
  const src = programs[language];
  // The lock's program is in the other language than the agent: a check runs in its own sandbox, inside the agent's act.
  const prime = ready("prime-intercept", language === "python" ? "typescript" : "python");
  const act = (source: string, ls: ActLock[] = [live(1, prime)], energy = 100) =>
    boxes.get(language).then(box => runAct(box, { type: lineType, variant: lineZ, state, rule, program: { language, source }, seed: "1", energy, locks: locks(ls) }));

  test(`${language}: a move that breaks a lock fails the act, naming it; one that keeps it commits`, async () => {
    const broken = await act(src.shift(1));
    assert.equal(broken.record.outcome, "failed");
    assert.match(broken.record.reason ?? "", /breaks lock #1 \(the y-intercept is prime\), holding 5: drain it first/);
    const kept = await act(src.shift(4));   // 13 → 17
    assert.equal(kept.record.outcome, "committed");
    assert.equal(kept.record.locks, undefined);
    assert.deepEqual(kept.record.lockChecked, [1]);
  });

  test(`${language}: drain to zero then move, in one act; the drain is recorded and paid on top of the charge`, async () => {
    const { record } = await act(src.drainThenShift(1, 5));
    assert.equal(record.outcome, "committed", record.reason);
    assert.deepEqual(record.locks, [{ op: "drain", lock: 1, amount: 5, spend: 5 }]);
    assert.equal(record.lockSpend, 5);
    assert.deepEqual(record.lockChecked, []);
    const part = await act(src.drainThenShift(1, 2));
    assert.equal(part.record.outcome, "failed");
  });

  test(`${language}: listing locks gives their programs and is a read of what they read; lock changes alone are a skip that carries them`, async () => {
    const listed = await act(src.list);
    assert.deepEqual(listed.record.notes, [`1:the y-intercept is prime:${prime.language}:${prime.source.length}`]);
    assert.equal(listed.record.readsByRep.locks, 10);
    const funded = await act(src.fundOnly);
    assert.equal(funded.record.outcome, "skipped");
    assert.deepEqual(funded.record.locks, [{ op: "fund", lock: 1, amount: 3, spend: 3 }]);
  });

  test(`${language}: a new lock is a program in the agent's language, made on the state the calls reach, where it must hold`, async () => {
    const mine = ready("prime-intercept", language);
    const made = await act(src.lockAfter(4, mine), []);
    assert.equal(made.record.outcome, "committed", made.record.reason);
    assert.deepEqual(made.record.notes, ["true"]);
    const d = made.record.locks![0]!;
    assert.ok(d.op === "create");
    const r = run(mine, line(-2, 17)) as Extract<PredicateRun, { ok: true }>;
    assert.deepEqual({ ...d, fee: 0, rate: 0, spend: 0 }, { op: "create", lock: 1, program: mine, programBits: predicateBits(mine), readBits: r.readBits, bits: predicateBits(mine) + r.readBits, amount: 10, fee: 0, rate: 0, spend: 0 });
    // Creation and upkeep are proportional to the complexity, each at its own rate.
    assert.ok(Math.abs(d.fee - rates.createPerBit * d.bits) < 1e-9 && Math.abs(d.rate - rates.upkeepPerBit * d.bits) < 1e-12 && Math.abs(d.spend - d.fee - 10) < 1e-9);
    const not = await act(src.lockAfter(2, mine), []);   // 15
    assert.equal(not.record.outcome, "failed");
    assert.match(not.record.reason ?? "", /does not meet the lock's program \(the y-intercept is prime\)/);
    const poor = await act(src.lockAfter(4, mine), [], 3);
    assert.equal(poor.record.outcome, "failed");
    assert.match(poor.record.reason ?? "", /not enough energy/);
  });
}

test("quotes see the act's queued drains; a game without locks says so", () => {
  const prime = ready("prime-intercept", "typescript");
  const host = new EngineHost({ type: lineType, variant: lineZ, state, rule, energy: 100, locks: { ...locks([live(1, prime)]), language: "typescript" } });
  const ctx = { hostCallsLeft: 10 };
  const q1 = host.handle({ op: "quote", calls: [{ mutator: "si.shift", site: 0, args: { k: "1" } }] }, ctx);
  assert.ok(q1.ok && (q1.result as { valid: boolean }).valid === false);
  assert.match((q1 as { result: { reason: string } }).result.reason, /breaks lock #1/);
  assert.ok(host.handle({ op: "drain", lock: 1, amount: 5 }, ctx).ok);
  const q2 = host.handle({ op: "quote", calls: [{ mutator: "si.shift", site: 0, args: { k: "1" } }] }, ctx);
  assert.ok(q2.ok && (q2.result as { valid: boolean }).valid === true);
  const none = new EngineHost({ type: lineType, variant: lineZ, state, rule, energy: 100 }).handle({ op: "locks" }, ctx);
  assert.deepEqual(none, { ok: false, error: "this game has no locks" });
});

test("the shipped starters never propose a move a lock forbids: on a locked line each skips or keeps the predicate, in both languages", async () => {
  // y = −2x + 13 under "the y-intercept is prime": the starters' own climb prices every plan, and a quote refuses a lock-breaking one.
  const { startersFor } = await import("../src/index.ts");
  const prime = ready("prime-intercept", "typescript");
  let committed = 0;
  for (const language of ["typescript", "python"] as const) for (const a of startersFor("prime-gradient", language)) {
    for (const seed of ["1", "2", "3"]) {
      const { record, state: after } = await runAct(await boxes.get(language), {
        type: lineType, variant: lineZ, state, rule, program: { language, source: a.source }, seed, energy: 500, locks: locks([live(1, prime)]),
      });
      assert.notEqual(record.outcome, "failed", `${a.kind} (${language}): ${record.reason}`);
      if (record.outcome === "committed") {
        committed++;
        const l = (after as typeof state).lines[0]!;
        const c = Qn.div(Qn.q(-l.c), Qn.q(l.b));
        assert.ok(c.d === 1n && c.n > 1n && [...Array(Number(c.n) - 2)].every((_, i) => c.n % BigInt(i + 2) !== 0n), `${a.kind} (${language}) moved to c = ${Qn.toWire(c)}`);
      }
    }
  }
  assert.ok(committed > 0, "some starter still moves (a tilt keeps c)");
});
