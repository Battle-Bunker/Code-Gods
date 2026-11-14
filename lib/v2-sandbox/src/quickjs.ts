/**
 * TypeScript and JavaScript agents on QuickJS-Wasm (copied from lib/game-runtime/engine/quickjs.mjs and cleaned: no
 * read meter, no script mode). A fresh runtime and context per act; a virtual clock, a seeded Math.random, the
 * deterministic step budget (interrupt ticks) and the time cap. The only host capability is `__host`, a host
 * function taking one request's JSON text and returning the reply's (spec §6.5).
 */
import { getQuickJS, type QuickJSContext, type QuickJSHandle, type QuickJSWASMModule } from "quickjs-emscripten";
import { SandboxError, LIMITS, stepLimit, timeLimit, stopwatch } from "./limits.ts";
import { OVERSIZE_REPLY, messageBytes } from "./channel.ts";
import type { Engine, ExecuteRequest, ExecuteResult, Hooks } from "./engine.ts";

const EPOCH_US = 1767225600n * 1000000n;           // 2026-01-01T00:00:00Z: every act's virtual clock starts here
const TICKS_PER_INTERRUPT = 10000;                 // QuickJS polls the interrupt handler every 10,000 ticks
const MASK64 = (1n << 64n) - 1n;
const fail = (code: SandboxError["code"], message: string): never => { throw new SandboxError(code, message); };

/** SplitMix64; Math.random = top 53 bits / 2^53. */
function splitmix(seed: bigint) {
  let state = BigInt.asUintN(64, seed);
  return () => {
    state = (state + 0x9E3779B97F4A7C15n) & MASK64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK64;
    return z ^ (z >> 31n);
  };
}

/** Installs the virtual clock and seeded randomness, then forgets the host functions it used. */
const SETUP = `{
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
}`;
/** Error text, computed by guest code (user getters may run) inside the budget. */
const DESCRIBE = `(e) => {
  try { return (String((e && e.name) || "Error") + ": " + String(e && e.message !== undefined ? e.message : e)).slice(0, 500); }
  catch { return "an error"; }
}`;

export class QuickJSEngine implements Engine {
  private readonly QuickJS: QuickJSWASMModule;
  private constructor(QuickJS: QuickJSWASMModule) { this.QuickJS = QuickJS; }

  static async create(): Promise<QuickJSEngine> {
    const engine = new QuickJSEngine(await getQuickJS());
    // Trusted warm-up: V8 compiles QuickJS's Wasm lazily, which must not be charged to a player's first act.
    const prelude = "var __decode = t => t, __encode_calls = c => JSON.stringify(c);";
    for (let i = 0; i < 3; i++) {
      engine.execute({ source: "function agent(o) { return [{ m: String(o), at: Date.now(), r: Math.random() }]; }", prelude, offer: "{}", seed: 0n, stepBudget: 100000, wallMs: 5000 }, { host: () => "{}" });
    }
    return engine;
  }

