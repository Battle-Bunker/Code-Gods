/**
 * Far moves are dear (owner design, 2026-11-14): "It's really expensive to move objects a long way in a single turn, by
 * design, so all strategies should be incremental hill climbing." For sampled start states and multi-unit calls of
 * every sized mutator on every line variant, the single act is compared with the path of unit acts of the same mutator
 * to the same end state, each unit act its own act:
 *
 *   - the fees (which + where + arguments) of the single call are at least the path's: exactly equal for whole amounts,
 *     displacements and factors, at least for fractions (a fraction pays for its denominator once, the path's remainder
 *     step too);
 *   - the charge W + β·W² of the single act is at least the path's Σ (W_i + β·W_i²), wherever the path climbs no
 *     barrier: no unit step pays a surcharge the single call does not (Σ max(0, Δφ_i) ≤ max(0, Δφ)). A path through a
 *     barrier (a prime coefficient in the middle: φ is the factorisation code, owner decision 17) pays for climbing it,
 *     and a jump over it does not; no price that depends on the arguments alone can charge for it, so those samples
 *     are counted and reported, and only their share of cheaper jumps is bounded.
 *
 * A sample whose unit path leaves the board (a step that is refused) is skipped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, isInvalid, Qn, q, rng, type Q, type Rng, type Variant } from "@workspace/v2-core";
import { changeCharge } from "@workspace/v2-economy";
import { fromMC, lineType, lineQ, lineZ, lineZ4, type LineState } from "../src/index.ts";

type Args = Record<string, string>;
interface Plan { readonly mutator: string; readonly single: Args; readonly path: readonly Args[] }

const W = Qn.toWire;
/** p/q split into unit steps of ±1 and one remainder step (p mod q)/q of the same sign. */
function units(x: Q): Q[] {
  const neg = x.n < 0n, p = neg ? -x.n : x.n, whole = p / x.d, rest = p % x.d;
  const out: Q[] = Array.from({ length: Number(whole) }, () => q(neg ? -1n : 1n));
  if (rest !== 0n) out.push(q(neg ? -rest : rest, x.d));
  return out;
}
/** The prime factors of n ≥ 1, with multiplicity. */
function primes(n: bigint): bigint[] {
  const out: bigint[] = [];
  for (let d = 2n; d * d <= n; d++) while (n % d === 0n) { out.push(d); n /= d; }
  if (n > 1n) out.push(n);
  return out;
}

function sampleQ(r: Rng, rational: boolean, min: number): Q {
  for (;;) {
    const d = rational ? BigInt(1 + r.below(3)) : 1n;
    const p = BigInt(1 + r.below(12)) * (r.bit() ? -1n : 1n);
    const x = q(p, d);
    if (Math.abs(Number(x.n) / Number(x.d)) >= min) return x;
  }
}

/** A multi-unit call of `mutator` and its path of unit calls. */
function plan(mutator: string, r: Rng, rational: boolean): Plan {
  const k = sampleQ(r, rational, 2);
  switch (mutator) {
    case "si.shift": case "si.tilt": case "seq.step":
      return { mutator, single: { k: W(k) }, path: units(k).map(u => ({ k: W(u) })) };
    case "cart.pivot": {
      const x0 = W(q(r.below(7) - 3));
      return { mutator, single: { x0, k: W(k) }, path: units(k).map(u => ({ x0, k: W(u) })) };
    }
    case "cart.slide": {
      const u = r.bit() ? q(0) : sampleQ(r, rational, 1), v = r.bit() && u.n !== 0n ? q(0) : sampleQ(r, rational, 1);
      return { mutator, single: { u: W(u), v: W(v) }, path: [...(u.n ? units(u) : []).map(x => ({ u: W(x), v: "0" })), ...(v.n ? units(v) : []).map(y => ({ u: "0", v: W(y) }))] };
    }
    case "gen.nudge": {
      const which = ["a", "b", "c"][r.below(3)]!, n = sampleQ(r, false, 2);
      return { mutator, single: { which, k: W(n) }, path: units(n).map(u => ({ which, k: W(u) })) };
    }
    case "int.move": {
      const axis = r.bit() ? "x" : "y";
      return { mutator, single: { axis, k: W(k) }, path: units(k).map(u => ({ axis, k: W(u) })) };
    }
    case "mach.stretch": {
      // Two to four prime factors, some of them on the denominator, and a sign: each prime is a unit stretch.
      for (;;) {
        const ps = Array.from({ length: 2 + r.below(3) }, () => [2n, 3n, 5n, 7n][r.below(4)]!);
        const den = ps.filter(() => r.below(3) === 0), num = ps.filter(p => !den.includes(p));
        if (num.length + den.length < 2) continue;
        const neg = r.bit() === 1;
        const f = q((neg ? -1n : 1n) * num.reduce((a, b) => a * b, 1n), den.reduce((a, b) => a * b, 1n));
        const steps = [...primes(f.n < 0n ? -f.n : f.n).map(p => q(p)), ...primes(f.d).map(p => q(1n, p))];
        if (neg) steps[0] = Qn.neg(steps[0]!);
        return { mutator, single: { f: W(f) }, path: steps.map(x => ({ f: W(x) })) };
      }
    }
    default: throw new Error(mutator);
  }
}

