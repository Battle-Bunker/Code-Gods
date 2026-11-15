/**
 * The act charge (spec §6.1; docs/energy-model.md §2):
 *
 *   charge = R/κ + (committed ? W + β·W² : 0)
 *
 * R is the bits the act read (the offer's bits plus its queries'), W the sum of its calls' prices. κ and β are economy
 * constants, not room settings: reads are κ times cheaper than changes, and a radical act costs superlinearly.
 */

/** Reads are this many times cheaper than changes (docs/energy-model.md §2.1). */
export const KAPPA = 32;
/** The superlinear surcharge on a change of W bits: β·W² (docs/energy-model.md §4.3). */
export const BETA = 0.05;
/** Energy bits charged per bit read: 1/κ. */
export const READ_PRICE = 1 / KAPPA;

function bits(value: number, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Invalid ${what}`);
  return value;
}

/** What a committed change costs: W + β·W², W the sum of the calls' prices. */
export function changeCharge(callBits: readonly number[]): number {
  const w = callBits.reduce((sum, b) => sum + bits(b, "call price"), 0);
  return w + BETA * w * w;
}

/** What reading `readBits` bits costs: R/κ. */
export const readCharge = (readBits: number): number => bits(readBits, "read bits") * READ_PRICE;

export interface ActChargeInput {
  /** R: the bits the act read, the offer's included. */
  readonly readBits: number;
  /** Each call's price, in the order applied. */
  readonly callBits: readonly number[];
  /** Whether the change committed (the state changed). A skip, a failure or no change pays only for its reads. */
  readonly committed: boolean;
}

/** One act's charge, in energy bits. */
export function actCharge({ readBits, callBits, committed }: ActChargeInput): number {
  const read = readCharge(readBits);
  return committed ? read + changeCharge(callBits) : read;
}

/**
 * The power v1 calibrated summon prices at (its Grid default), energy per world second. A summon or an edit is priced
 * at its bits times power ÷ this (the coordinator's call on decision 21), so a typical starter costs the same seconds of
 * full power whatever a preset's power is.
 */
export const SUMMON_CALIBRATION_POWER = 64;
/** The factor on summon and edit prices at this power. */
export const summonPriceScale = (powerPerSecond: number): number => bits(powerPerSecond, "power") / SUMMON_CALIBRATION_POWER;

/**
 * The god's looks (owner decision 35: "querying 5 objects every second would be easily affordable but doing so 100
 * times a second would be prohibitive"): the weight on the read price at which LOOKS_PER_SECOND looks of a typical
 * object (`medianLookBits`, its full read) take LOOK_POWER_SHARE of a player's power. 100 a second then take twice it.
 */
export const LOOKS_PER_SECOND = 5;
export const LOOK_POWER_SHARE = 0.1;
export function readPriceWeightFor(powerPerSecond: number, medianLookBits: number): number {
  return (LOOK_POWER_SHARE * bits(powerPerSecond, "power")) / LOOKS_PER_SECOND / (bits(medianLookBits, "look bits") * READ_PRICE);
}
