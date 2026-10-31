import type { ComponentType } from "react";

/** A hint for where a new pane of this panel opens beside the lenses; the player and the assistant arrange panes freely. */
export type Placement = "left" | "right" | "bottom";
export type PanelSize = "sm" | "md" | "lg";

/** A panel's manifest plus its component. Panels live one per file in src/panels/*.tsx. */
export type PanelDefinition = {
  /** Stable id; defaults to the file name. */
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
