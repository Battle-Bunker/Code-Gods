/**
 * One line (the `object` pane): the line in the human's focus (`view.focus`, set by Lines, the palette or an
 * assistant) on the expanded face, every representation the rule reads, the parts, the worked computation, the ladder
 * and the nearest improvement. The switcher and the comparison are the human's view state (`view.showRepresentation`,
 * `view.compareRepresentations`), so an assistant can switch them for them; "Draw every line in Lines this way" pins the
 * representation for the rule's family (`view.pinRepresentation`).
 */
import { bankedWords } from "./turnover-words";
import { isPaid, lookLabel, quotePrice, seenWords } from "./seen";
import { FreshMark, useWorldNow } from "./fresh-mark";
import { AffordanceButton } from "@/site/components/action";
import { useMemo, useState } from "react";
import { pinnedRep } from "@workspace/v2-affordances";
import { useAffordance } from "@workspace/v2-affordances/react";
import { ANOTHER, ClimbHistory, climbOf, ExpandedFace, moves as candidatesOf, ObjectChip, shortTitle, type ValuePart } from "@workspace/v2-views";
import { representation } from "@workspace/v2-core";
import { decodeState, objectTypeOf, objectWord, useGame, useGameScope, useMyAgents, useMyObject, useMyRule, useObjectMoves, useOthersAt, useOthersBlurred, type OthersAtMaps } from "@/sdk";
import { useReplaying, useView } from "@/core/affordance-runtime";
import { requestComposer } from "./assistant-request";
import { useRuntime } from "@/core/affordance-runtime";
import { useOpenPane } from "@/dock/open-pane";
import { bitsText, chanceText, pointsText } from "@/core/words";
import { rarerThanText } from "@workspace/v2-views/format";
import { BitsHelp, BoundMark } from "@/core/score-help";
import { toast } from "@/hooks/use-toast";
import { activeOp, compareOp, switcherOf, whyLine, type SwitchOp } from "./lines";
import { requestForge } from "./forge-request";
import { ObjectLocks } from "./object-locks";

/** How many candidates the face lists when it shows the others' totals at them (the server reads at most four). */
const CANDIDATES = 4;
/** How many of the last moves on the object the face lists. */
const CLIMB_SHOWN = 5;

const failed = (title: string) => (e: unknown) => toast({ title, description: e instanceof Error ? e.message : String(e), variant: "destructive" });

/**
 * The object's detail: the One line content. `onReps` given (the hover overlay), switching and comparing
 * representations stay in the overlay; without it they are the human's view state.
 */
