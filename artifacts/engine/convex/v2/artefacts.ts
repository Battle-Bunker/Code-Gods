/**
 * The committed valuation artefacts as the server uses them (spec §7.6–§7.7): by rule key, with the run-time lookup of
 * a score's bits. Bundled by scripts/gen-v2-artefacts.mjs; no calibration runs on the server.
 */
import type { Score } from "@workspace/v2-core";
import { bitsFor, type Artefact } from "@workspace/v2-valuation";
import { ARTEFACT_RECORDS } from "./artefacts.gen.ts";

export interface ArtefactRecord {
  ruleKey: string;
  variant: string;
  family: string;
  params: unknown;
  tieBreaker: string;
  status: "converged" | "unconverged" | "unreachable" | "flagged" | "too-coarse" | string;
  primarySense: "min" | "max";
  curve: Artefact["curve"];
  contentHash: string;
  /** Bits are null on a rung an unconverged estimate never measured (never dealt). */
  rungs: { score: (string | null)[] | null; label: string; layer: number; bits: number | null }[];
}

const BY_KEY = new Map(ARTEFACT_RECORDS.map(a => [a.ruleKey, a]));

export function artefactFor(ruleKey: string): ArtefactRecord | null {
  return BY_KEY.get(ruleKey) ?? null;
}
/** Dealable: a converged artefact (spec §7.5–§7.6: unconverged, flagged and too-coarse rules are never dealt). */
export const dealable = (a: ArtefactRecord | null): a is ArtefactRecord => a?.status === "converged";

/** A score's ✨ rarity in bits under a rule's artefact. */
export function rarityOf(a: ArtefactRecord, score: Score): number {
  return bitsFor(a as unknown as Artefact, score);
}
