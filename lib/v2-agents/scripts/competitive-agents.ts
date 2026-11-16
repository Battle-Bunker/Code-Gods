/**
 * Measurement agents that play to win (docs/engine-v2/competitive-play.md). Not shipped, not offered to players: each is
 * the shipped Simple starter of the seat's family with its last line (`return climb(...)`) replaced by `compete`, so it
 * sees only what any agent sees in an act: its own rule exactly, the offered object, the others' sum on it as disclosed
 * (worth, othersAfter: priced reads), prices, and its budget. Its player (scripts/competitive.ts) sees the public
 * standings and may rewrite the constants below at the edit price.
 *
 * `compete` values a move by its effect on the seat's standing, not only its points. On the offered object the seat
 * knows its own bits n and the others' sum S (not the split). Its points there are n·S; the others' points there add up
 * to n·S + S² − Σ n_j², estimated with the others' bits split evenly over its R rivals: n·S + S²(1 − 1/R). A move to
 * (n′, S′) is worth
 *
 *   OWN · Δ(mine) − RIVAL · Δ(rivals' points) / R          (a rival's share: rank is decided against one rival)
 *     − FRAGILE · (bits a single step by anyone could knock off the new state) · S′
 *
 * and the seat takes the candidate with the most worth per energy it can pay for (within the starter's allowance), or
 * skips. Candidates: the QUOTES best steps for its rule, plus, when RIVAL > 0 and the object is worth at least TARGET
 * bits to the others, PROBE more steps spread over the rest (each othersAfter is a priced read and a host call).
 *
 * Kinds (constants): naive is the shipped starter itself; mixed OWN 1, RIVAL 1; vandal OWN 0, RIVAL 1 (only damage,
 * only on objects others hold at least TARGET bits on, only a knock of at least KNOCK of their sum); defender OWN 1,
 * RIVAL 0, FRAGILE 0.5; rank (the rank-aware player) starts as mixed and its player sets RIVAL from the standings.
 */

export type CompetitiveKind = "mixed" | "vandal" | "defender" | "rank" | "lookahead";

export interface Knobs { readonly own: number; readonly rival: number; readonly fragile: number; readonly target: number; readonly knock: number; readonly probe: number }
export const KNOBS: Record<Exclude<CompetitiveKind, "lookahead">, Knobs> = {
  mixed: { own: 1, rival: 1, fragile: 0, target: 4, knock: 0, probe: 10 },
  vandal: { own: 0, rival: 1, fragile: 0, target: 8, knock: 0.25, probe: 16 },
  defender: { own: 1, rival: 0, fragile: 0.5, target: Infinity, knock: 0, probe: 0 },
  rank: { own: 1, rival: 1, fragile: 0, target: 4, knock: 0, probe: 10 },
};

const CALL = /  return climb\(offer, options, (score\([^)]*\)), QUOTES\);/;

/** The knob lines a player may rewrite (scripts/competitive.ts finds them by these names). */
export const knobLines = (k: Knobs, rivals: number) =>
  `const OWN = ${k.own}, RIVAL = ${k.rival}, FRAGILE = ${k.fragile}, TARGET = ${Number.isFinite(k.target) ? k.target : 1e9}, KNOCK = ${k.knock}, PROBE = ${k.probe}, RIVALS = ${rivals};`;

/** The `compete` ending for a starter's source: lines (score(m, c, ...)) or grids (score(b, ...)). */
export function competitive(source: string, kind: CompetitiveKind, rivals: number): string {
  if (kind === "lookahead") return lookahead(source);
  const m = CALL.exec(source);
  if (!m) throw new Error("not a points starter: no climb ending");
  const now = m[1]!;
  const grid = now.startsWith("score(b,");
  // Neighbours of a candidate (the knocks any seat could make in one small step), as scores, in the agent's head.
  const around = grid
    ? `t => { const out = []; for (let i = 0; i < 16; i++) for (const k of [-1, 1]) { const x = edit(t[1], [i], () => k); if (x !== t[1]) out.push(${now.replace("(b,", "(x,")}); } return out; }`
    : `t => { const m2 = t[1], c2 = t[2]; if (!Q.isQ(m2)) return []; return [[Q.add(m2, 1), c2], [Q.sub(m2, 1), c2], [m2, Q.add(c2, 1)], [m2, Q.sub(c2, 1)]].map(([x, y]) => ${now.replace("(m, c", "(x, y")}); }`;
  // On grids the starter tries ±1 only, and a ±1 step barely dents a board (docs/engine-v2/competitive-play.md): a
  // player out to knock adds far moves, priced by their size like any change (one cell by up to ±9, a row or column by ±2).
  const far = grid && KNOBS[kind].rival > 0
    ? `  for (let i = 0; i < 16; i++) for (let k = -9; k <= 9; k++) if (Math.abs(k) > FAR) { const x = edit(b, [i], () => k); if (x !== b) tries.push([move("cells.add", { cell: NAME[i], k }), x]); }
${source.includes("const LINE = [], LINES = [];") ? "" : "  // (no rows or columns in this agent)\n  if (false)\n"}  for (let i = 0; i < 8; i++) for (const k of [-2, 2]) { const x = edit(b, LINES[i], () => k); if (x !== b) tries.push([move("tally.add", { line: LINE[i], k }), x]); }
`
    : "";
  const body = source.replace("  let options = tries.map(", `${far}  let options = tries.map(`).replace(CALL, `  return compete(offer, options, ${now}, tries, ${around});`);
  const k = KNOBS[kind];
  return `${knobLines(k, rivals)}   // the player's knobs (competitive-agents.ts)\n${body}\n${COMPETE}`;
}

