/**
 * The palette's pure helpers over Command lists. The app builds its commands from the affordance directory
 * (lib/v2-affordances `paletteFor`), so nothing here knows the operations.
 */
import { paletteRows } from "./search.ts";
import type { Availability, Command, LiveOptions, PaletteContext, PickOption } from "./types.ts";

/** Commands worth showing for a query, best first: available ones, then the dimmed ones; never what can never apply. */
export function searchCommands(commands: readonly Command[], query: string, ctx: PaletteContext): { command: Command; availability: Availability }[] {
  return paletteRows(commands, ctx, { query }).flatMap(s => s.rows)
    .filter(r => query.trim() || r.availability.ok)
    .map(({ command, availability }) => ({ command, availability }));
}

/**
 * A pick page's live list from a subscription's current state (the app's shared query hook): loading while it has no
 * answer, its error's message, else every item mapped to an option.
 */
export function liveOptions<T>(result: { data: readonly T[] | undefined; error?: Error | null }, option: (item: T) => PickOption): LiveOptions {
  return { options: result.data?.map(option), error: result.error ? result.error.message : null };
}
