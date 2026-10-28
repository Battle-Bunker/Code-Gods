export type ObjectType = "Int" | "string" | "Grid";
export type ObjectValue = number | string;
export type Language = "python" | "typescript";
export type Params = Readonly<Record<string, number | string | readonly number[] | readonly (readonly number[])[]>>;

/** Uniform integer in [0, bound). Generation never calls Math.random directly. */
export type Rng = (bound: number) => number;

export interface Domain {
  objectType: ObjectType;
  intMin: number;
  intMax: number;
  stringMaxLength: number;
  /** Grid only (see @workspace/game-core settings). */
  gridSize?: number;
  gridSymbols?: string;
  gridColours?: string;
}

/**
 * A family of utility functions sharing one idea, e.g. "loves a digit".
 * Sampling parameters turns a family into one god's concrete utility function.
 *
 * Utility functions are written for people first: no input validation (the engine
 * only ever passes legal objects), short bodies, and a plain-language summary.
 */
export interface UtilityFamily<P extends Params = Params> {
  readonly id: string;
  /** Display name. Public: the catalog of possible families is common knowledge. */
  readonly name: string;
  readonly objectType: ObjectType;
  /** Public, parameter-free description of what gods of this family care about. */
  readonly theme: string;
  sample(rng: Rng): P;
  /** Private: the incentive this exact utility function creates, in plain language. */
  summary(p: P): string;
  /** Lines of Python that precede `def utility` (helpers/imports), if any. */
  pythonPrelude?(p: P): string;
  /** Body of `def utility(x)`, indented four spaces. */
  python(p: P): string;
  /** Body of `function utility(x)`: plain JavaScript (no type syntax), indented two spaces. */
  typescript(p: P): string;
  /** A legal object with utility ≥ 0.99. Used to prove reachability; never shown to players. */
  exemplar(p: P): ObjectValue;
}

/** Persisted, server-private description of one god's utility function. */
export interface UtilityDescriptor {
  familyId: string;
  params: Params;
}

/** What a god is told about their own utility function. */
export interface UtilityCard {
  familyId: string;
  name: string;
  summary: string;
  source: Readonly<Record<Language, string>>;
}
