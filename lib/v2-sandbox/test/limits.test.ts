/** The per-turn caps: the deterministic step budget, the time cap (and the worker's hard wall), the host-call cap. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { FakeHost } from "../src/index.ts";
import { sandboxes } from "./helpers.ts";

const inline = sandboxes("inline");
const worker = sandboxes("worker");
after(async () => { await inline.close(); await worker.close(); });
const host = () => new FakeHost({ line: { m: 1, c: 1 }, rule: { family: "m-meets-c", params: {} } });

const runaway = {
  python: "def agent(offer):\n    offer.view('si')\n    while True:\n        pass\n",
  typescript: "function agent(offer: Offer) { offer.view('si'); for (;;) {} }\n",
};

/** Loops whose steps are slow (native work in each), so the time cap binds before 10 million steps. */
const slow = {
  python: "def agent(offer):\n    while True:\n        sorted(range(2000))\n",
  typescript: "function agent(offer: Offer) { for (;;) { 'x'.repeat(2000).split('').reverse(); } }\n",
};

for (const language of ["python", "typescript"] as const) {
  test(`${language}: the step budget stops a runaway loop, and the reads before it are still charged`, async () => {
    const result = await (await inline.get(language)).act({ source: runaway[language], offer: { object: 0 }, seed: "1", host: host(), limits: { stepBudget: 20000 } });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "LIMIT");
    assert.match(result.error, /Step limit exceeded/);
    assert.equal(result.readBits, 4 + 4);
  });

  test(`${language}: the time cap stops a loop the step budget would allow`, async () => {
    const result = await (await inline.get(language)).act({ source: slow[language], offer: { object: 0 }, seed: "1", host: host(), limits: { stepBudget: 10_000_000, wallMs: 100 } });
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.code, "LIMIT"); assert.match(result.error, /Time limit exceeded/); }
  });
}

test("python: the step limit cannot be caught", async () => {
  const source = "def agent(offer):\n    try:\n        while True:\n            pass\n    except BaseException:\n        return [call('probe', r='caught')]\n";
  const result = await (await inline.get("python")).act({ source, offer: { object: 0 }, seed: "1", host: host(), limits: { stepBudget: 5000 } });
  assert.equal(result.ok, false);
});

const native = {
  python: "def agent(offer):\n    return [call('probe', r=str(sum(range(10 ** 12))))]\n",
  typescript: "function agent(offer: Offer) { return [call('probe', { r: String(/(a+)+$/.test('a'.repeat(40) + 'b')) })]; }\n",
};

for (const language of ["python", "typescript"] as const) {
  test(`${language} (worker): the hard wall ends one long native step, and the next act runs normally`, async () => {
    const box = await worker.get(language);
    const started = Date.now();
    const stuck = await box.act({ source: native[language], offer: { object: 0 }, seed: "1", host: host(), limits: { wallMs: 300 } });
    assert.equal(stuck.ok, false);
    if (!stuck.ok) { assert.equal(stuck.code, "LIMIT"); assert.match(stuck.error, /Time limit exceeded/); }
    assert.ok(Date.now() - started < 5000);
    const fine = await box.act({ source: language === "python" ? "def agent(offer):\n    return None\n" : "function agent(offer: Offer) { return null; }",
      offer: { object: 0 }, seed: "1", host: host() });
    assert.equal(fine.ok, true, fine.ok ? "" : fine.error);
  });
}

test("both languages: the host-call cap refuses calls past it, as host errors", async () => {
  const sources = {
    python: "def agent(offer):\n    seen = []\n    for i in range(5):\n        try:\n            offer.budget()\n            seen.append('ok')\n        except HostError as e:\n            seen.append(str(e))\n    return [call('probe', r='|'.join(seen))]\n",
    typescript: "function agent(offer: Offer) {\n  const seen: string[] = [];\n  for (let i = 0; i < 5; i++) { try { offer.budget(); seen.push('ok'); } catch (e) { seen.push(e instanceof HostError ? e.message : 'other'); } }\n  return [call('probe', { r: seen.join('|') })];\n}\n",
  };
  for (const language of ["python", "typescript"] as const) {
    const h = host();
    const result = await (await inline.get(language)).act({ source: sources[language], offer: { object: 0 }, seed: "1", host: h, limits: { hostCallCap: 3 } });
    assert.equal(result.ok, true, result.ok ? "" : result.error);
    if (!result.ok) continue;
    assert.equal(JSON.parse(result.calls)[0].args.r, "ok|ok|ok|the host-call cap (3 calls per act) is reached|the host-call cap (3 calls per act) is reached");
    assert.equal(h.calls, 3, "refused calls never reach the host");
    assert.deepEqual(result.transcript.map(t => (t.reply.ok ? t.reply.result : null) as { hostCallsLeft: number } | null).slice(0, 3).map(r => r?.hostCallsLeft), [2, 1, 0]);
  }
});
