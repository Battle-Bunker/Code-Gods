/**
 * The interactions of 🫅 Kings and Subjects (./royal_court.ts): operators over the base's vocabulary, `kings` (the king
 * cell of each court) and `subjects` (a court's other three cells), both lists of cells the base card builds.
 *
 * Which of them are dealt, and with which values, is decided by measurement (docs/layered-rules-measurements/
 * royal-court.md, scripts/royal-court-sweep.ts). The ones that are never dealt stay here so the sweep can reproduce the
 * numbers that rejected them; an interaction costs nothing until a value of it is dealt.
 */
import type { Interaction, TierValue } from "../tiers.ts";

const num = (v: TierValue, k: string): number => v[k] as number;

const WALK_TS = (end: string) => `
    const walks = (cell, goal, total) => {
      ${end}
      let found = 0;
      if (cell.row !== goal.row) found += walks(cell.row < goal.row ? cell.down : cell.up, goal, total);
      if (cell.col !== goal.col) found += walks(cell.col < goal.col ? cell.right : cell.left, goal, total);
      return found;
    };`;
const WALK_PY = (end: string) => `
    def walks(cell, goal, total):
        ${end.split("\n").join("\n        ")}
        found = 0
        if cell.row != goal.row:
            found += walks(cell.down if cell.row < goal.row else cell.up, goal, total)
        if cell.col != goal.col:
            found += walks(cell.right if cell.col < goal.col else cell.left, goal, total)
        return found`;

/** Every shortest path (side-by-side steps) between two kings whose numbers, both kings included, add up to x. */
export const kingPaths: Interaction = {
  id: "paths", fn: ["kingPaths", "king_paths"],
  label: v => `paths between kings that add up to ${num(v, "x")}`,
  text: (v, _g, points) => "A path walks from one king to another, moving side by side and always getting closer. "
    + `Each path whose numbers, both kings included, add up to ${num(v, "x")} scores ${points(1)}.`,
  consts: v => [["PATH_TOTAL", num(v, "x")]],
  ts: () => `${WALK_TS(`total += cell.value;
      if (cell.row === goal.row && cell.col === goal.col) return total === PATH_TOTAL ? 1 : 0;`)}
    let paths = 0;
    for (let i = 0; i < kings.length; i++) {
      for (let j = i + 1; j < kings.length; j++) paths += walks(kings[i], kings[j], 0);
    }
    return paths;`,
  py: () => `${WALK_PY(`total += cell.value
if cell.row == goal.row and cell.col == goal.col:
    return 1 if total == PATH_TOTAL else 0`)}
    paths = 0
    for i in range(len(kings)):
        for j in range(i + 1, len(kings)):
            paths += walks(kings[i], kings[j], 0)
    return paths`,
};

/**
 * Pairs of kings joined by at least one shortest path whose numbers strictly between the two kings add up to x; the
 * number of such paths breaks ties (two components). Kings that touch have nothing in between and never count.
 */
const pairsOf = (ranked: boolean): Interaction => ({
  id: ranked ? "pathPairs" : "pairs", fn: ranked ? ["rankedKingPairs", "ranked_king_pairs"] : ["kingPairs", "king_pairs"], ...(ranked ? { arity: 2 } : {}),
  label: v => `pairs of kings with ${num(v, "x")} between them`,
  text: (v, _g, points) => "A path walks from one king to another, moving side by side and always getting closer. "
    + `Each pair of kings with a path whose numbers in between add up to ${num(v, "x")} scores ${points(1)}.`
    + (ranked ? " Among equal counts, more such paths score higher." : ""),
  consts: v => [["BETWEEN_TOTAL", num(v, "x")]],
  ts: () => `${WALK_TS(`if (cell.row === goal.row && cell.col === goal.col) return total === BETWEEN_TOTAL ? 1 : 0;
      total += cell.value;`)}
    let pairs = 0;${ranked ? "\n    let paths = 0;" : ""}
    for (let i = 0; i < kings.length; i++) {
      for (let j = i + 1; j < kings.length; j++) {
        const apart = Math.abs(kings[i].row - kings[j].row) + Math.abs(kings[i].col - kings[j].col);
        const found = apart < 2 ? 0 : walks(kings[i], kings[j], -kings[i].value);
        if (found > 0) pairs += 1;${ranked ? "\n        paths += found;" : ""}
      }
    }
    return ${ranked ? "[pairs, paths]" : "pairs"};`,
  py: () => `${WALK_PY(`if cell.row == goal.row and cell.col == goal.col:
    return 1 if total == BETWEEN_TOTAL else 0
total += cell.value`)}
    pairs = 0${ranked ? "\n    paths = 0" : ""}
    for i in range(len(kings)):
        for j in range(i + 1, len(kings)):
            apart = abs(kings[i].row - kings[j].row) + abs(kings[i].col - kings[j].col)
            found = 0 if apart < 2 else walks(kings[i], kings[j], -kings[i].value)
            if found > 0:
                pairs += 1${ranked ? "\n            paths += found" : ""}
    return ${ranked ? "(pairs, paths)" : "pairs"}`,
});
/** Pairs of kings with x in between, counted once each. */
export const kingPairs = pairsOf(false);
/** The same with the number of such paths as a tie-break (two components). */
export const rankedKingPairs = pairsOf(true);

