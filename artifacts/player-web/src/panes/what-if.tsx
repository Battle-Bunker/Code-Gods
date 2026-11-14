/**
 * What if (the `what-if` pane, integration plan §1.6): pick a change and its numbers, and see the line it would make,
 * your rule's step, rarity in bits and points after it, and what an agent would spend on it, without changing anything. It
 * works on the line in focus (`view.focus`, set by Lines, One line, the palette or an assistant) and is worked out in
 * the browser by the same engine host as the server's `rep.mutators`, `object.quote` and `object.score`
 * (./what-if-model.ts); the line and its value are the shared live subscriptions the other panes use.
 */
import { useMemo, useState } from "react";
import { ObjectChip } from "@workspace/v2-views";
import type { Score } from "@workspace/v2-core";
import { decodeState, objectWord, useGame, useGameScope, useMyObject, useMyRule, type GameRule, type MyRule } from "@/sdk";
import { useView } from "@/core/affordance-runtime";
import { bitsText, chanceText, energyText, pointsText } from "@/core/words";
import { argError, mutatorChoices, standing, whatIf, wireNumber, type MutatorChoice } from "./what-if-model";

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

function Tryout({ rule, my, state, want, sites }: { rule: GameRule; my: MyRule; state: unknown; want: number | null; sites: number }) {
  const choices = useMemo(() => mutatorChoices(rule.variant), [rule.variant]);
  const [id, setId] = useState(choices[0]!.id);
  const choice = choices.find(c => c.id === id) ?? choices[0]!;
  const [args, setArgs] = useState<Record<string, string>>(() => defaults(choice));
  const [site, setSite] = useState(0);
  const pick = (next: string) => { const c = choices.find(x => x.id === next)!; setId(next); setArgs(defaults(c)); };
  const bad = choice.args.flatMap(a => (a.kind === "number" ? [[a.name, argError(args[a.name] ?? "", a.fractions)] as const] : [])).find(([, e]) => e) ?? null;
  const bits = useMemo(() => (my.value ? (u: Score) => my.value!(u).bits : null), [my.value]);
  // The line as it is now, worked out once per line rather than once per keystroke.
  const before = useMemo(() => { try { return standing(rule, state, bits, want); } catch { return undefined; } }, [rule, state, bits, want]);
  const out = useMemo(() => {
    if (bad) return null;
    const wire = Object.fromEntries(choice.args.map(a => [a.name, a.kind === "number" ? wireNumber(args[a.name] ?? "") : args[a.name] ?? ""]));
    return whatIf({ rule, state, call: { mutator: choice.id, site, args: wire }, value: bits, want }, before);
  }, [rule, state, choice, args, site, bits, want, bad?.[1], before]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = [...new Set(choices.map(c => c.repTitle))];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted-foreground">Change</span>
          <select value={choice.id} onChange={e => pick(e.target.value)} className={`${field} max-w-full`} data-testid="select-what-if-change">
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
            <select value={site} onChange={e => setSite(Number(e.target.value))} className={field} data-testid="select-what-if-site">
              {Array.from({ length: sites }, (_, i) => <option key={i} value={i}>Line {i + 1}</option>)}
            </select>
          </label>
        )}
        {choice.args.map(a => (
          <label key={`${choice.id}:${a.name}`} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-mono">{a.name}</span>
            {a.kind === "choice" ? (
              <select value={args[a.name]} onChange={e => setArgs({ ...args, [a.name]: e.target.value })} className={field} data-testid={`select-what-if-${a.name}`}>
                {a.choices.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : (
              <input value={args[a.name] ?? ""} onChange={e => setArgs({ ...args, [a.name]: e.target.value })} className={`${field} w-24`} inputMode="text"
                aria-invalid={bad?.[0] === a.name || undefined} data-testid={`input-what-if-${a.name}`} />
            )}
          </label>
        ))}
      </div>
      {bad ? <p className="text-sm text-destructive" data-testid="text-what-if-error">{bad[0]}: {bad[1]}</p>
        : out && !out.ok ? <p className="text-sm text-destructive" data-testid="text-what-if-error">This change is not allowed: {out.reason}.</p>
        : out && out.ok ? (
          <div className="space-y-2 border-t pt-3 text-sm" data-testid="what-if-result">
            <p data-testid="text-what-if-after">It would {out.what}: <ObjectChip type={rule.type} state={out.after} sites={sites} /></p>
            <dl className="space-y-1">
              <Delta label="Your rarity" from={out.from.rarity} to={out.to.rarity} fmt={b => `${bitsText(b)} (${chanceText(b)} by chance)`} testId="text-what-if-rarity" />
              <Delta label="Your points on it" from={out.from.points} to={out.to.points} fmt={pointsText} testId="text-what-if-points" />
            </dl>
            {want !== null && <p className="text-xs text-muted-foreground">Points assume the others' bits on this {rule.type.id} stay as they are now ({bitsText(want)}): their rules are secret, so nobody can tell how much they would want it after.</p>}
            <p className="text-xs text-muted-foreground" data-testid="text-what-if-charge">An agent would spend about {energyText(out.charge)} on this change, plus what it reads first.</p>
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
      <Tryout key={objectId} rule={my.rule} my={my} state={state} want={o.value?.want ?? null} sites={sites} />
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
