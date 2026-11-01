/**
 * Client-side navigation over the History API, on the URL scheme in ./routes.ts and under the app's own base path
 * (Vite's BASE_URL: "/client/" hosted by the engine, "/" on a dev server). No router library: four routes.
 */
import { useCallback, useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { parseRoute, routeHref, type ClientRoute, type ParsedRoute } from "./routes";

export const BASE = import.meta.env.BASE_URL;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Push (or replace) a location inside the app; every useClientRoute re-renders. */
export function navigate(href: string, { replace = false }: { replace?: boolean } = {}) {
  if (href === `${location.pathname}${location.search}`) return;
  if (replace) history.replaceState(null, "", href); else history.pushState(null, "", href);
  emit();
}

let cache: { key: string; parsed: ParsedRoute } | undefined;
function current(): ParsedRoute {
  const key = `${location.pathname}${location.search}`;
  if (cache?.key !== key) cache = { key, parsed: parseRoute(BASE, location.pathname, location.search) };
  return cache.parsed;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  addEventListener("popstate", listener);
  return () => { listeners.delete(listener); removeEventListener("popstate", listener); };
}

/** The current route; a non-canonical location (?room=CODE, a stray path) is replaced by its canonical href. */
export function useClientRoute(): ClientRoute {
  const parsed = useSyncExternalStore(subscribe, current);
  useEffect(() => { if (parsed.canonical) navigate(parsed.canonical, { replace: true }); }, [parsed.canonical]);
  return parsed.route;
}

/** The href of a route, keeping the page's own query parameters (?panels=off) across navigation. */
export const hrefTo = (route: Exclude<ClientRoute, { kind: "legacyGame" }>) => routeHref(BASE, route, location.search);

/** An in-app link: a real href (open in a new tab works), navigated without a page load on a plain click. */
export function Link({ to, onClick, ...rest }: { to: Exclude<ClientRoute, { kind: "legacyGame" }> } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const href = hrefTo(to);
  const click = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  }, [href, onClick]);
  return <a href={href} onClick={click} {...rest} />;
}
