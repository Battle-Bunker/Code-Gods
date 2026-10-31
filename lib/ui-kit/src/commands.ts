/**
 * Commands from the function catalogue: every entry with a palette spec for the surface becomes one Command, bound
 * to a performer by the app (`bind` returns null to leave an entry out, e.g. a function the app has no UI for yet).
 * Availability follows the entry's audience: owner entries need the owner, admin entries an admin, player entries a
 * member (or a credential that may act), infrastructure entries a signed-in human. The confirmation level is the
 * palette spec's; test/search.test.ts checks that every entry reached by a destructive tool states one, so a new
 * destructive tool cannot land unconfirmed (checked there rather than here, to keep the tool schemas out of the
 * engine UI's bundle).
 */
import { CATALOG, type CatalogEntry, type PaletteSurface, type PublicFunctionPath } from "@workspace/player-client/catalog";
import { deriveConfirm } from "./confirm.ts";
import { paletteRows } from "./search.ts";
import type { Availability, Command, PaletteContext, Performer } from "./types.ts";

const RANK = { visitor: 0, "signed-in": 1, member: 2, seated: 3, owner: 4 } as const;

/** The default availability of a catalogue command in a context (an app may wrap it with state checks). */
export function availabilityFor(entry: CatalogEntry, ctx: PaletteContext): Availability {
  switch (entry.audience) {
    case "admin": return ctx.admin ? { ok: true } : { ok: false, reason: "Only admins can do this.", hidden: true };
    case "owner":
      if (ctx.role === "owner" || ctx.permission === "owner") return { ok: true };
      if (RANK[ctx.role] < RANK["signed-in"] && !ctx.permission) return { ok: false, reason: "Sign in first.", hidden: true };
      return { ok: false, reason: "Only the room owner can do this.", fix: "Ask the owner, or let your assistant propose it if you own the room." };
    case "player":
      if (ctx.permission === "read" && entry.kind !== "query") return { ok: false, reason: "This connection is read-only.", fix: "Reconnect with act rights." };
      if (RANK[ctx.role] >= RANK.member || ctx.permission) return { ok: true };
      if (RANK[ctx.role] < RANK["signed-in"]) return { ok: false, reason: "Sign in first." };
      return { ok: false, reason: "Join the room first." };
    case "infrastructure": return RANK[ctx.role] >= RANK["signed-in"] || ctx.permission ? { ok: true } : { ok: false, reason: "Sign in first.", hidden: true };
    case "test": return { ok: false, reason: "Test only.", hidden: true };
  }
}

export function commandsFromCatalog(
  catalog: typeof CATALOG,
  bind: (path: PublicFunctionPath, entry: CatalogEntry) => Performer | null,
  surface: PaletteSurface,
): Command[] {
  const out: Command[] = [];
  for (const path of Object.keys(catalog) as PublicFunctionPath[]) {
    const entry: CatalogEntry = catalog[path];
    if (!entry.palette || !entry.palette.surfaces.includes(surface)) continue;
    const performer = bind(path, entry);
    if (!performer) continue;
    out.push({
      id: path, human: { title: entry.palette.label, tooltip: entry.human.tooltip }, group: entry.palette.group, keywords: entry.palette.keywords,
      confirm: deriveConfirm({ explicit: entry.palette.confirm }),
      performer, available: ctx => availabilityFor(entry, ctx),
    });
  }
  return out;
}

/** Commands worth showing for a query, best first: available ones, then the dimmed ones; never what can never apply. */
export function searchCommands(commands: readonly Command[], query: string, ctx: PaletteContext): { command: Command; availability: Availability }[] {
  return paletteRows(commands, ctx, { query, browse: !query.trim() }).flatMap(s => s.rows)
    .filter(r => query.trim() || r.availability.ok)
    .map(({ command, availability }) => ({ command, availability }));
}
