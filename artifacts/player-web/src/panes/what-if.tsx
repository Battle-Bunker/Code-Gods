/**
 * What if (the `what-if` pane, integration plan §1.6): pick a change and its numbers, and see the line it would make,
 * your rule's step, ✨ rarity and points after it, and what an agent would spend on it, without changing anything. It
 * works on the line in focus (`view.focus`, set by Lines, One line, the palette or an assistant) and is worked out in
 * the browser by the same engine host as the server's `rep.mutators`, `object.quote` and `object.score`
 * (./what-if-model.ts); the line and its value are the shared live subscriptions the other panes use.
 */
import { useMemo, useState } from "react";
import { ObjectChip } from "@workspace/v2-views";
import { lineType, type LineState } from "@workspace/v2-linear";
import { decodeState, useGameScope, useMyObject, useMyRule, type LineRule, type MyRule } from "@/sdk";
import { useView } from "@/core/affordance-runtime";
import { energyText, one, pointsText, rarityText } from "@/core/words";
import { argError, mutatorChoices, whatIf, wireNumber, type MutatorChoice } from "./what-if-model";

const field = "h-9 min-w-0 border bg-background px-2 text-sm";

function defaults(c: MutatorChoice): Record<string, string> {
  return Object.fromEntries(c.args.map(a => [a.name, a.kind === "choice" ? a.choices![0]! : "1"]));
}

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

function Tryout({ rule, my, state, want, sites }: { rule: LineRule; my: MyRule; state: LineState; want: number | null; sites: number }) {
  const choices = useMemo(() => mutatorChoices(rule.variant), [rule.variant]);
  const [id, setId] = useState(choices[0]!.id);
  const choice = choices.find(c => c.id === id) ?? choices[0]!;
  const [args, setArgs] = useState<Record<string, string>>(() => defaults(choice));
  const [site, setSite] = useState(0);
  const pick = (next: string) => { const c = choices.find(x => x.id === next)!; setId(next); setArgs(defaults(c)); };
  const bad = choice.args.filter(a => a.kind === "number").map(a => [a.name, argError(args[a.name] ?? "", rule.variant)] as const).find(([, e]) => e);
  const out = useMemo(() => {
    if (bad) return null;
    const wire = Object.fromEntries(choice.args.map(a => [a.name, a.kind === "number" ? wireNumber(args[a.name] ?? "") : args[a.name] ?? ""]));
    return whatIf({ rule, state, call: { mutator: choice.id, site, args: wire }, rarities: my.rarities, want });
  }, [rule, state, choice, args, site, my.rarities, want, bad]);
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
                {a.choices!.map(v => <option key={v} value={v}>{v}</option>)}
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
            <p data-testid="text-what-if-after">It would {out.what}: <ObjectChip type={lineType} state={out.after} sites={sites} /></p>
            <dl className="space-y-1">
              <Delta label="Your rule" from={out.from.level} to={out.to.level} fmt={l => `step ${l} of ${out.to.top}`} testId="text-what-if-step" />
              <Delta label="✨ rarity" from={out.from.rarity} to={out.to.rarity} fmt={x => rarityText(x).replace("✨ ", "")} testId="text-what-if-rarity" />
              <Delta label="Your points on it" from={out.from.points} to={out.to.points} fmt={pointsText} testId="text-what-if-points" />
            </dl>
            {want !== null && <p className="text-xs text-muted-foreground">Points assume the others want this line as much as now ({one(want)}): their rules are secret, so nobody can tell how much they would want it after.</p>}
            <p className="text-xs text-muted-foreground" data-testid="text-what-if-charge">An agent would spend about {energyText(out.charge)} on this change, plus what it reads first.</p>
          </div>
        ) : null}
    </div>
  );
}

function FocusedTryout({ objectId }: { objectId: string }) {
  const o = useMyObject(objectId);
  const my = useMyRule();
  const state = useMemo(() => (o ? decodeState(o.state) : null), [o?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!o || !state || !my) return <p className="p-4 text-sm text-muted-foreground">Loading this line…</p>;
  if (!my.rule) return <p className="p-4 text-sm text-muted-foreground">This version of the app cannot work out your rule yet: reload the page to update it.</p>;
  const sites = lineType.sites(state, my.rule.variant);
  return (
    <div className="space-y-3 p-3" data-testid="what-if" data-line={o.number}>
      <div className="space-y-1 text-sm">
        <p><span className="font-semibold">Line {o.number}</span>: <ObjectChip type={lineType} state={state} sites={sites} /></p>
        <p className="text-xs text-muted-foreground">Try a change to see what it would do. Nothing happens to the line: only agents change lines.</p>
      </div>
      <Tryout key={objectId} rule={my.rule} my={my} state={state} want={o.value?.want ?? null} sites={sites} />
    </div>
  );
}

export function WhatIfPane() {
  const { seated } = useGameScope();
  const focus = useView().focus;
  if (!seated) return <p className="p-4 text-sm text-muted-foreground" data-testid="what-if-none">You hold no rule in this game, so there is no score to try changes on.</p>;
  if (!focus) return <p className="p-4 text-sm text-muted-foreground" data-testid="what-if-empty">Pick a line in Lines, then try a change on it here.</p>;
  return <FocusedTryout key={focus.objectId} objectId={focus.objectId} />;
}
