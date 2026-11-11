/**
 * When to load a seat's scoring tables again (pure). They are loaded once per game and seat, but the game's hold
 * correction (docs/energy-model.md §8) is computed during planning: tables loaded before it is ready lack it, so a
 * rarity worked out in the client ("How this scores", the local evaluator) came out lower than the engine's number
 * for the same object (the objects list said 56.4 bits where the popover said 50.62). The key changes once, when the
 * correction becomes ready, so the tables are fetched again with it.
 */
export function tablesKey(mine: { gameId: string; godId: string } | null | undefined, holdState: string | undefined): string {
  return mine ? `${mine.gameId}:${mine.godId}${holdState === "ready" ? ":hold" : ""}` : "";
}
