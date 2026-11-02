/**
 * AI seat names: every AI seat gets an alliterative title that pairs a computing word with a mythic role
 * ("Binary Bard", "Vector Vizier", "Lambda Lorekeeper"). Gods negotiating over code, named like it.
 *
 * - Unique within a room, guaranteed: a candidate is skipped if any member (human or AI) already has it,
 *   ignoring case; once the whole pool is taken, " II", " III", … extend it.
 * - Short (≤ 18 characters), kid-friendly, and shaped like a title, never like a person's full name, so
 *   an AI is never mistaken for a human (humans show their verified Google name).
 * - Deterministic: the same seed and the same taken names always give the same name.
 * - Readable at a glance: initials no other seat uses are preferred.
 *
 * The seat's model stays visible separately (the players list subtitle); the name does not encode it.
 * Pure: no Convex imports, unit-tested in test/unit/ai-names.test.ts.
 */

/** Per initial: computing words × mythic roles. Every pair alliterates. */
const GROUPS: ReadonlyArray<readonly [readonly string[], readonly string[]]> = [
  [["Abacus", "Array", "Atom"], ["Augur", "Archon", "Alchemist"]],
  [["Binary", "Bit", "Byte"], ["Bard", "Beacon", "Builder"]],
  [["Cipher", "Circuit", "Cache"], ["Champion", "Chronicler", "Custodian"]],
  [["Data", "Delta", "Datum"], ["Druid", "Dreamer", "Defender"]],
  [["Echo", "Engine", "Entropy"], ["Envoy", "Elder", "Emissary"]],
  [["Function", "Fractal", "Flux"], ["Forger", "Founder", "Falcon"]],
  [["Glyph", "Graph", "Gate"], ["Guardian", "Guide", "Griffin"]],
  [["Hash", "Heap", "Helix"], ["Herald", "Hermit", "Hero"]],
  [["Index", "Integer", "Input"], ["Inventor", "Imp", "Icon"]],
  [["Kernel", "Key", "Kilobyte"], ["Keeper", "Knight", "Kindler"]],
  [["Lambda", "Loop", "Logic"], ["Lorekeeper", "Lantern", "Luminary"]],
  [["Matrix", "Module", "Macro"], ["Muse", "Mystic", "Mage"]],
  [["Node", "Nibble", "Number"], ["Navigator", "Nomad", "Nightwatch"]],
  [["Opcode", "Orbit", "Output"], ["Oracle", "Overseer", "Owl"]],
  [["Pixel", "Pointer", "Prism", "Parser"], ["Prophet", "Pilgrim", "Paladin"]],
  [["Quantum", "Query", "Qubit"], ["Quester", "Quill", "Quasar"]],
  [["Router", "Register", "Recursion"], ["Ranger", "Riddler", "Regent"]],
  [["Signal", "Stack", "Syntax", "Sigma"], ["Sage", "Seer", "Sentinel", "Sorcerer"]],
  [["Token", "Tensor", "Thread"], ["Titan", "Trickster", "Tinker"]],
  [["Vector", "Variable", "Vertex"], ["Vizier", "Voyager", "Visionary"]],
  [["Widget", "Wire", "Wavelet"], ["Warden", "Wizard", "Weaver"]],
];

export const AI_NAMES: readonly string[] = GROUPS.flatMap(([words, roles]) => words.flatMap(w => roles.map(r => `${w} ${r}`)));

/** FNV-1a: a stable 32-bit hash of the seed. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** mulberry32: a small seeded PRNG. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The pool in the seed's own order (Fisher–Yates). */
function shuffled(seed: string): string[] {
  const out = [...AI_NAMES], next = rng(hash(seed));
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}
const ROMAN = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/**
 * A name for a new AI seat: deterministic from `seed`, distinct (ignoring case) from every name in `taken`
 * (all the room's members), preferring an initial no taken name starts with. `avoid` names are never returned but,
 * unlike `taken`, do not count as initials in use (the seat's template name).
 */
export function aiSeatName(seed: string, taken: Iterable<string>, avoid: Iterable<string> = []): string {
  const names = [...taken];
  const used = new Set([...names, ...avoid].map(n => n.trim().toLowerCase()));
  const initials = new Set(names.map(n => n.trim().charAt(0).toUpperCase()));
  const order = shuffled(seed);
  const free = order.filter(n => !used.has(n.toLowerCase()));
  const pick = free.find(n => !initials.has(n.charAt(0))) ?? free[0];
  if (pick) return pick;
  for (let k = 0; ; k++) {
    const suffix = ROMAN[k] ?? String(k + 2);
    const found = order.find(n => !used.has(`${n} ${suffix}`.toLowerCase()));
    if (found) return `${found} ${suffix}`;
  }
}

type Named = { name?: unknown };
const renameRows = (rows: unknown, idKey: "id" | "deityId", names: ReadonlyMap<string, string>) =>
  Array.isArray(rows) ? rows.map((r: Named & Record<string, unknown>) => {
    const next = typeof r?.[idKey] === "string" ? names.get(r[idKey] as string) : undefined;
    return next ? { ...r, name: next } : r;
  }) : rows;

/** A stored game record (games.summary) with the given gods renamed in its roster, leaderboard and winners. */
export function renameInRecord(record: unknown, names: ReadonlyMap<string, string>): unknown {
  if (!record || typeof record !== "object") return record;
  const r = record as Record<string, unknown>;
  return {
    ...r,
    ...("roster" in r ? { roster: renameRows(r.roster, "id", names) } : {}),
    ...("leaderboard" in r ? { leaderboard: renameRows(r.leaderboard, "deityId", names) } : {}),
    ...("winners" in r ? { winners: renameRows(r.winners, "deityId", names) } : {}),
  };
}
