/**
 * What would this move do to my points? Pick one of your top lines and a mutator, type its arguments, and see the
 * result worked out in the browser by your own rule (the same engine code the server scores with), with what the
 * move would cost. Nothing is sent. The others' want after a move cannot be known (their rules are secret), so the
 * points after assume it stays as it is now.
 */
import { useMemo, useState } from "react";
import { decodeState, definePanel, fmtBits, fmtNum, mutatorChoices, pointsText, useGame, useMyObjects, useMyRule, useObjectIds, whatIf } from "@sdk";

export default definePanel({
  title: "What would this move do?",
  placement: "right",
  size: "lg",
  Component() {
    const my = useMyRule();
    const variant = useGame()?.variant;
    const ids = useObjectIds("points", 10);
    const objects = useMyObjects(ids.results.map(o => o.objectId));
    const [pick, setPick] = useState(0);
    const choices = useMemo(() => (my?.rule ? mutatorChoices(my.rule.variant) : []), [my?.rule]);
    const [mutator, setMutator] = useState<string>();
    const [args, setArgs] = useState("{}");
    const target = objects[pick] ?? objects[0];
    const choice = choices.find(c => c.id === mutator) ?? choices[0];
    const out = useMemo(() => {
      if (!my?.rule || !target || !choice) return undefined;
      let parsed: Record<string, string>;
      try { parsed = JSON.parse(args) as Record<string, string>; } catch (e) { return { ok: false as const, reason: (e as Error).message }; }
      return whatIf({ rule: my.rule, state: decodeState(target.state, variant), call: { mutator: choice.id, args: parsed }, value: my.bits, want: target.value?.want ?? null });
    }, [my, target, choice, args, variant]);
    if (!my?.rule || !target) return <p className="text-xs italic opacity-60">{my === undefined || ids.isLoading ? "Loading…" : "No lines yet."}</p>;
    return (
      <div className="space-y-2 text-xs" data-testid="example-what-if">
        <label className="block">line{" "}
          <select value={pick} onChange={e => setPick(Number(e.target.value))} className="border bg-transparent px-1">
            {objects.map((o, i) => o && <option key={o.objectId} value={i}>#{o.number} ({o.value ? pointsText(o.value.points) : "…"})</option>)}
          </select>
        </label>
        <label className="block">move{" "}
          <select value={choice?.id} onChange={e => setMutator(e.target.value)} className="border bg-transparent px-1">
            {choices.map(c => <option key={c.id} value={c.id}>{c.id}: {c.title}</option>)}
          </select>
        </label>
        <label className="block">arguments (JSON; {choice?.args.map(a => `${a.name}: ${a.hint}`).join("; ") || "none"})
          <textarea value={args} onChange={e => setArgs(e.target.value)} rows={2} className="mt-1 w-full border bg-transparent p-1 font-mono" />
        </label>
        {!out ? null : !out.ok ? <p className="text-destructive" data-testid="example-what-if-refused">{out.reason}</p> : (
          <p className="tabular-nums" data-testid="example-what-if-result">
            {out.what}: your bits {fmtBits(out.from.rarity ?? 0)} → <b>{fmtBits(out.to.rarity ?? 0)}</b>
            {out.to.points !== null && <>, points {pointsText(out.from.points ?? 0)} → <b>{pointsText(out.to.points)}</b></>}; an agent would spend {fmtNum(out.charge)} energy.
          </p>
        )}
      </div>
    );
  },
});
