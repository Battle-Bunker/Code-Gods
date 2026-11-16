/** A game's read price (paid looks): its weight and whether reads are paid. Its own module so a query that only needs
 *  these does not load the world or the value curves (test/unit/v2-values-load.test.ts). */
/** The weight on the read price of a look (decision 35); absent (games stored before it): 0, free. */
export const readPriceWeightOf = (game: { settings: { readPriceWeight?: number } }) => Math.max(0, game.settings.readPriceWeight ?? 0);
/** Whether the game pays to read: its weight is above 0. Fixed for the game's lifetime. */
export const paysToRead = (game: { settings: { readPriceWeight?: number } }) => readPriceWeightOf(game) > 0;
/** Whether a seated player's reads go through their knowledge (a game that pays to read, not yet ended). */
export const paidLive = (game: { phase: string; settings: { readPriceWeight?: number } }) => paysToRead(game) && game.phase !== "ended";
