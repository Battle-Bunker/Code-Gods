/**
 * The WASI preview1 import table of the CPython guest, on Node's own WebAssembly.
 *
 * Two modes:
 *  - "bootstrap" (trusted startup only): a read-only, in-memory file system holding the bundled
 *    standard-library files (preopened as /lib), argv/environment, writes to stdout/stderr discarded.
 *    The clock and entropy are already the virtual ones, so the initialized snapshot is identical on
 *    every host.
 *  - "guest" (everything after bootstrap: compilation, inspection, every act): ONLY clock_time_get,
 *    clock_res_get and random_get are answered, from the virtual clock (2026-01-01T00:00:00Z, +1 µs per
 *    read) and a SplitMix64 byte stream from the act's seed. Every other import returns ENOTCAPABLE (or
 *    traps, for proc_exit, which has no result), whatever Python API the guest recovered.
 */
export const EPOCH_NS = 1767225600n * 1000000000n;
const MASK64 = (1n << 64n) - 1n;
const E = { SUCCESS: 0, BADF: 8, FAULT: 21, INVAL: 28, ISDIR: 31, NOENT: 44, NOSYS: 52, NOTDIR: 54, ROFS: 69, NOTCAPABLE: 76 };
const FILETYPE = { UNKNOWN: 0, CHAR: 2, DIRECTORY: 3, REGULAR: 4 };
const ALL_RIGHTS = MASK64 >> 35n;   // the 29 preview1 rights bits
const PREOPEN = "/lib";

/** Raised by host imports to abort a guest call (a trap: the instance is replaced before reuse). */
export class CapabilityTrap extends Error {}

/** SplitMix64 (the grid-lab test vectors' generator), as a little-endian byte stream. */
export class SplitMix64 {
  constructor(seed) { this.state = BigInt.asUintN(64, BigInt(seed)); this.buffer = new Uint8Array(0); }
  next() {
    this.state = (this.state + 0x9E3779B97F4A7C15n) & MASK64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK64;
    return z ^ (z >> 31n);
  }
  take(n) {
    if (this.buffer.length < n) {
      const words = Math.ceil((n - this.buffer.length) / 8);
      const more = new Uint8Array(this.buffer.length + words * 8);
      more.set(this.buffer);
      const view = new DataView(more.buffer);
      for (let i = 0; i < words; i++) view.setBigUint64(this.buffer.length + 8 * i, this.next(), true);
      this.buffer = more;
    }
    const out = this.buffer.slice(0, n);
    this.buffer = this.buffer.slice(n);
    return out;
  }
}

/** A read-only tree built from bundle paths under /lib (directories are implied by file paths). */
function tree(files) {
  const nodes = new Map([[PREOPEN, { dir: true, entries: new Set() }]]);
  for (let [path, data] of files) {
    if (!path.startsWith(PREOPEN + "/")) continue;
    if (path.endsWith("/")) { path = path.slice(0, -1); if (!nodes.has(path)) nodes.set(path, { dir: true, entries: new Set() }); }
    else nodes.set(path, { dir: false, data });
    let child = path;
    for (let parent = path.slice(0, path.lastIndexOf("/")); parent.length >= PREOPEN.length; parent = parent.slice(0, parent.lastIndexOf("/"))) {
      if (!nodes.has(parent)) nodes.set(parent, { dir: true, entries: new Set() });
      nodes.get(parent).entries.add(child.slice(parent.length + 1));
      child = parent;
      if (parent === PREOPEN) break;
    }
  }
  let ino = 1n;
  for (const node of [...nodes.keys()].sort()) nodes.get(node).ino = ino++;
  for (const node of nodes.values()) if (node.dir) node.list = [...node.entries].sort();
  return nodes;
}

