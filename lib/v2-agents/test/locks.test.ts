/**
 * Locks through the agent API (docs/engine-v2/locks.md): an agent lists the offered object's locks (a read), queues
 * funds, drains and new locks, and runAct applies them with lib/v2-core's lockedAct: funds and drains, then each call
 * checked against the locks left, then the new locks on the state reached. Both guest languages.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fromMC, lineZ, lineType } from "@workspace/v2-linear";
import { parsePredicate, Qn, type ActLock, type Predicate } from "@workspace/v2-core";
import { EngineHost, lockInfo, runAct, sandboxes } from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());
const line = (m: number, c: number) => ({ lines: [fromMC(Qn.q(m), Qn.q(c))] });
const rule = { family: "prime-gradient", params: { ends: 1 }, tieBreaker: "shared-factor" };
const P = (t: string) => parsePredicate(lineType, t) as Predicate;
const primeLock: ActLock = { n: 1, predicate: P("si.c is prime"), text: "si.c is prime", info: 4, energy: 5, settledAt: 0, rate: 0.1 };
const locks = (live: ActLock[] = [primeLock]) => ({ world: 0, live, nextLock: live.length + 1, fullChargeSeconds: 240, info: lockInfo(lineType, lineZ) });
const state = line(-2, 13);

const programs = {
  typescript: {
    shift: (k: number) => `function agent(offer) { return [move("si.shift", { k: ${k} })]; }`,
    drainThenShift: (k: number, x: number) => `function agent(offer) { offer.drain(1, ${x}); return [move("si.shift", { k: ${k} })]; }`,
    list: `function agent(offer) { const ls = offer.locks(); offer.note(ls.map(l => l.lock + ":" + l.predicate + ":" + l.words).join("|")); return null; }`,
    lockAfter: (k: number, p: string) => `function agent(offer) { offer.lock(${JSON.stringify(p)}, 10); return [move("si.shift", { k: ${k} })]; }`,
    fundOnly: `function agent(offer) { offer.fund(1, 3); return null; }`,
  },
  python: {
    shift: (k: number) => `def agent(offer):\n    return [move("si.shift", k=${k})]\n`,
    drainThenShift: (k: number, x: number) => `def agent(offer):\n    offer.drain(1, ${x})\n    return [move("si.shift", k=${k})]\n`,
    list: `def agent(offer):\n    offer.note("|".join(f"{l.lock}:{l.predicate}:{l.words}" for l in offer.locks()))\n    return None\n`,
    lockAfter: (k: number, p: string) => `def agent(offer):\n    offer.lock(${JSON.stringify(p)}, 10)\n    return [move("si.shift", k=${k})]\n`,
    fundOnly: `def agent(offer):\n    offer.fund(1, 3)\n    return None\n`,
  },
};
const act = (language: "typescript" | "python", source: string, live?: ActLock[], energy = 100) =>
  boxes.get(language).then(box => runAct(box, {
    type: lineType, variant: lineZ, state, rule, program: { language, source }, seed: "1", energy, locks: locks(live),
  }));

for (const language of ["typescript", "python"] as const) {
  const src = programs[language];
  test(`${language}: a move that breaks a lock fails the act; one that keeps it commits`, async () => {
    const broken = await act(language, src.shift(1));
    assert.equal(broken.record.outcome, "failed");
    assert.match(broken.record.reason ?? "", /breaks lock #1 \(the y-intercept is prime\)/);
    const kept = await act(language, src.shift(4));   // 13 → 17
    assert.equal(kept.record.outcome, "committed");
    assert.equal(kept.record.locks, undefined);
  });

  test(`${language}: drain to zero then move, in one act; the drain is recorded and paid on top of the charge`, async () => {
    const { record } = await act(language, src.drainThenShift(1, 5));
    assert.equal(record.outcome, "committed", record.reason);
    assert.deepEqual(record.locks, [{ op: "drain", lock: 1, amount: 5, spend: 5 }]);
    assert.equal(record.lockSpend, 5);
    const part = await act(language, src.drainThenShift(1, 2));
    assert.equal(part.record.outcome, "failed");
  });

  test(`${language}: listing locks is a read of their information; lock changes alone are a skip that carries them`, async () => {
    const listed = await act(language, src.list);
    assert.deepEqual(listed.record.notes, ["1:si.c is prime:the y-intercept is prime"]);
    assert.equal(listed.record.readsByRep.locks, 4);
    const funded = await act(language, src.fundOnly);
    assert.equal(funded.record.outcome, "skipped");
    assert.deepEqual(funded.record.locks, [{ op: "fund", lock: 1, amount: 3, spend: 3 }]);
  });

  test(`${language}: a new lock is made on the state the calls reach, and must hold there`, async () => {
    const made = await act(language, src.lockAfter(4, "si.c is prime and si.m = -2"), []);
    assert.equal(made.record.outcome, "committed", made.record.reason);
    const d = made.record.locks![0]!;
    assert.equal(d.op, "create");
    assert.equal(d.lock, 1);
    const not = await act(language, src.lockAfter(2, "si.c is prime"), []);   // 15
    assert.equal(not.record.outcome, "failed");
    const poor = await act(language, src.lockAfter(4, "si.c is prime"), [], 3);
    assert.equal(poor.record.outcome, "failed");
    assert.match(poor.record.reason ?? "", /not enough energy/);
  });
}

test("quotes and othersAfter see the act's queued drains; a game without locks says so", () => {
  const host = new EngineHost({ type: lineType, variant: lineZ, state, rule, energy: 100, locks: locks() });
  const ctx = { hostCallsLeft: 10 };
  const q1 = host.handle({ op: "quote", calls: [{ mutator: "si.shift", site: 0, args: { k: "1" } }] }, ctx);
  assert.ok(q1.ok && (q1.result as { valid: boolean }).valid === false);
  assert.ok(host.handle({ op: "drain", lock: 1, amount: 5 }, ctx).ok);
  const q2 = host.handle({ op: "quote", calls: [{ mutator: "si.shift", site: 0, args: { k: "1" } }] }, ctx);
  assert.ok(q2.ok && (q2.result as { valid: boolean }).valid === true);
  const none = new EngineHost({ type: lineType, variant: lineZ, state, rule, energy: 100 }).handle({ op: "locks" }, ctx);
  assert.deepEqual(none, { ok: false, error: "this game has no locks" });
});

test("the shipped starters never propose a move a lock forbids: on a locked line each skips or keeps the predicate, in both languages", async () => {
  // y = −2x + 13 under "si.c is prime": the starters' own climb prices every plan, and a quote refuses a lock-breaking one.
  const { startersFor } = await import("../src/index.ts");
  let committed = 0;
  for (const language of ["typescript", "python"] as const) for (const a of startersFor("prime-gradient", language)) {
    for (const seed of ["1", "2", "3"]) {
      const { record, state: after } = await runAct(await boxes.get(language), {
        type: lineType, variant: lineZ, state, rule, program: { language, source: a.source }, seed, energy: 500, locks: locks(),
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
