/**
 * The setup combobox's words (docs/ui-redesign.md §2.4), pure so they are tested without a browser: whose a setup is
 * ("System", "You" or the owner's name), why the viewer may not edit it, and the search over name, owner and summary.
 */

/** A setup as the combobox sees it (setups.list). */
export interface SetupRow { id: string; name: string; summary: string; ownerName: string; system: boolean; mine: boolean; editable: boolean }
/** Whose setup it is, in the viewer's words: "System", "You" or the owner's name. */
export const ownerLabel = (s: Pick<SetupRow, "system" | "mine" | "ownerName">) => (s.system ? "System" : s.mine ? "You" : s.ownerName);
/** Why the viewer may not edit a setup (the Edit button's tooltip), or null when they may. */
export function editBlocker(s: Pick<SetupRow, "system" | "editable" | "ownerName">): string | null {
  if (s.editable) return null;
  return s.system ? "System setups cannot be edited: duplicate it" : `Only ${s.ownerName} can edit this setup`;
}
/** The setups matching a search: every word of the query appears in the name, the owner or the summary. */
export function searchSetups<S extends Pick<SetupRow, "name" | "summary" | "ownerName" | "system" | "mine">>(setups: readonly S[], query: string): S[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...setups];
  return setups.filter(s => {
    const text = `${s.name} ${ownerLabel(s)} ${s.ownerName} ${s.summary}`.toLowerCase();
    return words.every(w => text.includes(w));
  });
}
