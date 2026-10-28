// Fixture page for @workspace/object-views (served at /preview/ObjectViews). Grid is not yet a
// selectable object type on the server, so these values are generated locally.
import { useEffect, useState } from "react";
import { spawnGrid, type GridTypeArgs } from "@workspace/game-core";
import { ObjectView, objectTitle, type ObjectValue } from "@workspace/object-views";

/** mulberry32: a small deterministic PRNG, so the fixtures are stable between runs. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return (b: bigint) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return BigInt(((t ^ (t >>> 14)) >>> 0) % Number(b));
  };
}

const gridTypes: [string, GridTypeArgs][] = [
  ["3×3 base10 rgb", { size: 3, symbols: "base10", colours: "rgb" }],
  ["5×5 base10 rgby", { size: 5, symbols: "base10", colours: "rgby" }],
  ["4×4 base12 rgb", { size: 4, symbols: "base12", colours: "rgb" }],
  ["6×6 cards rainbow6", { size: 6, symbols: "cards", colours: "rainbow6" }],
  ["7×7 cards rainbow6", { size: 7, symbols: "cards", colours: "rainbow6" }],
];

type Row = { id: string; label: string; value: ObjectValue; objectType?: string; grid?: GridTypeArgs };
const rows: Row[] = [
  { id: "int", label: "Int", value: 42, objectType: "Int" },
  { id: "string", label: "string", value: "hello \"gods\"", objectType: "string" },
  { id: "string-gridlike", label: "string game, grid-like text", value: "1R,2G/3B,4R", objectType: "string" },
  { id: "grid-fixed", label: "3×3 fixed", value: "7R,3G,0B/1R,2R,9B/4G,4G,8R", objectType: "Grid", grid: { size: 3, symbols: "base10", colours: "rgb" } },
  ...gridTypes.map(([label, t], i): Row => ({ id: `grid-${i}`, label, value: spawnGrid(t, seeded(7 + i)), objectType: "Grid", grid: t })),
];

const before = spawnGrid({ size: 5, symbols: "base10", colours: "rgby" }, seeded(99));
// Two cells change: row 3's first symbol and row 5's last colour.
const after = before.split("/").map((row, r) =>
  r === 2 ? row.replace(/^[0-9]/, (d) => String((Number(d) + 1) % 10))
  : r === 4 ? row.replace(/[RYGB]$/, (c) => (c === "Y" ? "B" : "Y")) : row).join("/");

export default function ObjectViews() {
  const [dark, setDark] = useState(() => new URLSearchParams(location.search).get("theme") === "dark");
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Object views</h1>
        <button type="button" onClick={() => setDark(!dark)} className="border px-3 py-1 text-sm" data-testid="button-theme">{dark ? "Light" : "Dark"} theme</button>
      </header>

      <section className="border bg-card">
        <h2 className="px-4 py-2 text-sm font-medium border-b">Objects / typed (server display)</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-normal">object</th><th className="py-2 font-normal">value</th><th className="px-4 py-2 font-normal text-right">Σ utility</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t hover:bg-muted/50" data-testid={`row-${r.id}`}>
                  <td className="px-4 py-1.5 font-mono text-xs truncate max-w-[120px]">{r.label}</td>
                  <td className="py-1.5 font-mono truncate max-w-[220px]"><ObjectView value={r.value} objectType={r.objectType} grid={r.grid} /></td>
                  <td className="px-4 py-1.5 font-mono text-right tabular-nums">{(i * 1.37).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border bg-card">
        <h2 className="px-4 py-2 text-sm font-medium border-b">Objects / untyped (player console)</h2>
        <table className="w-full font-mono text-xs">
          <tbody>
            {rows.filter(r => r.id !== "string-gridlike").map((r) => (
              <tr key={r.id} className="border-t" data-testid={`untyped-${r.id}`}>
                <td className="py-1.5 px-2 max-w-[260px] truncate" title={objectTitle(r.value)}><ObjectView value={r.value} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="border bg-card p-4 space-y-2">
        <h2 className="text-sm font-medium">Transformations</h2>
        <ul className="font-mono text-xs space-y-1">
          <li className="flex gap-2 items-center" data-testid="feed-int"><span className="opacity-50 w-20 truncate">agent-1</span><span className="truncate"><ObjectView value={3} /></span><span className="text-primary">→</span><span className="truncate font-semibold"><ObjectView value={9} compareTo={3} /></span></li>
          <li className="flex gap-2 items-center" data-testid="feed-grid"><span className="opacity-50 w-20 truncate">agent-2</span><span className="truncate"><ObjectView value={before} /></span><span className="text-primary">→</span><span className="truncate font-semibold"><ObjectView value={after} compareTo={before} /></span></li>
        </ul>
      </section>
    </div>
  );
}
