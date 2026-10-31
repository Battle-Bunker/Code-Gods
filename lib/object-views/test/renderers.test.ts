/**
 * Several named renderers per object type (registry.ts): the type's default, an explicit `renderer` prop, the
 * viewer's remembered choice, and the guarded localStorage behind it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { OBJECT_RENDERER_KEY_PREFIX, createObjectTypeRegistry, type ObjectRendererOf } from "../src/registry.ts";

const r = (id: string): ObjectRendererOf<string> => ({ id, label: id, blurb: `${id} blurb`, Component: id.toUpperCase() });

/** A Map-backed localStorage stand-in, installed for one test and removed after. */
function withStorage(fn: (store: Map<string, string>) => void, opts: { throws?: boolean } = {}) {
  const g = globalThis as { localStorage?: unknown };
  const had = Object.getOwnPropertyDescriptor(g, "localStorage");
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  Object.defineProperty(g, "localStorage", {
    configurable: true,
    get() { if (opts.throws) throw new Error("blocked"); return storage; },
  });
  try { fn(store); } finally {
    if (had) Object.defineProperty(g, "localStorage", had); else delete g.localStorage;
  }
}

function gridRegistry() {
  const reg = createObjectTypeRegistry<string>();
  reg.register({ type: "string", renderers: [r("text")], infer: v => typeof v === "string" });
  reg.register({ type: "Grid", renderers: [r("tiles"), r("digits")], defaultRenderer: "digits", infer: v => v === "grid" });
  return reg;
}

test("renderers: the type's default unless the viewer chose another; an explicit prop wins", () => {
  withStorage(() => {
    const reg = gridRegistry();
    assert.deepEqual(reg.renderers("Grid").map(x => x.id), ["tiles", "digits"]);
    assert.deepEqual(reg.renderers("Nope"), []);
    assert.equal(reg.choice("Grid"), "digits", "default");
    assert.equal(reg.pick("Grid")?.id, "digits");
    assert.equal(reg.pick("Grid", "tiles")?.id, "tiles", "explicit renderer prop");
    assert.equal(reg.resolve("grid")?.component, "DIGITS", "an entry's component is its default renderer's");

    assert.equal(reg.choose("Grid", "tiles"), true);
    assert.equal(reg.choice("Grid"), "tiles", "viewer's choice");
    assert.equal(reg.pick("Grid")?.id, "tiles");
    assert.equal(reg.pick("Grid", "digits")?.id, "digits", "explicit prop beats the viewer's choice");
    assert.equal(reg.pick("Grid", "sparkles")?.id, "tiles", "an unknown explicit id falls back to the viewer's choice");

    assert.equal(reg.choose("Grid", "sparkles"), false, "an unknown renderer is refused");
    assert.equal(reg.choice("Grid"), "tiles");
    assert.equal(reg.choice("Nope"), undefined);
    assert.equal(reg.pick("Nope"), undefined);
  });
});

test("renderers: the default is the first renderer when none is named; a bad default is refused", () => {
  const reg = createObjectTypeRegistry<string>();
  reg.register({ type: "Tree", renderers: [r("outline"), r("svg")] });
  assert.equal(reg.get("Tree")?.defaultRenderer, "outline");
  assert.throws(() => reg.register({ type: "Bad", renderers: [r("a")], defaultRenderer: "b" }), /default renderer "b"/);
  assert.throws(() => reg.register({ type: "Empty", renderers: [] }), /at least one renderer/);
});

test("renderers: one-component registration still works, as a single renderer", () => {
  const reg = createObjectTypeRegistry<string>();
  reg.register({ type: "Int", component: "I", infer: v => typeof v === "number" });
  assert.equal(reg.resolve(5)?.component, "I");
  assert.deepEqual(reg.renderers("Int").map(x => x.id), ["default"]);
  assert.equal(reg.pick("Int")?.Component, "I");
});

test("renderers: the viewer's choice is remembered per type in localStorage and read back by a fresh registry", () => {
  withStorage(store => {
    const a = gridRegistry();
    a.choose("Grid", "tiles");
    assert.equal(store.get(`${OBJECT_RENDERER_KEY_PREFIX}Grid`), "tiles");
    assert.equal(OBJECT_RENDERER_KEY_PREFIX, "code-gods.object-views.renderer.");
    const b = gridRegistry();
    assert.equal(b.choice("Grid"), "tiles", "a new page load reads the stored choice");
    store.set(`${OBJECT_RENDERER_KEY_PREFIX}Grid`, "removed-renderer");
    assert.equal(gridRegistry().choice("Grid"), "digits", "a stored id that is no longer registered falls back to the default");
  });
});

test("renderers: subscribers hear every change; blocked storage keeps the choice in memory", () => {
  withStorage(() => {
    const reg = gridRegistry();
    assert.equal(reg.choice("Grid"), "digits");
    let calls = 0;
    const off = reg.subscribe(() => calls++);
    reg.choose("Grid", "tiles");
    assert.equal(reg.choice("Grid"), "tiles", "remembered for this page even though storage throws");
    assert.equal(calls, 1);
    reg.choose("Grid", "nope");
    assert.equal(calls, 1, "a refused choice notifies nobody");
    off();
    reg.choose("Grid", "digits");
    assert.equal(calls, 1);
  }, { throws: true });
});

test("renderers: no localStorage at all (Node, SSR) still works", () => {
  const reg = gridRegistry();
  assert.equal(reg.choice("Grid"), "digits");
  reg.choose("Grid", "tiles");
  assert.equal(reg.choice("Grid"), "tiles");
});
