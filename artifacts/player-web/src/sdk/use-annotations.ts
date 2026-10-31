/**
 * `useAnnotations(objects, { utility })`: the annotation of your own utility for each object (which cells, digits or
 * characters make up your score), for `ObjectView`'s `annotations` prop. The family's own annotator when it has one
 * (@workspace/game-utilities `annotatorFor`), else the generic sensitivity analysis of ./annotate.ts through the local
 * evaluator, which then loads (it also loads for a defence goal, whose feeding cells are added to a family's own marks;
 * a family with its own annotator and no defence goal never loads it).
 *
 * Computed lazily for the objects passed in (pass the rows a panel shows, not the whole world), in idle time, a cell at a
 * time, never during a render; cached per game, player and value, so an object is annotated once however often it
 * re-renders. Objects appear in the map as their annotations become ready.
 */
import { useEffect, useMemo, useState } from "react";
import { instantiate, type Instantiation, type ObjectValue } from "@workspace/game-types";
import { annotatorFor, type Annotation, type UtilityDescriptor } from "@workspace/game-utilities";
import { useEvaluator, useMyUtility } from "./hooks";
import { AnnotationCache, annotateJob, annotationKey, runWhenIdle, type Job } from "./annotate";

/** Whose utility to annotate: your own, or none (annotations off). */
export type AnnotateMode = "mine" | "none";

const cache = new AnnotationCache(4000);
const NONE: ReadonlyMap<string, readonly Annotation[]> = new Map();

export function useAnnotations(objects: readonly { id: string; value: ObjectValue }[], { utility = "mine" }: { utility?: AnnotateMode } = {}): ReadonlyMap<string, readonly Annotation[]> {
  const mine = useMyUtility();
  const on = utility === "mine" && !!mine;
  const descriptor = mine?.utility as UtilityDescriptor | undefined;
  const annotator = on && descriptor ? annotatorFor(descriptor.familyId) : undefined;
  const evaluator = useEvaluator({ enabled: on && (!annotator || !!descriptor?.penalty) });
  const settings = mine?.settings as { objectType: string; typeArgs?: Record<string, number | string> } | undefined;
  const inst = useMemo((): Instantiation | undefined => {
    try { return settings ? instantiate(settings.objectType, settings.typeArgs ?? {}) : undefined; } catch { return undefined; }
  }, [settings?.objectType, JSON.stringify(settings?.typeArgs ?? null)]);
  // The game and whose utility: a cached annotation never describes another player's goal.
  const scope = mine ? `${mine.gameId}:${mine.godId}` : "";
  const annotate = useMemo(() => {
    if (!on || !descriptor || !inst || (!annotator && !evaluator)) return null;
    // A family's own annotator draws at once; with a defence goal it waits for the evaluator to add the goal's cells.
    if (annotator && descriptor.penalty && !evaluator) return null;
    const score = evaluator ? (v: ObjectValue) => evaluator.score(v).netBits : undefined;
    const penalty = evaluator ? (v: ObjectValue) => evaluator.score(v).penaltyBits ?? 0 : undefined;
    return (value: ObjectValue) => annotateJob(value, { descriptor, inst, annotator, score, penalty });
  }, [on, descriptor, inst, annotator, evaluator]);

  const [version, setVersion] = useState(0);
  // The values asked for (not what is cached), so finishing one does not restart the run.
  const values = useMemo(() => [...new Set(objects.map(o => o.value))], [objects]);
  const requested = values.map(String).join("\n");
  useEffect(() => {
    if (!annotate) return;
    const missing = values.filter(v => !cache.has(annotationKey(scope, v)));
    if (!missing.length) return;
    const steps = missing.map(value => {
      let job: Job<Annotation[]> | null = null;
      return () => {
        const key = annotationKey(scope, value);
        if (cache.has(key)) return true;
        try {
          job ??= annotate(value);
          if (!job.step()) return false;
          cache.set(key, job.result());
        } catch (error) {
          console.warn("[sdk] annotation failed:", error);
          cache.set(key, []);
        }
        return true;
      };
    });
    return runWhenIdle(steps, { onBatch: () => setVersion(v => v + 1) });
    // `requested` stands for `values` (a new array whenever the objects re-render).
  }, [annotate, scope, requested]);

  return useMemo(() => {
    if (!annotate) return NONE;
    const out = new Map<string, readonly Annotation[]>();
    for (const o of objects) {
      const hit = cache.get(annotationKey(scope, o.value));
      if (hit?.length) out.set(o.id, hit);
    }
    return out;
  }, [objects, annotate, scope, version]);
}
