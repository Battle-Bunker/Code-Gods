/**
 * v1's owner ⋯ menu in the game (parity row page-game-owner-menu): End the game, Start the world now, Resume, each the
 * room owner's affordance, offered where it applies (the directory says when). Only the owner sees it.
 */
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAffordance } from "@workspace/v2-affordances/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { failureText } from "@/site/components/action";

export function OwnerMenu() {
  const end = useAffordance("game.end");
  const startNow = useAffordance("game.startWorldNow");
  const resume = useAffordance("game.resume");
  const items = [
    { a: startNow, label: "Start the world now", testId: "menu-owner-start-world", confirm: null },
    { a: resume, label: "Resume the game", testId: "menu-owner-resume", confirm: null },
    { a: end, label: "End the game…", testId: "button-end-game", confirm: "End the game now for everyone? Scores are final at this moment." },
  ].filter(i => !i.a.hidden && i.a.available);
  const [asking, setAsking] = useState<(typeof items)[number] | null>(null);
  if (!items.length) return null;
  const go = (i: (typeof items)[number]) => {
    void i.a.run({} as never).catch((e: unknown) => toast({ title: `${i.label.replace(/…$/, "")} did not happen`, description: failureText(e), variant: "destructive" }));
  };
  const run = (i: (typeof items)[number]) => (i.confirm ? setAsking(i) : go(i));
  return (<>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 border px-2 py-0.5 text-xs text-muted-foreground" aria-label="The room owner's controls" data-testid="button-owner-menu">
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />Owner
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">You own this room</DropdownMenuLabel>
        {items.map(i => <DropdownMenuItem key={i.testId} onSelect={() => run(i)} data-testid={i.testId}>{i.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    {asking && (
      <AlertDialog open onOpenChange={o => { if (!o) setAsking(null); }}>
        <AlertDialogContent data-testid={`${asking.testId}-confirm`}>
          <AlertDialogHeader>
            <AlertDialogTitle>{asking.label.replace(/…$/, "")}?</AlertDialogTitle>
            <AlertDialogDescription>{asking.confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const i = asking; setAsking(null); go(i); }} data-testid={`${asking.testId}-yes`}>{asking.label.replace(/…$/, "")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}
  </>);
}
