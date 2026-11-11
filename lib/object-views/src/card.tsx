/** The kid utility card (and its defence goal), and the Room helpers drawer generated from HelperDoc[]. */
import { useEffect, useMemo, useState } from "react";
import { capabilityClass } from "@workspace/game-types";
import { familyUses, type BadgeLike } from "./catalog.ts";
import type { GridSettings } from "./registry.ts";
import type { GoalExplainer, Ordinal } from "@workspace/game-utilities";
import { cardSections, tierBonus, tierOpens, type CardTierLike, type CardTierSection } from "./card-tiers.ts";
import { GridObject } from "./views.tsx";
import { GoalBoard } from "./explain/GoalBoard.tsx";
import { Term } from "@workspace/ui-kit";

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
  /** A tiered draw's ★ blocks (docs/layered-rules-design.md §4). Absent on base draws and on cards dealt before tiers. */
  tiers?: readonly CardTierLike[];
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

function Source({ text, language, testId, open }: { text: string; language: string; testId: string; open: boolean }) {
  return (
    <details className="mt-2" open={open} data-testid={`${testId}-section`}>
      <summary className="cursor-pointer text-xs text-muted-foreground">{language} source</summary>
      <pre data-testid={testId} className="mt-1 font-mono text-[11px] leading-snug whitespace-pre-wrap break-words max-h-72 overflow-auto bg-muted p-2">{text}</pre>
    </details>
  );
}

/** A goal card's example board: the room's tiles at the example's own size, with its caption. */
export function CardExample({ example, grid }: { example: NonNullable<UtilityCardLike["example"]>; grid?: GridSettings }) {
  return (
    <figure className="mt-2 flex items-center gap-3" data-testid="utility-card-example">
      <GridObject value={example.value} grid={grid ? { ...grid, size: example.size } : undefined} renderer="tiles" />
      <figcaption className="text-xs leading-snug text-muted-foreground"><span className="font-medium text-foreground">For example: </span>{example.caption}</figcaption>
    </figure>
  );
}

/**
 * The goal card's worked example (docs/annotations-design.md §3): a board of the room's own shape, searched to show
 * scoring and non-scoring units, listed beside it with the board linked to them both ways.
 */
export function GoalExampleView({ goal, grid }: { goal: GoalExplainer; grid: GridSettings }) {
  const example = useMemo(() => goal.example(), [goal]);
  if (!example) return null;
  return (
    <figure className="mt-3 border-t pt-3" data-testid="utility-card-goal-example">
      <figcaption className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Example</figcaption>
      <GoalBoard goal={goal} value={example.value} grid={grid} caption={example.caption} testId="goal-example-board" />
    </figure>
  );
}

/**
 * One "★ To score even higher" block: closed until the board reaches its gate or already holds a tier point (`auto`),
 * then it opens by itself, once; the player can open and close it by hand at any time. Closed over a board that has
 * tier points, it says so.
 */
function TierBlock({ section, ordinal }: { section: CardTierSection; ordinal?: Ordinal | null }) {
  const auto = tierOpens(section.tier, ordinal);
  const [open, setOpen] = useState(auto);
  useEffect(() => { if (auto) setOpen(true); }, [auto]);
  const bonus = open ? null : tierBonus(section.tier, ordinal);
  return (
    <details className="mt-2 border-l-4 border-amber-500/70 bg-muted/40 px-3 py-2 text-sm" open={open}
      onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)} data-testid={`card-tier-${section.tier.id}`} data-open={open || undefined}>
      <summary className="cursor-pointer font-medium leading-snug [overflow-wrap:anywhere]">{section.title}
        {bonus && <span className="mt-0.5 block text-xs font-normal text-muted-foreground" data-testid={`card-tier-bonus-${section.tier.id}`}>{bonus}</span>}</summary>
      <p className="mt-1.5 leading-relaxed" data-testid={`card-tier-text-${section.tier.id}`}>{section.body}</p>
    </details>
  );
}

/**
 * Emoji and name, plain summary (a tiered draw: the base rule, then its ★ blocks), an example board (the annotated one with `goal`, else the card's tiny one when the rule
 * has one), a "uses" chip row, then the source (collapsed unless `sourceOpen`); a defence goal follows as its own card. `grid` (the room's Grid settings) draws the example with the room's colour shades.
 */
