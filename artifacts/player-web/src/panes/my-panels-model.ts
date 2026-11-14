/** "Your panels" (./my-panels.tsx) in player words. Pure. */

export interface Diagnostic { line: number; column: number; code: string; message: string }
export interface SaveOutcome { saved: boolean; slug: string; version: number | null; diagnostics: Diagnostic[] }
export interface Author { kind: "browser" | "delegate"; label: string }

export const diagnosticText = (d: Diagnostic) => `Line ${d.line}, column ${d.column}: ${d.message} (${d.code})`;

export function saveOutcomeText(o: SaveOutcome): string {
  if (o.saved) return `Saved ${o.slug} as version ${o.version}.`;
  const n = o.diagnostics.length;
  return `Not saved: ${n} problem${n === 1 ? "" : "s"} to fix.`;
}

export function authorText(a: Author): string {
  if (a.kind === "browser") return "written by you";
  return /^assistant\b/.test(a.label) ? `written by your ${a.label}` : `written by the ${a.label}`;
}

/** The server's slug rule (convex/v2/panelShapes.ts SLUG), checked before a save. */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
export function slugProblem(slug: string): string | null {
  if (!slug) return "Name the panel first.";
  return SLUG.test(slug) ? null : "A panel's name is lowercase letters, digits and dashes (up to 48), like my-stats.";
}

/** The version "Roll back" restores: the one before the current, when there is one. */
export const rollbackTarget = (currentVersion: number): number | null => (currentVersion > 1 ? currentVersion - 1 : null);

/** What a new panel starts as: a small panel on the v2 SDK that reads live game data. */
export const EXAMPLE_PANEL = `import { definePanel, useGame, useLeaderboard, useMe, useMyRule } from "@sdk";

function MyStats() {
  const game = useGame();
  const me = useMe();
  const rule = useMyRule();
  const board = useLeaderboard();
  if (!game) return <p>Loading…</p>;
  return (
    <div>
      <p data-testid="example-phase">The game is {game.phase}.</p>
      <p data-testid="example-players">{game.roster.length} players.</p>
      {rule && <p data-testid="example-rule">Your goal: {rule.row.title}</p>}
      {me && <p>Your energy: {Math.round(me.energy)} ⚡</p>}
      {board && (
        <ol>
          {board.rows.map(r => <li key={r.memberId}>{r.name}: {r.net.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} points</li>)}
        </ol>
      )}
    </div>
  );
}

export default definePanel({ title: "My stats", placement: "right", size: "sm", Component: MyStats });
`;
