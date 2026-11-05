/**
 * An agent's name, prominent, with a small (i) after it when the agent has a description: hover or focus shows the
 * whole description, and a tap (click) toggles it, so it works with a mouse, a keyboard and a touch screen. Written with
 * createElement (no JSX) so the node test can render it to static markup.
 */
import { createElement as h, useState } from "react";

export function AgentName({ id, name, description }: { id: string; name: string; description?: string }) {
  const [open, setOpen] = useState(false);
  const text = description?.trim();
  return h("span", { className: "group relative inline-flex items-baseline gap-1", "data-testid": `text-agent-name-${id}` },
    h("span", { className: "text-base font-semibold" }, name),
    text ? h("button", {
      type: "button", "data-testid": `button-agent-info-${id}`, "aria-label": `About ${name}`, "aria-expanded": open, "aria-describedby": `agent-desc-${id}`, title: text,
      onClick: () => setOpen(o => !o),
      className: "cursor-help text-xs text-muted-foreground hover:text-foreground focus-visible:text-foreground",
    }, "(i)") : null,
    text ? h("span", {
      id: `agent-desc-${id}`, role: "tooltip", "data-testid": `text-agent-description-${id}`,
      className: `absolute left-0 top-full z-10 mt-1 w-64 max-w-[80vw] whitespace-pre-wrap break-words border bg-popover p-2 text-xs font-normal text-popover-foreground shadow ${open ? "block" : "hidden group-hover:block group-focus-within:block"}`,
    }, text) : null);
}

/** The name to show for an agent: its own, or "Agent 1", "Agent 2"… by its place in the list when it has none. */
export function agentLabel(name: string | undefined, index: number): string {
  return name?.trim() || `Agent ${index + 1}`;
}
