/** `?panels=off`: safe mode. Only the built-in panels and the assistant load: no file panels, no stored panels. */
export const SAFE_MODE = typeof location !== "undefined" && new URLSearchParams(location.search).get("panels") === "off";
