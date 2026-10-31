/**
 * Help commands both apps share: "Explain: ‹term›" rows for the glossary (found by typing "bits" or "what is
 * bits"), "Explain a term…" (a pick of the whole glossary) and "Keyboard shortcuts". Pure data.
 */
import { GLOSSARY, GLOSSARY_IDS, type GlossaryId } from "./glossary.ts";
import type { Command, PaletteFormPage } from "./types.ts";

const always = () => ({ ok: true as const });
const glossPage = (id: GlossaryId): PaletteFormPage => ({ kind: "info", title: GLOSSARY[id].term, lines: [GLOSSARY[id].gloss] });

/** One "Explain: ‹term›" row per glossary term; shown only when typed. */
export function glossaryCommands(): Command[] {
  return GLOSSARY_IDS.map(id => {
    const { term, gloss } = GLOSSARY[id];
    const t = term.toLowerCase();
    return {
      id: `ui.glossary.${id}`, human: { title: `Explain: ${t}`, tooltip: gloss }, group: "help", section: "help",
      keywords: [t, `what is ${t}`, `what are ${t}`, `explain ${t}`, "meaning", "glossary"],
      performer: { kind: "form", page: glossPage(id) }, available: always,
    } satisfies Command;
  });
}

/** "Explain a term…": the whole glossary as a pick list. */
export function explainTermCommand(defaultScore = 1): Command {
  return {
    id: "ui.glossary", human: { title: "Explain a term…", tooltip: "Plain-language meanings of the game's words, from bits to payoff." },
    group: "help", section: "help", keywords: ["glossary", "what is", "meaning", "words", "terms"], defaultScore,
    performer: { kind: "form", page: {
      kind: "pick", title: "Explain a term",
      options: () => GLOSSARY_IDS.map(id => ({ id, label: GLOSSARY[id].term, detail: GLOSSARY[id].gloss })),
      onPick: id => glossPage(id as GlossaryId),
    } },
    available: always,
  };
}

/** "Keyboard shortcuts": the palette's keys plus any the app adds. */
export function shortcutsCommand(extra: readonly string[] = []): Command {
  return {
    id: "ui.help.shortcuts", human: { title: "Keyboard shortcuts", tooltip: "The keys that open the command palette and move through it." },
    group: "help", section: "help", keywords: ["keys", "hotkeys", "keyboard"],
    performer: { kind: "form", page: { kind: "info", title: "Keyboard shortcuts", lines: [
      "Cmd+K or Ctrl+K: open or close the command palette, from anywhere.",
      "/ : open the palette (when you are not typing in a field).",
      "? : open the palette's Help (when you are not typing in a field).",
      "↑ ↓ move, ↵ run, Esc goes back one step, Backspace in an empty search goes back.",
      ...extra,
    ] } },
    available: always,
  };
}
