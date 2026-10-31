/** `?panels=off`: safe mode. Only the built-in lenses and the assistant load: no file panels, no stored panels. */
export const SAFE_MODE = typeof location !== "undefined" && new URLSearchParams(location.search).get("panels") === "off";
