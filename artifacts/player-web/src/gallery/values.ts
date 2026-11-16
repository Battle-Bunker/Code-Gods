/**
 * The galleries' value lookup: rules are scored by energy (owner decision 50), so no score has a worth from a table and
 * this is always undefined; the galleries pick examples by score instead.
 */
import type { Score } from "@workspace/v2-core";

export function valueFor(_variant: string, _family: string, _params: unknown, _tieBreaker: string | null | undefined): ((u: Score) => number) | undefined {
  return undefined;
}

export { pickExamples } from "./pick-examples";