  execute({ source, prelude, offer, seed, stepBudget, wallMs }: ExecuteRequest, hooks: Hooks): ExecuteResult {
    const runtime = this.QuickJS.newRuntime();
    runtime.setMemoryLimit(32 * 1024 * 1024);
    runtime.setMaxStackSize(512 * 1024);
    const context = runtime.newContext();
    const handles: QuickJSHandle[] = [];
    const keep = (handle: QuickJSHandle) => (handles.push(handle), handle);
    // Captured before untrusted code can replace JSON.stringify (getString is NUL-terminated; JSON escapes NULs).
    const stringify = keep(context.unwrapResult(context.evalCode("JSON.stringify")));
    let ticks = 0n, executing = false, usedRandom = false;
    const next = splitmix(seed);
    /** Copy a guest string primitive exactly, if it is one and at most `max` characters. */
    const copy = (handle: QuickJSHandle, max: number): string | null | undefined => {
      if (context.typeof(handle) !== "string") return undefined;
      const length = context.getProp(handle, "length");
      const size = context.getNumber(length);
      length.dispose();
      if (size > max) return null;
      const encoded = context.unwrapResult(context.callFunction(stringify, context.undefined, handle));
      try { return JSON.parse(context.getString(encoded)) as string; } finally { encoded.dispose(); }
    };
    const fn = (name: string, f: (...args: QuickJSHandle[]) => QuickJSHandle) => keep(context.newFunction(name, f));
    try {
      context.setProp(context.global, "__clock", fn("__clock", () => context.newNumber(Number((EPOCH_US + ++ticks) / 1000n))));
      context.setProp(context.global, "__elapsed", fn("__elapsed", () => context.newNumber(Number(++ticks) / 1000)));
      context.setProp(context.global, "__entropy", fn("__entropy", () => {
        if (executing) usedRandom = true;
        return context.newNumber(Number(next() >> 11n) / 2 ** 53);
      }));
      // The channel: a string in, a string out, synchronously. Anything else is answered as a host error would be.
      context.setProp(context.global, "__host", fn("__host", request => {
        const text = copy(request, LIMITS.messageBytes);
        if (text === undefined) return context.newString(JSON.stringify({ ok: false, error: "a host request is JSON text" }));
        if (text === null || messageBytes(text) > LIMITS.messageBytes) return context.newString(OVERSIZE_REPLY);
        return context.newString(hooks.host(text));
      }));
      context.unwrapResult(context.evalCode(SETUP)).dispose();
      const describe = keep(context.unwrapResult(context.evalCode(DESCRIBE)));
      // The trusted guest library and the offer: outside the budget.
      const library = context.evalCode(prelude, "codegods.js");
      if (library.error) { library.error.dispose(); fail("CONFIG", "The JavaScript guest library failed to run"); }
      else library.value.dispose();
      const decode = keep(context.getProp(context.global, "__decode"));
      const encode = keep(context.getProp(context.global, "__encode_calls"));
      if (context.typeof(decode) !== "function" || context.typeof(encode) !== "function") fail("CONFIG", "The guest library must define __decode and __encode_calls");
      const handed = context.callFunction(decode, context.undefined, keep(context.newString(offer)));
      if (handed.error) { handed.error.dispose(); fail("CONFIG", "The guest library could not make the offer"); }
      const offerHandle = keep((handed as { value: QuickJSHandle }).value);
      hooks.onExecute?.();
      const cpu = stopwatch();
      // QuickJS calls the handler every 10,000 ticks (function calls and backward jumps): a deterministic count.
      const interruptLimit = Math.ceil(stepBudget / TICKS_PER_INTERRUPT);
      let interrupts = 0;
      const stepsOut = () => interrupts > interruptLimit;
      const expired = () => stepsOut() || cpu() >= wallMs;
      const limit = () => fail("LIMIT", stepsOut() ? stepLimit(stepBudget) : timeLimit(wallMs));
      runtime.setInterruptHandler(() => { interrupts++; return expired(); });
      executing = true;
      // Interrupts are cooperative: a long native builtin may return late. The post-checks reject its result; the
      // worker's hard wall ends one that never returns.
      const guest = (result: ReturnType<QuickJSContext["evalCode"]>, what: string): QuickJSHandle => {
        if (!result.error) return keep(result.value);
        const error = keep(result.error);
        if (expired()) limit();
        const described = context.callFunction(describe, context.undefined, error);
        let detail = "an error";
        if (!described.error) detail = copy(keep(described.value), 1000) || detail;
        else described.error.dispose();
        if (expired()) limit();
        if (/out of memory/i.test(detail)) fail("LIMIT", "Memory limit exceeded: the agent used too much memory");
        return fail("EXECUTION", `${what}: ${detail}`);
      };
      guest(context.evalCode(source, "agent.js"), "The agent's program threw an error");
      const agent = keep(context.getProp(context.global, "agent"));
      if (context.typeof(agent) !== "function") fail("EXECUTION", "The agent's program must define function agent(offer)");
      const calls = guest(context.callFunction(agent, context.undefined, offerHandle), "agent threw an error");
      // The encoder is untrusted-equivalent (the agent can replace what it uses); the host validates its output.
      const output = guest(context.callFunction(encode, context.undefined, calls), "Encoding the agent's calls failed");
      if (expired()) limit();
      const text = copy(output, LIMITS.callsBytes);
      if (text === undefined) fail("EXECUTION", "agent must return a list of calls (the encoder did not produce a string)");
      if (text === null) fail("LIMIT", `agent returned too many calls (over ${LIMITS.callsBytes} bytes)`);
      if (expired()) limit();
      if (/[^\x00-\x7f]/u.test(text!)) fail("EXECUTION", "The encoded calls must be ASCII");
      return { calls: text!, usedRandom, steps: interrupts * TICKS_PER_INTERRUPT };
    } finally {
      executing = false;
      for (const handle of handles.reverse()) if (handle.alive) handle.dispose();
      context.dispose(); runtime.dispose();
    }
  }
}
