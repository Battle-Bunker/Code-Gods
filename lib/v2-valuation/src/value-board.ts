/**
 * Value functions for the coloured boards' rules (lib/v2-grid-boards; owner decision 23, value.ts the machinery): a
 * board's bits are the survival of the stationary law at its utilities, sampled by plain draws from π (every cell
 * independently: a symbol by its value's weight, a colour uniformly), as value-grid.ts samples the digit grid's
 * non-exact families. Every weight is 1, so a score's survival interval is binomial.
 *
 * Honesty (coordinator's call 37): these are the old game's bounded families. A score rarer than the draws reach is
 * paid by the marked tail, which may not pay past the family's top; boardTopGap reports how far the top sits beyond the
 * last measured knot, so a rule whose top is unmeasured is visible before it is dealt.
 */
import { canonicalJson, evaluateObject, hashHex, rng, tieBreakerId, type ObjectType, type Rng, type RuleFamily, type Score, type TieBreaker, type Variant } from "@workspace/v2-core";
import { boardParams, canonicalColours, paletteOf, symbolCount, symbolValue, type BoardState } from "@workspace/v2-grid-boards";
import { ruleKey, valuesHash } from "./keys.ts";
import { knotsFrom, sampledOracle, tailOf, VALUE_CONFIG, type ValueConfig, type ValueFunction } from "./value.ts";

/** Plain draws from π per rule: certifies scores down to about log2(draws / minSupport) bits. */
export const BOARD_DRAWS = 2_000_000;

/** A board drawn exactly from π. */
export function drawBoardFromPi(variant: Variant, r: Rng): () => BoardState {
  const { size, symbols, step } = boardParams(variant);
  const S = symbolCount(symbols), pal = paletteOf(variant);
  const w = Array.from({ length: S }, (_, s) => 2 ** (-step * symbolValue(variant, s)));
  const z = w.reduce((t, x) => t + x, 0), p = w.map(x => x / z);
  const sym = () => { let u = r.unit(), s = 0; while (s < S - 1 && u >= p[s]!) { u -= p[s]!; s++; } return s; };
  const cards = symbols === "cards";
  return () => {
    const n2 = size * size;
    const st = { sym: Array.from({ length: n2 }, sym), col: Array.from({ length: n2 }, () => pal[r.below(pal.length)]!) };
    return cards ? { ...st, cards: true as const } : st;
  };
}

export function boardValueFunction<P>(type: ObjectType<BoardState>, family: RuleFamily<BoardState, P>, params: P, variant: Variant,
  options: { tieBreaker?: TieBreaker; seed?: string; config?: Partial<ValueConfig>; draws?: number } = {}): ValueFunction {
  const cfg = { ...VALUE_CONFIG, ...options.config };
  const seed = options.seed ?? "v2";
  const tieBreaker = tieBreakerId(family, options.tieBreaker);
  const tb = tieBreaker === "none" ? null : tieBreaker;
  const n = options.draws ?? BOARD_DRAWS;
  // Colour peers share one value function: the rule with its colours renamed in order is valued (canonicalColours).
  const canon = canonicalColours(params, variant);
  const draw = drawBoardFromPi(variant, rng("board-value", seed, family.id, JSON.stringify(canon), String(tb), variant.id));
  const draws: { u: Score; w: number }[] = [];
  for (let i = 0; i < n; i++) draws.push({ u: evaluateObject(type, family, canon, draw(), variant, tb).score, w: 1 });
  const { knots, candidates } = knotsFrom([sampledOracle("plain draws from π", draws)], cfg);
  const body = {
    schema: 7 as const, kind: "value-function" as const,
    ruleKey: ruleKey(type as ObjectType<unknown>, variant, family.id, params, tieBreaker),
    objectType: type.id, objectTypeVersion: type.version, variant: variant.id, variantHash: valuesHash(variant),
    family: family.id, params, tieBreaker, seed, config: cfg, knots, tail: tailOf(knots),
    diagnostics: { exact: [], sampled: { draws: n, accepted: n, ess: n }, candidates },
  };
  return { ...body, contentHash: hashHex(canonicalJson(body)) };
}