const COMPETE = `
function compete(offer, options, now, tries, around) {
  const w = worth(offer);
  if (!w) return climb(offer, options, now, QUOTES);
  const calls = offer.budget().hostCallsLeft ?? 64;
  if (calls < 14) return null;
  const n = w.mine, S = w.others, R = Math.max(1, RIVALS);
  const rivals = (mine, oth) => mine * oth + oth * oth * (1 - 1 / R);
  const idx = options.map((o, i) => i).sort((a, b) => (better(options[a][1], options[b][1]) ? -1 : better(options[b][1], options[a][1]) ? 1 : 0));
  const pick = OWN > 0 ? idx.slice(0, QUOTES) : [];
  if (RIVAL > 0 && S >= TARGET && PROBE > 0) {
    const rest = idx.filter(i => !pick.includes(i)), step = Math.max(1, rest.length / PROBE);
    for (let j = 0; j < rest.length && pick.length < (OWN > 0 ? QUOTES : 0) + PROBE; j += step) pick.push(rest[Math.floor(j)]);
  }
  let left = calls - 12;
  const ranked = [];
  for (const i of pick) {
    if (left-- <= 0) break;
    const s = options[i][1], r = OWN > 0 || FRAGILE > 0 ? rarity(offer, s) : n;
    let o;
    try { o = offer.othersAfter(Array.isArray(options[i][0]) ? options[i][0] : [options[i][0]]); } catch (e) { continue; }
    if (o.after === null) continue;
    const S2 = Math.max(0, o.after);
    if (KNOCK > 0 && S - S2 < KNOCK * S) continue;
    let v = OWN * (r * S2 - n * S) - (RIVAL * (rivals(r, S2) - rivals(n, S))) / R;
    ranked.push([v, i, r, S2]);
  }
  ranked.sort((a, b) => b[0] - a[0]);
  if (FRAGILE > 0) for (const x of ranked.slice(0, 3)) {
    if (left-- <= 0) break;
    const worst = around(tries[x[1]]).reduce((lo, s) => (lo === null || better(lo, s) ? s : lo), null);
    if (worst !== null) x[0] -= FRAGILE * Math.max(0, x[2] - rarity(offer, worst)) * x[3];
  }
  const good = ranked.filter(x => x[0] > 1e-9).sort((a, b) => b[0] - a[0]).slice(0, 4);
  const cap = allowance(offer), saved = offer.budget().energy;
  let best = null;
  for (const [v, i] of good) {
    const plan = options[i][0], p = price(offer, plan);
    if (p === null || p > Math.max(cap, saved)) continue;
    const per = v / Math.max(p, 1e-6);
    if (!best || per > best[0]) best = [per, plan];
  }
  return best ? (Array.isArray(best[1]) ? best[1] : [best[1]]) : null;
}
`;

/** The agents session's two-move lookahead (lines; pool-dynamics.ts --look dip:0.5): a copy, as that one is a script. */
function lookahead(source: string): string {
  const call = CALL;
  if (!call.test(source) || source.includes("score(b,")) throw new Error("lookahead is for line starters");
  return source.replace(call, (_m, now: string) => `  const one = climb(offer, options, ${now}, QUOTES);
  if (one || PROTECT.includes(offer.object)) return one;
  const here = ${now}, floor = (1 - 0.5) * rarity(offer, here);
  const firsts = tries.slice(0, options.length).map((t, i) => [t, options[i][1]]).filter(([[, m1], s1]) => Q.isQ(m1) && s1)
    .sort((a, b) => (better(a[1], b[1]) ? -1 : better(b[1], a[1]) ? 1 : 0)).slice(0, 6)
    .filter(([, s1]) => rarity(offer, s1) >= floor).slice(0, 3).map(([t]) => t);
  const pairs = [];
  for (const [plan, m1, c1] of firsts) {
    const first = Array.isArray(plan) ? plan : [plan];
    for (const k of [-1, 1]) {
      pairs.push([[...first, move("si.shift", { k })], ${now.replace("(m, c", "(m1, Q.add(c1, k)")}]);
      pairs.push([[...first, move("si.tilt", { k })], ${now.replace("(m, c", "(Q.add(m1, k), c1")}]);
    }
  }
  const two = climb(offer, pairs, here, 4);
  return two ? two.slice(0, -1) : null;`);
}
