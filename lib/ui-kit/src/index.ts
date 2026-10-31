/**
 * The shared UI kit (docs/ui-redesign.md §2.5): the command palette's contract and components, the glossary and
 * <Term>. Both apps build their command lists from the function catalogue with commandsFromCatalog plus their own
 * `ui.*` commands of the same shape. `@workspace/ui-kit/core` is the same minus the React components.
 */
export * from "./core.ts";
export { Term } from "./term.tsx";
export { CommandPalette, PaletteTrigger, usePaletteHotkeys, type CommandPaletteProps, type PaletteOpenInit } from "./palette.tsx";
