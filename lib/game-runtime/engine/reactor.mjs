/**
 * Pinned CPython command module -> reactor (offline, by scripts/build-python-bundle.mjs).
 *
 * Only section framing, the export section and the memory limits are rewritten: the existing C APIs
 * the host calls are exported by their debug-name-map indices, every defined global is exported as
 * `snapshot_global_<i>` (so the host can snapshot and restore it), and the memory gets a 128 MiB
 * maximum (V8 has no store limits). Code is validated by V8 at compile time and decoded below to
 * reject every table-mutating opcode; unknown instruction proposals fail closed rather than being
 * byte-searched. Imports must all be functions (no imported tables, memories or globals).
 */
import { createHash } from "node:crypto";

export const ABI = (
  "__wasm_call_ctors malloc free PyConfig_InitPythonConfig "
  + "Py_InitializeFromConfig PyConfig_Clear PyRun_SimpleString "
  + "Py_CompileString PyDict_New PyDict_SetItemString PyEval_GetBuiltins "
  + "PyEval_EvalCode PyObject_CallOneArg PyLong_FromLong PyLong_AsLong "
  + "PyUnicode_FromStringAndSize PyUnicode_AsUTF8AndSize PyObject_Type "
  + "PyErr_Clear PyErr_Occurred PyImport_AddModule PyModule_GetDict PyDict_GetItemString "
  + "PyMarshal_WriteObjectToString PyMarshal_ReadObjectFromString PyBytes_AsStringAndSize "
  + "PyLong_FromLongLong PyUnicode_GetLength PyErr_GetRaisedException"
).split(" ");
/** 128 MiB of linear memory, in 64 KiB pages. */
export const MEMORY_MAX_PAGES = 2048;

export function leb(data, pos) {
  let value = 0n, shift = 0n;
  for (;;) {
    if (pos >= data.length) throw new Error("Truncated Wasm LEB");
    const byte = data[pos++];
    value |= BigInt(byte & 127) << shift;
    if (byte < 128) return [Number(value), pos];
    shift += 7n;
    if (shift > 70n) throw new Error("Invalid Wasm LEB");
  }
}
export function encode(value) {
  const out = [];
  while (value >= 128) { out.push((value & 127) | 128); value = Math.floor(value / 128); }
  out.push(value);
  return Uint8Array.from(out);
}
const utf8 = new TextEncoder();
const string = value => { const data = utf8.encode(value); return concat([encode(data.length), data]); };
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/** Decodes every function body; throws on any table-mutating or unknown instruction. */
export function immutableTable(code) {
  let [count, p] = leb(code, 0);
  for (let f = 0; f < count; f++) {
    let size; [size, p] = leb(code, p);
    const end = p + size;
    let locals; [locals, p] = leb(code, p);
    for (let i = 0; i < locals; i++) { [, p] = leb(code, p); p += 1; }
    while (p < end) {
      const op = code[p++];
      if ([2, 3, 4, 12, 13, 16, 18, 20, 32, 33, 34, 35, 36, 63, 64, 65, 66, 210].includes(op)) [, p] = leb(code, p);
      else if (op === 17 || op === 19) { [, p] = leb(code, p); [, p] = leb(code, p); }
      else if (op === 14) {
        let n; [n, p] = leb(code, p);
        for (let i = 0; i <= n; i++) [, p] = leb(code, p);
      } else if (op >= 40 && op <= 62) { [, p] = leb(code, p); [, p] = leb(code, p); }
      else if (op === 67) p += 4;
      else if (op === 68) p += 8;
      else if (op === 252) {
        let sub; [sub, p] = leb(code, p);
        if (sub === 8 || sub === 10) { [, p] = leb(code, p); [, p] = leb(code, p); }
        else if (sub === 9 || sub === 11) [, p] = leb(code, p);
        else if (sub > 7) throw new Error("Table/bulk proposal not supported");
      } else if ([0, 1, 5, 11, 15, 26, 27].includes(op) || (op >= 69 && op <= 196)) { /* no immediates */ }
      else throw new Error(`Unsupported or table instruction 0x${op.toString(16)}`);
    }
    if (p !== end) throw new Error("Invalid function framing");
  }
  if (p !== code.length) throw new Error("Invalid code framing");
}

