/**
 * The shared setup catalogue, paged (read-architecture R1): `setups.page` is the skeleton (ids, names, summaries; the
 * system's in seed order, then everyone's by name, or the server's search), `setups.row` one setup with its owner's name.
 */
import { useMemo } from "react";
import { api, useLive, useLivePages } from "@/site/lib/convex";
import type { Live, SetupLike } from "@/site/lib/commands";

/** How many setups a palette's pick shows (the first page; typing searches the whole catalogue on the server). */
export const PALETTE_SETUPS = 50;
/** How many setups the Setup combobox loads at a time (more as it scrolls). */
export const PICKER_PAGE = 30;

const search = (query: string) => (query.trim() ? { search: query.trim() } : {});

/** The first page of the catalogue, or of the server's search for `query`. */
export function useSetupEntries(query: string): Live<readonly SetupLike[]> {
  const r = useLive(api.setups.page, { paginationOpts: { numItems: PALETTE_SETUPS, cursor: null }, ...search(query) });
  return useMemo(() => ({ data: r.data?.page, error: r.error }), [r.data, r.error]);
}

/** The catalogue a page at a time (every loaded page stays live): the Setup combobox's skeleton. */
export const useSetupPages = (query: string, enabled = true) =>
  useLivePages(api.setups.page, enabled ? search(query) : "skip", { initialNumItems: PICKER_PAGE });

/** One setup as a list row shows it, with its owner's name (null once deleted). */
export const useSetupRow = (setupId: string | undefined) => useLive(api.setups.row, setupId ? { setupId } : "skip");
