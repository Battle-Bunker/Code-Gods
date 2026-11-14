/** Determinism (spec §6.5): the same source, offer, seed and host give the same transcript and result. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { FakeHost } from "../src/index.ts";
import { sandboxes } from "./helpers.ts";

const inline = sandboxes("inline");
const worker = sandboxes("worker");
after(async () => { await inline.close(); await worker.close(); });

/** Agents whose host calls and answer depend on their seeded randomness and on the virtual clock. */
const sources = {
  python: `import random, time
def agent(offer):
    reps = ["si", "seq"]
    for i in range(3):
        offer.view(random.choice(reps))
    offer.element("si", "y", {"q": random.randint(-5, 5)})
    q = offer.quote([call("si.shift", k=random.randint(1, 9))])
    return [call("si.tilt", k=random.randint(1, 1000)), call("probe", r=str(time.time()) + ":" + str(q.total))]
`,
  typescript: `function agent(offer: Offer) {
  const reps = ["si", "seq"];
  const pick = (n: number) => Math.floor(Math.random() * n);
  for (let i = 0; i < 3; i++) offer.view(reps[pick(2)]);
  offer.element("si", "y", { q: pick(11) - 5 });
  const q = offer.quote([call("si.shift", { k: 1 + pick(9) })]);
  return [call("si.tilt", { k: 1 + pick(1000) }), call("probe", { r: Date.now() + ":" + q.total })];
}`,
};

const host = () => new FakeHost({ line: { m: 1, c: 2 }, rule: { family: "m-meets-c", params: {} } });

for (const language of ["python", "typescript"] as const) {
  test(`${language}: the same seed gives the same transcript and calls, inline and in a worker`, async () => {
    const run = async (box: typeof inline, seed: string) => {
      const result = await (await box.get(language)).act({ source: sources[language], offer: { object: 3 }, seed, host: host() });
      assert.equal(result.ok, true, result.ok ? "" : result.error);
      return result;
    };
    const a = await run(inline, "123456789"), b = await run(inline, "123456789"), c = await run(worker, "123456789");
    for (const other of [b, c]) {
      assert.deepEqual(other.transcript, a.transcript);
      assert.equal(other.ok && other.calls, a.ok && a.calls);
      assert.equal(other.ok && other.usedRandom, true);
    }
    const seeds = await Promise.all(["1", "2", "3"].map(s => run(inline, s)));
    const distinct = new Set(seeds.map(r => (r.ok ? r.calls : "")));
    assert.ok(distinct.size > 1, "different seeds should not all agree");
  });
}
