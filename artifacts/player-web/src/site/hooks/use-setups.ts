/**
 * The shared setup catalogue, paged (read-architecture R1): `setups.page` is the skeleton (ids, names, summaries; the
 * system's in seed order, then everyone's by name, or the server's search), `setups.row` one setup with its owner's name.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { api, useLive, useLivePages } from "@/site/lib/convex";
import type { Live, SetupLike } from "@/site/lib/commands";

/** How many setups a palette's pick shows (the first page; typing searches the whole catalogue on the server). */
export const PALETTE_SETUPS = 30;
/** How many setups the Setup combobox loads at a time (more as it scrolls). */
export const PICKER_PAGE = 30;

const search = (query: string) => (query.trim() ? { search: query.trim() } : {});

/**
 * The last answer while the next one loads (a new search per keystroke): the list stays on screen instead of
 * flashing "Loading". Not a cache: it is what this component last rendered, and it is replaced by the live answer.
 */
function useShownWhileLoading<T>(value: T | undefined): T | undefined {
  const shown = useRef(value);
  if (value !== undefined) shown.current = value;
  return value ?? shown.current;
}

/** The first page of the catalogue, or of the server's search for `query`. */
export function useSetupEntries(query: string): Live<readonly SetupLike[]> {
  const r = useLive(api.setups.page, { paginationOpts: { numItems: PALETTE_SETUPS, cursor: null }, ...search(query) });
  const data = useShownWhileLoading(r.data?.page);
  return useMemo(() => ({ data, error: r.error }), [data, r.error]);
}

/** The catalogue a page at a time (every loaded page stays live): the Setup combobox's skeleton. */
export function useSetupPages(query: string, enabled = true) {
  const pages = useLivePages(api.setups.page, enabled ? search(query) : "skip", { initialNumItems: PICKER_PAGE });
  const results = useShownWhileLoading(pages.status === "LoadingFirstPage" ? undefined : pages.results);
  return { ...pages, results: results ?? [], loading: pages.status === "LoadingFirstPage" && !results };
}

/** One setup as a list row shows it, with its owner's name (null once deleted). */
export const useSetupRow = (setupId: string | undefined) => useLive(api.setups.row, setupId ? { setupId } : "skip");

/** Whether an element is on screen (inside its scrolling list): a row subscribes to its own setup only while it is. */
export function useInView(ref: RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: "64px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}
