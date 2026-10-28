import type { ComponentType } from "react";

/** Where a panel docks. The player can drag it elsewhere; their choice wins over the manifest. */
export type Placement = "left" | "right" | "bottom";
export type PanelSize = "sm" | "md" | "lg";

/** A panel's manifest plus its component. Panels live one per file in src/panels/*.tsx. */
export type PanelDefinition = {
  /** Stable id; defaults to the file name. Used for layout persistence. */
  id?: string;
  title: string;
  description?: string;
  placement?: Placement;
  size?: PanelSize;
  Component: ComponentType;
};

/** Declare a panel: `export default definePanel({ title, placement, size, Component })`. */
export function definePanel(definition: PanelDefinition): PanelDefinition {
  return definition;
}

export function isPanelDefinition(value: unknown): value is PanelDefinition {
  return !!value && typeof value === "object" && typeof (value as PanelDefinition).title === "string" &&
    typeof (value as PanelDefinition).Component === "function";
}
