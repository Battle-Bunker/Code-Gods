export type Language = "python" | "typescript";
export type ObjectValue = number | string;

export interface GameSettings {
  language: Language;
  objectType: "Int" | "string";
  intMin: number;
  intMax: number;
  stringMaxLength: number;
  grammarId: string;
  valueGeneratorId: string;
  complexityFunctionId: string;
  spawnFunctionId: "uniform";
  planningSeconds: number;
  halfLifeSeconds: number;
  startingObjectCount: number;
  spawnRateHz: number;
  interactionRateHz: number;
  pauseSeconds: number;
  startingEnergy: number;
  energyPerSecond: number;
}

// These IDs describe the contract, not a claim that runners are installed.
export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({
  language: "python",
  objectType: "Int",
  intMin: -2147483648,
  intMax: 2147483647,
  stringMaxLength: 128,
  grammarId: "python-standard-v1",
  valueGeneratorId: "pantheon-of-friction-v1",
  complexityFunctionId: "ast-bytes-v1",
  spawnFunctionId: "uniform",
  planningSeconds: 60,
  halfLifeSeconds: 300,
  startingObjectCount: 10,
  spawnRateHz: 0.1,
  interactionRateHz: 10,
  pauseSeconds: 180,
  startingEnergy: 100,
  energyPerSecond: 1,
});

/** Validate mathematical settings, independently of deployment resource limits. */
export function validateSettings(settings: GameSettings): void {
  if (!["python", "typescript"].includes(settings.language)) {
    throw new Error("Unsupported language");
  }
  if (!["Int", "string"].includes(settings.objectType)) {
    throw new Error("Unsupported object type");
  }
  if (
    !Number.isSafeInteger(settings.intMin) ||
    !Number.isSafeInteger(settings.intMax) ||
    settings.intMin < -2147483648 ||
    settings.intMax > 2147483647 ||
    settings.intMin > settings.intMax
  ) {
    throw new Error("Integer bounds must lie within the signed 32-bit domain");
  }
  for (const key of ["stringMaxLength", "startingObjectCount"] as const) {
    if (!Number.isSafeInteger(settings[key]) || settings[key] < 0) {
      throw new Error(`${key} must be a nonnegative safe integer`);
    }
  }
  for (const key of [
    "planningSeconds", "halfLifeSeconds", "spawnRateHz",
    "interactionRateHz", "pauseSeconds", "startingEnergy", "energyPerSecond",
  ] as const) {
    if (!Number.isFinite(settings[key]) || settings[key] < 0) {
      throw new Error(`${key} must be finite and nonnegative`);
    }
  }
  if (settings.halfLifeSeconds === 0) throw new Error("Half-life must be positive");
  if (settings.pauseSeconds === 0) throw new Error("Pause duration must be positive");
  if (settings.spawnFunctionId !== "uniform") throw new Error("Unsupported spawn function");
  for (const key of ["grammarId", "valueGeneratorId", "complexityFunctionId"] as const) {
    if (typeof settings[key] !== "string" || !settings[key].trim()) {
      throw new Error(`${key} is required`);
    }
  }
}

/** Reject rather than coerce, truncate, wrap, or clamp invalid runner outputs. */
export function assertObjectValue(
  value: unknown,
  settings: Pick<GameSettings, "objectType" | "intMin" | "intMax" | "stringMaxLength">,
): asserts value is ObjectValue {
  if (settings.objectType === "Int") {
    if (
      typeof value !== "number" || !Number.isSafeInteger(value) ||
      value < settings.intMin || value > settings.intMax
    ) throw new Error("Expected an integer within the room's configured bounds");
  } else if (
    typeof value !== "string" || value.length > settings.stringMaxLength ||
    /[^\x00-\x7f]/u.test(value)
  ) {
    throw new Error("Expected an ASCII string within the room's configured length cap");
  }
}
