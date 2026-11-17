/**
 * What if (the `what-if` pane, integration plan §1.6): pick a change and its numbers, and see the line it would make,
 * your rule's step, rarity in bits and points after it, and what an agent would spend on it, without changing anything. It
 * works on the line in focus (`view.focus`, set by Lines, One line, the palette or an assistant) and is worked out in
 * the browser by the same engine host as the server's `rep.mutators`, `object.quote` and `object.score`
 * (./what-if-model.ts); the line and its value are the shared live subscriptions the other panes use.
 */
import { useMemo, useState } from "react";
import { MoveSketch, ObjectChip } from "@workspace/v2-views";
import { LENSES, type LineState } from "@workspace/v2-linear";
import { decodeState, objectWord, useGame, useGameScope, useMyObject, useMyRule, type GameRule, type MyRule } from "@/sdk";
import { useView } from "@/core/affordance-runtime";
import { bitsText, chanceText, energyText, pointsText } from "@/core/words";
import { LockWarning } from "./lock-warning";
import { formError, mutatorChoices, standing, whatIf, wireArgs, type MutatorChoice } from "./what-if-model";

const field = "h-9 min-w-0 border bg-background px-2 text-sm";

const defaults = (c: MutatorChoice): Record<string, string> => Object.fromEntries(c.args.map(a => [a.name, a.start]));

function Delta({ label, from, to, fmt, testId }: { label: string; from: number | null; to: number | null; fmt: (x: number) => string; testId: string }) {
  if (from === null || to === null) return null;
  const dir = to > from ? "up" : to < from ? "down" : "same";
  return (
    <div className="flex flex-wrap items-baseline gap-x-2" data-testid={testId} data-dir={dir}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{fmt(from)} → <b className={dir === "up" ? "text-primary" : dir === "down" ? "text-destructive" : ""}>{fmt(to)}</b></dd>
    </div>
  );
}

/** The names of what a lens move's "at" picks: the lens's numbers, or its fractions for a swap or a round. */
function atNames(move: string, lensId: string): string[] | null {
  const lens = LENSES.find(l => l.id === lensId);
  if (!lens) return null;
  if (move === "swap" || move === "round") return lens.pairs.map(([t]) => lens.names[t]!.replace(/ top$/, ""));
  return [...lens.names];
}

