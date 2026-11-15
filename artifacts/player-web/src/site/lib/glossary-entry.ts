/** Which glossary entry a request names ("Explain a term"): pure, unit-tested. */
import { GLOSSARY, GLOSSARY_IDS, type GlossaryId } from "@workspace/ui-kit/core";

/** The entry a request names: its id, or a term's own name in any case ("points", "Rarity (bits)"); null for the index. */
export function glossaryEntry(request: string): GlossaryId | null {
  const q = request.trim().toLowerCase();
  if (!q) return null;
  return GLOSSARY_IDS.find(id => id === q || GLOSSARY[id].term.toLowerCase() === q) ?? GLOSSARY_IDS.find(id => GLOSSARY[id].term.toLowerCase().startsWith(q)) ?? null;
}
