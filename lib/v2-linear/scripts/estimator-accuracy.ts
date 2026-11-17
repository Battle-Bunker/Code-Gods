// Probe: how close is the live energy estimate to what a much larger search finds, by line size?
// For each dealt rule, a few parameter draws, lines of about B binary digits (each gradient and intercept number about
// B bits): "newborn" (random) and "worked" (the rule's best candidate from a random line, at most B + 3 bits). For each
// state, the live estimate (the beginner physics, its work budget) and, from the SAME starts, a larger search:
//   - the live routes again with no work budget (direct turn, the rule's candidates, the 4-lens climb of 6 steps);
//   - the greedy climb in all six lenses, 24 steps;
//   - a best-first search over single mutations in each of the six lenses (cheapest turn first, NODES states a lens);
//   - for B ≤ SWEEP_MAX: every value of each single number in a box (|v| < 2^min(B + 3, 11)) in the mc, xy, abc and mA lenses.
// Per start, c = −log2 Σ 2^−cost over the distinct targets found (the estimator's soft minimum).
// Not a test. Usage: node --experimental-strip-types scripts/estimator-accuracy.ts [ruleId|all] [sizes] [NODES]
// Output: one markdown row per rule and size, and a JSON line per state on stderr.
import { greedyClimb, physicsOf, q, rng as makeRng, softMinBits, withPhysics, type RouteSpace } from "@workspace/v2-core";
import { lineQ as V } from "../test/config.ts";
import { dynamicFamilies, estimateLine, fromMC, isVertical, lensById, lensSpace, lensPrice, lensSurprise, lineRule, TURN_BITS, lineStarts, LENSES, routePrice, type Line, type LensId } from "../src/index.ts";

const physics = physicsOf(V), lambda = physics.gravity;
// The live routes without the work budget: none up to 10 bits; 20 times the budget beyond (unlimited takes minutes there).
const VU = (B: number) => withPhysics(V, { ...physics, estimatorWork: B <= 10 ? 1_000_000_000 : 20 * physics.estimatorWork });
const only = process.argv[2] && process.argv[2] !== "all" ? process.argv[2] : null;
const SIZES = (process.argv[3] ?? "5,10,20,40").split(",").map(Number);
const NODES = Number(process.argv[4] ?? 1500);
const SWEEP_MAX = 10, PARAMS = 2, DRAWS = 2;
const keyOf = (l: Line) => `${l.a},${l.b},${l.c}`;
const bits = (n: bigint) => (n < 0n ? -n : n).toString(2).length;
const sizeOf = (l: Line) => { const ns = lensById("mc").numbers(l); return ns ? Math.max(...ns.map(bits)) : Infinity; };

/** A min-heap of [priority, item]. */
class Heap<T> {
  private a: [number, T][] = [];
  get size() { return this.a.length; }
  push(p: number, x: T) { const a = this.a; a.push([p, x]); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (a[j]![0] <= a[i]![0]) break; [a[i], a[j]] = [a[j]!, a[i]!]; i = j; } }
  pop(): [number, T] { const a = this.a, top = a[0]!, last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l]![0] < a[m]![0]) m = l; if (r < a.length && a[r]![0] < a[m]![0]) m = r; if (m === i) break; [a[i], a[m]] = [a[m]!, a[i]!]; i = m; } } return top; }
}

