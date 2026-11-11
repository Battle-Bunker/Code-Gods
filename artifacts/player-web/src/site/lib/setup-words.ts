/**
 * The setup combobox's words (docs/ui-redesign.md §2.4), pure so they are tested without a browser: whose a setup is
 * ("System", "You" or the owner's name) and why the viewer may not edit it. The search is the engine's (setups.page).
 */

/** A setup as the combobox's row shows it (setups.row). */
export interface SetupRow { id: string; name: string; summary: string; ownerName: string; system: boolean; mine: boolean; editable: boolean }
/** Whose setup it is, in the viewer's words: "System", "You" or the owner's name. */
export const ownerLabel = (s: Pick<SetupRow, "system" | "mine" | "ownerName">) => (s.system ? "System" : s.mine ? "You" : s.ownerName);
/** Why the viewer may not edit a setup (the Edit button's tooltip), or null when they may. */
export function editBlocker(s: Pick<SetupRow, "system" | "editable" | "ownerName">): string | null {
  if (s.editable) return null;
  return s.system ? "System setups cannot be edited: duplicate it" : `Only ${s.ownerName} can edit this setup`;
}

/** The one-line note under the picker's "Lab" heading. */
export const LAB_NOTE = "Experimental setups. Only administrators see these; players in your room still see the one it runs.";
/**
 * Whether the "Lab" heading goes before entry `i`: the first Lab setup of the list (the engine sends them last, and
 * only to an administrator). Search results come best match first, so a Lab setup can appear anywhere: each then gets
 * the heading when it follows an ordinary one.
 */
export const labStartsAt = (entries: readonly { lab?: boolean }[], i: number) => !!entries[i]?.lab && !entries[i - 1]?.lab;

/** The longest setup name (game-core SETUP_NAME_MAX; repeated so this module stays dependency-free). */
const NAME_MAX = 40;
/**
 * The first name of the form `<stem><tail>`, then `<stem><tail> 2`, ` 3`…, not in `taken` (case-insensitive), the stem
 * shortened to fit 40 characters: the engine's rule for copies (convex/setups.ts freeName), for a copy the page saves.
 */
export function freeName(stem: string, tail: string, taken: readonly string[]): string {
  const used = new Set(taken.map(t => t.toLowerCase()));
  for (let n = 1; ; n++) {
    const suffix = `${tail}${n > 1 ? ` ${n}` : ""}`;
    const candidate = `${stem.slice(0, NAME_MAX - suffix.length).trimEnd()}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
