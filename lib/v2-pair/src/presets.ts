/**
 * The two-line preset (integration plan §5.7): the pool of docs/engine-v2/two-line-systems.md §3, every family with
 * each of its tie-breakers. Not the default; offered as "Lines · pairs". The deal refuses any rule whose artefact is not
 * dealable, so the artefacts decide what is live.
 */
import { tieBreakersOn } from "@workspace/v2-core";
import { pairQ, pairType } from "./type.ts";

export interface PairPoolRule { readonly family: string; readonly params: unknown; readonly tieBreakers: readonly string[] }

/** Held back from the deal (two-line-systems.md §6.1): a one-sentence family reaches its hills. */
export const UNDEALT = new Set(["on-the-diagonal"]);

export const pairPresets = [
  {
    id: "lines-pairs", title: "Lines · pairs (two lines per object)", variant: pairQ.id,
    rules: pairType.families.filter(f => !UNDEALT.has(f.id)).flatMap(f => f.dealable(pairQ).map(params => ({ family: f.id, params, tieBreakers: tieBreakersOn(f, pairQ).map(t => t.id) }))) as readonly PairPoolRule[],
  },
] as const;
