import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export class RuntimeError extends Error {
  constructor(code, message) { super(message); this.name = "RuntimeError"; this.code = code; }
}
const fail = (code, message) => { throw new RuntimeError(code, message); };
function domain(settings) {
  if (!settings || !["Int", "string"].includes(settings.objectType)
      || !Number.isInteger(settings.intMin) || !Number.isInteger(settings.intMax)
      || settings.intMin < -(2 ** 31) || settings.intMax >= 2 ** 31 || settings.intMin > settings.intMax
      || !Number.isInteger(settings.stringMaxLength) || settings.stringMaxLength < 0
      || settings.stringMaxLength > 8192
      || !Number.isInteger(settings.interactionComputeMs ?? 5)
      || (settings.interactionComputeMs ?? 5) < 1
      || (settings.interactionComputeMs ?? 5) > 1000) fail("DOMAIN", "Unsupported domain settings");
}
function check(value, settings) {
  const valid = settings.objectType === "Int"
    ? Number.isSafeInteger(value) && value >= settings.intMin && value <= settings.intMax
    : typeof value === "string" && value.length <= settings.stringMaxLength && !/[^\x00-\x7f]/u.test(value);
  if (!valid) fail("DOMAIN", "Value outside configured domain");
}

/** A bounded process pool. Guest code executes only in Wasm, never in these hosts. */
export class GameRuntime {
  constructor({ language, workers = 1, queueLimit = 32, deadlineMs = 4000,
    startupMs = 30000, python = "python3" } = {}) {
    if (!["python", "typescript"].includes(language)) fail("CONFIG", "Unknown language");
    for (const n of [workers, queueLimit, deadlineMs, startupMs])
      if (!Number.isSafeInteger(n) || n < 1) fail("CONFIG", "Limits must be positive integers");
    if (workers > 16 || queueLimit > 1024 || deadlineMs > 30000 || startupMs > 120000)
      fail("CONFIG", "Unsupported service limits");
    // Resolve the trusted executable before removing PATH from the child.
    if (!python.includes("/")) {
      python = (process.env.PATH ?? "").split(delimiter).map(p => join(p, python)).find(existsSync) ?? python;
    }
    Object.assign(this, { language, workers, queueLimit, deadlineMs, startupMs, python });
    this.queue = []; this.slots = []; this.closed = false;
  }
  async inspect(source, settings) { return this.request("inspect", source, settings); }
  async execute(source, input, settings) {
    domain(settings); check(input, settings);
    return this.request("execute", source, settings, input);
  }
  async executeBatch(source, inputs, settings) {
    domain(settings);
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 128)
      fail("DOMAIN", "Batch requires 1–128 inputs");
    inputs.forEach(input => check(input, settings));
    if (Buffer.byteLength(JSON.stringify(inputs)) > 32768)
      fail("DOMAIN", "Batch inputs exceed 32768 bytes");
    // Python retains compatibility with workers that only implement single calls.
    if (this.language === "python") {
      const values = [];
      for (const input of inputs) values.push((await this.execute(source, input, settings)).value);
      return { values };
    }
    return this.request("executeBatch", source, settings, inputs);
  }
  async validate(source, samples, settings) {
    if (!Array.isArray(samples) || samples.length < 1 || samples.length > 32)
      fail("DOMAIN", "Validation requires 1–32 samples");
    const { cost } = await this.inspect(source, settings);
    const outputs = [];
    for (const sample of samples) {
      const { value } = await this.execute(source, sample, settings);
      outputs.push(value);
    }
    return { cost, outputs };
  }
  request(mode, source, settings, input) {
    domain(settings);
    if (typeof source !== "string" || Buffer.byteLength(source) > 16384)
      fail("COMPILE", "Source must be at most 16384 UTF-8 bytes");
    if (this.closed) fail("UNAVAILABLE", "Runtime is closed");
    if (this.queue.length + this.slots.filter(s => s.job).length >= this.queueLimit + this.workers)
      fail("CAPACITY", "Runtime capacity exhausted; retry later");
    return new Promise((resolve, reject) => {
      const { objectType, intMin, intMax, stringMaxLength, interactionComputeMs = 5 } = settings;
      const job = { request: { mode, source, settings: { objectType, intMin, intMax, stringMaxLength, interactionComputeMs }, input }, resolve, reject };
      // Queue wait itself is bounded, including slow worker startup.
      job.timer = setTimeout(() => {
        const i = this.queue.indexOf(job);
        if (i >= 0) { this.queue.splice(i, 1); reject(new RuntimeError("CAPACITY", "Queue wait expired")); }
      }, this.startupMs + this.deadlineMs);
      this.queue.push(job); this.pump();
    });
  }
  pump() {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (!slot.ready || slot.job || !this.queue.length) continue;
      const job = this.queue.shift(); clearTimeout(job.timer); slot.job = job;
      slot.timer = setTimeout(() => this.remove(slot, new RuntimeError("LIMIT", "Hard wall deadline exceeded")),
        slot.executionPhases ? this.startupMs : this.deadlineMs);
      slot.child.stdin.write(JSON.stringify(job.request) + "\n");
    }
    // Starting workers already reserve queued jobs. Grow only for actual
    // concurrent demand, not every request during a sequential startup probe.
    let starting = this.slots.filter(slot => !slot.ready).length;
    while (this.queue.length > starting && this.slots.length < this.workers) {
      this.start(); starting++;
    }
  }
  start() {
    const isPython = this.language === "python";
    const path = fileURLToPath(new URL(isPython ? "./python/runner.py" : "./typescript-worker.mjs", import.meta.url));
    const child = spawn(isPython ? this.python : process.execPath,
      isPython ? ["-u", path] : ["--max-old-space-size=192", path],
      { env: {}, stdio: ["pipe", "pipe", "pipe"] });
    const slot = { child, ready: false, buffer: "", bytes: 0, job: null, removed: false };
    this.slots.push(slot);
    slot.timer = setTimeout(() => this.remove(slot, new RuntimeError("UNAVAILABLE", "Worker startup timed out")),
      this.startupMs);
    child.on("error", () => this.remove(slot, new RuntimeError("UNAVAILABLE", "Runtime dependency unavailable")));
    child.on("exit", () => this.remove(slot, new RuntimeError("UNAVAILABLE", "Runtime worker exited")));
    child.stdin.on("error", () => this.remove(slot, new RuntimeError("UNAVAILABLE", "Runtime worker pipe closed")));
    child.stderr.on("data", data => {
      slot.bytes += data.length;
      if (slot.bytes > 65536) this.remove(slot, new RuntimeError("LIMIT", "Worker output exceeded limit"));
    });
    child.stdout.on("data", data => {
      slot.bytes += data.length;
      if (slot.bytes > 8 * 1024 * 1024) return this.remove(slot, new RuntimeError("LIMIT", "Worker output exceeded limit"));
      slot.buffer += data.toString("utf8");
      while (slot.buffer.includes("\n") && !slot.removed) {
      const newline = slot.buffer.indexOf("\n");
      const text = slot.buffer.slice(0, newline); slot.buffer = slot.buffer.slice(newline + 1);
      try {
        const result = JSON.parse(text);
        if (!slot.ready) {
          if (result.ready !== true) throw new Error("Bad startup");
          slot.executionPhases = result.executionPhases === true;
          slot.ready = true; clearTimeout(slot.timer); slot.bytes = 0; this.pump(); continue;
        }
        if (result.phase === "execute" && slot.executionPhases && slot.job && !slot.job.executing) {
          slot.job.executing = true;
          clearTimeout(slot.timer);
          const { mode, input, settings } = slot.job.request;
          const items = mode === "executeBatch" ? input.length : 1;
          // This is a wall-clock safety backstop, NOT the guest CPU meter.
          // Allow scheduling/IPC slack and bounded per-item batch overhead,
          // without giving a non-interruptible builtin the full service timeout.
          slot.executionWallMs = Math.min(this.deadlineMs,
            Math.max(50, settings.interactionComputeMs * 10 * items));
          slot.timer = setTimeout(() => this.remove(slot, new RuntimeError("LIMIT", "Execution hard wall deadline exceeded")),
            slot.executionWallMs);
          continue;
        }
        if (!slot.job || slot.buffer.length) throw new Error("Unexpected response");
        const job = slot.job;
        if (result.ok === false) {
          const error = new RuntimeError(
            ["COMPILE", "DOMAIN", "LIMIT", "EXECUTION"].includes(result.code) ? result.code : "EXECUTION",
            String(result.error).slice(0, 1000));
          // The worker has disposed the fresh guest. Keep its trusted compiled
          // cache on ordinary guest errors; only malformed IPC/hard hangs kill it.
          clearTimeout(slot.timer); slot.job = null; slot.bytes = 0;
          job.reject(error); this.pump(); continue;
        }
        if (job.request.mode === "inspect") {
          if (Object.keys(result).sort().join() !== "cost,ok" || !Number.isSafeInteger(result.cost) || result.cost < 0)
            throw new Error("Invalid inspection result");
        } else if (job.request.mode === "executeBatch") {
          if (Object.keys(result).sort().join() !== "ok,values" || !Array.isArray(result.values)
              || result.values.length !== job.request.input.length) throw new Error("Invalid batch result");
          result.values.forEach(value => check(value, job.request.settings));
        } else {
          if (Object.keys(result).sort().join() !== "ok,value") throw new Error("Invalid execution result");
          check(result.value, job.request.settings);
        }
        clearTimeout(slot.timer); slot.job = null; slot.bytes = 0;
        job.resolve(job.request.mode === "inspect" ? { cost: result.cost }
          : job.request.mode === "executeBatch" ? { values: result.values } : { value: result.value });
        this.pump();
      } catch (error) {
        this.remove(slot, error instanceof RuntimeError ? error : new RuntimeError("EXECUTION", "Invalid runtime response"));
      }
      }
    });
  }
  remove(slot, error) {
    if (slot.removed) return;
    slot.removed = true; clearTimeout(slot.timer); slot.child.kill("SIGKILL");
    this.slots = this.slots.filter(s => s !== slot);
    if (slot.job) slot.job.reject(error);
    // Missing dependencies should not create an endless respawn loop.
    if (!slot.ready) {
      for (const job of this.queue.splice(0)) { clearTimeout(job.timer); job.reject(error); }
    } else this.pump();
  }
  close() {
    this.closed = true;
    const error = new RuntimeError("UNAVAILABLE", "Runtime closed");
    for (const job of this.queue.splice(0)) { clearTimeout(job.timer); job.reject(error); }
    for (const slot of [...this.slots]) this.remove(slot, error);
  }
}

export const createRuntime = options => new GameRuntime(options);