function FocusedLine({ objectId, reps, onReps }: { objectId: string; reps: readonly string[]; onReps?: (reps: string[]) => void }) {
  const { seated } = useGameScope();
  const view = useView();
  const o = useMyObject(objectId);
  const my = useMyRule();
  const agents = useMyAgents();
  const blurred = useOthersBlurred();
  const show = useAffordance("view.showRepresentation");
  const compare = useAffordance("view.compareRepresentations");
  const pin = useAffordance("view.pinRepresentation");
  // From the overlay, "Try a change" makes this the object in focus (What if works on it) without opening One line.
  const focusOn = useAffordance("view.openObject");
  const header = useGame();
  const worldNow = useWorldNow();
  const replaying = useReplaying();
  const openPane = useOpenPane(replaying ? "replay" : header?.phase ?? "live");
  const state = useMemo(() => (o ? decodeState(o.state, header?.variant) : null), [o?.state, header?.variant]); // eslint-disable-line react-hooks/exhaustive-deps
  const word = objectWord(header?.variant);
  const aiOff = !!useRuntime().context.room?.aiOff;
  // The candidates, and the others' total bits at each (one live read for the object's few candidate states).
  const rule0 = seated ? my?.rule ?? null : null, value0 = my?.bits ?? undefined;
  const candidates = useMemo(() => (rule0 && state ? candidatesOf(rule0, state, value0, { k: CANDIDATES }) : []), [rule0, state, value0]);
  const calls = useMemo(() => candidates.map(m => m.call as { mutator: string; site: number; args: Record<string, string> }), [candidates]);
  // After the end (the state is frozen) the others' sums at each candidate are open and exact: a live read. While the
  // game runs they are paid and blurred (W3 #882, call 33): a quote on the player's press, one look's price a candidate.
  const ended = header?.phase === "ended";
  const exact = useOthersAt(replaying || !ended ? null : objectId, calls);
  const whatIf = useAffordance("object.whatIf");
  // A quote holds for the state it was asked from (the server says which): once the line moves, it says so.
  // What the quote priced, kept with it: a paid quote stays on screen after the line moves on (coordinator, call 33).
  const [quote, setQuote] = useState<{ objectId: string; state: string; maps: OthersAtMaps; priced: { words: string; want: number | null }[] } | null>(null);
  const myQuote = quote && quote.objectId === objectId ? quote : null;
  const quoteFresh = !!myQuote && myQuote.state === o?.state;
  const [quoting, setQuoting] = useState(false);
  const askQuote = () => {
    if (quoting || !calls.length) return;
    setQuoting(true);
    whatIf.run({ objectId, calls }).then(r => {
      const rows = r.after.flatMap(a => (a ? [a] : []));
      const priced = candidates.map((m, i) => ({ words: m.words, want: r.after[i]?.want ?? null }));
      setQuote({ objectId, state: r.state, priced, maps: { want: new Map(rows.map(a => [a.state, a.want])), taken: new Map(rows.flatMap(a => (a.taken !== null ? [[a.state, a.taken] as const] : []))) } });
    }, failed("The quote did not come")).finally(() => setQuoting(false));
  };
  const others = ended ? exact : quoteFresh ? myQuote!.maps : undefined;
  // The climb on it lately: the viewer's own act-log rows on this object (≤ 50, one small read), oldest first.
  const recent = useObjectMoves(replaying ? null : o?.number);
  // Judged on the moves it shows (the last few), so the verdict matches the list.
  const climb = useMemo(() => climbOf([...(recent ?? [])].slice(0, CLIMB_SHOWN).reverse().map(m => ({ by: m.mine ? "you" : m.by?.name ?? ANOTHER, before: m.before, after: m.after }))), [recent]);
  if (!o || !state) return <p className="p-4 text-sm text-muted-foreground">Loading this {word.one}…</p>;
  const rule = my?.rule ?? null;
  if (!seated || !rule) {
    return (
      <div className="space-y-2 p-4 text-sm" data-testid="line-expanded">
        <p className="font-semibold">{word.One} {o.number}: <ObjectChip type={objectTypeOf(header?.variant)} state={state} /></p>
        <p className="text-muted-foreground">{seated ? "This version of the app cannot draw your rule yet: reload the page to update it." : `You hold no rule in this game, so there is no score to explain on this ${word.one}.`}</p>
      </div>
    );
  }
  const primary = my!.row.primary;
  const { active, compare: compared } = switcherOf(reps, primary);
  const run = (op: SwitchOp) => {
    if (onReps) { onReps(op.id === "view.showRepresentation" ? [(op.args as { rep: string }).rep] : [...(op.args as { reps: string[] }).reps]); return Promise.resolve(); }
    return (op.id === "view.showRepresentation" ? show.run(op.args) : compare.run(op.args)).catch(failed("The view did not change"));
  };
  const pinned = pinnedRep(view, rule.family.id, primary);
  const v = o.value;
  const othersAt = others && v
    ? { now: v.want, at: (after: unknown) => others.want.get(rule.type.encode(after)) ?? null, taken: (after: unknown) => others.taken.get(rule.type.encode(after)) ?? null, approx: !ended || blurred }
    : undefined;
  return (
    <div className="space-y-3 p-3" data-testid="line-expanded" data-line={o.number}>
      <div className="space-y-1 text-sm">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{word.One} {o.number}</span>
          {v && <span data-testid="text-line-points">{"bound" in v && v.bound && <><BoundMark testId="mark-bound-line" /> </>}{bitsText(v.rarityBits)} · <b>{pointsText(v.points)}</b></span>}
          {v && <BitsHelp testId="button-bits-help-line" />}
          {/* v1's AskAboutObject: the line in a message to your assistant, to finish and send. */}
          {!aiOff && (
            <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" data-testid={`button-object-ask-${o.number}`}
              title={`Put this ${word.one} in a message to your assistant`} onClick={() => void requestComposer({ fill: `${word.One} ${o.number}: ` }, openPane)}>ask my assistant</button>
          )}
        </p>
        {view.focus?.objectId === objectId && view.focus.from && <p className="text-xs text-muted-foreground" data-testid="text-object-from">Opened from: {view.focus.from}</p>}
        {/* Line turnover: a retired line keeps its final state and the points it banked; no agent acts on it again. */}
        {o.retiredAt !== undefined && v && <p className="text-xs font-medium" data-testid="text-line-retired">{bankedWords({ retiredAt: o.retiredAt, points: v.points }, header?.turnover?.banked ?? true, header?.phase !== "ended")}: no agent acts on it again.</p>}
        {v && <p className="text-xs text-muted-foreground" data-testid="text-line-formula">{whyLine({ rarity: v.rarityBits, want: v.want }, {}, word.one, blurred)}</p>}
        {/* What the energy means, in one line. */}
        {v && v.rarityBits > 0 && <p className="text-xs text-muted-foreground" data-testid="text-line-rarer">For your rule, reaching a {word.one} at least this good from a random {word.one} of its size costs about {bitsText(v.rarityBits)} of energy.</p>}
        {/* Paid looks (W3 #643): this is the line as last seen; a look pays to see it as it is now. */}
        {isPaid(o) && (
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5" data-testid="text-line-seen"><FreshMark o={o} worldNow={worldNow} />{seenWords(o)}</span>
            {lookLabel(o.lookPrice) && <AffordanceButton id="object.look" args={{ objectId }} label={lookLabel(o.lookPrice)!} busyLabel="Looking…" tone="quiet" className="px-2 py-0.5 text-xs" testId="button-look-line" />}
          </p>
        )}
      </div>
      {/* A tree-valued rule's points, part by part (the server's value.parts, W-server2 #1017; null otherwise). */}
      <ExpandedFace rule={rule} state={state} value={my!.bits ?? undefined} active={active} compare={compared}
        parts={v && "parts" in v ? (v.parts as readonly ValuePart[] | null | undefined) ?? null : null}
        moves={candidates} others={othersAt} climb={<ClimbHistory climb={climb} noun={word.one} approx={blurred} />}
        onActive={rep => void run(activeOp(objectId, rep, compared))} onCompare={rep => void run(compareOp(objectId, active, rep))} />
      {!ended && !replaying && o.retiredAt === undefined && candidates.length > 0 && (
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground" data-testid="what-if-quote">
          <button type="button" className="underline underline-offset-4 disabled:opacity-50" disabled={quoting || !whatIf.available} onClick={askQuote} data-testid="button-quote-what-if">
            {quoting ? "Quoting…" : `${myQuote ? "Quote again" : "Quote what these moves do for the others"} (${quotePrice(o.lookPrice, candidates.length)})`}
          </button>
          <span data-testid="text-quote-state" data-fresh={quoteFresh || undefined}>{quoteFresh ? "An estimate (≈): each quote is a fresh blurred reading, so asking again draws fresh."
            : myQuote ? `This ${word.one} has moved since your quote. What you paid for, from where it was:` : "Their sums are paid and blurred while the game runs."}</span>
        </p>
      )}
      {!ended && !replaying && myQuote && !quoteFresh && (
        <ul className="space-y-0.5 text-xs text-muted-foreground" data-testid="list-stale-quote">
          {myQuote.priced.map((p, i) => <li key={i}>{p.words}: the others' bits after it about {p.want === null ? "unknown" : bitsText(p.want)} (≈)</li>)}
        </ul>
      )}
      <ObjectLocks objectId={objectId} noun={word.one} retired={o.retiredAt !== undefined} />
      <button type="button" className="mr-4 text-xs underline underline-offset-4" data-testid="button-open-what-if" onClick={() => void (onReps ? focusOn.run({ objectId, show: false }) : Promise.resolve()).then(() => openPane("what-if")).catch(failed("What if did not open"))}>
        Try a change on this {word.one}
      </button>
      {/* A deal, one press from the line it is about: the forge opens with the leave-alone control filled in. */}
      {(agents?.length ?? 0) > 0 && !replaying && header?.phase !== "ended" && o.retiredAt === undefined && (
        <button type="button" className="mr-4 text-xs underline underline-offset-4" data-testid="button-leave-here"
          onClick={() => void requestForge({ kind: "leave", numbers: [o.number] }, openPane)}>Leave this {word.one} alone</button>
      )}
      {pinned !== active && pin.available && (
        <button type="button" className="text-xs underline underline-offset-4" data-testid="button-pin-representation"
          onClick={() => void pin.run({ rep: active, family: rule.family.id }).catch(failed(`${word.Many} did not change`))}>
          Draw every {word.one} in {word.Many} this way ({shortTitle(representation(rule.type, active).title)})
        </button>
      )}
    </div>
  );
}

/** An object's detail with its own representation choice (the hover overlay, components/object-hover.tsx). */
export function ObjectDetail({ objectId }: { objectId: string }) {
  const [reps, setReps] = useState<string[]>([]);
  return <FocusedLine objectId={objectId} reps={reps} onReps={setReps} />;
}

export function LinePane() {
  const focus = useView().focus;
  const word = objectWord(useGame()?.variant);
  if (!focus) return <p className="p-4 text-sm text-muted-foreground" data-testid="line-empty">Pick a {word.one} in {word.Many} to see it here.</p>;
  return <FocusedLine key={focus.objectId} objectId={focus.objectId} reps={focus.reps} />;
}
