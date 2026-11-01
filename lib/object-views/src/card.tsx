/** The kid utility card (and its defence goal), and the Room helpers drawer generated from HelperDoc[]. */
import { useMemo, useState } from "react";
import { capabilityClass } from "@workspace/game-types";
import { familyUses, type BadgeLike } from "./catalog.ts";
import type { GridSettings } from "./registry.ts";
import { GridObject } from "./views.tsx";

export interface UtilityCardLike {
  familyId: string;
  emoji: string;
  name: string;
  theme?: string;
  summary: string;
  language: "python" | "typescript" | string;
  source: string;
  /** A tiny example board (its own size) and what it scores (docs/rules-design.md §3.2). */
  example?: { value: string; size: number; caption: string };
  penalty?: { familyId: string; emoji: string; name: string; summary: string; comparative: string; source: string };
}

export function BadgeChips({ badges, empty = "🌍 Works everywhere", testId }: { badges: readonly BadgeLike[]; empty?: string; testId?: string }) {
  if (!badges.length) return <span className="text-xs text-muted-foreground" data-testid={testId}>{empty}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid={testId}>
      {badges.map(b => (
        <span key={b.id} title={b.kid} className="text-[11px] border px-1.5 py-0.5 whitespace-nowrap bg-muted/40">{b.emoji} {b.label}</span>
      ))}
    </span>
  );
}

function Source({ text, language, testId }: { text: string; language: string; testId: string }) {
  return (
    <details className="mt-2" open>
      <summary className="cursor-pointer text-xs text-muted-foreground">{language} source</summary>
      <pre data-testid={testId} className="mt-1 font-mono text-[11px] leading-snug whitespace-pre-wrap break-words max-h-72 overflow-auto bg-muted p-2">{text}</pre>
    </details>
  );
}

/** A goal card's example board: the room's tiles at the example's own size, big enough to read, with its caption. */
const EXAMPLE_CELL_PX = 26;
export function CardExample({ example, grid }: { example: NonNullable<UtilityCardLike["example"]>; grid?: GridSettings }) {
  return (
    <figure className="mt-2 flex items-center gap-3" data-testid="utility-card-example">
      <GridObject value={example.value} grid={grid ? { ...grid, size: example.size } : undefined} renderer="tiles" cellPx={EXAMPLE_CELL_PX} />
      <figcaption className="text-xs leading-snug text-muted-foreground"><span className="font-medium text-foreground">For example: </span>{example.caption}</figcaption>
    </figure>
  );
}

/**
 * Emoji and name, plain summary, an example board when the rule has one, a "uses" chip row, then the source; a defence
 * goal follows as its own card. `grid` (the room's Grid settings) draws the example with the room's colour shades.
 */