export class Wasi {
  /**
   * @param {{ files: Map<string, Uint8Array>, args: string[], env: string[], record?: Set<string> }} options
   * `record` (build time only) collects every path the bootstrap opens or stats.
   */
  constructor({ files, args, env, record }) {
    this.nodes = tree(files);
    this.args = args; this.env = env; this.record = record;
    this.mode = "bootstrap";
    this.memory = null;
    this.clock = 0n;
    this.entropy = new SplitMix64(0);
    this.executing = false; this.usedEntropy = false;
    this.fds = new Map([[0, { stdio: true }], [1, { stdio: true }], [2, { stdio: true }], [3, { path: PREOPEN, preopen: true }]]);
    this.nextFd = 4;
    this.output = [];
  }
  /** Restart the per-act deterministic state (the virtual clock and the act's entropy stream). */
  resetAct(seed) { this.clock = 0n; this.entropy = new SplitMix64(seed); this.usedEntropy = false; }
  view() { return new DataView(this.memory.buffer); }
  bytes() { return new Uint8Array(this.memory.buffer); }
  text(ptr, len) { return new TextDecoder().decode(this.bytes().subarray(ptr, ptr + len)); }
  /** Writes into guest memory; throws RangeError out of bounds (answered as EFAULT). */
  put(ptr, data) {
    const memory = this.bytes();
    if (ptr < 0 || ptr + data.length > memory.length) throw new RangeError("out of bounds");
    memory.set(data, ptr);
  }

  /** The import object: one dispatcher per import the module declares. */
  imports(module) {
    const table = {};
    for (const { module: from, name, kind } of WebAssembly.Module.imports(module)) {
      if (from !== "wasi_snapshot_preview1" || kind !== "function") throw new Error("Unexpected module import");
      const own = this[`wasi_${name}`]?.bind(this);
      table[name] = (...args) => {
        if (this.mode !== "bootstrap") {
          // After bootstrap, clocks and entropy are virtual and deterministic, so every path to them
          // (including escapes past the guest's module proxies) sees the same values.
          try {
            if (name === "clock_time_get") {
              this.clock += 1n;
              this.view().setBigUint64(this.checked(args[2], 8), EPOCH_NS + 1000n * this.clock, true);
              return E.SUCCESS;
            }
            if (name === "clock_res_get") { this.view().setBigUint64(this.checked(args[1], 8), 1000n, true); return E.SUCCESS; }
            if (name === "random_get") {
              const [ptr, len] = [args[0] >>> 0, args[1] >>> 0];
              if (len > 65536) return E.INVAL;
              this.checked(ptr, len);
              if (this.executing) this.usedEntropy = true;
              this.put(ptr, this.entropy.take(len));
              return E.SUCCESS;
            }
          } catch (error) {
            if (error instanceof RangeError) return E.FAULT;
            throw error;
          }
          if (name === "proc_exit") throw new CapabilityTrap("Guest I/O/process capability denied");
          return E.NOTCAPABLE;   // regardless of recovered Python APIs
        }
        if (!own) return name === "proc_exit" ? (() => { throw new CapabilityTrap("proc_exit during bootstrap"); })() : E.NOSYS;
        try { return own(...args); }
        catch (error) { if (error instanceof RangeError) return E.FAULT; throw error; }
      };
    }
    return { wasi_snapshot_preview1: table };
  }
  checked(ptr, len) {
    ptr >>>= 0;
    if (ptr + len > this.memory.buffer.byteLength) throw new RangeError("out of bounds");
    return ptr;
  }

