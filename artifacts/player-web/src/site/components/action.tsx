/**
 * The site's controls (palette-and-pages.md §2.10). Every operation is an affordance (lib/v2-affordances): its button
 * is an <AffordanceButton id=…>, which takes its title, tooltip, availability, confirmation and the reason it cannot
 * run from the directory, through `useAffordance`, so a button and its palette row never disagree.
 *
 * Unavailable actions stay focusable (aria-disabled, not disabled) so keyboard users reach the reason; with
 * `showReason` the reason is also printed, because touch has no hover.
 */
import { forwardRef, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "wouter";
import { useAffordance, AffordanceError } from "@workspace/v2-affordances/react";
import type { AffordanceId, AffordanceOf } from "@workspace/v2-affordances";
import type { z } from "zod/v4";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

export type Tone = "primary" | "secondary" | "quiet" | "link" | "danger";

/** A tooltip around any control. */
export function Tip({ text, reason, children, side }: { text?: string; reason?: string | null; children: ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  const body = [text ?? "", reason ?? ""].filter(Boolean).join(" ");
  if (!body) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs bg-foreground text-background">{body}</TooltipContent>
    </Tooltip>
  );
}

export const TONES: Record<Tone, string> = {
  primary: "inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90",
  secondary: "inline-flex items-center justify-center gap-2 border border-border bg-background px-3 py-2 text-sm hover:bg-muted",
  quiet: "inline-flex items-center gap-1.5 text-sm hover:text-foreground text-muted-foreground",
  link: "inline-flex items-center gap-1.5 text-sm underline underline-offset-4 decoration-border hover:decoration-foreground",
  danger: "inline-flex items-center justify-center gap-2 border border-destructive/50 text-destructive px-3 py-2 text-sm hover:bg-destructive/5",
};

/** A plain navigation or local control with the site's look (no operation behind it). */
export const Action = forwardRef<HTMLElement, {
  label: ReactNode; tone?: Tone; onClick?: () => void; href?: string; external?: boolean; tooltip?: string;
  unavailable?: string | null; icon?: ReactNode; testId?: string; className?: string;
}>(function Action({ label, tone = "secondary", onClick, href, external, tooltip, unavailable, icon, testId, className = "" }, ref) {
  const cls = `${TONES[tone]} ${unavailable ? "opacity-50 cursor-not-allowed" : ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`;
  const content = <>{icon}{label}</>;
  const control = href && !unavailable ? (
    external
      ? <a ref={ref as React.Ref<HTMLAnchorElement>} href={href} target="_blank" rel="noreferrer" className={cls} data-testid={testId}>{content}</a>
      : <Link ref={ref as React.Ref<HTMLAnchorElement>} href={href} className={cls} data-testid={testId}>{content}</Link>
  ) : (
    <button ref={ref as React.Ref<HTMLButtonElement>} type="button" aria-disabled={!!unavailable || undefined} className={cls} data-testid={testId}
      onClick={() => { if (!unavailable) onClick?.(); }}>{content}</button>
  );
  return <Tip text={tooltip} reason={unavailable}>{control}</Tip>;
});

type ArgsOf<Id extends AffordanceId> = z.input<AffordanceOf<Id>["params"]>;
type ResultOf<Id extends AffordanceId> = z.output<AffordanceOf<Id>["result"]>;

/** How an operation's failure reads: the server's words, then its fix when it is a sentence. */
export function failureText(e: unknown): string {
  if (e instanceof AffordanceError) return [e.message, e.fix && !/^[a-z]+\.[a-zA-Z]+$/.test(e.fix) ? e.fix : ""].filter(Boolean).join(" ");
  return e instanceof Error ? e.message : String(e);
}

/**
 * One operation's button. Runs `args` (or `args()` at click time) through the affordance; while it runs the button
 * says `busyLabel`; a failure is toasted with the server's words (and returned to `onError`), a success goes to
 * `onDone`. Confirmation follows the directory: `inline` asks "again to …" on the button, `summary` and `modal` open a
 * dialog with `confirmText` (or the tooltip). Hidden operations render nothing.
 */
export function AffordanceButton<Id extends AffordanceId>({
  id, args, label, busyLabel, tone = "secondary", testId, className = "", showReason, confirmText, onDone, onError, icon, disabledReason,
}: {
  id: Id; args?: ArgsOf<Id> | (() => ArgsOf<Id>); label?: ReactNode; busyLabel?: ReactNode; tone?: Tone; testId?: string; className?: string;
  showReason?: boolean; confirmText?: string; onDone?: (result: ResultOf<Id>) => void; onError?: (message: string) => void; icon?: ReactNode;
  /** An app-level reason it cannot run now (a draft is empty), on top of the directory's. */
  disabledReason?: string | null;
}) {
  const a = useAffordance(id);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [dialog, setDialog] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 5000); return () => clearTimeout(t); }, [armed]);
  if (a.hidden) return null;
  const reason = !a.available ? a.reason ?? "Not available now." : disabledReason ?? null;
  const go = async () => {
    if (inFlight.current) return;   // one click, one request
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await a.run((typeof args === "function" ? (args as () => ArgsOf<Id>)() : args ?? {}) as ArgsOf<Id>);
      onDone?.(result as ResultOf<Id>);
    } catch (e) {
      const message = failureText(e);
      if (onError) onError(message); else toast({ title: `${a.title}: not done`, description: message, variant: "destructive" });
    } finally { inFlight.current = false; setBusy(false); }
  };
  const click = () => {
    if (reason || busy) return;
    if (a.confirm === "inline" && !armed) { setArmed(true); return; }
    setArmed(false);
    if (a.confirm === "summary" || a.confirm === "modal") { setDialog(true); return; }
    void go();
  };
  const blocked = !!reason || busy;
  const cls = `${TONES[tone]} ${blocked ? "opacity-50 cursor-not-allowed" : ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`;
  const text = busy ? busyLabel ?? label ?? a.title : armed ? `Again to ${String(label ?? a.title).toLowerCase()}` : label ?? a.title;
  const button = (
    <button type="button" aria-disabled={blocked || undefined} className={cls} data-testid={testId} data-affordance={id} onClick={click}>{icon}{text}</button>
  );
  const tipped = <Tip text={a.tooltip} reason={reason}>{button}</Tip>;
  return (
    <>
      {showReason && reason ? <span className="inline-flex flex-col items-start gap-1">{tipped}<span className="text-xs text-muted-foreground" data-testid={testId ? `${testId}-reason` : undefined}>{reason}</span></span> : tipped}
      {dialog && (
        <AlertDialog open onOpenChange={setDialog}>
          <AlertDialogContent data-testid={testId ? `${testId}-confirm` : undefined}>
            <AlertDialogHeader>
              <AlertDialogTitle>{a.title}?</AlertDialogTitle>
              <AlertDialogDescription>{confirmText ?? a.tooltip}{a.spends === "energy" ? " It costs ⚡ energy." : ""}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction data-testid={testId ? `${testId}-confirm-ok` : undefined} onClick={() => { setDialog(false); void go(); }}>{label ?? a.title}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
