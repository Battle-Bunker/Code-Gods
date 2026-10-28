/** What room settings pickers need to offer Grid: shipped GridTypes, components and capability badges. */
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS, type GridTypeArgs } from "@workspace/game-core";
import { SHIPPED_GRID_TYPES, gridData } from "./data.ts";
import { gridEnv } from "./env.ts";

/** Capability classes as kid-facing badges (architecture §2.2). Finite has no badge. */
export const GRID_BADGES: readonly { id: string; emoji: string; label: string; kid: string }[] = [
  { id: "Valued", emoji: "➕", label: "Points", kid: "Symbols are worth points" },
  { id: "Ranked", emoji: "🪜", label: "Counting order", kid: "Symbols come in order, like counting" },
  { id: "Numeral", emoji: "🔟", label: "Place value", kid: "Read a row as one big number" },
  { id: "Suited", emoji: "♠️", label: "Suits", kid: "Symbols belong to teams: spades, hearts, diamonds, clubs" },
  { id: "Faced", emoji: "👑", label: "Picture cards", kid: "Jacks, queens and kings" },
  { id: "Spectral", emoji: "🌈", label: "Colour order", kid: "Colours come in rainbow order" },
  { id: "Wheel", emoji: "🎡", label: "Colour wheel", kid: "The rainbow wraps round: violet is next to red" },
  { id: "Mixable", emoji: "🎨", label: "Paint mixing", kid: "Some colours mix into others, like yellow and blue make green" },
];

export function gridTypeLabel(t: GridTypeArgs): string {
  return `${t.size}×${t.size} · ${SYMBOL_COMPONENTS[t.symbols].label} · ${COLOUR_COMPONENTS[t.colours].label}`;
}

export function gridBadges(t: GridTypeArgs) {
  const caps = gridEnv(t).caps;
  return GRID_BADGES.filter(b => caps.has(b.id));
}

export const MAX_CALLS_PER_ACT = 8;

export function gridManifest() {
  return {
    types: SHIPPED_GRID_TYPES.map(t => ({
      key: t.key, size: t.size, symbols: t.symbols, colours: t.colours, label: gridTypeLabel(t),
      badges: gridBadges(t), familyCount: gridData(t).families.length,
    })),
    symbols: Object.values(SYMBOL_COMPONENTS).map(c => ({
      id: c.id, label: c.label, emoji: c.emoji, kid: c.kid, glyphs: [...c.glyphs], names: [...c.names],
    })),
    colours: Object.values(COLOUR_COMPONENTS).map(c => ({
      id: c.id, label: c.label, emoji: c.emoji, kid: c.kid, glyphs: [...c.letters], names: [...c.names], css: [...c.css],
    })),
    maxCallsPerAct: MAX_CALLS_PER_ACT,
  };
}
