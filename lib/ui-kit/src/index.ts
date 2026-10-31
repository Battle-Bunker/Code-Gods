/**
 * The shared UI kit (docs/ui-redesign.md §2.5): the command palette's contract and components, the glossary and
 * <Term>. Both apps build their command lists from the function catalogue with commandsFromCatalog plus their own
 * `ui.*` commands of the same shape.
 */
export type { Availability, Command, Confirm, PaletteContext, PaletteFormPage, PaletteGroup, Performer, Phase, PickOption } from "./types.ts";
export { availabilityFor, commandsFromCatalog, searchCommands } from "./commands.ts";
export { GLOSSARY, GLOSSARY_IDS, type GlossaryId } from "./glossary.ts";
export { Term } from "./term.tsx";
export { CommandPalette, PaletteTrigger, type PaletteOpenInit } from "./palette.tsx";
