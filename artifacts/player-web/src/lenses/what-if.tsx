/**
 * What if…: what a move would do to your score before anyone makes it, scored by YOUR utility function in the
 * browser (the engine's own code and calibration tables), with the act's cost. The assistant sets it up (an object
 * and the move; optionally a second move to compare, or a raw value to score). Others' reaction is unknowable.
 */
import { useMemo } from "react";
import type { MutatorCallWire } from "@workspace/game-types";
import { Obj, fmtBits, useEvaluator, useObjects, type Evaluator, type LiveObject } from "@/sdk";
import { composer } from "@/core/chat/composer";
import { LensEmpty, Section, TextButton, type LensProps } from "./kit";

type Calls = NonNullable<LensProps<"what-if">["params"]>["calls"];
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** The lens's calls carry argument lists; the engine's wire form is [mutatorId, {named arguments}]. */
const toWire = (calls: Calls): MutatorCallWire[] => calls.map(([id, args]) => [id, Array.isArray(args) && args.length === 1 && isRecord(args[0]) ? args[0] : isRecord(args) ? args : {}] as const);

type Outcome = { error: string; cost?: number } | { value: LiveObject["value"]; cost: number; before: number; after: number };
function tryMove(evaluator: Evaluator, target: LiveObject, calls: Calls): Outcome {
  try {
    const outcome = evaluator.apply(target.value, toWire(calls));
    if (!outcome.ok) return { error: outcome.reason, cost: outcome.cost.total };
    return { value: outcome.value as LiveObject["value"], cost: outcome.cost.total, before: evaluator.score(target.value).netBits, after: evaluator.score(outcome.value).netBits };
  } catch (error) { return { error: (error as Error).message }; }
}

function Result({ label, target, outcome }: { label: string; target: LiveObject; outcome: Outcome }) {
  if ("error" in outcome) return <p className="text-sm text-destructive">{label}: {outcome.error}{outcome.cost !== undefined ? ` (a failed act still costs ${fmtBits(outcome.cost)} bits)` : ""}</p>;
  const delta = outcome.after - outcome.before;
  return (
    <div className="space-y-1">
      <p className="text-sm">{label}: your net bits {fmtBits(outcome.before)} → <b>{fmtBits(outcome.after)}</b> (<span className={delta >= 0 ? "text-[hsl(var(--accent))]" : "text-destructive"}>{delta >= 0 ? "+" : ""}{fmtBits(delta)}</span>), the act costs {fmtBits(outcome.cost)} bits.</p>
      <div className="flex items-center gap-3"><Obj value={target.value} /> <span aria-hidden>→</span> <Obj value={outcome.value} /></div>
    </div>
  );
}

export default function WhatIf({ params }: LensProps<"what-if">) {
  const objects = useObjects({ hz: 0.5 });
  const evaluator = useEvaluator();
  const target = objects.find(o => o.id === params?.objectId);
  const main = useMemo(() => (evaluator && target && params ? tryMove(evaluator, target, params.calls) : undefined), [evaluator, target, params]);
  const alt = useMemo(() => (evaluator && target && params?.compare ? tryMove(evaluator, target, params.compare) : undefined), [evaluator, target, params]);
  const raw = useMemo(() => {
    if (!evaluator || params?.value === undefined) return undefined;
    try { return evaluator.score(params.value as LiveObject["value"]).netBits; } catch (error) { return (error as Error).message; }
  }, [evaluator, params?.value]);

  if (!params) {
    return <LensEmpty action={<TextButton onClick={() => composer.fill("Show me in the What if… view what this move would do: ")}>Ask your assistant to set one up</TextButton>}>
      A what-if needs an object and a move. Your assistant sets them: say which object and what you'd like to try.
    </LensEmpty>;
  }
  if (!target) return <LensEmpty>That object is no longer in the world. Ask your assistant for a new what-if.</LensEmpty>;
  if (!evaluator || !main) return <LensEmpty>Loading your utility function…</LensEmpty>;
  return (
    <div className="space-y-4" data-testid="lens-what-if">
      <Result label={`${params.calls.map(c => c[0]).join(", ")}`} target={target} outcome={main} />
      {alt && params.compare && <Section title="Compared with"><Result label={params.compare.map(c => c[0]).join(", ")} target={target} outcome={alt} /></Section>}
      {raw !== undefined && <p className="text-sm">The value your assistant asked about scores {typeof raw === "number" ? `${fmtBits(raw)} bits` : `nothing: ${raw}`} for you.</p>}
      <p className="text-xs text-muted-foreground">Only your own score can be computed: how the others would value the result is unknowable.</p>
    </div>
  );
}