export function UtilityCardView({ card, uses, grid }: { card: UtilityCardLike; uses?: readonly BadgeLike[]; grid?: GridSettings }) {
  const badges = useMemo(() => uses ?? familyUses(card.familyId), [uses, card.familyId]);
  const penaltyUses = useMemo(() => (card.penalty ? familyUses(card.penalty.familyId) : []), [card.penalty?.familyId]);
  return (
    <div className="space-y-3" data-testid="utility-card">
      <div>
        <p className="text-xl font-semibold leading-tight" data-testid="utility-card-name"><span aria-hidden>{card.emoji} </span>{card.name}</p>
        {card.theme && <p className="text-xs text-muted-foreground">{card.theme}</p>}
        <p className="mt-2 text-sm leading-relaxed" data-testid="text-utility-summary">{card.summary}</p>
        {card.example && <CardExample example={card.example} grid={grid} />}
        <p className="mt-2 text-xs flex flex-wrap items-center gap-1.5"><span className="text-muted-foreground">uses:</span><BadgeChips badges={badges} testId="utility-card-uses" /></p>
        <Source text={card.source} language={card.language} testId="text-utility-source" />
      </div>
      {card.penalty && (
        <div className="border-l-4 border-destructive pl-3 py-1" data-testid="utility-card-penalty">
          <p className="font-semibold"><span aria-hidden>⚠️ {card.penalty.emoji} </span>{card.penalty.name} <span className="text-xs font-normal text-muted-foreground">your defence goal</span></p>
          <p className="mt-1 text-sm">{card.penalty.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">Only counts when an object is {card.penalty.comparative} than usual. Then you see “⚠️ {card.penalty.comparative} than 90% of …”.</p>
          {penaltyUses.length > 0 && <p className="mt-1 text-xs flex flex-wrap items-center gap-1.5"><span className="text-muted-foreground">uses:</span><BadgeChips badges={penaltyUses} /></p>}
          <Source text={card.penalty.source} language={card.language} testId="text-penalty-source" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export interface HelperDocLike {
  name: { python: string; typescript: string };
  signature: { python: string; typescript: string };
  kid: string;
  class?: string;
  group: "read" | "mutator" | string;
}

function badgeOf(cls: string | undefined): BadgeLike | undefined {
  if (!cls) return undefined;
  try { return capabilityClass(cls).badge; } catch { return undefined; }
}

/** Helpers grouped by the badge that provides them ("Everywhere" first). */
export function groupHelpers(helpers: readonly HelperDocLike[]) {
  const groups = new Map<string, { badge?: BadgeLike; items: HelperDocLike[] }>();
  for (const h of helpers) {
    const b = badgeOf(h.class);
    const key = b?.id ?? "";
    let g = groups.get(key);
    if (!g) groups.set(key, g = { badge: b, items: [] });
    g.items.push(h);
  }
  return [...groups.values()].sort((a, b) => (a.badge ? 1 : 0) - (b.badge ? 1 : 0));
}

/**
 * The Room helpers drawer: the read helpers (the kid grid API) and the mutator constructors an agent
 * returns, grouped by badge, each with its signature and kid line. Clicking a name inserts it.
 */
export function HelpersDrawer({ helpers, language, onInsert, open: initiallyOpen = false }: {
  helpers: readonly HelperDocLike[]; language: "python" | "typescript" | string; onInsert?: (name: string) => void; open?: boolean;
}) {
  const [query, setQuery] = useState("");
  const lang = language === "typescript" ? "typescript" : "python";
  const q = query.trim().toLowerCase();
  const match = (h: HelperDocLike) => !q || h.name[lang].toLowerCase().includes(q) || h.kid.toLowerCase().includes(q);
  const sections: [string, string, HelperDocLike[]][] = [
    ["read", "Read the board", helpers.filter(h => h.group !== "mutator" && match(h))],
    ["mutator", "Moves your agent can return", helpers.filter(h => h.group === "mutator" && match(h))],
  ];
  return (
    <details className="border text-sm" open={initiallyOpen} data-testid="helpers-drawer">
      <summary className="cursor-pointer px-3 py-2 font-medium">Room helpers <span className="text-xs text-muted-foreground font-normal">({helpers.length})</span></summary>
      <div className="px-3 pb-3 space-y-3">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a helper" aria-label="Find a helper"
          className="w-full border bg-background px-2 py-1 text-xs outline-none focus:border-primary" data-testid="input-helper-search" />
        {sections.map(([id, title, items]) => items.length > 0 && (
          <section key={id} data-testid={`helpers-${id}`}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
            {groupHelpers(items).map(g => (
              <div key={g.badge?.id ?? "everywhere"} className="mt-1.5">
                {g.badge && <p className="text-[11px] text-muted-foreground" title={g.badge.kid}>{g.badge.emoji} {g.badge.label}</p>}
                <ul className="space-y-1 max-h-64 overflow-auto">
                  {g.items.map(h => (
                    <li key={h.name[lang] + h.signature[lang]} className="text-xs">
                      <button type="button" disabled={!onInsert} onClick={() => onInsert?.(h.name[lang])}
                        className="font-mono font-semibold text-primary hover:underline disabled:text-foreground disabled:no-underline break-all text-left"
                        title={onInsert ? "Insert into the forge" : undefined} data-testid={`helper-${h.name[lang]}`}>{h.signature[lang]}</button>
                      <span className="block text-muted-foreground">{h.kid}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}
