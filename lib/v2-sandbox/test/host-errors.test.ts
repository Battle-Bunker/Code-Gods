/**
 * Host errors (spec §6.4, §6.5): a `{ ok: false, error }` reply is raised in the agent as HostError, which it may
 * catch; uncaught, it fails the act, which is still charged the reads made before it.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { FakeHost } from "../src/index.ts";
import { probes, sandboxes } from "./helpers.ts";

const boxes = sandboxes();
after(() => boxes.close());
const host = () => new FakeHost({ line: { m: 2, c: 3 }, rule: { family: "m-meets-c", params: {} } });

const caught = {
  python: "def agent(offer):\n    try:\n        offer.view('nope')\n    except HostError as e:\n        return [call('probe', r=str(e))]\n",
  typescript: "function agent(offer: Offer) {\n  try { offer.view('nope'); } catch (e) { if (e instanceof HostError) return [call('probe', { r: e.message })]; throw e; }\n  return null;\n}\n",
};
const uncaught = {
  python: "def agent(offer):\n    offer.view('si')\n    offer.element('si', 'nope')\n    return None\n",
  typescript: "function agent(offer: Offer) { offer.view('si'); offer.element('si', 'nope'); return null; }\n",
};

for (const language of ["python", "typescript"] as const) {
  test(`${language}: a host error is a HostError the agent can catch`, async () => {
    const result = await (await boxes.get(language)).act({ source: caught[language], offer: { object: 0 }, seed: "1", host: host() });
    assert.equal(result.ok, true, result.ok ? "" : result.error);
    if (!result.ok) return;
    assert.deepEqual(probes(result.calls), ["unknown representation \"nope\""]);
    assert.deepEqual(result.transcript, [{ request: { op: "view", rep: "nope" }, reply: { ok: false, error: "unknown representation \"nope\"" } }]);
  });

  test(`${language}: an uncaught host error fails the act, which keeps its reads`, async () => {
    const result = await (await boxes.get(language)).act({ source: uncaught[language], offer: { object: 0 }, seed: "1", host: host() });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "EXECUTION");
    assert.match(result.error, /HostError: si has no element "nope"/);
    assert.equal(result.readBits, 5 + 1 + 5 + 1);
    assert.equal(result.transcript.length, 2);
  });

  test(`${language}: a host that throws is reported to the agent as a host error, not a crash`, async () => {
    const broken = { calls: 0, handle() { throw new Error("database down"); } };
    const result = await (await boxes.get(language)).act({ source: caught[language], offer: { object: 0 }, seed: "1", host: broken });
    assert.equal(result.ok, true, result.ok ? "" : result.error);
    if (result.ok) assert.deepEqual(probes(result.calls), ["the host failed: database down"]);
  });
}
