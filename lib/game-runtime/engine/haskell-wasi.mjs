/**
 * The WASI preview1 import table of the MicroHs guests (engine/haskell.mjs), on Node's own WebAssembly.
 *
 * One run = one fresh instance. The host offers exactly:
 *  - a read-only in-memory file tree (the package database and the sources for a compilation, or the
 *    compiled program for an act), preopened as "/";
 *  - one writable directory, "/out/", whose files are kept in memory (the compiler's output);
 *  - stdin (the act's input), stdout and stderr (captured, bounded);
 *  - the virtual clock (2026-01-01T00:00:00Z, +1 µs per read) and the run's seeded SplitMix64 bytes;
 *  - proc_exit, which ends the run with its code.
 * Every other import (sockets, renames, directory changes, polling, ...) answers ENOTCAPABLE/ENOSYS.
 * Node's own node:wasi is not used (its fast path crashes on these modules, and it reaches the host).
 */
import { EPOCH_NS, SplitMix64 } from "./wasi.mjs";

const E = { SUCCESS: 0, BADF: 8, FAULT: 21, INVAL: 28, ISDIR: 31, NOENT: 44, NOSYS: 52, NOTDIR: 54, ROFS: 69, FBIG: 22, NOTCAPABLE: 76 };
const FILETYPE = { UNKNOWN: 0, CHAR: 2, DIRECTORY: 3, REGULAR: 4 };
const ALL_RIGHTS = (1n << 29n) - 1n;
const OUT = "/out";
const utf8 = new TextEncoder();

/** A guest's proc_exit (or a host stop): ends the run. */
export class GuestExit extends Error {
  constructor(code) { super(`exit ${code}`); this.code = code; }
}

/** A bounded append-only byte sink. */
class Sink {
  constructor(max) { this.max = max; this.parts = []; this.size = 0; this.overflow = false; }
  write(bytes) {
    const room = this.max - this.size;
    if (bytes.length > room) this.overflow = true;
    const take = bytes.subarray(0, Math.max(0, room));
    if (take.length) { this.parts.push(take.slice()); this.size += take.length; }
  }
  bytes() {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const p of this.parts) { out.set(p, at); at += p.length; }
    return out;
  }
  text() { return new TextDecoder().decode(this.bytes()); }
}

function tree(files) {
  const nodes = new Map([["", { dir: true }], [OUT, { dir: true, out: true }]]);
  for (const [path, data] of files) {
    const full = path.startsWith("/") ? path : `/${path}`;
    nodes.set(full, { dir: false, data });
    for (let parent = full.slice(0, full.lastIndexOf("/")); parent; parent = parent.slice(0, parent.lastIndexOf("/")))
      if (!nodes.has(parent)) nodes.set(parent, { dir: true });
  }
  let ino = 1n;
  for (const key of [...nodes.keys()].sort()) nodes.get(key).ino = ino++;
  return nodes;
}

export class HaskellWasi {
  /**
   * @param {{ files: Map<string, Uint8Array>, args: string[], stdin?: Uint8Array, seed?: bigint,
   *           stdoutMax: number, stderrMax?: number, outMax?: number }} options
   */
  constructor({ files, args, stdin = new Uint8Array(0), seed = 0n, stdoutMax, stderrMax = 64 * 1024, outMax = 8 * 1024 * 1024 }) {
    this.nodes = tree(files);
    this.args = args;
    this.stdin = stdin; this.stdinAt = 0;
    this.stdout = new Sink(stdoutMax); this.stderr = new Sink(stderrMax);
    this.outMax = outMax; this.outSize = 0;
    this.outputs = new Map();   // "/out/name" -> Sink
    this.clock = 0n; this.entropy = new SplitMix64(seed); this.usedEntropy = false;
    this.fds = new Map([[0, { stdio: "in" }], [1, { stdio: "out" }], [2, { stdio: "err" }], [3, { path: "", preopen: "/" }]]);
    this.nextFd = 4;
    this.memory = null;
  }
  view() { return new DataView(this.memory.buffer); }
  bytes() { return new Uint8Array(this.memory.buffer); }
  checked(ptr, len) {
    ptr >>>= 0;
    if (ptr + len > this.memory.buffer.byteLength) throw new RangeError("out of bounds");
    return ptr;
  }
  put(ptr, data) { this.bytes().set(data, this.checked(ptr, data.length)); }
  /** The bytes the guest wrote to /out/<name>, or undefined. */
  output(name) { return this.outputs.get(`${OUT}/${name}`)?.bytes(); }

  imports(module) {
    const table = {};
    for (const { module: from, name, kind } of WebAssembly.Module.imports(module)) {
      if (from !== "wasi_snapshot_preview1" || kind !== "function") throw new Error("Unexpected module import");
      const own = this[`wasi_${name}`]?.bind(this);
      table[name] = (...args) => {
        if (!own) return E.NOSYS;
        try { return own(...args); }
        catch (error) { if (error instanceof RangeError) return E.FAULT; throw error; }
      };
    }
    return { wasi_snapshot_preview1: table };
  }