function startState(v: Variant, r: Rng): LineState {
  const rational = (v.params as { domain?: string }).domain === "Q";
  const num = () => (rational ? q(r.below(25) - 12, 1 + r.below(3)) : q(r.below(41) - 20));
  const per = (v.params as { linesPerObject?: number }).linesPerObject ?? 1;
  return { lines: Array.from({ length: per }, () => fromMC(num(), num())) };
}

const SIZED = ["si.shift", "si.tilt", "seq.step", "cart.pivot", "cart.slide", "gen.nudge", "int.move", "mach.stretch"];

for (const v of [lineZ, lineQ, lineZ4]) {
  test(`${v.id}: a far move costs at least the path of unit moves to the same line`, () => {
    const r = rng("far-moves", v.id);
    const rational = (v.params as { domain?: string }).domain === "Q";
    const report: Record<string, { samples: number; skipped: number; barrier: number; barrierCheaper: number }> = {};
    for (const mutator of SIZED) {
      const rep = report[mutator] = { samples: 0, skipped: 0, barrier: 0, barrierCheaper: 0 };
      let tries = 0;
      while (rep.samples < 150 && tries++ < 5000) {
        const s0 = startState(v, r), site = r.below(s0.lines.length), p = plan(mutator, r, rational);
        const one = applyCall(lineType, v, s0, { mutator, site, args: p.single });
        if (isInvalid(one)) continue;
        rep.samples++;
        let s = s0, fees = 0, surcharges = 0, charge = 0, ok = true;
        for (const args of p.path) {
          const a = applyCall(lineType, v, s, { mutator, site, args });
          if (isInvalid(a)) { ok = false; break; }
          fees += a.price.total - a.price.surcharge;
          surcharges += a.price.surcharge;
          charge += changeCharge([a.price.total]);
          s = a.result;
        }
        if (!ok) { rep.skipped++; continue; }
        assert.equal(lineType.encode(s), lineType.encode(one.result), `${mutator} ${JSON.stringify(p)}: the path ends elsewhere`);
        const fee = one.price.total - one.price.surcharge;
        assert.ok(fee >= fees - 1e-9, `${mutator} ${JSON.stringify(p.single)} on ${lineType.encode(s0)}: fee ${fee} < path fees ${fees}`);
        if (surcharges > one.price.surcharge + 1e-9) {
          rep.barrier++;
          if (changeCharge([one.price.total]) < charge) rep.barrierCheaper++;
          continue;
        }
        assert.ok(changeCharge([one.price.total]) >= charge - 1e-9,
          `${mutator} ${JSON.stringify(p.single)} on ${lineType.encode(s0)}: charge ${changeCharge([one.price.total])} < path ${charge}`);
      }
      assert.ok(rep.samples - rep.skipped >= 30, `${mutator}: only ${rep.samples - rep.skipped} samples checked`);
    }
    const total = Object.values(report).reduce((t, x) => ({ samples: t.samples + x.samples, skipped: t.skipped + x.skipped, barrier: t.barrier + x.barrier, barrierCheaper: t.barrierCheaper + x.barrierCheaper }), { samples: 0, skipped: 0, barrier: 0, barrierCheaper: 0 });
    console.log(`${v.id}: ${JSON.stringify(report)}`);
    const checked = total.samples - total.skipped;
    console.log(`${v.id}: ${total.samples} samples, ${(100 * total.skipped / total.samples).toFixed(1)}% skipped (a unit step left the board); ` +
      `of ${checked} checked, ${(100 * total.barrier / checked).toFixed(1)}% climb a barrier on the way, and the single act's charge is at least ` +
      `the path's in ${(100 * (1 - total.barrierCheaper / checked)).toFixed(1)}% (every exception a barrier jumped)`);
    // Jumping a barrier is the exception, not the rule: in most samples even a barrier costs the path less than one jump.
    assert.ok(total.barrierCheaper / checked < 0.08, `${total.barrierCheaper} of ${checked} samples are cheaper as one jump`);
  });
}
