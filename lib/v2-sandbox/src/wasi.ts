/**
 * The WASI preview1 import table of the CPython guest (copied from lib/game-runtime/engine/wasi.mjs and cleaned).
 *
 *  - "bootstrap" (trusted startup only): a read-only, in-memory /lib holding the bundled standard library,
 *    argv/environment, stdout/stderr discarded. The clock and entropy are already the virtual ones, so the
 *    initialized snapshot is identical on every host.
 *  - "guest" (everything after bootstrap): only the virtual clock (2026-01-01T00:00:00Z, +1 µs per read), the
 *    act's seeded entropy and, during an act, the host channel on descriptor 3 (spec §6.5) are answered. Every other
 *    import returns ENOTCAPABLE (proc_exit traps), whatever Python API the guest recovered.
 *
 * The channel's framing: the guest writes a 4-byte little-endian length and that many bytes of JSON with
 * fd_write(3); once a whole request has arrived the host answers it, and the guest reads the reply, framed the
 * same way, with fd_read(3).
 */
import { LIMITS } from "./limits.ts";
import { OVERSIZE_REPLY } from "./channel.ts";

export const EPOCH_NS = 1767225600n * 1000000000n;
const MASK64 = (1n << 64n) - 1n;
const E = { SUCCESS: 0, BADF: 8, FAULT: 21, INVAL: 28, ISDIR: 31, NOENT: 44, NOSYS: 52, NOTDIR: 54, ROFS: 69, NOTCAPABLE: 76 };
const FILETYPE = { UNKNOWN: 0, DIRECTORY: 3, REGULAR: 4 };
const ALL_RIGHTS = MASK64 >> 35n;
const PREOPEN = "/lib";
export const CHANNEL_FD = 3;
const utf8 = new TextEncoder();

/** Raised by host imports to abort a guest call (the instance is replaced before reuse). */
export class CapabilityTrap extends Error {}
/** The act ran past its time cap (seen at a clock read). */
export class TimeTrap extends CapabilityTrap {}

