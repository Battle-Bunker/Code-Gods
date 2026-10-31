/**
 * The one way the engine UI gives a control its tooltip (palette-and-pages.md §2.10): the text is the catalogue's
 * `human.tooltip` (or a `ui.*` command's), then the reason the action is unavailable, then its shortcut, so a button
 * and its palette row never disagree. A source test (test/tooltips.test.ts) fails on a literal `title="…"` on a
 * button or link anywhere else.
 *
 * Unavailable actions stay focusable (aria-disabled, not disabled) so keyboard users reach the reason; under a
 * primary button the reason is also printed, because touch has no hover.
 */
import { forwardRef, type ReactElement, type ReactNode } from "react";
import { Link } from "wouter";
import type { PublicFunctionPath } from "@workspace/player-client/catalog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { titleFor, tooltipFor, type UiCommandId } from "@/lib/commands";

export type ActionKey = PublicFunctionPath | UiCommandId;
export type Tone = "primary" | "secondary" | "quiet" | "link" | "danger";

/** A tooltip around any control, from a catalogue key or explicit text. */
export function Tip({ k, text, reason, children, side }: { k?: ActionKey; text?: string; reason?: string | null; children: ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  const body = [text ?? (k ? tooltipFor(k) : ""), reason ?? ""].filter(Boolean).join(" ");
  if (!body) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs bg-foreground text-background">{body}</TooltipContent>
    </Tooltip>
  );
}

const TONES: Record<Tone, string> = {
  primary: "inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90",
  secondary: "inline-flex items-center justify-center gap-2 border border-border bg-background px-3 py-2 text-sm hover:bg-muted",
  quiet: "inline-flex items-center gap-1.5 text-sm hover:text-foreground text-muted-foreground",
  link: "inline-flex items-center gap-1.5 text-sm underline underline-offset-4 decoration-border hover:decoration-foreground",
  danger: "inline-flex items-center justify-center gap-2 border border-destructive/50 text-destructive px-3 py-2 text-sm hover:bg-destructive/5",
};

interface ActionProps {
  /** The catalogue path or ui command whose title and tooltip this control shows. */
  k: ActionKey;
  /** A shorter label (≤ 3 words); the command's title otherwise. */
  label?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  /** In-app route (wouter), or an external URL with `external`. */
  href?: string;
  external?: boolean;
  /** Why it cannot run now; the control stays focusable and explains itself. */
  unavailable?: string | null;
  pending?: boolean;
  icon?: ReactNode;
  testId?: string;
  className?: string;
  /** Print the unavailable reason under the control (primary actions on touch screens). */
  showReason?: boolean;
}

export const Action = forwardRef<HTMLElement, ActionProps>(function Action(
  { k, label, tone = "secondary", onClick, href, external, unavailable, pending, icon, testId, className = "", showReason }, ref,
) {
  const blocked = !!unavailable || !!pending;
  const cls = `${TONES[tone]} ${blocked ? "opacity-50 cursor-not-allowed" : ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`;
  const content = <>{icon}{label ?? titleFor(k)}</>;
  const control = href && !blocked ? (
    external
      ? <a ref={ref as React.Ref<HTMLAnchorElement>} href={href} target="_blank" rel="noreferrer" className={cls} data-testid={testId}>{content}</a>
      : <Link ref={ref as React.Ref<HTMLAnchorElement>} href={href} className={cls} data-testid={testId}>{content}</Link>
  ) : (
    <button ref={ref as React.Ref<HTMLButtonElement>} type="button" aria-disabled={blocked || undefined} className={cls} data-testid={testId}
      onClick={() => { if (!blocked) onClick?.(); }}>{content}</button>
  );
  const tip = <Tip k={k} reason={unavailable}>{control}</Tip>;
  if (!showReason || !unavailable) return tip;
  return <span className="inline-flex flex-col items-start gap-1">{tip}<span className="text-xs text-muted-foreground" data-testid={testId ? `${testId}-reason` : undefined}>{unavailable}</span></span>;
});
