/**
 * Portable randomness for measurement (open-agents.md §3.4–3.5; sandbox.py derive_seed, measure.py
 * SplitMix64): every seed the engine hands an agent, and every shuffle of the bias diagnostic, is
 * reproducible in any language from the season salt.
 */
import { hmacSha256, utf8Bytes } from "../util.ts";
import { pyFloatRepr } from "./codes.ts";

const M64 = (1n << 64n) - 1n;

/** SplitMix64 (Steele, Lea & Flood 2014). next() is the raw 64-bit output, as a bigint. */
export class SplitMix64 {
  private s: bigint;
  constructor(seed: number | bigint) { this.s = BigInt(seed) & M64; }

  next(): bigint {
    this.s = (this.s + 0x9e3779b97f4a7c15n) & M64;
    let z = this.s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M64;
    return z ^ (z >> 31n);
  }

  /** Fisher–Yates from the top: for i = n−1 … 1, j = next() mod (i + 1), swap p[i], p[j]. */
  permutation(n: number): number[] {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Number(this.next() % BigInt(i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
  }
}

export type SeedPart = string | number | bigint;

/** Python str(part): integers in decimal, floats as repr, strings as they are. */
function pyStr(part: SeedPart): string {
  if (typeof part === "string") return part;
  if (typeof part === "bigint") return part.toString();
  return Number.isInteger(part) ? part.toFixed(0) : pyFloatRepr(part);
}

/**
 * A 64-bit seed: the first 8 bytes, big-endian, of HMAC-SHA256(salt, "\x1f".join(str(part))).
 * Measurement uses ("measure", inst.key, grid index, replicate) and play ("play", ...): without the
 * salt the two streams are indistinguishable. In production the salt is a season secret (committed
 * by hash, revealed after the season); never hard-code it.
 */
export function deriveSeed(salt: string | Uint8Array, parts: readonly SeedPart[]): bigint {
  const mac = hmacSha256(typeof salt === "string" ? utf8Bytes(salt) : salt, parts.map(pyStr).join("\x1f"));
  let x = 0n;
  for (let i = 0; i < 8; i++) x = (x << 8n) | BigInt(mac[i]);
  return x;
}