function Tryout({ rule, my, state, want, sites, testPrefix = "", objectId }: { rule: GameRule; my: MyRule; state: unknown; want: number | null; sites: number; testPrefix?: string; objectId?: string }) {
  const tid = (id: string) => (testPrefix ? id.replace("what-if-", `what-if-${testPrefix}`) : id);
  const choices = useMemo(() => mutatorChoices(rule.variant), [rule.variant]);
  const [id, setId] = useState(choices[0]!.id);
  const choice = choices.find(c => c.id === id) ?? choices[0]!;
  const [args, setArgs] = useState<Record<string, string>>(() => defaults(choice));
  const [site, setSite] = useState(0);
  // The moves already in this turn (one lens per turn); the form adds the next.
  const [steps, setSteps] = useState<{ mutator: string; site: number; args: Record<string, string> }[]>([]);
  const pick = (next: string) => { const c = choices.find(x => x.id === next)!; setId(next); setArgs(defaults(c)); };
  const bad = formError(choice.args, args);
  const bits = my.bits;
  // The line as it is now, worked out once per line rather than once per keystroke.
  const before = useMemo(() => { try { return standing(rule, state, bits, want); } catch { return undefined; } }, [rule, state, bits, want]);
  const out = useMemo(() => {
    if (bad) return null;
    const wire = wireArgs(choice.args, args);
    return whatIf({ rule, state, steps, call: { mutator: choice.id, site, args: wire }, value: bits, want }, before);
  }, [rule, state, choice, args, site, bits, want, bad?.[1], before, steps]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = [...new Set(choices.map(c => c.repTitle))];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted-foreground">Change</span>
          <select value={choice.id} onChange={e => pick(e.target.value)} className={`${field} max-w-full`} data-testid={tid("select-what-if-change")}>
            {groups.map(g => (
              <optgroup key={g} label={g}>
                {choices.filter(c => c.repTitle === g).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {sites > 1 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Which line</span>
            <select value={site} onChange={e => setSite(Number(e.target.value))} className={field} data-testid={tid("select-what-if-site")}>
              {Array.from({ length: sites }, (_, i) => <option key={i} value={i}>Line {i + 1}</option>)}
            </select>
          </label>
        )}
        {choice.args.map(a => (
          <label key={`${choice.id}:${a.name}`} className="flex max-w-[16rem] flex-col gap-1">
            <span className="text-xs text-muted-foreground" data-testid={tid(`label-what-if-${a.name}`)}>{a.label}</span>
            {a.name === "at" && args.lens && atNames(choice.id, args.lens) ? (
              <select value={args.at} onChange={e => setArgs({ ...args, at: e.target.value })} className={field} data-testid={tid("select-what-if-at")}>
                {atNames(choice.id, args.lens)!.map((n, i) => <option key={n} value={String(i + 1)}>{n}</option>)}
              </select>
            ) : a.kind === "choice" ? (
              <select value={args[a.name]} onChange={e => setArgs({ ...args, [a.name]: e.target.value })} className={field} data-testid={tid(`select-what-if-${a.name}`)}>
                {a.choices.map(v => <option key={v} value={v}>{a.choiceWords?.[v] ?? v}</option>)}
              </select>
            ) : (
              <input value={args[a.name] ?? ""} onChange={e => setArgs({ ...args, [a.name]: e.target.value })} className={`${field} w-28`} inputMode="text" placeholder={a.optional ? "or leave empty" : undefined}
                aria-invalid={bad?.[0] === a.name || undefined} aria-describedby={a.hint ? `hint-what-if-${testPrefix}${a.name}` : undefined} data-testid={tid(`input-what-if-${a.name}`)} />
            )}
            {a.hint && a.kind !== "choice" && <span id={`hint-what-if-${testPrefix}${a.name}`} className="text-[11px] leading-snug text-muted-foreground" data-testid={tid(`hint-what-if-${a.name}`)}>{a.hint}</span>}
          </label>
        ))}
      </div>
      {bad ? <p className="text-sm text-destructive" data-testid={tid("text-what-if-error")}>{choice.args.find(x => x.name === bad[0])?.label ?? bad[0]}: {bad[1]}</p>
        : out && !out.ok ? <p className="text-sm text-destructive" data-testid={tid("text-what-if-error")}>This change is not allowed: {out.reason}.</p>
        : out && out.ok ? (
          <div className="space-y-2 border-t pt-3 text-sm" data-testid={tid("what-if-result")}>
            <div className="flex flex-wrap gap-3 text-xs">
              <button type="button" className="underline underline-offset-4" onClick={() => setSteps([...steps, { mutator: choice.id, site, args: wireArgs(choice.args, args) }])} data-testid={tid("button-what-if-add-step")}>Add another move to this turn</button>
              {steps.length > 0 && <button type="button" className="underline underline-offset-4" onClick={() => setSteps([])} data-testid={tid("button-what-if-clear-steps")}>Start the turn again ({steps.length} move{steps.length === 1 ? "" : "s"} before this one)</button>}
            </div>
            <p data-testid={tid("text-what-if-after")}>It would {out.what}: <ObjectChip type={rule.type} state={out.after} sites={sites} /></p>
            {/* A lens move (turn, fold, swap, lean, zoom) drawn on the plane and said in plain words; other moves draw nothing. */}
            {rule.type.id === "line" && (
              <MoveSketch before={(state as LineState).lines[site]!} after={(out.after as LineState).lines[site]!} call={{ mutator: choice.id, args: wireArgs(choice.args, args) }} />
            )}
            <dl className="space-y-1">
              <Delta label="Your energy" from={out.from.rarity} to={out.to.rarity} fmt={b => bitsText(b)} testId={tid("text-what-if-rarity")} />
              <Delta label="Your points on it" from={out.from.points} to={out.to.points} fmt={pointsText} testId={tid("text-what-if-points")} />
            </dl>
            {want !== null && <p className="text-xs text-muted-foreground">Points assume the others' bits on this {rule.type.id} stay as they are now ({bitsText(Math.max(0, want))}): their rules are secret, so nobody can tell how much they would want it after.</p>}
            <p className="text-xs text-muted-foreground" data-testid={tid("text-what-if-charge")}>This turn costs {energyText(out.charge)}: {out.naming.toFixed(1)} bits to name its moves and {out.surprise.toFixed(1)} bits of surprise (an agent pays this plus what it reads first).</p>
            {objectId && !testPrefix && <LockWarning objectId={objectId} call={{ mutator: choice.id, site, args: wireArgs(choice.args, args) }} noun={rule.type.id} />}
          </div>
        ) : null}
    </div>
  );
}

function FocusedTryout({ objectId }: { objectId: string }) {
  const o = useMyObject(objectId);
  const my = useMyRule();
  const variant = useGame()?.variant;
  const word = objectWord(variant);
  const [compare, setCompare] = useState(false);
  const state = useMemo(() => (o ? decodeState(o.state, variant) : null), [o?.state, variant]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!o || !state || !my) return <p className="p-4 text-sm text-muted-foreground">Loading this {word.one}…</p>;
  if (!my.rule) return <p className="p-4 text-sm text-muted-foreground">This version of the app cannot work out your rule yet: reload the page to update it.</p>;
  const sites = my.rule.type.sites(state, my.rule.variant);
  return (
    <div className="space-y-3 p-3" data-testid="what-if" data-line={o.number}>
      <div className="space-y-1 text-sm">
        <p><span className="font-semibold">{word.One} {o.number}</span>: <ObjectChip type={my.rule.type} state={state} sites={sites} /></p>
        <p className="text-xs text-muted-foreground">Try a change to see what it would do. Nothing happens to the {word.one}: only agents change {word.many}.</p>
      </div>
      <Tryout key={objectId} rule={my.rule} my={my} state={state} want={o.value?.want ?? null} sites={sites} objectId={objectId} />
      {/* v1's "Compared with": a second change tried on the same line, under the first. */}
      {compare ? (
        <section className="space-y-2 border-t pt-3" data-testid="what-if-compared">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Compared with</h3>
            <button type="button" className="text-xs underline underline-offset-4" onClick={() => setCompare(false)} data-testid="button-what-if-compare-off">Stop comparing</button>
          </div>
          <Tryout key={`${objectId}:compare`} rule={my.rule} my={my} state={state} want={o.value?.want ?? null} sites={sites} testPrefix="compare-" />
        </section>
      ) : (
        <button type="button" className="text-xs underline underline-offset-4" onClick={() => setCompare(true)} data-testid="button-what-if-compare">Compare with another change</button>
      )}
    </div>
  );
}

export function WhatIfPane() {
  const { seated } = useGameScope();
  const focus = useView().focus;
  const word = objectWord(useGame()?.variant);
  if (!seated) return <p className="p-4 text-sm text-muted-foreground" data-testid="what-if-none">You hold no rule in this game, so there is no score to try changes on.</p>;
  if (!focus) return <p className="p-4 text-sm text-muted-foreground" data-testid="what-if-empty">Pick a {word.one} in {word.Many}, then try a change on it here.</p>;
  return <FocusedTryout key={focus.objectId} objectId={focus.objectId} />;
}
