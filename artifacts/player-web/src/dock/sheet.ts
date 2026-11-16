/**
 * Whether the phone's assistant sheet rises by itself. Opened now (by the menu, the palette or a model) it rises; open
 * from before (the view is kept for the room) it waits lowered, so a game never starts under it. "From before" includes
 * the stored view arriving after the first render: until it has loaded, nothing is a change (`had` stays null).
 */
export function sheetStep(had: boolean | null, now: { sheet: boolean; loading: boolean }): { rise: boolean; had: boolean | null } {
  if (now.loading) return { rise: false, had };
  return { rise: had !== null && now.sheet && !had, had: now.sheet };
}
