/**
 * Object rendering for panels, reusing the engine UI's renderers (lib/object-views): an Int, string or
 * Grid value draws the same way here as everywhere else in the game.
 */
import type { ReactNode } from "react";
import { ObjectView, TransformationView, objectContext, objectNoun, formatBits } from "@workspace/object-views";
import { useMutators } from "./hooks";
import type { LiveObject } from "./hooks";

export { ObjectView, TransformationView, formatBits };

/** Props every ObjectView / TransformationView needs for this game (display tables of the instance). */
export function useObjectContext() {
  const { instance } = useMutators();
  return { ctx: objectContext(instance), noun: objectNoun(instance?.objectType), objectType: instance?.objectType };
}

/** One live object, drawn with this game's renderer. */
export function Obj({ value, title }: { value: LiveObject["value"]; title?: boolean }) {
  const { ctx } = useObjectContext();
  return <ObjectView value={value} {...ctx} showTitle={title} />;
}

/** A wrapping grid of objects with an optional badge (e.g. a number) under each. */
export function ObjectGrid({ objects, badge, onSelect, max = 60 }: {
  objects: readonly Pick<LiveObject, "id" | "value">[]; badge?: (o: any) => ReactNode; onSelect?: (id: string) => void; max?: number;
}) {
  const { ctx } = useObjectContext();
  if (!objects.length) return <p className="text-[12px] italic opacity-60">Nothing to show.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {objects.slice(0, max).map(o => (
        <button key={o.id} type="button" onClick={onSelect ? () => onSelect(o.id) : undefined} disabled={!onSelect}
          className="flex flex-col items-center gap-0.5 border border-[hsl(var(--card-border))] p-1 text-[10px] font-mono disabled:cursor-default">
          <ObjectView value={o.value} {...ctx} />
          {badge && <span>{badge(o)}</span>}
        </button>
      ))}
      {objects.length > max && <span className="self-center text-[11px] opacity-60">+{objects.length - max}</span>}
    </div>
  );
}
