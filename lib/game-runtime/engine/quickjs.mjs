/**
 * typescript-agent-v1 execution on QuickJS-Wasm: a fresh runtime and context per act, with the virtual
 * clock, the seeded Math.random, the deterministic step budget (interrupt ticks) and the CPU check. It
 * needs only QuickJS, so execution workers do not load the TypeScript compiler (engine/typescript.mjs
 * produces the JavaScript, as trusted compiler output).
 */
import { fail, timeLimit, stopwatch } from "./domain.mjs";

/** @param {{ getQuickJS: () => Promise<any> }} deps */
export async function createQuickJSExecutor({ getQuickJS }) {
  const QuickJS = await getQuickJS();
  const CALLS_MAX = 65536;
  const EPOCH_US = 1767225600n * 1000000n;           // 2026-01-01T00:00:00Z: every act's virtual clock starts here
  const TICKS_PER_INTERRUPT = 10000;                 // QuickJS polls the interrupt handler every 10,000 ticks
  const MASK64 = (1n << 64n) - 1n;
  /** SplitMix64 (the grid-lab test vectors' generator); `Math.random` = top 53 bits / 2^53. */
  function splitmix(seed) {
    let state = BigInt.asUintN(64, seed);
    return () => {
      state = (state + 0x9E3779B97F4A7C15n) & MASK64;
      let z = state;
      z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK64;
      z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK64;
      return z ^ (z >> 31n);
    };
  }

  function act(js, preludeJs, input, { computeMs = 5, seed = "0", stepBudget = 500000 } = {}, onExecute = () => {}) {
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(32 * 1024 * 1024);
    runtime.setMaxStackSize(512 * 1024);
    const context = runtime.newContext();
    const handles = [];
    const keep = handle => (handles.push(handle), handle);
    // Capture the intrinsic before untrusted code can replace JSON.stringify.
    // getString uses a NUL-terminated bridge; JSON escaping preserves embedded NULs.
    const stringify = keep(context.unwrapResult(context.evalCode("JSON.stringify")));
    // Deterministic: a virtual clock (1 µs per read, restarted every act) and a seeded generator.
    let ticks = 0n, executing = false, usedRandom = false;
    const next = splitmix(BigInt(seed));
    const clock = keep(context.newFunction("__clock", () => context.newNumber(Number((EPOCH_US + ++ticks) / 1000n))));
    const elapsed = keep(context.newFunction("__elapsed", () => context.newNumber(Number(++ticks) / 1000)));
    const entropy = keep(context.newFunction("__entropy", () => {
      if (executing) usedRandom = true;
      return context.newNumber(Number(next() >> 11n) / 2 ** 53);
    }));
    /** Copy a guest string primitive exactly, after bounding its length. */
    const copy = (handle, max) => {
      if (context.typeof(handle) !== "string") return undefined;
      const length = context.getProp(handle, "length");
      const size = context.getNumber(length);
      length.dispose();
      if (size > max) return null;
      const encoded = context.unwrapResult(context.callFunction(stringify, context.undefined, handle));
      try { return JSON.parse(context.getString(encoded)); } finally { encoded.dispose(); }
    };
    try {
      context.setProp(context.global, "__clock", clock);
      context.setProp(context.global, "__entropy", entropy);
      context.setProp(context.global, "__elapsed", elapsed);
      const setup = context.evalCode(`{
        const clock = globalThis.__clock, entropy = globalThis.__entropy, elapsed = globalThis.__elapsed, NativeDate = Date;
        delete globalThis.__clock; delete globalThis.__entropy; delete globalThis.__elapsed;
        Object.defineProperty(globalThis, "performance", {value: Object.freeze({now: elapsed}), writable: false, configurable: false});
        const HostDate = function(...args) {
          if (!new.target) return new NativeDate(clock()).toString();
          return Reflect.construct(NativeDate, args.length ? args : [clock()], new.target);
        };
        Object.setPrototypeOf(HostDate, NativeDate);
        HostDate.prototype = NativeDate.prototype;
        Object.defineProperty(HostDate, "now", {value: clock});
        Object.defineProperty(globalThis, "Date", {value: HostDate, writable: false, configurable: false});
        Object.defineProperty(Math, "random", {value: entropy, writable: false, configurable: false});
      }`);
      context.unwrapResult(setup).dispose();
      // Error text is computed by guest code (user getters may run), inside the budget.
      const describe = keep(context.unwrapResult(context.evalCode(`(e) => {
        try { return (String((e && e.name) || "Error") + ": " + String(e && e.message !== undefined ? e.message : e)).slice(0, 500); }
        catch { return "an error"; }
      }`)));
      // Trusted prelude and decode: outside the guest budget.
      const prelude = context.evalCode(preludeJs, "prelude.js");
      if (prelude.error) { prelude.error.dispose(); fail("CONFIG", "The room's JavaScript prelude failed to run"); }
      prelude.value.dispose();
      const decode = keep(context.getProp(context.global, "__decode"));
      const encode = keep(context.getProp(context.global, "__encode_calls"));
      if (context.typeof(decode) !== "function" || context.typeof(encode) !== "function") {
        fail("CONFIG", "The room's prelude must define __decode and __encode_calls");
      }
      // newString also crosses a NUL-terminated bridge. A host-escaped literal
      // preserves all ASCII code points without executing input as source.
      const arg = keep(typeof input === "number" ? context.newNumber(input)
        : context.unwrapResult(context.evalCode(JSON.stringify(input))));
      const decoded = context.callFunction(decode, context.undefined, arg);
      if (decoded.error) { decoded.error.dispose(); fail("CONFIG", "The room's prelude could not decode the input"); }
      const object = keep(decoded.value);
      // This thread's CPU clock where Node has one, otherwise this thread's wall time (process CPU would
      // count other workers). Compilation, fresh-context setup, the prelude and decode are outside the
      // guest budget. The pool's execution wall backstop starts here, after trusted setup.
      onExecute();
      const cpu = stopwatch();
      // The deterministic step budget: QuickJS calls the handler every 10,000 ticks (function calls and
      // backward jumps), so its call count is a deterministic counter. CPU time remains a backstop.
      const interruptLimit = Math.ceil(stepBudget / TICKS_PER_INTERRUPT);
      let interrupts = 0;
      const stepsOut = () => interrupts > interruptLimit;
      const overCpu = () => cpu() >= computeMs;
      const expired = () => stepsOut() || overCpu();
      const limit = () => fail("LIMIT", stepsOut()
        ? `Step limit exceeded: the agent took more than ${stepBudget} steps. Do less work per call.` : timeLimit(computeMs));
      runtime.setInterruptHandler(() => { interrupts++; return expired(); });
      executing = true;
      // Interrupt checks are cooperative: long native builtins may return late.
      // The post-check rejects those results; the parent hard wall kills hangs.
      const guest = (result, what) => {
        if (!result.error) return keep(result.value);
        const error = keep(result.error);
        if (expired()) limit();
        const text = context.callFunction(describe, context.undefined, error);
        let detail = "an error";
        if (!text.error) { detail = copy(keep(text.value), 1000) || detail; }
        else text.error.dispose();
        if (expired()) limit();
        fail("EXECUTION", `${what}: ${detail}`);
      };
      guest(context.evalCode(js, "agent.js"), "The agent's program threw an error");
      let agent;
      try { agent = keep(context.getProp(context.global, "agent")); }
      catch { if (expired()) limit(); fail("EXECUTION", "Reading agent failed"); }
      if (context.typeof(agent) !== "function") fail("EXECUTION", "The agent's program no longer defines function agent");
      const calls = guest(context.callFunction(agent, context.undefined, object), "agent threw an error");
      // The encoder is untrusted-equivalent (the guest can replace what it uses);
      // the host parses and validates its output.
      const output = guest(context.callFunction(encode, context.undefined, calls), "Encoding agent's calls failed");
      if (expired()) limit();
      const text = copy(output, CALLS_MAX);
      if (text === undefined) fail("DOMAIN", "agent must return a list of mutator calls (the encoder did not produce a string)");
      if (text === null) fail("LIMIT", `agent returned too many mutator calls (encoded output over ${CALLS_MAX} bytes)`);
      if (expired()) limit();
      if (/[^\x00-\x7f]/u.test(text)) fail("DOMAIN", "Encoded calls must be an ASCII string");
      return { calls: text, usedRandom, steps: interrupts * TICKS_PER_INTERRUPT };
    } finally {
      for (const handle of handles.reverse()) if (handle.alive) handle.dispose();
      context.dispose(); runtime.dispose();
    }
  }

  // Trusted warm-up before announcing readiness: V8 compiles QuickJS's Wasm
  // functions lazily on first use, which must not be charged to a player's budget.
  for (let i = 0; i < 3; i++) {
    act("function agent(o) { return [{ m: String(o), at: Date.now(), r: Math.random(), s: [1, 2].map(x => x * 2) }]; }\n",
      "function __decode(w) { return w; }\nfunction __encode_calls(c) { return JSON.stringify(c); }\n",
      i ? "warm" : 1, { computeMs: 1000 });
    try { act("function agent(o) { throw new Error('warm'); }", "function __decode(w) { return w; }\nfunction __encode_calls(c) { return c; }", 1, { computeMs: 1000 }); }
    catch { /* expected */ }
  }  return {
    /**
     * One act of compiled JavaScript: {js, preludeJs, input, computeMs, seed, stepBudget}. Validation of
     * the input, seed and settings is the caller's (index.mjs checks them before dispatch).
     */
    execute({ js, preludeJs, input, computeMs, seed, stepBudget }, { onExecute } = {}) {
      return act(js, preludeJs, input, { computeMs, seed, stepBudget }, onExecute);
    },
  };
}