  strings(list, ptrs, buf) {
    const view = this.view();
    let at = buf >>> 0;
    list.forEach((s, i) => {
      const data = utf8.encode(s + "\0");
      view.setUint32(this.checked(ptrs + 4 * i, 4), at, true);
      this.put(at, data); at += data.length;
    });
    return E.SUCCESS;
  }
  sizes(list, countPtr, sizePtr) {
    const view = this.view();
    view.setUint32(this.checked(countPtr, 4), list.length, true);
    view.setUint32(this.checked(sizePtr, 4), list.reduce((n, s) => n + utf8.encode(s).length + 1, 0), true);
    return E.SUCCESS;
  }
  wasi_args_get(ptrs, buf) { return this.strings(this.args, ptrs, buf); }
  wasi_args_sizes_get(c, s) { return this.sizes(this.args, c, s); }
  wasi_environ_get() { return E.SUCCESS; }
  wasi_environ_sizes_get(c, s) { return this.sizes([], c, s); }
  wasi_clock_res_get(_id, ptr) { this.view().setBigUint64(this.checked(ptr, 8), 1000n, true); return E.SUCCESS; }
  wasi_clock_time_get(_id, _precision, ptr) {
    this.clock += 1n;
    this.view().setBigUint64(this.checked(ptr, 8), EPOCH_NS + 1000n * this.clock, true);
    return E.SUCCESS;
  }
  wasi_random_get(ptr, len) {
    if ((len >>> 0) > 65536) return E.INVAL;
    this.usedEntropy = true;
    this.put(this.checked(ptr, len >>> 0), this.entropy.take(len >>> 0));
    return E.SUCCESS;
  }
  wasi_sched_yield() { return E.SUCCESS; }
  wasi_proc_exit(code) { throw new GuestExit(code >>> 0); }

