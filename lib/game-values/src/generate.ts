import { GENERATOR_ID, evaluatePreference, random } from "./model.ts";
import type { Options, Domain, Preference, Deity, Manifest } from "./model.ts";
import { exportSource } from "./source.ts";
import { screen } from "./screen.ts";
import type { ScreeningReport } from "./screen.ts";

export interface Pantheon {
  readonly manifest: Manifest;
  readonly gods: readonly Deity[];
  /** Trusted/server-only: contains all gods' values and parameters. */
  readonly screening: ScreeningReport;
}
export class GenerationError extends Error {
  readonly report?: ScreeningReport;
  constructor(message: string, report?: ScreeningReport) {
    super(message);
    this.name = "GenerationError";
    this.report = report;
  }
}

export function generate(options: Options): Pantheon {
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) {
    throw new GenerationError("seed must be an unsigned 32-bit integer");
  }
  const count = options.deityCount ?? 3;
  if (!Number.isInteger(count) || count < 3 || count > 8) {
    throw new GenerationError("This generator supports 3–8 deities");
  }
  const below = random(options.seed);
  let domain: Domain;
  let preferences: Preference[];
  if (options.objectType === "Int") {
    const min = options.intMin ?? -2147483648;
    const max = options.intMax ?? 2147483647;
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) ||
        min < -2147483648 || max > 2147483647 || min > max) {
      throw new GenerationError("Invalid signed-32-bit integer bounds");
    }
    // A complete cycle is required so all structural regions remain reachable.
    const period = 16 + 4 * below(4);
    if (max - min + 1 < period) throw new GenerationError(`Domain needs at least ${period} consecutive integers for this seed`);
    domain = Object.freeze({ objectType: "Int", intMin: min, intMax: max });
    const shift = below(period);
    preferences = [4, 8, 6, 5, 7, 3, 9, 10].slice(0, count).map(center =>
      Object.freeze({ kind: "cyclic-well" as const, period, center: (center + shift) % period, width: 2 }));
  } else if (options.objectType === "string") {
    const cap = options.stringMaxLength ?? 128;
    if (!Number.isSafeInteger(cap) || cap < 4 || cap > 4096) {
      throw new GenerationError("This generator requires an ASCII length cap between 4 and 4096");
    }
    domain = Object.freeze({ objectType: "string", stringMaxLength: cap });
    const a = below(26);
    const b = (a + 1 + below(25)) % 26;
    const alphabet = [String.fromCharCode(97 + a), String.fromCharCode(97 + b)];
    preferences = ["0000", "1111", "0011", "0001", "0111", "0101", "0110", "1001"].slice(0, count)
      .map(pattern => Object.freeze({
        kind: "edit-well" as const,
        prototype: [...pattern].map(bit => alphabet[Number(bit)]).join(""),
        width: 2,
      }));
  } else {
    throw new GenerationError("Unsupported object type");
  }
  const manifest: Manifest = Object.freeze({
    generatorId: GENERATOR_ID, seed: options.seed, domain, preferences: Object.freeze(preferences),
  });
  const gods: readonly Deity[] = Object.freeze(preferences.map((p, i) => Object.freeze({
    id: `god-${i + 1}`,
    preference: p,
    evaluate: (x: number | string) => evaluatePreference(x, domain, p),
    source: Object.freeze({ python: exportSource(domain, p, "python"), typescript: exportSource(domain, p, "typescript") }),
  })));
  const screening = screen(manifest, gods);
  if (!screening.accepted) throw new GenerationError(`Political screening failed: ${screening.rejections.join("; ")}`, screening);
  return Object.freeze({ manifest, gods, screening });
}
