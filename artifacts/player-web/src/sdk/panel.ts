/**
 * A stored panel's module (`panel.save`): `export default definePanel({ title, placement, size, Component })` from
 * "@sdk". The definition carries the SDK version it was written for (`sdk: 2`); the panel frame loads only that
 * version (src/frame/loader.ts). Pure: shared by the app, the frame and the unit tests.
 */
import type { ComponentType } from "react";

/** The panel SDK this app serves to stored panels. Version 1 was the first engine's; its panels do not load. */
export const PANEL_SDK = 2;

export interface PanelManifest {
  title: string;
  /** Where the pane opens by default. */
  placement?: "left" | "right" | "bottom";
  size?: "sm" | "md" | "lg";
}
export interface PanelDefinition extends PanelManifest {
  Component: ComponentType;
  sdk: typeof PANEL_SDK;
}

export function definePanel(manifest: PanelManifest & { Component: ComponentType }): PanelDefinition {
  return { ...manifest, sdk: PANEL_SDK };
}

export function isPanelDefinition(value: unknown): value is PanelDefinition {
  if (!value || typeof value !== "object") return false;
  const c = (value as { Component?: unknown }).Component;
  // A function component, or a memo / forwardRef object.
  return typeof c === "function" || (!!c && typeof c === "object" && "$$typeof" in c);
}
