import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameRuntime } from "../index.mjs";

// The fixture "Int" prelude plus a tiny metered view: reading `.value` costs 8 bits.
const fixture = JSON.parse(readFileSync(new URL("./fixture-prelude.json", import.meta.url), "utf8"));
const base = { ...fixture, interactionComputeMs: 1000 };
const PY_VIEW = `
_BITS = [0]
class _View:
    def __init__(self, n): self._n = n
    @property
    def value(self):
        _BITS[0] += 8
        return self._n
def __agent_view(wire): return _View(wire)
`;
const JS_VIEW = `
let __bits = 0;
function __agent_view(w) { return { get value() { __bits += 8; return w; } }; }
`;
const DTS_VIEW = "\ndeclare function __agent_view(wire: number): { readonly value: number };\n";
const metered = (key, meter = true, extra = {}) => ({ ...base, ...extra, prelude: { ...base.prelude, key,
  python: base.prelude.python + PY_VIEW + (meter ? "def __read_bits(): return _BITS[0]\n" : ""),
  js: base.prelude.js + JS_VIEW + (meter ? "function __read_bits() { return __bits; }\n" : ""),
  dts: base.prelude.dts + DTS_VIEW } });
const meteredSettings = metered("metered");
const py = body => `def agent(n):\n${body}\n`;
const js = body => `function agent(n) {\n${body}\n}\n`;

for (const language of ["python", "typescript"]) {
  const isPy = language === "python";
  test(language + ": readBits is the meter's reading; 0 without a meter or a view", { timeout: 120000 }, async () => {
    const r = new GameRuntime({ language });
    try {
      const twice = isPy ? py("    return [add(n.value + n.value)]") : js("  return [add(n.value + n.value)];");
      const result = await r.act(twice, 5, meteredSettings, "1");
      assert.equal(result.calls, '[["add",{"k":10}]]');
      assert.equal(result.readBits, 16);
      const none = isPy ? py("    return [add(3)]") : js("  return [add(3)];");
      assert.equal((await r.act(none, 5, meteredSettings, "1")).readBits, 0);
      // A fresh guest per act: the meter does not carry over.
      assert.equal((await r.act(twice, 5, meteredSettings, "2")).readBits, 16);
      // validate: each sample reports its own reading.
      const checked = await r.validate(twice, [1, 2], meteredSettings, ["1", "2"]);
      assert.deepEqual(checked.acts.map(a => a.readBits), [16, 16]);
      // A view without a meter, and the plain fixture, read 0.
      const plain = isPy ? py("    return [add(n)]") : js("  return [add(n)];");
      const view = isPy ? py("    return [add(n.value)]") : js("  return [add(n.value)];");
      assert.equal((await r.act(view, 5, metered("view-only", false), "1")).readBits, 0);
      assert.equal((await r.act(plain, 5, base, "1")).readBits, 0);
      // The meter handing back anything but a finite number >= 0 reads 0.
      for (const bad of isPy ? ["-1", "float('nan')", "'x'", "None", "float('inf')"] : ["-1", "NaN", "'x'", "undefined", "Infinity"]) {
        const odd = metered("odd-" + bad, true, {});
        odd.prelude.python += `def __read_bits(): return ${bad}\n`;
        odd.prelude.js += `function __read_bits() { return ${bad}; }\n`;
        assert.equal((await r.act(view, 5, odd, "1")).readBits, 0, bad);
      }
    } finally { r.close(); }
  });

  test(language + ": readBits is attached to a failing act (agent raised, step limit)", { timeout: 120000 }, async () => {
    const r = new GameRuntime({ language });
    try {
      const raise = isPy ? py("    n.value\n    raise ValueError('boom')") : js("  n.value; if (n) throw new Error('boom'); return [];");
      await assert.rejects(r.act(raise, 5, meteredSettings, "1"), e => e.code === "EXECUTION" && e.readBits === 8);
      const spin = isPy ? py("    n.value\n    n.value\n    while True:\n        pass") : js("  n.value; n.value; while (true) {}\n  return [];");
      await assert.rejects(r.act(spin, 5, { ...meteredSettings, stepBudget: 2000 }, "1"),
        e => e.code === "LIMIT" && /Step limit/.test(e.message) && e.readBits === 16);
      // Failures before the budgeted phase carry no reading; a prelude with no meter reads 0.
      await assert.rejects(r.act(raise, 5, metered("nometer", false), "1"), e => e.code === "EXECUTION" && e.readBits === 0);
    } finally { r.close(); }
  });
}

