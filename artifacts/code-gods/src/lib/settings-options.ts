/** The settings fields whose choices depend on the language and object type (grammar, selector, complexity). */
export const OPTION_KEYS = ["grammarId", "utilitySelectorId", "complexityFunctionId"] as const;
export type OptionKey = typeof OPTION_KEYS[number];
export type OptionCatalog = Record<OptionKey, readonly { id: string; languages: readonly string[]; objectTypes: readonly string[] }[]>;

/**
 * The draft with every option field moved to a choice that `language` and `objectType` offer (the first
 * one) when its current value (the draft's, else the saved settings') is not offered. Before the catalogue
 * has loaded nothing changes, so a language switch made early is repaired when it arrives, never blanked.
 */
export function fixOptionChoices(draft: Record<string, string>, saved: Record<string, unknown>, options: OptionCatalog | undefined,
  language: string, objectType: string): Record<string, string> {
  if (!options) return draft;
  const next = { ...draft };
  for (const key of OPTION_KEYS) {
    const choices = options[key].filter(o => o.languages.includes(language) && o.objectTypes.includes(objectType));
    if (!choices.some(o => o.id === (next[key] ?? String(saved[key] ?? "")))) next[key] = choices[0]?.id ?? "";
  }
  return next;
}
