/**
 * Confirmation levels (docs/research/ui-redesign/palette-and-pages.md §2.6): confirm only what is costly or
 * irreversible, and name the consequence.
 * - none: reads, navigation, reversible toggles;
 * - inline: destructive but scoped to the user and cheap ("Press ↵ again", 5 s);
 * - summary: spends resources or starts something for everyone (a card, Enter confirms);
 * - modal: irreversible and affects everyone (an alert dialog, focus on Cancel).
 */
import type { Confirm } from "./types.ts";

export const INLINE_TIMEOUT_MS = 5000;

export function deriveConfirm(f: { explicit?: Confirm; destructive?: boolean; spends?: boolean; everyone?: boolean; irreversible?: boolean }): Confirm {
  if (f.explicit) return f.explicit;
  if (f.irreversible && f.everyone) return "modal";
  if (f.spends || f.everyone) return "summary";
  if (f.destructive) return "inline";
  return "none";
}

export type Armed = { id: string; at: number } | null;

/** One Enter on an inline-confirmed row: the first arms it, a second within the timeout runs it. */
export function inlineStep(armed: Armed, id: string, now: number): { armed: Armed; run: boolean } {
  if (armed && armed.id === id && now - armed.at <= INLINE_TIMEOUT_MS) return { armed: null, run: true };
  return { armed: { id, at: now }, run: false };
}