test("typescript: the agent's parameter is typed by __agent_view when the prelude declares it", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "typescript" });
  try {
    await r.inspect(js("  return [add(n.value)];"), meteredSettings);
    await assert.rejects(r.inspect(js("  return [add(n)];"), meteredSettings), { code: "COMPILE" });
    await assert.rejects(r.inspect(js("  return [add(n.missing)];"), meteredSettings), { code: "COMPILE" });
    // Without the declaration the parameter is the plain decode (a number).
    await r.inspect(js("  return [add(n)];"), base);
    await assert.rejects(r.inspect(js("  return [add(n.value)];"), base), { code: "COMPILE" });
  } finally { r.close(); }
});

test("typescript: an agent rebinding __read_bits cannot hide its reads", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "typescript" });
  try {
    const sneaky = js("  const v = n.value;\n  (globalThis as any).__read_bits = () => 0;\n  return [add(v)];");
    assert.equal((await r.act(sneaky, 5, meteredSettings, "1")).readBits, 8);
    const gone = js("  const v = n.value;\n  delete (globalThis as any).__read_bits;\n  return [add(v)];");
    assert.equal((await r.act(gone, 5, meteredSettings, "1")).readBits, 8);
    const sneakyThenThrow = js("  n.value;\n  (globalThis as any).__read_bits = () => 0;\n  if (n) throw new Error('x');\n  return [];");
    await assert.rejects(r.act(sneakyThenThrow, 5, meteredSettings, "1"), e => e.readBits === 8);
  } finally { r.close(); }
});

test("python: source that could reach past the meter is refused, with the line", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "python" });
  try {
    const refused = async (source, pattern) => {
      await assert.rejects(r.inspect(source, base), e => e.code === "COMPILE" && e.message.startsWith("SyntaxError: ") && pattern.test(e.message),
        source);
    };
    const body = line => `def agent(n):\n${line}\n    return []\n`;
    for (const [line, name] of [
      ["    x = n.__class__", "__class__"], ["    x = __builtins__", "__builtins__"], ["    x = _hidden", "_hidden"],
      ["    x = n._secret", "_secret"], ["    f = lambda _a: _a", "_a"], ["    x = dict(_k=1)", "_k"],
      ["    import math as _m", "_m"], ["    from math import _x", "_x"], ["    global _g", "_g"],
      ["    x = (lambda: 0).__closure__", "__closure__"],
    ]) await refused(body(line), new RegExp(`agents can't use "${name}" \\(line 2\\): names starting with _ belong to the sandbox`));
    await refused("def agent(_n):\n    return []\n", /"_n" \(line 1\)/);
    await refused("def agent(n, *, _k=1):\n    return []\n", /"_k" \(line 1\)/);
    await refused("def agent(n, **__kw):\n    return []\n", /"__kw" \(line 1\)/);
    for (const attr of "gi_frame gi_code gi_yieldfrom cr_frame cr_code cr_await ag_frame ag_code ag_await f_back f_globals f_locals f_builtins f_code tb_frame tb_next cell_contents format format_map mro".split(" "))
      await refused(body(`    x = n.${attr}`), new RegExp(`agents can't use "\\.${attr}" \\(line 2\\)`));
    await refused(body("    x = '{}'.format(1)"), /build text with f-strings/);
    for (const name of "getattr setattr delattr attrgetter methodcaller vars globals locals".split(" ")) {
      await refused(body(`    x = ${name}`), new RegExp(`agents can't use ${name} \\(line 2\\): read the board through the room's helpers \\(cell.colour, n.value, ...\\)`));
      await refused(body(`    x = n.${name}`), new RegExp(`agents can't use ${name} \\(line 2\\)`));
      await refused(body(`    from operator import ${name}`), new RegExp(`agents can't use ${name} \\(line 2\\)`));
    }
    // Reported at the first line, whichever rule it breaks.
    await refused("def agent(n):\n    a = 1\n    b = getattr\n    c = n._x\n    return []\n", /getattr \(line 3\)/);
    // Ordinary agents, the throwaway `_`, and a module-level agent with helpers and classes are fine.
    for (const ok of [
      "def agent(n):\n    return [add(i) for _ in range(3) for i in (1,)]\n",
      "def agent(n):\n    for _ in range(3):\n        pass\n    a, _ = 1, 2\n    return [add(n)]\n",
      "import math\nclass Box:\n    def __init__(self, v):\n        self.v = v\ndef helper(x, key=None):\n    return sorted(x, key=key)\ndef agent(n):\n    return [add(Box(n).v + math.isqrt(4))]\n",
      "def agent(n):\n    label = f'{n:>3}'\n    return [add(n)] if label else []\n",
    ]) await r.inspect(ok, base);
    // Acts go through the same inspection.
    await assert.rejects(r.act(body("    x = vars(n)"), 5, base, "1"), e => e.code === "COMPILE" && /vars \(line 2\)/.test(e.message));
  } finally { r.close(); }
});
