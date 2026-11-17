/**
 * Your secret goal (the `my-card` pane): the dealt rule's card in plain words; the line in your focus explained first
 * (its parts on their rulers, the moves that would make it rarer: docs/engine-v2/annotations-design.md, owner decision
 * 23: no steps); then a worked example (the family's own, else the most legible from a seeded walk: lib/v2-views example.ts); and the rule's
 * parts named "(main part, tie-breaker)" (ux-lessons 2.6).
 */
import { RuleCode } from "@/components/rule-code";
import { useMemo, useState } from "react";
import { DriftOnCard } from "./drift";
import { GoalCard, randomExample, rarityScale, workedExample } from "@workspace/v2-views";
import { lineFromInputs, stateFromWire } from "./example-edit";
import type { Score } from "@workspace/v2-core";
import { decodeState, objectWord, useGame, useGameScope, useMyObject, useMyRule, type GameRule } from "@/sdk";
import { useView } from "@/core/affordance-runtime";
import { partsNote } from "./lines";

/** The line in the human's focus (Lines, One line, the palette), decoded, with its name: "Line 7". */
function useFocusedMine(): { state: unknown; name: string } | null {
  const focus = useView().focus;
  const header = useGame();
  const o = useMyObject(focus?.objectId);
  const state = useMemo(() => (focus && o ? decodeState(o.state, header?.variant) : null), [focus, o?.state, header?.variant]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!focus || !o || !state) return null;
  const word = objectWord(header?.variant);
  return { state, name: `${word.One} ${o.number}` };
}

/** v1's ✏️ Edit: a line by its gradient and intercept; any other object by its rows as written. */
function ExampleEditor({ rule, onChange }: { rule: GameRule; onChange: (s: unknown) => void }) {
  const isLine = rule.type.id === "line";
  const [m, setM] = useState("1"), [c, setC] = useState("0");
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const apply = () => {
    const s = isLine ? lineFromInputs(m, c) : stateFromWire(rule.type as never, rule.variant, text);
    setBad(s === null);
    if (s !== null) onChange(s);
  };
  const field = "w-20 rounded border bg-background px-1 py-0.5 text-foreground";
  return (
    <form className="flex flex-wrap items-center gap-2 text-xs" onSubmit={e => { e.preventDefault(); apply(); }} data-testid="form-edit-example">
      {isLine ? (<>
        <label>y = <input className={field} value={m} onChange={e => setM(e.target.value)} aria-label="Gradient" data-testid="input-example-m" /></label>
        <label>x + <input className={field} value={c} onChange={e => setC(e.target.value)} aria-label="Intercept" data-testid="input-example-c" /></label>
      </>) : (
        <label>Rows <input className="w-48 rounded border bg-background px-1 py-0.5 font-mono text-foreground" value={text} placeholder={rule.type.encode(rule.type.origin(rule.variant))} onChange={e => setText(e.target.value)} data-testid="input-example-wire" /></label>
      )}
      <button type="submit" className="border px-2 py-0.5" data-testid="button-apply-example">Show it</button>
      {bad && <span className="text-destructive" role="alert">{isLine ? "Write whole numbers or fractions, like −2 or 1/2." : "Write it as the placeholder shows, one digit a cell."}</span>}
    </form>
  );
}

function Card({ rule, parts, value }: { rule: GameRule; parts: number; value: ((u: Score) => number) | null }) {
  const worked = useMemo(() => workedExample(rule, value), [rule, value]);
  // v1's example: randomised or edited by the player, the worked one until then.
  const [own, setOwn] = useState<unknown>(null);
  const [editing, setEditing] = useState(false);
  const example = own ?? worked;
  const scale = useMemo(() => rarityScale(rule, value, 6), [rule, value]);
  const tools = (
    <div className="space-y-1.5" data-testid="example-tools">
      <div className="flex gap-2 text-xs">
        <button type="button" className="border px-2 py-0.5 hover:bg-muted" data-testid="button-randomise-example" onClick={() => setOwn(randomExample(rule, Math.floor(Math.random() * 2 ** 31)))}>Randomise</button>
        <button type="button" className="border px-2 py-0.5 hover:bg-muted" aria-expanded={editing} data-testid="button-edit-example" onClick={() => setEditing(e => !e)}>{editing ? "Done editing" : "Edit"}</button>
        {own !== null && <button type="button" className="px-1 underline underline-offset-4" onClick={() => setOwn(null)} data-testid="button-reset-example">Back to the worked example</button>}
      </div>
      {editing && <ExampleEditor rule={rule} onChange={setOwn} />}
    </div>
  );
  const mine = useFocusedMine();
  const word = objectWord(rule.variant.id);
  const note = partsNote(parts, word.one, word.many);
  return (
    <div className="space-y-2 p-3" data-testid="goal-card">
      <GoalCard rule={rule} example={example} mine={mine} value={value ?? undefined} exampleOpen={false} exampleTools={tools} scale={scale} />
      <RuleCode familyId={rule.family.id} params={rule.params} />
      {/* How the parts rank, behind "more" (round 27: the card read 52 words before anything else). */}
      {note && (
        <details className="text-xs text-muted-foreground" data-testid="details-rule-parts">
          <summary className="cursor-pointer">More about your rule</summary>
          <p className="mt-1" data-testid="text-rule-parts">{note}</p>
        </details>
      )}
    </div>
  );
}

function SeatedCard() {
  const my = useMyRule();
  if (!my) return <p className="p-4 text-sm text-muted-foreground">Dealing your rule…</p>;
  if (!my.rule) {
    // A deploy ahead of this page: the server's own words, without the drawings.
    return (
      <div className="space-y-1 p-4 text-sm" data-testid="goal-card">
        <p className="font-semibold">{my.row.title}</p>
        <p>{my.row.card}</p>
        <p className="text-muted-foreground" data-testid="text-rule-retired">This game's rule has since been retired from the game: its drawing and scores are no longer available.</p>
      </div>
    );
  }
  return (<>
    <DriftOnCard />
    <Card rule={my.rule} parts={my.row.layers.length} value={my.bits} />
  </>);
}

export function MyCardPane() {
  return useGameScope().seated ? <SeatedCard /> : <p className="p-4 text-sm text-muted-foreground" data-testid="goal-card-none">You hold no rule in this game.</p>;
}
