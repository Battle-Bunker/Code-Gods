/**
 * "Summon my first agent" from anywhere on the game screen (the planning line, Where am I, My agents) summons in one
 * press (ux-lessons 1.3), through the forge's own summon so its message, price and state stay in one place: the button
 * asks for it here, opens the forge, and the forge performs it once.
 */
const pending = new Set<string>();
const listeners = new Set<() => void>();

export function requestFirstSummon(gameId: string) {
  pending.add(gameId);
  for (const l of listeners) l();
}
/** The forge takes a pending request for its game (once). */
export function takeFirstSummon(gameId: string): boolean {
  return pending.delete(gameId);
}
export function onFirstSummon(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/**
 * The button's press: open the forge, then ask it to summon. Opening first matters: opening can store the screen's
 * arrangement and remount the forge, and a summon taken by the forge being replaced would lose its message.
 */
export async function summonFirst(gameId: string, openPane: (pane: string) => Promise<boolean>) {
  if (!await openPane("forge")) return;
  requestAnimationFrame(() => requestFirstSummon(gameId));
}
