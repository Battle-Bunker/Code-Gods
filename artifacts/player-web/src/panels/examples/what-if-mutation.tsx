/**
 * What would this mutation do to my score? Pick a live object, write mutator calls, and see the result
 * scored by YOUR utility function in the browser (the same code and calibration tables as the engine),
 * with the act's bit cost. Others' bits on a hypothetical value cannot be known: that stays private.
 */
import { useMemo, useState } from "react";
import { definePanel, Obj, useEvaluator, useMutators, useObjects, fmtBits } from "@sdk";

export default definePanel({
  title: "What would this mutation do?",
  placement: "right",
  size: "lg",
  Component() {
    const objects = useObjects({ hz: 0.5 });
    const evaluator = useEvaluator();
    const { mutators } = useMutators();
    const [objectId, setObjectId] = useState<string>();
    const [calls, setCalls] = useState(`[["${mutators[0]?.id ?? "add"}", {}]]`);
    const target = objects.find(o => o.id === objectId) ?? objects[0];
    const result = useMemo(() => {
      if (!evaluator || !target) return undefined;
      try {
        const parsed = JSON.parse(calls);
        const outcome = evaluator.apply(target.value, parsed);
        if (!outcome.ok) return { error: outcome.reason, cost: outcome.cost.total };
        const before = evaluator.score(target.value), after = evaluator.score(outcome.value);
        return { value: outcome.value, cost: outcome.cost.total, before: before.netBits, after: after.netBits };
      } catch (error) { return { error: (error as Error).message }; }
    }, [evaluator, target, calls]);
    if (!target) return <p className="text-[12px] italic opacity-60">No objects yet.</p>;
    return (
      <div className="space-y-2 text-[12px]" data-testid="example-what-if">
        <label className="block">object{" "}
          <select value={target.id} onChange={e => setObjectId(e.target.value)} className="border bg-transparent px-1">
            {objects.map((o, i) => <option key={o.id} value={o.id}>#{i + 1} (mine {fmtBits(o.own.netBits)})</option>)}
          </select>
        </label>
        <label className="block">calls (JSON, as an agent returns them; mutators: {mutators.map(m => m.id).join(", ")})
          <textarea value={calls} onChange={e => setCalls(e.target.value)} rows={2} className="mt-1 w-full border bg-transparent p-1 font-mono text-[11px]" />
        </label>
        {!evaluator ? <p className="opacity-60">Loading your utility function…</p> : !result ? null : "error" in result ? (
          <p className="text-destructive">{result.error}{result.cost !== undefined ? ` (a failed act still costs ${fmtBits(result.cost)})` : ""}</p>
        ) : (
          <div className="flex items-center gap-3">
            <Obj value={target.value} /> → <Obj value={result.value!} />
            <span className="tabular-nums">my net bits {fmtBits(result.before!)} → <b>{fmtBits(result.after!)}</b> ({result.after! >= result.before! ? "+" : ""}{fmtBits(result.after! - result.before!)}), act costs {fmtBits(result.cost)}</span>
          </div>
        )}
      </div>
    );
  },
});
