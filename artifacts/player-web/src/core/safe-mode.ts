/**
 * `?panels=off`: safe mode. Only the built-in panes and the assistant load; no stored or file panel runs (its pane says
 * so instead), so a panel that breaks the page can always be turned off or deleted. The parameter is carried across
 * navigation (routes.ts carriedSearch).
 */
export const safeModeOf = (search: string) => new URLSearchParams(search).get("panels") === "off";
export const SAFE_MODE = typeof location !== "undefined" && safeModeOf(location.search);
