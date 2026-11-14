/**
 * Deterministic randomness (spec §7.3): 32-bit integer operations only, so every JavaScript engine gives the same
 * sequence. Streams are sfc32, seeded by SplitMix32 from a 64-bit hash of a seed string.
 */
import { hash64 } from "./hash.ts";

export interface Rng {
  /** A uniform 32-bit unsigned integer. */
  uint32(): number;
  /** One fair bit. */
  bit(): 0 | 1;
  /** A uniform integer in [0, k), k ≥ 1 (exact, by rejection). */
  below(k: number): number;
  /** A uniform double in [0, 1), from 32 bits. */
  unit(): number;
  /** True with probability 2^−bits (bits ≥ 0). */
  chance(bits: number): boolean;
}

function splitmix32(state: number): [number, number] {
  state = (state + 0x9e3779b9) | 0;
  let z = state;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return [state, (z ^ (z >>> 16)) >>> 0];
}

class Sfc32 implements Rng {
  private a: number; private b: number; private c: number; private d: number;
  private bits = 0; private nbits = 0;
  constructor(seed: bigint) {
    let s = Number(seed & 0xffffffffn) ^ Number((seed >> 32n) & 0xffffffffn);
    const out: number[] = [];
    for (let i = 0; i < 4; i++) { let v: number; [s, v] = splitmix32(s); out.push(v); }
    [this.a, this.b, this.c, this.d] = out as [number, number, number, number];
    for (let i = 0; i < 12; i++) this.uint32();
  }
  uint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }
  bit(): 0 | 1 {
    if (this.nbits === 0) { this.bits = this.uint32(); this.nbits = 32; }
    const b = (this.bits & 1) as 0 | 1;
    this.bits >>>= 1; this.nbits--;
    return b;
  }
  below(k: number): number {
    if (!Number.isInteger(k) || k < 1 || k > 0x100000000) throw new RangeError(`below(${k})`);
    if (k === 1) return 0;
    const limit = 0x100000000 - (0x100000000 % k);
    for (;;) { const x = this.uint32(); if (x < limit) return x % k; }
  }
  unit(): number {
    return this.uint32() / 0x100000000;
  }
  chance(bits: number): boolean {
    if (bits <= 0) return true;
    if (Number.isInteger(bits)) {
      for (let i = 0; i < bits; i++) if (this.bit() === 1) return false;
      return true;
    }
    return this.unit() < 2 ** -bits;
  }
}

/** A stream named by any number of parts: rng("v2", ruleKey, replicate, rung). */
export function rng(...parts: readonly (string | number | bigint)[]): Rng {
  return new Sfc32(hash64(parts.map(String).join("\u0000")));
}