/** SplitMix64 as a little-endian byte stream (the act's entropy). */
export class SplitMix64 {
  private state: bigint;
  private buffer = new Uint8Array(0);
  constructor(seed: bigint) { this.state = BigInt.asUintN(64, seed); }
  next(): bigint {
    this.state = (this.state + 0x9E3779B97F4A7C15n) & MASK64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK64;
    return z ^ (z >> 31n);
  }
  take(n: number): Uint8Array {
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

interface Node { dir: boolean; entries?: Set<string>; list?: string[]; data?: Uint8Array; ino?: bigint }
interface Fd { stdio?: boolean; preopen?: boolean; path?: string; offset?: number }

/** A read-only tree built from bundle paths under /lib (directories are implied by file paths). */
function tree(files: Map<string, Uint8Array>): Map<string, Node> {
  const nodes = new Map<string, Node>([[PREOPEN, { dir: true, entries: new Set() }]]);
  for (let [path, data] of files) {
    if (!path.startsWith(PREOPEN + "/")) continue;
    if (path.endsWith("/")) { path = path.slice(0, -1); if (!nodes.has(path)) nodes.set(path, { dir: true, entries: new Set() }); }
    else nodes.set(path, { dir: false, data });
    let child = path;
    for (let parent = path.slice(0, path.lastIndexOf("/")); parent.length >= PREOPEN.length; parent = parent.slice(0, parent.lastIndexOf("/"))) {
      if (!nodes.has(parent)) nodes.set(parent, { dir: true, entries: new Set() });
      nodes.get(parent)!.entries!.add(child.slice(parent.length + 1));
      child = parent;
      if (parent === PREOPEN) break;
    }
  }
  let ino = 1n;
  for (const node of [...nodes.keys()].sort()) nodes.get(node)!.ino = ino++;
  for (const node of nodes.values()) if (node.dir) node.list = [...node.entries!].sort();
  return nodes;
}

type Import = (...args: any[]) => number;

export class Wasi {
  nodes: Map<string, Node>;
  mode: "bootstrap" | "guest" = "bootstrap";
  memory: WebAssembly.Memory | null = null;
  executing = false;
  usedEntropy = false;
  /** The act's host channel (request text → reply text), attached only while an act runs. */
  channel: ((request: string) => string) | null = null;
  /** performance.now() past which a clock read ends the act (a real-time check at deterministic points). */
  deadline: number | null = null;
  private clock = 0n;
  private entropy = new SplitMix64(0n);
  private fds = new Map<number, Fd>([[0, { stdio: true }], [1, { stdio: true }], [2, { stdio: true }], [3, { path: PREOPEN, preopen: true }]]);
  private nextFd = 4;
  private inbox = new Uint8Array(0);
  private outbox = new Uint8Array(0);
  readonly output: string[] = [];

  private readonly options: { files: Map<string, Uint8Array>; args: string[]; env: string[] };
  constructor(options: { files: Map<string, Uint8Array>; args: string[]; env: string[] }) {
    this.options = options;
    this.nodes = tree(options.files);
  }
  /** Restart the per-act deterministic state: the virtual clock, the entropy stream, the channel buffers. */
  resetAct(seed: bigint) {
    this.clock = 0n; this.entropy = new SplitMix64(seed); this.usedEntropy = false;
    this.inbox = new Uint8Array(0); this.outbox = new Uint8Array(0);
  }
  private view() { return new DataView(this.memory!.buffer); }
  private bytes() { return new Uint8Array(this.memory!.buffer); }
  private text(ptr: number, len: number) { return new TextDecoder().decode(this.bytes().subarray(ptr, ptr + len)); }
  private put(ptr: number, data: Uint8Array) {
    const memory = this.bytes();
    if (ptr < 0 || ptr + data.length > memory.length) throw new RangeError("out of bounds");
    memory.set(data, ptr);
  }
  private checked(ptr: number, len: number) {
    ptr >>>= 0;
    if (ptr + len > this.memory!.buffer.byteLength) throw new RangeError("out of bounds");
    return ptr;
  }
  private iovs(iovs: number, count: number): [number, number][] {
    const view = this.view(), out: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const ptr = view.getUint32(this.checked(iovs + 8 * i, 8), true), len = view.getUint32(iovs + 8 * i + 4, true);
      out.push([this.checked(ptr, len), len]);
    }
    return out;
  }

  /** The import object: one dispatcher per import the module declares. */
  imports(module: WebAssembly.Module) {
    const table: Record<string, Import> = {};
    for (const { module: from, name, kind } of WebAssembly.Module.imports(module)) {
      if (from !== "wasi_snapshot_preview1" || kind !== "function") throw new Error("Unexpected module import");
      const own = (this as unknown as Record<string, Import | undefined>)[`wasi_${name}`]?.bind(this);
      table[name] = (...args: any[]) => {
        try {
          if (this.mode !== "bootstrap") return this.guest(name, args);
          if (!own) { if (name === "proc_exit") throw new CapabilityTrap("proc_exit during bootstrap"); return E.NOSYS; }
          return own(...args);
        } catch (error) {
          if (error instanceof RangeError) return E.FAULT;
          throw error;
        }
      };
    }
    return { wasi_snapshot_preview1: table };
  }

  /** After bootstrap: the virtual clock, the act's entropy and the channel; nothing else. */
  private guest(name: string, args: any[]): number {
    if (name === "clock_time_get") {
      if (this.executing && this.deadline !== null && performance.now() > this.deadline) throw new TimeTrap("time");
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
    if (name === "fd_write" && args[0] === CHANNEL_FD && this.channel) return this.channelWrite(args[1], args[2], args[3]);
    if (name === "fd_read" && args[0] === CHANNEL_FD && this.channel) return this.channelRead(args[1], args[2], args[3]);
    if (name === "proc_exit") throw new CapabilityTrap("Guest I/O/process capability denied");
    return E.NOTCAPABLE;
  }

  private channelWrite(iovs: number, count: number, written: number): number {
    let total = 0;
    const parts = [this.inbox];
    for (const [ptr, len] of this.iovs(iovs, count)) { parts.push(this.bytes().slice(ptr, ptr + len)); total += len; }
    const size = parts.reduce((n, p) => n + p.length, 0);
    if (size > 4 + LIMITS.messageBytes + 4) return E.INVAL;   // a frame never exceeds its header and the limit
    this.inbox = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { this.inbox.set(p, at); at += p.length; }
    if (this.inbox.length >= 4) {
      const length = new DataView(this.inbox.buffer).getUint32(0, true);
      if (length > LIMITS.messageBytes) { this.inbox = new Uint8Array(0); this.reply(OVERSIZE_REPLY); }
      else if (this.inbox.length >= 4 + length) {
        const request = new TextDecoder().decode(this.inbox.subarray(4, 4 + length));
        this.inbox = this.inbox.slice(4 + length);
        this.reply(this.channel!(request));
      }
    }
    this.view().setUint32(this.checked(written, 4), total, true);
    return E.SUCCESS;
  }
  private reply(text: string) {
    const body = utf8.encode(text), frame = new Uint8Array(4 + body.length);
    new DataView(frame.buffer).setUint32(0, body.length, true);
    frame.set(body, 4);
    this.outbox = frame;
  }
  private channelRead(iovs: number, count: number, readPtr: number): number {
    let total = 0;
    for (const [ptr, len] of this.iovs(iovs, count)) {
      const chunk = this.outbox.subarray(total, total + len);
      this.put(ptr, chunk);
      total += chunk.length;
      if (chunk.length < len) break;
    }
    this.outbox = this.outbox.slice(total);
    this.view().setUint32(this.checked(readPtr, 4), total, true);
    return E.SUCCESS;
  }

  // --- Bootstrap only: trusted startup reads the bundled standard library.
  private strings(list: string[], ptrs: number, buf: number) {
    const view = this.view();
    let at = buf >>> 0;
    list.forEach((s, i) => {
      const data = utf8.encode(s + "\0");
      view.setUint32(this.checked(ptrs + 4 * i, 4), at, true);
      this.put(at, data); at += data.length;
    });
    return E.SUCCESS;
  }
  private sizes(list: string[], countPtr: number, sizePtr: number) {
    const view = this.view();
    view.setUint32(this.checked(countPtr, 4), list.length, true);
    view.setUint32(this.checked(sizePtr, 4), list.reduce((n, s) => n + utf8.encode(s).length + 1, 0), true);
    return E.SUCCESS;
  }
  wasi_args_get(ptrs: number, buf: number) { return this.strings(this.options.args, ptrs, buf); }
  wasi_args_sizes_get(c: number, s: number) { return this.sizes(this.options.args, c, s); }
  wasi_environ_get(ptrs: number, buf: number) { return this.strings(this.options.env, ptrs, buf); }
  wasi_environ_sizes_get(c: number, s: number) { return this.sizes(this.options.env, c, s); }
  wasi_clock_res_get(_id: number, ptr: number) { this.view().setBigUint64(this.checked(ptr, 8), 1000n, true); return E.SUCCESS; }
  wasi_clock_time_get(_id: number, _precision: bigint, ptr: number) {
    this.clock += 1n;
    this.view().setBigUint64(this.checked(ptr, 8), EPOCH_NS + 1000n * this.clock, true);
    return E.SUCCESS;
  }
  wasi_random_get(ptr: number, len: number) {
    if ((len >>> 0) > 65536) return E.INVAL;
    this.put(this.checked(ptr, len >>> 0), this.entropy.take(len >>> 0)); return E.SUCCESS;
  }
  wasi_sched_yield() { return E.SUCCESS; }
  wasi_fd_write(fd: number, iovs: number, count: number, written: number) {
    if (!this.fds.get(fd)?.stdio || fd === 0) return E.BADF;
    let total = 0;
    for (const [ptr, len] of this.iovs(iovs, count)) { if (this.output.length < 64) this.output.push(this.text(ptr, len)); total += len; }
    this.view().setUint32(this.checked(written, 4), total, true);
    return E.SUCCESS;
  }
  wasi_fd_fdstat_get(fd: number, ptr: number) {
    const entry = this.fds.get(fd);
    if (!entry) return E.BADF;
    const view = this.view(); ptr = this.checked(ptr, 24);
    const type = entry.stdio ? FILETYPE.UNKNOWN : this.nodes.get(entry.path!)!.dir ? FILETYPE.DIRECTORY : FILETYPE.REGULAR;
    view.setUint8(ptr, type); view.setUint16(ptr + 2, 0, true);
    view.setBigUint64(ptr + 8, ALL_RIGHTS, true); view.setBigUint64(ptr + 16, ALL_RIGHTS, true);
    return E.SUCCESS;
  }
  wasi_fd_fdstat_set_flags() { return E.NOTCAPABLE; }
  wasi_fd_prestat_get(fd: number, ptr: number) {
    const entry = this.fds.get(fd);
    if (!entry?.preopen) return E.BADF;
    const view = this.view(); ptr = this.checked(ptr, 8);
    view.setUint8(ptr, 0); view.setUint32(ptr + 4, utf8.encode(entry.path!).length, true);
    return E.SUCCESS;
  }
  wasi_fd_prestat_dir_name(fd: number, ptr: number, len: number) {
    const entry = this.fds.get(fd);
    if (!entry?.preopen) return E.BADF;
    this.put(this.checked(ptr, len), utf8.encode(entry.path!).subarray(0, len));
    return E.SUCCESS;
  }
  private resolve(fd: number, ptr: number, len: number): [number, string?] {
    const base = this.fds.get(fd);
    if (!base || base.stdio || !this.nodes.get(base.path!)?.dir) return [E.BADF];
    const parts = base.path!.split("/");
    for (const part of this.text(ptr, len).split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") { if (parts.length <= 2) return [E.NOTCAPABLE]; parts.pop(); }
      else parts.push(part);
    }
    const path = parts.join("/");
    if (path !== PREOPEN && !path.startsWith(PREOPEN + "/")) return [E.NOTCAPABLE];
    return [E.SUCCESS, path];
  }
  private stat(node: Node, ptr: number) {
    const view = this.view(); ptr = this.checked(ptr, 64);
    this.bytes().fill(0, ptr, ptr + 64);
    view.setBigUint64(ptr + 8, node.ino!, true);
    view.setUint8(ptr + 16, node.dir ? FILETYPE.DIRECTORY : FILETYPE.REGULAR);
    view.setBigUint64(ptr + 24, 1n, true);
    view.setBigUint64(ptr + 32, BigInt(node.dir ? 0 : node.data!.length), true);
    return E.SUCCESS;   // all timestamps 0: deterministic
  }
  wasi_path_filestat_get(fd: number, _flags: number, ptr: number, len: number, out: number) {
    const [errno, path] = this.resolve(fd, ptr, len);
    if (errno) return errno;
    const node = this.nodes.get(path!);
    return node ? this.stat(node, out) : E.NOENT;
  }
  wasi_fd_filestat_get(fd: number, out: number) {
    const entry = this.fds.get(fd);
    if (!entry) return E.BADF;
    if (entry.stdio) { const p = this.checked(out, 64); this.bytes().fill(0, p, p + 64); this.view().setUint8(p + 16, FILETYPE.UNKNOWN); return E.SUCCESS; }
    return this.stat(this.nodes.get(entry.path!)!, out);
  }
  // No write, truncate, create, rename, link or delete operation exists here.
  wasi_path_open(fd: number, _dirflags: number, ptr: number, len: number, oflags: number, _r: bigint, _i: bigint, _f: number, out: number) {
    const [errno, path] = this.resolve(fd, ptr, len);
    if (errno) return errno;
    const node = this.nodes.get(path!);
    if (oflags & (1 | 4 | 8)) return E.ROFS;
    if (!node) return E.NOENT;
    if ((oflags & 2) && !node.dir) return E.NOTDIR;
    const fdNew = this.nextFd++;
    this.fds.set(fdNew, { path, offset: 0 });
    this.view().setUint32(this.checked(out, 4), fdNew, true);
    return E.SUCCESS;
  }
  wasi_fd_close(fd: number) {
    const entry = this.fds.get(fd);
    if (!entry || entry.preopen || entry.stdio) return entry ? E.SUCCESS : E.BADF;
    this.fds.delete(fd);
    return E.SUCCESS;
  }
  private file(fd: number): [number, Fd?, Node?] {
    const entry = this.fds.get(fd);
    if (!entry || entry.stdio) return [E.BADF];
    const node = this.nodes.get(entry.path!)!;
    return node.dir ? [E.ISDIR] : [E.SUCCESS, entry, node];
  }
  private readInto(data: Uint8Array, offset: number, iovs: number, count: number, readPtr: number) {
    let total = 0;
    for (const [ptr, len] of this.iovs(iovs, count)) {
      const chunk = data.subarray(offset + total, offset + total + len);
      this.put(ptr, chunk);
      total += chunk.length;
      if (chunk.length < len) break;
    }
    this.view().setUint32(this.checked(readPtr, 4), total, true);
    return total;
  }
  wasi_fd_read(fd: number, iovs: number, count: number, readPtr: number) {
    if (fd === 0) { this.view().setUint32(this.checked(readPtr, 4), 0, true); return E.SUCCESS; }
    const [errno, entry, node] = this.file(fd);
    if (errno) return errno;
    entry!.offset! += this.readInto(node!.data!, entry!.offset!, iovs, count, readPtr);
    return E.SUCCESS;
  }
  wasi_fd_pread(fd: number, iovs: number, count: number, offset: bigint, readPtr: number) {
    const [errno, , node] = this.file(fd);
    if (errno) return errno;
    this.readInto(node!.data!, Number(offset), iovs, count, readPtr);
    return E.SUCCESS;
  }
  wasi_fd_seek(fd: number, offset: bigint, whence: number, out: number) {
    const [errno, entry, node] = this.file(fd);
    if (errno) return errno;
    const base = whence === 0 ? 0n : whence === 1 ? BigInt(entry!.offset!) : whence === 2 ? BigInt(node!.data!.length) : -1n;
    const next = base + BigInt(offset);
    if (base < 0n || next < 0n) return E.INVAL;
    entry!.offset = Number(next);
    this.view().setBigUint64(this.checked(out, 8), next, true);
    return E.SUCCESS;
  }
  wasi_fd_tell(fd: number, out: number) {
    const [errno, entry] = this.file(fd);
    if (errno) return errno;
    this.view().setBigUint64(this.checked(out, 8), BigInt(entry!.offset!), true);
    return E.SUCCESS;
  }
  wasi_fd_readdir(fd: number, buf: number, bufLen: number, cookie: bigint, usedPtr: number) {
    const entry = this.fds.get(fd);
    if (!entry || entry.stdio) return E.BADF;
    const node = this.nodes.get(entry.path!)!;
    if (!node.dir) return E.NOTDIR;
    const out: Uint8Array[] = [];
    let size = 0;
    for (let i = Number(cookie); i < node.list!.length && size < bufLen; i++) {
      const name = utf8.encode(node.list![i]);
      const child = this.nodes.get(`${entry.path}/${node.list![i]}`)!;
      const record = new Uint8Array(24 + name.length);
      const view = new DataView(record.buffer);
      view.setBigUint64(0, BigInt(i + 1), true); view.setBigUint64(8, child.ino!, true);
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
