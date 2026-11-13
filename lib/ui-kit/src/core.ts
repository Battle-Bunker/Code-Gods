/**
 * The palette's pure parts (no React, no DOM): types, catalogue commands, search and ranking, confirmation levels,
 * recency, keys, the glossary and the shared help commands. Apps import this entry in code their unit tests load.
 */
export type { Availability, Command, Confirm, HandoffDraft, LiveOptions, PaletteContext, PaletteFormPage, PaletteGroup, PaletteSection, Performer, Phase, PickOption } from "./types.ts";
export { liveOptions } from "./commands.ts";
export { availabilityFor, commandsFromCatalog, searchCommands } from "./commands.ts";
export { SECTION_ORDER, SECTION_TITLES, matchScore, paletteRows, scoreCommand, sectionOf, type PaletteRow, type PaletteSectionRows, type RowsOptions } from "./search.ts";
export { INLINE_TIMEOUT_MS, deriveConfirm, inlineStep, type Armed } from "./confirm.ts";
export { RECENT_MAX, browserStorage, pushRecent, readRecent, recordRecent, type StorageLike } from "./recency.ts";
export { isEditable, paletteKey, shortcutLabel, type KeyEnv, type KeyLike } from "./keys.ts";
export { GLOSSARY, GLOSSARY_IDS, SCORE_LINES, SCORE_WORDS, scoreMovesLine, type GlossaryId } from "./glossary.ts";
export { explainTermCommand, glossaryCommands, shortcutsCommand } from "./help.ts";