type Row = { eLive: number; eBig: number; eUnb: number; unbBound?: boolean; bound: boolean; boundStarts: number; starts: number; exact: number; by: Record<string, number>; ms: number };
function header(title: string) {
  console.log(`\n### ${title}`);
  console.log("| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
}
function report(B: number, rows: Row[]) {
    if (!rows.length) { console.log(`| ${B} | 0 | | | | | | | | |`); return; }
    const mean = (f: (x: (typeof rows)[number]) => number) => rows.reduce((a, x) => a + f(x), 0) / rows.length;
    const over = rows.map(x => x.eLive - x.eBig), worst = over.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
    const starts = rows.reduce((a, x) => a + x.starts, 0), by: Record<string, number> = {};
    for (const x of rows) for (const [k, v] of Object.entries(x.by)) by[k] = (by[k] ?? 0) + v;
    const byS = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / starts)}%`).join(", ");
    console.log(`| ${B} | ${rows.length} | ${mean(x => x.eLive).toFixed(1)} | ${rows.filter(x => x.bound).length}/${rows.length}, ${Math.round((100 * rows.reduce((a, x) => a + x.boundStarts, 0)) / starts)}% | ${mean(x => x.eUnb).toFixed(1)} | ${mean(x => x.eBig).toFixed(1)} | ${mean(x => x.eLive - x.eBig).toFixed(1)} (${worst.toFixed(1)}) | ${Math.round((100 * rows.reduce((a, x) => a + x.exact, 0)) / starts)}% | ${byS} | ${Math.round(mean(x => x.ms))} |`);
}
// Report mode: the tables from the JSON lines of earlier runs (files named on the command line).
if (process.argv[2] === "report") {
  const { readFileSync } = await import("node:fs");
  const lines = process.argv.slice(3).flatMap(f => readFileSync(f, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)));
  for (const F of dynamicFamilies) {
    const mine = lines.filter(l => l.rule === F.id);
    if (!mine.length) continue;
    header(F.title);
    for (const B of [...new Set(mine.map(l => l.B as number))].sort((a, b) => a - b)) report(B, mine.filter(l => l.B === B));
  }
  process.exit(0);
}

for (const F of dynamicFamilies) {
  if (only && F.id !== only) continue;
  const all = F.dealable(V as never) as unknown[];
  const params = PARAMS >= all.length ? all : [all[0], all[Math.floor(all.length / 2)]];
  header(F.title);
  for (const B of SIZES) {
    const rows: Row[] = [];
    for (const p of params) {
      const rule = lineRule(F.dynamic as never, p as never);
      const r = makeRng("accuracy", `${F.id}:${B}:${JSON.stringify(p)}`);
      const big = (L: number) => { let n = 1n; for (let i = 1; i < L; i++) n = (n << 1n) | BigInt(r.bit()); return n; };
      const frac = () => q((r.bit() ? 1n : -1n) * big(B), big(B));
      for (let d = 0; d < DRAWS; d++) for (const kind of ["newborn", "worked"] as const) {
        let s = fromMC(frac(), frac());
        if (kind === "worked") {
          const u0 = rule.u(s);
          const better = [4, 8, 16, 32].flatMap(k => rule.candidates(s, u0 + k)).filter(t => !isVertical(t) && sizeOf(t) <= B + 3 && rule.u(t) > u0);
          if (!better.length) continue;
          s = better.reduce((a, b) => (rule.u(b) > rule.u(a) ? b : a));
        }
        const uStar = rule.u(s);
        if (!Number.isFinite(uStar)) continue;
        const seed = `acc:${keyOf(s)}`;
        const t0 = performance.now();
        const live = estimateLine(s, rule, V, { seed });
        const ms = performance.now() - t0;
        const unb = estimateLine(s, rule, VU(B), { seed });
        const starts = lineStarts(s, rule.lens, physics.estimatorStarts, seed, physics.sameSizeBand);
        const memo = new Map<string, number>();
        const u = (l: Line) => { const k = keyOf(l); let v = memo.get(k); if (v === undefined) { v = isVertical(l) ? -Infinity : rule.u(l); if (Number.isNaN(v)) v = -Infinity; memo.set(k, v); } return v; };
        const ok = (l: Line) => u(l) >= uStar - 1e-9;
        const by: Record<string, number> = {};
        let exact = 0, boundStarts = 0;
        const bigCosts = starts.map((x, i) => {
          const ls = live.samples[i]!;
          if (ls.by === "bound") boundStarts++;
          if (ok(x)) { by.already = (by.already ?? 0) + 1; exact++; return 0; }
          // Every route: target → [cost, kind].
          const routes = new Map<string, [number, string]>();
          let bestCost = Infinity;
          const best = () => bestCost;
          // A route's cost: the cheapest over the six lenses; `upper` (a price already known in one lens) skips that
          // work when it cannot come near the best found.
          const add = (t: Line, kindOf: string, cost?: number, upper?: number) => {
            if (!ok(t)) return;
            if (cost === undefined) {
              if (upper !== undefined && upper > best() + 8) cost = upper;
              else cost = routePrice(lambda, x, t).total;
            }
            if (!Number.isFinite(cost)) return;
            if (cost < bestCost) bestCost = cost;
            const k = keyOf(t), had = routes.get(k);
            if (!had || cost < had[0]) routes.set(k, [cost, had && had[0] <= cost ? had[1] : kindOf]);
          };
          // The live routes (no budget).
          add(s, "direct");
          for (const t of rule.candidates(x, uStar)) if (!isVertical(t)) add(t, "candidate");
          const spaces = new Map<LensId, RouteSpace<Line>>(LENSES.map(l => [l.id, lensSpace(lambda, l, u)]));
          const liveOrder = [...new Set([rule.lens, "mc", "cf", "pe"] as LensId[])];
          let cap = best() + 16;
          for (const id of liveOrder) { const c = greedyClimb(x, uStar, spaces.get(id)!, cap, 6); if (c && c.bits < cap) { add(c.target, "climb", c.bits); cap = c.bits; } }
          // The larger search: long climbs in every lens, best-first per lens, the box sweep.
          for (const sp of spaces.values()) { const c = greedyClimb(x, uStar, sp, best() + 16, 24); if (c) add(c.target, "long climb", c.bits); }
          for (const lens of LENSES) {
            const xs = lens.numbers(x); if (!xs) continue;
            const sp = spaces.get(lens.id)!, seen = new Set<string>([keyOf(x)]), h = new Heap<[Line, number]>();
            h.push(0, [x, 0]);
            for (let n = 0; n < (B <= 10 ? NODES : Math.min(NODES, 500)) && h.size; n++) {
              const [pr, [y, naming]] = h.pop();
              if (pr > best()) break;
              for (const mv of sp.moves(y)) {
                const k = keyOf(mv.to); if (seen.has(k)) continue; seen.add(k);
                const zs = lens.numbers(mv.to); if (!zs) continue;
                const nm = naming + mv.bits, cost = Math.min(nm, sp.name(x, mv.to)) + lensSurprise(lambda, xs, zs);
                if (ok(mv.to)) add(mv.to, "best-first", undefined, cost);
                else h.push(cost, [mv.to, nm]);
              }
            }
          }
          if (B <= SWEEP_MAX) for (const id of ["mc", "xy", "abc", "mA"] as LensId[]) {
            const lens = lensById(id), xs = lens.numbers(x); if (!xs) continue;
            const bottoms = new Set(lens.pairs.map(p => p[1])), R = 1n << BigInt(Math.min(B + 3, 11));
            for (let i = 0; i < xs.length; i++) for (let v = bottoms.has(i) ? 1n : -R; v < R; v++) {
              if (v === xs[i]) continue;
              const ns = xs.slice(); ns[i] = v; const t = lens.line(ns, x);
              if (t && ok(t)) { const ts = lens.numbers(t); if (ts) { const pr = lensPrice(lambda, lens, xs, ts); add(t, "sweep", undefined, pr.naming + pr.surprise + TURN_BITS); } }
            }
          }
          const all = [...routes.values()], bestBig = all.reduce((a, b) => (b[0] < a[0] ? b : a));
          by[bestBig[1]] = (by[bestBig[1]] ?? 0) + 1;
          if (ls.best <= bestBig[0] + 0.01) exact++;
          return softMinBits(all.map(v => v[0]));
        });
        const eBig = bigCosts.reduce((a, b) => a + b, 0) / bigCosts.length;
        const row = { eLive: live.energy, eBig, eUnb: unb.energy, unbBound: unb.bound, bound: live.bound, boundStarts, starts: starts.length, exact, by, ms };
        rows.push(row);
        console.error(JSON.stringify({ rule: F.id, B, kind, p, s: keyOf(s), uStar, ...row }));
      }
    }
    report(B, rows);
  }
}