  // --- Bootstrap-only implementations (trusted startup reads the bundled standard library).
  strings(list, ptrs, buf) {
    const view = this.view();
    let at = buf >>> 0;
    list.forEach((s, i) => {
      const data = new TextEncoder().encode(s + "\0");
      view.setUint32(this.checked(ptrs + 4 * i, 4), at, true);
      this.put(at, data); at += data.length;
    });
    return E.SUCCESS;
  }
  sizes(list, countPtr, sizePtr) {
    const view = this.view();
    view.setUint32(this.checked(countPtr, 4), list.length, true);
    view.setUint32(this.checked(sizePtr, 4), list.reduce((n, s) => n + new TextEncoder().encode(s).length + 1, 0), true);
    return E.SUCCESS;
  }
  wasi_args_get(ptrs, buf) { return this.strings(this.args, ptrs, buf); }
  wasi_args_sizes_get(c, s) { return this.sizes(this.args, c, s); }
  wasi_environ_get(ptrs, buf) { return this.strings(this.env, ptrs, buf); }
  wasi_environ_sizes_get(c, s) { return this.sizes(this.env, c, s); }
  wasi_clock_res_get(_id, ptr) { this.view().setBigUint64(this.checked(ptr, 8), 1000n, true); return E.SUCCESS; }
  wasi_clock_time_get(_id, _precision, ptr) {
    this.clock += 1n;
    this.view().setBigUint64(this.checked(ptr, 8), EPOCH_NS + 1000n * this.clock, true);
    return E.SUCCESS;
  }
  wasi_random_get(ptr, len) {
    if ((len >>> 0) > 65536) return E.INVAL;
    this.put(this.checked(ptr, len >>> 0), this.entropy.take(len >>> 0)); return E.SUCCESS;
  }
  wasi_sched_yield() { return E.SUCCESS; }
  wasi_fd_write(fd, iovs, count, written) {
    const entry = this.fds.get(fd);
    if (!entry?.stdio || fd === 0) return E.BADF;
    const view = this.view();
    let total = 0;
    for (let i = 0; i < count; i++) {
      const ptr = view.getUint32(this.checked(iovs + 8 * i, 8), true), len = view.getUint32(iovs + 8 * i + 4, true);
      this.checked(ptr, len);
      if (this.output.length < 64) this.output.push(this.text(ptr, len));
      total += len;
    }
    view.setUint32(this.checked(written, 4), total, true);
    return E.SUCCESS;
  }
  wasi_fd_fdstat_get(fd, ptr) {
    const entry = this.fds.get(fd);
    if (!entry) return E.BADF;
    const view = this.view(); ptr = this.checked(ptr, 24);
    const type = entry.stdio ? FILETYPE.UNKNOWN : this.nodes.get(entry.path).dir ? FILETYPE.DIRECTORY : FILETYPE.REGULAR;
    view.setUint8(ptr, type); view.setUint16(ptr + 2, 0, true);
    view.setBigUint64(ptr + 8, ALL_RIGHTS, true); view.setBigUint64(ptr + 16, ALL_RIGHTS, true);
    return E.SUCCESS;
  }
  wasi_fd_fdstat_set_flags() { return E.NOTCAPABLE; }
  wasi_fd_prestat_get(fd, ptr) {
    const entry = this.fds.get(fd);
    if (!entry?.preopen) return E.BADF;
    const view = this.view(); ptr = this.checked(ptr, 8);
    view.setUint8(ptr, 0); view.setUint32(ptr + 4, new TextEncoder().encode(entry.path).length, true);
    return E.SUCCESS;
  }
  wasi_fd_prestat_dir_name(fd, ptr, len) {
    const entry = this.fds.get(fd);
    if (!entry?.preopen) return E.BADF;
    this.put(this.checked(ptr, len), new TextEncoder().encode(entry.path).subarray(0, len));
    return E.SUCCESS;
  }
  resolve(fd, ptr, len) {
    const base = this.fds.get(fd);
    if (!base || base.stdio || !this.nodes.get(base.path)?.dir) return [E.BADF];
    const parts = base.path.split("/");
    for (const part of this.text(ptr, len).split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") { if (parts.length <= 2) return [E.NOTCAPABLE]; parts.pop(); }
      else parts.push(part);
    }
    const path = parts.join("/");
    if (path !== PREOPEN && !path.startsWith(PREOPEN + "/")) return [E.NOTCAPABLE];
    this.record?.add(path);
    return [E.SUCCESS, path];
  }
  stat(node, ptr) {
    const view = this.view(); ptr = this.checked(ptr, 64);
    this.bytes().fill(0, ptr, ptr + 64);
    view.setBigUint64(ptr + 8, node.ino, true);
    view.setUint8(ptr + 16, node.dir ? FILETYPE.DIRECTORY : FILETYPE.REGULAR);
    view.setBigUint64(ptr + 24, 1n, true);
    view.setBigUint64(ptr + 32, BigInt(node.dir ? 0 : node.data.length), true);
    return E.SUCCESS;   // all timestamps 0: deterministic
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
    if (entry.stdio) { const p = this.checked(out, 64); this.bytes().fill(0, p, p + 64); this.view().setUint8(p + 16, FILETYPE.UNKNOWN); return E.SUCCESS; }
    return this.stat(this.nodes.get(entry.path), out);
  }
  // wasi-libc asks for every right on every open; the tree is read-only because no write, truncate,
  // create, rename, link or delete operation exists here (fd_write only reaches stdout/stderr).
  wasi_path_open(fd, _dirflags, ptr, len, oflags, _rights, _inheriting, _fdflags, out) {
    const [errno, path] = this.resolve(fd, ptr, len);
    if (errno) return errno;
    const node = this.nodes.get(path);
    if (oflags & (1 | 4 | 8)) return E.ROFS;                       // O_CREAT, O_EXCL, O_TRUNC
    if (!node) return E.NOENT;
    if ((oflags & 2) && !node.dir) return E.NOTDIR;                // O_DIRECTORY
    const fdNew = this.nextFd++;
    this.fds.set(fdNew, { path, offset: 0 });
    this.view().setUint32(this.checked(out, 4), fdNew, true);
    return E.SUCCESS;
  }
  wasi_fd_close(fd) {
    const entry = this.fds.get(fd);
    if (!entry || entry.preopen || entry.stdio) return entry ? E.SUCCESS : E.BADF;
    this.fds.delete(fd);
    return E.SUCCESS;
  }
  file(fd) {
    const entry = this.fds.get(fd);
    if (!entry || entry.stdio) return [E.BADF];
    const node = this.nodes.get(entry.path);
    return node.dir ? [E.ISDIR] : [E.SUCCESS, entry, node];
  }
  readInto(data, offset, iovs, count, readPtr) {
    const view = this.view();
    let total = 0;
    for (let i = 0; i < count; i++) {
      const ptr = view.getUint32(this.checked(iovs + 8 * i, 8), true), len = view.getUint32(iovs + 8 * i + 4, true);
      const chunk = data.subarray(offset + total, offset + total + len);
      this.put(this.checked(ptr, len), chunk);
      total += chunk.length;
      if (chunk.length < len) break;
    }
    view.setUint32(this.checked(readPtr, 4), total, true);
    return total;
  }
  wasi_fd_read(fd, iovs, count, readPtr) {
    if (fd === 0) { this.view().setUint32(this.checked(readPtr, 4), 0, true); return E.SUCCESS; }
    const [errno, entry, node] = this.file(fd);
    if (errno) return errno;
    entry.offset += this.readInto(node.data, entry.offset, iovs, count, readPtr);
    return E.SUCCESS;
  }
  wasi_fd_pread(fd, iovs, count, offset, readPtr) {
    const [errno, , node] = this.file(fd);
    if (errno) return errno;
    this.readInto(node.data, Number(offset), iovs, count, readPtr);
    return E.SUCCESS;
  }
  wasi_fd_seek(fd, offset, whence, out) {
    const [errno, entry, node] = this.file(fd);
    if (errno) return errno;
    const base = whence === 0 ? 0n : whence === 1 ? BigInt(entry.offset) : whence === 2 ? BigInt(node.data.length) : -1n;
    const next = base + BigInt(offset);
    if (base < 0n || next < 0n) return E.INVAL;
    entry.offset = Number(next);
    this.view().setBigUint64(this.checked(out, 8), next, true);
    return E.SUCCESS;
  }
  wasi_fd_tell(fd, out) {
    const [errno, entry] = this.file(fd);
    if (errno) return errno;
    this.view().setBigUint64(this.checked(out, 8), BigInt(entry.offset), true);
    return E.SUCCESS;
  }
  wasi_fd_readdir(fd, buf, bufLen, cookie, usedPtr) {
    const entry = this.fds.get(fd);
    if (!entry || entry.stdio) return E.BADF;
    const node = this.nodes.get(entry.path);
    if (!node.dir) return E.NOTDIR;
    const out = [];
    let size = 0;
    for (let i = Number(cookie); i < node.list.length && size < bufLen; i++) {
      const name = new TextEncoder().encode(node.list[i]);
      const child = this.nodes.get(`${entry.path}/${node.list[i]}`);
      const record = new Uint8Array(24 + name.length);
      const view = new DataView(record.buffer);
      view.setBigUint64(0, BigInt(i + 1), true); view.setBigUint64(8, child.ino, true);
      view.setUint32(16, name.length, true); view.setUint8(20, child.dir ? FILETYPE.DIRECTORY : FILETYPE.REGULAR);
      record.set(name, 24);
      out.push(record); size += record.length;
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const r of out) { all.set(r, at); at += r.length; }
    const used = Math.min(size, bufLen);
    this.put(this.checked(buf, used), all.subarray(0, used));
    this.view().setUint32(this.checked(usedPtr, 4), used, true);
    return E.SUCCESS;
  }
}