/** Rewrites the memory section's limits to [min, MEMORY_MAX_PAGES]; rejects shared or 64-bit memories. */
function cappedMemory(payload) {
  let [count, q] = leb(payload, 0);
  if (count !== 1) throw new Error("Exactly one memory expected");
  const flags = payload[q++];
  if (flags !== 0 && flags !== 1) throw new Error("Only unshared 32-bit memories supported");
  let min; [min, q] = leb(payload, q);
  if (flags === 1) [, q] = leb(payload, q);
  if (q !== payload.length) throw new Error("Invalid memory section");
  if (min > MEMORY_MAX_PAGES) throw new Error("Initial memory exceeds the cap");
  return concat([encode(1), Uint8Array.of(1), encode(min), encode(MEMORY_MAX_PAGES)]);
}

/** @returns {{ binary: Uint8Array, globalCount: number, inputSha256: string }} */
export function transform(data) {
  const header = Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0);
  if (data.length < 8 || header.some((b, i) => data[i] !== b)) throw new Error("Not Wasm version 1");
  const sections = [], names = new Map();
  let pos = 8, globalCount = 0;
  while (pos < data.length) {
    const kind = data[pos];
    let size; [size, pos] = leb(data, pos + 1);
    const payload = data.subarray(pos, pos + size);
    if (payload.length !== size) throw new Error("Truncated section");
    pos += size;
    sections.push([kind, payload]);
    if (kind === 2) {
      let [count, q] = leb(payload, 0);
      for (let i = 0; i < count; i++) {
        for (let j = 0; j < 2; j++) { let n; [n, q] = leb(payload, q); q += n; }
        if (payload[q] !== 0) throw new Error("Only function imports supported");
        [, q] = leb(payload, q + 1);
      }
    }
    if (kind === 6) [globalCount] = leb(payload, 0);
    if (kind === 10) immutableTable(payload);
    if (kind !== 0) continue;
    let [n, q] = leb(payload, 0);
    if (new TextDecoder().decode(payload.subarray(q, q + n)) !== "name") continue;
    q += n;
    while (q < payload.length) {
      const sub = payload[q];
      [n, q] = leb(payload, q + 1);
      const end = q + n;
      if (sub === 1) {
        let count; [count, q] = leb(payload, q);
        for (let i = 0; i < count; i++) {
          let index, length; [index, q] = leb(payload, q); [length, q] = leb(payload, q);
          names.set(new TextDecoder().decode(payload.subarray(q, q + length)), index);
          q += length;
        }
      }
      q = end;
    }
  }
  const extra = ABI.map(n => {
    if (!names.has(n)) throw new Error(`Missing C API ${n}`);
    return [n, 0, names.get(n)];
  });
  for (let i = 0; i < globalCount; i++) extra.push([`snapshot_global_${i}`, 3, i]);
  const out = [header];
  let memories = 0;
  for (let [kind, payload] of sections) {
    if (kind === 0) continue;
    if (kind === 5) { payload = cappedMemory(payload); memories++; }
    if (kind === 7) {
      const [count, q] = leb(payload, 0);
      payload = concat([encode(count + extra.length), payload.subarray(q),
        ...extra.map(([n, k, i]) => concat([string(n), Uint8Array.of(k), encode(i)]))]);
    }
    out.push(Uint8Array.of(kind), encode(payload.length), payload);
  }
  if (memories !== 1) throw new Error("Exactly one defined memory expected");
  return { binary: concat(out), globalCount, inputSha256: createHash("sha256").update(data).digest("hex") };
}
