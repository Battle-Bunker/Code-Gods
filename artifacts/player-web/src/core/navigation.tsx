/**
 * Navigation for the dock and the replay, on the app's one router (wouter, core/app.tsx) and URL scheme (./routes.ts),
 * under the app's own base path (Vite's BASE_URL).
 */
import { useCallback, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { navigate as browserNavigate } from "wouter/use-browser-location";
import { carriedSearch, routeHref, type AppRoute } from "./routes";

export const BASE = import.meta.env.BASE_URL;
type Target = Exclude<AppRoute, { kind: "notFound" }>;

/** Push (or replace) a location inside the app (an absolute path, base included). */
export function navigate(href: string, { replace = false }: { replace?: boolean } = {}) {
  if (href === `${location.pathname}${location.search}`) return;
  browserNavigate(href, { replace });
}

/** The href of a route, keeping the page's own query parameters (?panels=off) across navigation. */
export const hrefTo = (route: Target) => routeHref(BASE, route, carriedSearch(location.search));

/** An in-app link: a real href (open in a new tab works), navigated without a page load on a plain click. */
export function Link({ to, onClick, ...rest }: { to: Target } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const href = hrefTo(to);
  const click = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  }, [href, onClick]);
  return <a href={href} onClick={click} {...rest} />;
}
