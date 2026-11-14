/**
 * The end summary's tugs of war, one per object (round 8b: grid 24 showed three times under "What cost you", once per
 * episode the act log folds). Pure, so it is unit tested.
 */
export interface TugEpisode<S> {
  readonly number: number; readonly withNames: readonly string[]; readonly flips: number; readonly mySpend: number;
  readonly practice: boolean; readonly best?: { readonly state: S; readonly points: number };
}

/** Episodes on the same object as one: pulls and spend added, everyone named once, the best state kept. */
export function mergeTugs<S>(episodes: readonly TugEpisode<S>[]): TugEpisode<S>[] {
  const by = new Map<number, TugEpisode<S>>();
  for (const e of episodes) {
    const was = by.get(e.number);
    if (!was) { by.set(e.number, { ...e, withNames: [...e.withNames] }); continue; }
    const best = !was.best ? e.best : !e.best ? was.best : e.best.points > was.best.points ? e.best : was.best;
    by.set(e.number, {
      number: e.number, withNames: [...new Set([...was.withNames, ...e.withNames])], flips: was.flips + e.flips,
      mySpend: was.mySpend + e.mySpend, practice: was.practice && e.practice, ...(best ? { best } : {}),
    });
  }
  return [...by.values()];
}