  iovecs(iovs, count) {
    const view = this.view(), out = [];
    for (let i = 0; i < count; i++) {
      const ptr = view.getUint32(this.checked(iovs + 8 * i, 8), true), len = view.getUint32(iovs + 8 * i + 4, true);
      out.push([this.checked(ptr, len), len]);
    }
    return out;
  }
  wasi_fd_write(fd, iovs, count, written) {
    const entry = this.fds.get(fd);
    const sink = entry?.stdio === "out" ? this.stdout : entry?.stdio === "err" ? this.stderr : entry?.sink;
    if (!sink) return entry ? E.BADF : E.BADF;
    let total = 0;
    for (const [ptr, len] of this.iovecs(iovs, count)) {
      if (entry.sink) {
        if (this.outSize + len > this.outMax) return E.FBIG;
        this.outSize += len;
      }
      sink.write(this.bytes().subarray(ptr, ptr + len));
      total += len;
    }
    this.view().setUint32(this.checked(written, 4), total, true);
    return E.SUCCESS;
  }
  wasi_fd_read(fd, iovs, count, readPtr) {
    const entry = this.fds.get(fd);
    if (!entry) return E.BADF;
    let data, offset;
    if (entry.stdio === "in") { data = this.stdin; offset = this.stdinAt; }
    else if (entry.path !== undefined && !this.nodes.get(entry.path).dir) { data = this.nodes.get(entry.path).data; offset = entry.offset; }
    else return entry.stdio ? E.BADF : E.ISDIR;
    let total = 0;
    for (const [ptr, len] of this.iovecs(iovs, count)) {
      const chunk = data.subarray(offset + total, offset + total + len);
      this.bytes().set(chunk, ptr);
      total += chunk.length;
      if (chunk.length < len) break;
    }
    if (entry.stdio === "in") this.stdinAt += total; else entry.offset += total;
    this.view().setUint32(this.checked(readPtr, 4), total, true);
    return E.SUCCESS;
  }
  wasi_fd_seek(fd, offset, whence, out) {
    const entry = this.fds.get(fd);
    if (!entry || entry.stdio || entry.sink || this.nodes.get(entry.path)?.dir) return entry?.sink ? E.NOTCAPABLE : E.BADF;
    const size = BigInt(this.nodes.get(entry.path).data.length);
    const base = whence === 0 ? 0n : whence === 1 ? BigInt(entry.offset) : whence === 2 ? size : -1n;
    const next = base + BigInt(offset);
    if (base < 0n || next < 0n) return E.INVAL;
    entry.offset = Number(next);
    this.view().setBigUint64(this.checked(out, 8), next, true);
    return E.SUCCESS;
  }
  wasi_fd_close(fd) {
    const entry = this.fds.get(fd);
    if (!entry) return E.BADF;
    if (!entry.stdio && !entry.preopen) this.fds.delete(fd);
    return E.SUCCESS;
  }
  wasi_fd_fdstat_get(fd, ptr) {
    const entry = this.fds.get(fd);
    if (!entry) return E.BADF;
    const view = this.view(); ptr = this.checked(ptr, 24);
    const type = entry.stdio ? FILETYPE.CHAR : entry.sink ? FILETYPE.REGULAR : this.nodes.get(entry.path).dir ? FILETYPE.DIRECTORY : FILETYPE.REGULAR;
    view.setUint8(ptr, type); view.setUint16(ptr + 2, 0, true);
    view.setBigUint64(ptr + 8, ALL_RIGHTS, true); view.setBigUint64(ptr + 16, ALL_RIGHTS, true);
    return E.SUCCESS;
  }
  wasi_fd_fdstat_set_flags() { return E.SUCCESS; }
  wasi_fd_prestat_get(fd, ptr) {
    const entry = this.fds.get(fd);
    if (!entry?.preopen) return E.BADF;
    const view = this.view(); ptr = this.checked(ptr, 8);
    view.setUint8(ptr, 0); view.setUint32(ptr + 4, entry.preopen.length, true);
    return E.SUCCESS;
  }
  wasi_fd_prestat_dir_name(fd, ptr, len) {
    const entry = this.fds.get(fd);
    if (!entry?.preopen) return E.BADF;
    this.put(this.checked(ptr, len), utf8.encode(entry.preopen).subarray(0, len));
    return E.SUCCESS;
  }
  resolve(fd, ptr, len) {
    const base = this.fds.get(fd);
    if (!base || base.stdio || base.sink || !this.nodes.get(base.path)?.dir) return [E.BADF];
    const parts = base.path ? base.path.split("/") : [""];
    for (const part of new TextDecoder().decode(this.bytes().subarray(this.checked(ptr, len), ptr + len)).split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") { if (parts.length <= 1) return [E.NOTCAPABLE]; parts.pop(); }
      else parts.push(part);
    }
    return [E.SUCCESS, parts.join("/")];
  }
  stat(node, ptr) {
    const view = this.view(); ptr = this.checked(ptr, 64);
    this.bytes().fill(0, ptr, ptr + 64);
    view.setBigUint64(ptr + 8, node.ino ?? 0n, true);
    view.setUint8(ptr + 16, node.dir ? FILETYPE.DIRECTORY : FILETYPE.REGULAR);
    view.setBigUint64(ptr + 24, 1n, true);
    view.setBigUint64(ptr + 32, BigInt(node.dir ? 0 : node.data?.length ?? 0), true);
    return E.SUCCESS;
  }
  wasi_path_filestat_get(fd, _flags, ptr, len, out) {
    const [errno, path] = this.resolve(fd, ptr, len);
    if (errno) return errno;
    const node = this.nodes.get(path);
    return node ? this.stat(node, out) : E.NOENT;
  }
  wasi_fd_filestat_get(fd, out) {
    const entry = this.fds.get(fd);
    if (!entry) return E.BADF;
    if (entry.stdio || entry.sink) return this.stat({ dir: false, data: { length: entry.sink?.size ?? 0 } }, out);
    return this.stat(this.nodes.get(entry.path), out);
  }
  wasi_path_open(fd, _dirflags, ptr, len, oflags, _rights, _inheriting, _fdflags, out) {
    const [errno, path] = this.resolve(fd, ptr, len);
    if (errno) return errno;
    const creating = oflags & (1 | 8);   // O_CREAT, O_TRUNC
    if (path.startsWith(`${OUT}/`) && path.lastIndexOf("/") === OUT.length) {
      if (!creating) {
        const sink = this.outputs.get(path);
        if (!sink) return E.NOENT;
        return E.NOTCAPABLE;   // outputs are write-only
      }
      if (this.outputs.size >= 8) return E.NOTCAPABLE;
      const sink = new Sink(this.outMax);
      this.outputs.set(path, sink);
      const fdNew = this.nextFd++;
      this.fds.set(fdNew, { sink });
      this.view().setUint32(this.checked(out, 4), fdNew, true);
      return E.SUCCESS;
    }
    const node = this.nodes.get(path);
    if (creating) return E.ROFS;
    if (!node) return E.NOENT;
    if ((oflags & 2) && !node.dir) return E.NOTDIR;
    const fdNew = this.nextFd++;
    this.fds.set(fdNew, { path, offset: 0 });
    this.view().setUint32(this.checked(out, 4), fdNew, true);
    return E.SUCCESS;
  }
  wasi_path_unlink_file() { return E.NOTCAPABLE; }
  wasi_path_remove_directory() { return E.NOTCAPABLE; }
}

/**
 * Runs one MicroHs module once in a fresh instance: `_start` with the host above. Returns
 * {code, reductions, wasi}; a trap (out of memory, a host fault) is rethrown.
 */
export function runModule(module, options, stepLimit = 0) {
  const wasi = new HaskellWasi(options);
  const instance = new WebAssembly.Instance(module, wasi.imports(module));
  wasi.memory = instance.exports.memory;
  instance.exports.cg_set_step_limit(stepLimit);
  let code = 0;
  try { instance.exports._start(); }
  catch (error) { if (error instanceof GuestExit) code = error.code; else throw error; }
  return { code, reductions: instance.exports.cg_reductions(), memoryBytes: instance.exports.memory.buffer.byteLength, wasi };
}
