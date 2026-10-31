/** `?panels=off`: safe mode. Only the core console loads: no file panels, no stored panels. */
export const SAFE_MODE = typeof location !== "undefined" && new URLSearchParams(location.search).get("panels") === "off";