export function UtilityCardView({ card, uses, grid, goal, ordinal, sourceOpen = false }: {
  card: UtilityCardLike; uses?: readonly BadgeLike[]; grid?: GridSettings;
  /**
   * The score of the board the player is looking at (the goal card's example object): a ★ block opens by itself once
   * it reaches the block's gate or holds one of its points.
   */
  ordinal?: Ordinal | null;
  /** Whether the source sections start expanded (they are collapsed by default). */
  sourceOpen?: boolean;
  /**
   * The player's own goal explainer: the card then shows its annotated example board (a family without a lens keeps its
   * hand-made tiny example when it has one, else shows a searched example board with its score).
   */
  goal?: GoalExplainer | null;
}) {
  const badges = useMemo(() => uses ?? familyUses(card.familyId), [uses, card.familyId]);
  const penaltyUses = useMemo(() => (card.penalty ? familyUses(card.penalty.familyId) : []), [card.penalty?.familyId]);
  const sections = useMemo(() => cardSections(card), [card.summary, card.tiers]);
  return (
    <div className="space-y-3" data-testid="utility-card">
      <div>
        <p className="text-xl font-semibold leading-tight" data-testid="utility-card-name"><span aria-hidden>{card.emoji} </span>{card.name}</p>
        {card.theme && <p className="text-xs text-muted-foreground">{card.theme}</p>}
        <p className="mt-2 text-sm leading-relaxed" data-testid="text-utility-summary">{sections.base}
          {/\bprimary points?\b/.test(card.summary) && <> <span className="text-muted-foreground">(<Term id="points-tuple">how points tuples compare</Term>)</span></>}</p>
        {sections.tiers.map(t => <TierBlock key={t.tier.id + t.tier.index} section={t} ordinal={ordinal} />)}
        {goal && grid && (goal.rich || !card.example) ? <GoalExampleView goal={goal} grid={grid} /> : card.example && <CardExample example={card.example} grid={grid} />}
        <p className="mt-2 text-xs flex flex-wrap items-center gap-1.5"><span className="text-muted-foreground">uses:</span><BadgeChips badges={badges} testId="utility-card-uses" /></p>
        <Source text={card.source} language={card.language} testId="text-utility-source" open={sourceOpen} />
      </div>
      {card.penalty && (
        <div className="border-l-4 border-destructive pl-3 py-1" data-testid="utility-card-penalty">
          <p className="font-semibold"><span aria-hidden>⚠️ {card.penalty.emoji} </span>{card.penalty.name} <span className="text-xs font-normal text-muted-foreground">your defence goal</span></p>
          <p className="mt-1 text-sm">{card.penalty.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">Only counts when an object is {card.penalty.comparative} than usual. Then you see “⚠️ {card.penalty.comparative} than 90% of …”.</p>
          {penaltyUses.length > 0 && <p className="mt-1 text-xs flex flex-wrap items-center gap-1.5"><span className="text-muted-foreground">uses:</span><BadgeChips badges={penaltyUses} /></p>}
          <Source text={card.penalty.source} language={card.language} testId="text-penalty-source" open={sourceOpen} />
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

/** A helper's name and signature in an agent language. */
export function helperIn(h: HelperDocLike, language: string): { name: string; signature: string } {
  const lang = language === "typescript" ? "typescript" : "python";
  return { name: h.name[lang], signature: h.signature[lang] };
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
  const q = query.trim().toLowerCase();
  const match = (h: HelperDocLike) => !q || helperIn(h, language).name.toLowerCase().includes(q) || h.kid.toLowerCase().includes(q);
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
                  {g.items.map(h => {
                    const { name, signature } = helperIn(h, language);
                    return (
                      <li key={name + signature} className="text-xs">
                        <button type="button" disabled={!onInsert} onClick={() => onInsert?.(name)}
                          className="font-mono font-semibold text-primary hover:underline disabled:text-foreground disabled:no-underline break-all text-left"
                          title={onInsert ? "Insert into the forge" : undefined} data-testid={`helper-${name}`}>{signature}</button>
                        <span className="block text-muted-foreground">{h.kid}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}
