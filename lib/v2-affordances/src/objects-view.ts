/** The Lines list's orders (v1's, W3-2 #936): your points, your bits, the others' bits, most changed, newest, oldest, recently changed. */
export const OBJECTS_SORTS = ["points", "rarity", "want", "mutations", "born", "oldest", "recent"] as const;
export type ObjectsSort = (typeof OBJECTS_SORTS)[number];
/** Which lines it lists (v1's filters): all, those earning you points, the contested ones, those with chips. */
export const OBJECTS_SHOWS = ["all", "positive", "contested", "chips"] as const;
export type ObjectsShow = (typeof OBJECTS_SHOWS)[number];
