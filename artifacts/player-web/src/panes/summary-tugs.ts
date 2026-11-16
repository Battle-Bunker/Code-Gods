/**
 * The end summary's tugs of war, one per object (round 8b: grid 24 showed three times under "What cost you", once per
 * episode the act log folds). Pure, so it is unit tested.
 */
export interface TugEpisode<S> {
  readonly number: number; readonly withNames: readonly string[]; readonly flips: number; readonly mySpend: number;
  readonly practice: boolean; readonly best?: { readonly state: S; readonly points: number };
  /** Only flipped between two states, this many moves (the tick's tug row, #967). */
  readonly cycle?: { readonly moves: number };
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

/** The tick's tug rows (v2/playState:tugs) as the summary's: names, whether every other side is a practice partner, the best state decoded. */
export function tugsFromServer<S>(rows: readonly {
  number: number; flips: number; mySpend: number; others: readonly { memberId: string; name: string }[];
  best: { state: string; points: number } | null; cycle?: { moves: number } | null;
}[], kindOf: (memberId: string) => string | undefined, decode: (state: string) => S): TugEpisode<S>[] {
  return rows.map(r => ({
    number: r.number, withNames: r.others.map(o => o.name), flips: r.flips, mySpend: r.mySpend,
    practice: r.others.length > 0 && r.others.every(o => kindOf(o.memberId) === "practice"),
    ...(r.best ? { best: { state: decode(r.best.state), points: r.best.points } } : {}),
    ...(r.cycle ? { cycle: { moves: r.cycle.moves } } : {}),
  }));
}
