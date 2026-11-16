import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = () => gridType.families.find(f => f.id === "constellation")!;
const terms = (s: GridState, star: number) =>
  Object.fromEntries(evaluateSite(gridType, fam(), { star }, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Constellation is registered with v1's star numbers 0 to 9 and one tie-breaker", () => {
  assert.deepEqual(fam().dealable(grid4), Array.from({ length: 10 }, (_, star) => ({ star })));
  assert.deepEqual(fam().tieBreakers.map(t => t.id), ["cluster-reach"]);
});

test("Constellation counts the stars in the biggest cluster; stars touching at a corner join", () => {
  // The 7s: a diagonal of four (rows 1 to 4) and a lone 7 in the top-right corner.
  const s = board("7007", "0700", "0070", "0007");
  assert.deepEqual(terms(s, 7), { stars: 4, "cluster-reach": 4 + 4 });
  assert.deepEqual(terms(s, 0), { stars: 11, "cluster-reach": 8 });
  assert.deepEqual(terms(s, 3), { stars: 0, "cluster-reach": 0 }, "no stars: no cluster");
  // A cluster of 2 (top left) and one of 5 down the right side and round the bottom-right corner: the 5 wins.
  assert.deepEqual(terms(board("5505", "0005", "0005", "0055"), 5), { stars: 5, "cluster-reach": 4 + 2 });
  assert.deepEqual(terms(board("5500", "0005", "0005", "0055"), 5), { stars: 4, "cluster-reach": 3 + 2 });
  // A tie for the biggest: the tie-breaker reads the cluster that reaches further.
  assert.deepEqual(terms(board("0055", "0000", "5000", "0500"), 5), { stars: 2, "cluster-reach": 2 + 2 });
  assert.deepEqual(terms(board("5000", "0500", "0000", "0055"), 5), { stars: 2, "cluster-reach": 2 + 2 });
});

test("Constellation card: v1's words, the dealt number", () => {
  assert.match(fam().card({ star: 4 }, null), /holding 4/);
  assert.match(fam().card({ star: 4 }, null), /even at a corner/);
  assert.match(fam().card({ star: 4 }, "cluster-reach"), /Secondary: .*rows and columns/);
});
