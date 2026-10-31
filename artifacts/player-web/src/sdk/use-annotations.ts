/**
 * `useAnnotations(objects, { utility })`: the annotation of your own utility for each object (which cells, digits or
 * characters make up your score), for `ObjectView`'s `annotations` prop. The family's own annotator when it has one
 * (@workspace/game-utilities `annotatorFor`), else the generic sensitivity analysis of ./annotate.ts through the local
 * evaluator (which then loads; a family with its own annotator never loads it).
 *
 * Computed lazily for the objects passed in (pass the rows a panel shows, not the whole world), in idle time, never
 * during a render; cached per game and value, so an object is annotated once however often it re-renders. Objects
 * appear in the map as their annotations become ready.
 */
import { useEffect, useMemo, useState } from "react";
import { instantiate, type Instantiation, type ObjectValue } from "@workspace/game-types";
import { annotatorFor, type Annotation, type UtilityDescriptor } from "@workspace/game-utilities";
import { useEvaluator, useMyUtility } from "./hooks";
import { AnnotationCache, annotateValue, annotationKey, runWhenIdle } from "./annotate";

/** Whose utility to annotate: your own, or none (annotations off). */
export type AnnotateMode = "mine" | "none";

const cache = new AnnotationCache(4000);
const NONE: ReadonlyMap<string, readonly Annotation[]> = new Map();

export function useAnnotations(objects: readonly { id: string; value: ObjectValue }[], { utility = "mine" }: { utility?: AnnotateMode } = {}): ReadonlyMap<string, readonly Annotation[]> {
  const mine = useMyUtility();
  const on = utility === "mine" && !!mine;
  const descriptor = mine?.utility as UtilityDescriptor | undefined;
  const annotator = on && descriptor ? annotatorFor(descriptor.familyId) : undefined;
  const evaluator = useEvaluator({ enabled: on && !annotator });
  const settings = mine?.settings as { objectType: string; typeArgs?: Record<string, number | string> } | undefined;
  const inst = useMemo((): Instantiation | undefined => {
    try { return settings ? instantiate(settings.objectType, settings.typeArgs ?? {}) : undefined; } catch { return undefined; }
  }, [settings?.objectType, JSON.stringify(settings?.typeArgs ?? null)]);
  const gameId = mine?.gameId ?? "";
  const annotate = useMemo(() => {
    if (!on || !descriptor || !inst || (!annotator && !evaluator)) return null;
    const score = evaluator ? (v: ObjectValue) => evaluator.score(v).netBits : undefined;
    return (value: ObjectValue) => annotateValue(value, { descriptor, inst, annotator, score });
  }, [on, descriptor, inst, annotator, evaluator]);

  const [version, setVersion] = useState(0);
  const missing = useMemo(() => (annotate ? [...new Set(objects.map(o => o.value))].filter(v => !cache.has(annotationKey(gameId, v))) : []),
    [objects, annotate, gameId, version]);
  const pending = missing.map(String).join("\n");
  useEffect(() => {
    if (!annotate || !missing.length) return;
    return runWhenIdle(missing, value => {
      const key = annotationKey(gameId, value);
      if (cache.has(key)) return;
      let marks: Annotation[] = [];
      try { marks = annotate(value); } catch (error) { console.warn("[sdk] annotation failed:", error); }
      cache.set(key, marks);
    }, { onBatch: () => setVersion(v => v + 1) });
    // `pending` stands for `missing` (a new array every render).
  }, [annotate, gameId, pending]);

  return useMemo(() => {
    if (!annotate) return NONE;
    const out = new Map<string, readonly Annotation[]>();
    for (const o of objects) {
      const hit = cache.get(annotationKey(gameId, o.value));
      if (hit?.length) out.set(o.id, hit);
    }
    return out;
  }, [objects, annotate, gameId, version]);
}
