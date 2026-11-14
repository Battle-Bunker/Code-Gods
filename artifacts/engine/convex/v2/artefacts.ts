/**
 * The committed valuation artefacts as the server uses them (spec §7.6–§7.7): by rule key, with the run-time lookup of
 * a score's bits. Bundled by scripts/gen-v2-artefacts.mjs; no calibration runs on the server.
 */
import type { Score } from "@workspace/v2-core";
import { bitsFor, type Artefact, type Tail } from "@workspace/v2-valuation";
import { ARTEFACT_RECORDS } from "./artefacts.gen.ts";

export interface ArtefactRecord {
  ruleKey: string;
  variant: string;
  family: string;
  params: unknown;
  tieBreaker: string;
  status: "converged" | "unconverged" | "unreachable" | "flagged" | "too-coarse" | string;
  /** The dealt ladder's top rung: lines above it score as it (call (g)). */
  cap: number;
  /** The last measured, converged rung; rungs above it up to the cap take the fitted tail's values (rungBits). */
  convergedCap: number;
  tail: Tail | null;
  dealable: boolean;
  primarySense: "min" | "max";
  curve: Artefact["curve"];
  contentHash: string;
  /** Bits are null on a rung an unconverged estimate never measured (never dealt). */
  /** `main`: on a joint ladder, the main level the rung sits at (levelOf needs it). */
  rungs: { score: (string | null)[] | null; label: string; layer: number; main?: number; bits: number | null }[];
}

const BY_KEY = new Map(ARTEFACT_RECORDS.map(a => [a.ruleKey, a]));

export function artefactFor(ruleKey: string): ArtefactRecord | null {
  return BY_KEY.get(ruleKey) ?? null;
}
/**
 * Dealable: the artefact says so (coordinator's call (g)): not too coarse or unreachable, with at least six rungs
 * converged; its ladder is capped at the last converged rung, and rarityOf scores lines above the cap as the cap.
 */
export const dealable = (a: ArtefactRecord | null): a is ArtefactRecord => a?.dealable === true;

/** A score's ✨ rarity in bits under a rule's artefact. */
export function rarityOf(a: ArtefactRecord, score: Score): number {
  return bitsFor(a as unknown as Artefact, score);
}
