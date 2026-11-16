/**
 * Powers that every JavaScript runtime computes to the same bits (spec §7.3). `a ** b` and Math.pow are not: V8 hands
 * them to the platform's libm, so Node and the Convex runtime differ in the last bit for fractional exponents (found
 * 16 Nov: 2 ** 1.5). One such bit made a read length 9 on the engine and 8.999999999999998 in Node, `chance` took its
 * whole-number branch on one side only, and the two birth walks parted for the rest of the game.
 *
 * Here: a whole exponent is repeated multiplication (exact for powers of two), a half is Math.sqrt (correctly rounded
 * by IEEE 754), and anything else is exp(b · ln a), which V8 computes with its own fdlibm port on every platform.
 * Nothing in the v2 packages uses `**` or Math.pow on numbers (lib/v2-core/test/pow-boundary.test.ts).
 */
function byMultiplying(a: number, n: number): number {
  let r = 1;
  for (let b = a, k = n; k > 0; k = Math.floor(k / 2), b *= b) if (k % 2 === 1) r *= b;
  return r;
}

export function pow(a: number, b: number): number {
  if (Number.isInteger(b) && Math.abs(b) <= 4096) {
    if (b >= 0) return byMultiplying(a, b);
    return a === 2 ? byMultiplying(0.5, -b) : 1 / byMultiplying(a, -b);
  }
  if (b === 0.5) return Math.sqrt(a);
  if (b === -0.5) return 1 / Math.sqrt(a);
  return Math.exp(b * (a === 2 ? Math.LN2 : Math.log(a)));
}

/** 2^b. */
export const pow2 = (b: number): number => pow(2, b);

/** A digest of `pow` over a fixed spread of inputs: equal on two runtimes exactly when they agree to the bit on all of them. */
export function powDigest(): string {
  const bytes = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  const mix = (x: number) => { bytes.setFloat64(0, x); for (let i = 0; i < 8; i++) h = Math.imul(h ^ bytes.getUint8(i), 0x01000193); };
  for (let i = 1; i <= 4000; i++) {
    const b = (i * 0.0173) % 40 - 20;
    mix(pow(2, b)); mix(pow(2, -i * 0.25)); mix(pow(1 + i / 7, b / 5)); mix(pow(i, -1.37)); mix(pow(i / 3, 0.5)); mix(pow(1 + 1 / i, i % 9));
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