const ROADS_TS = (same: boolean) => `
    const isSubject = (cell) => subjects.includes(cell);
    const roads = grid.regions((a, b) => isSubject(a) && isSubject(b)${same ? " && a.value === b.value" : ""});`;
const ROADS_PY = (same: boolean) => `
    def joined(a, b):
        return a in subjects and b in subjects${same ? " and a.value == b.value" : ""}
    roads = grid.regions(joined)`;
const roadText = (same: boolean) => (same ? "Subjects showing the same number that touch side by side make a road."
  : "Subjects that touch side by side make a road.");

const exactRoads = (id: string, fn: readonly [string, string], same: boolean): Interaction => ({
  id, fn,
  label: v => `${same ? "same-number roads" : "roads"} of exactly ${num(v, "y")} subjects`,
  text: (v, _g, points) => `${roadText(same)} Each road of exactly ${num(v, "y")} subjects scores ${points(1)}.`,
  consts: v => [["ROAD_LENGTH", num(v, "y")]],
  ts: () => `${ROADS_TS(same)}
    let hits = 0;
    for (const road of roads) {
      if (isSubject(road[0]) && road.length === ROAD_LENGTH) hits += 1;
    }
    return hits;`,
  py: () => `${ROADS_PY(same)}
    hits = 0
    for road in roads:
        if road[0] in subjects and len(road) == ROAD_LENGTH:
            hits += 1
    return hits`,
});
const longestRoad = (id: string, fn: readonly [string, string], same: boolean): Interaction => ({
  id, fn,
  label: () => (same ? "the longest same-number road of subjects" : "the longest road of subjects"),
  text: (_v, _g, points) => `${roadText(same)} Your longest road scores ${points(1)} for each subject in it.`,
  consts: () => [],
  ts: () => `${ROADS_TS(same)}
    let longest = 0;
    for (const road of roads) {
      if (isSubject(road[0]) && road.length > longest) longest = road.length;
    }
    return longest;`,
  py: () => `${ROADS_PY(same)}
    longest = 0
    for road in roads:
        if road[0] in subjects and len(road) > longest:
            longest = len(road)
    return longest`,
});

/** Roads of subjects (any numbers) of exactly y cells. */
export const subjectRoads = exactRoads("roads", ["subjectRoads", "subject_roads"], false);
/** Roads of subjects showing one number, of exactly y cells. */
export const twinRoads = exactRoads("sameRoads", ["twinRoads", "twin_roads"], true);
/** The owner's literal form: the longest road of subjects, scored by its length (measured: a plateau). */
export const longRoad = longestRoad("longestRoad", ["longestRoad", "longest_road"], false);
/** The longest road of subjects showing one number, scored by its length. */
export const longTwinRoad = longestRoad("sameRoad", ["longestTwinRoad", "longest_twin_road"], true);

export const COURT_INTERACTIONS: readonly Interaction[] = [kingPaths, kingPairs, rankedKingPairs, subjectRoads, twinRoads, longRoad, longTwinRoad];
