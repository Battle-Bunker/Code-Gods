/**
 * The JSX-free part of @workspace/ui-kit, for node tests: its package entry also exports the palette components
 * (.tsx), which node's type stripping cannot load. test/support/ui-kit-hook.mjs points the bare specifier here.
 */
export { availabilityFor, commandsFromCatalog, searchCommands } from "../../../../lib/ui-kit/src/commands.ts";
export { GLOSSARY, GLOSSARY_IDS } from "../../../../lib/ui-kit/src/glossary.ts";
