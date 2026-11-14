/**
 * The rule gallery (`/rule-gallery`) and one rule's page (`/rule-gallery/:family`), integration plan §1.1: generated
 * from the v2 rule families of the line type and the deployed presets (site/lib/rule-gallery.ts), with no room, game
 * or server read. The gallery lists the rules a board deals; a rule's page shows its card for the chosen numbers and
 * tie-breaker, its parts, the views it reads and the goal card's worked example with its steps to the top.
 */
import { useEffect, useMemo } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { GoalCard } from "@workspace/v2-views";
import "@workspace/v2-views/styles.css";
import { Page } from "@/site/components/layout";
import { api, useLive } from "@/site/lib/convex";
import { EmptyState, Section } from "@/site/components/page-parts";
import { BOARDS, familyPage, galleryFamilies, gallerySearch, galleryRarities, setupFromSearch, type GalleryEntry, type GallerySetup } from "@/site/lib/rule-gallery";
import { ruleFamilyPath, ruleGalleryPath } from "@/site/lib/routes";
import { workedExample } from "@/panes/worked-example";

const field = "h-9 min-w-0 max-w-full border bg-background px-2 text-sm";

function BoardPicker({ board, onPick }: { board: string; onPick: (b: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Board" className="flex flex-wrap gap-2" data-testid="board-picker">
      {BOARDS.map(b => (
        <button key={b.id} type="button" role="radio" aria-checked={b.id === board} onClick={() => onPick(b.id)} title={b.blurb}
          className={`border px-3 py-1.5 text-sm ${b.id === board ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`} data-testid={`button-board-${b.id}`}>
          {b.title}
        </button>
      ))}
    </div>
  );
}

function Tile({ e, board }: { e: GalleryEntry; board: string }) {
  const href = ruleFamilyPath(e.id, gallerySearch({ board, params: 0, tb: null }));
  return (
    <li className="flex flex-col gap-2 border bg-card p-4" data-testid={`tile-${e.id}`}>
      <h3 className="text-lg font-semibold leading-tight"><Link href={href} className="hover:underline underline-offset-4" data-testid={`link-family-${e.id}`}>{e.title}</Link></h3>
      <p className="text-sm leading-relaxed">{e.sentence}</p>
      <p className="mt-auto text-xs text-muted-foreground">
        {e.tieBreakers} tie-breaker{e.tieBreakers === 1 ? "" : "s"}{e.choices > 1 ? ` · ${e.choices} versions` : ""}
        {e.presets.length ? ` · dealt in ${e.presets.join(", ")}` : " · not in a setup yet"}
      </p>
    </li>
  );
}

export function RuleGallery() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const setup = setupFromSearch(search);
  const g = useMemo(() => galleryFamilies(setup.board), [setup.board]);
  useEffect(() => { document.title = "Rule gallery · Code Gods"; }, []);
  return (
    <Page crumbs={[{ label: "Rule gallery" }]}>
      <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 space-y-6 rise" data-testid="page-rule-gallery">
        <header className="space-y-3">
          <h1 className="font-display text-4xl md:text-5xl leading-none">Rule gallery</h1>
          <p className="max-w-[70ch] text-sm text-muted-foreground">
            Every secret rule a game can deal you. Pick a board, then open a rule to see a worked example and the steps to the top.
          </p>
          <BoardPicker board={setup.board} onPick={b => navigate(ruleGalleryPath(gallerySearch({ board: b, params: 0, tb: null })), { replace: true })} />
        </header>
        {[{ title: "Beginner rules", list: g.beginner, id: "beginner" }, { title: "More rules", list: g.more, id: "more" }].map(s => s.list.length > 0 && (
          <section key={s.id} className="space-y-3" data-testid={`section-${s.id}`}>
            <h2 className="font-display text-2xl">{s.title} <span className="text-muted-foreground text-base">({s.list.length})</span></h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{s.list.map(e => <Tile key={e.id} e={e} board={setup.board} />)}</ul>
          </section>
        ))}
      </div>
    </Page>
  );
}

export function RuleFamily() {
  const { family = "" } = useParams<{ family: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const page = useMemo(() => familyPage(family, setupFromSearch(search)), [family, search]);
  const example = useMemo(() => (page ? workedExample(page.rule) : null), [page]);
  // Each step's rarity in bits, from the server's calibration (one live subscription per family shown).
  const ask = page ? galleryRarities(page, undefined).query : null;
  const rows = useLive(api.v2.gallery.family, ask ?? "skip").data;
  const rarities = page ? galleryRarities(page, rows).rarities : null;
  useEffect(() => { document.title = `${page?.family.title ?? "Rule"} · Rule gallery · Code Gods`; }, [page?.family.title]);
  const go = (s: Partial<GallerySetup>) => page && navigate(ruleFamilyPath(family, gallerySearch({ ...page.setup, ...s })), { replace: true });
  const back = ruleGalleryPath(page ? gallerySearch({ board: page.setup.board, params: 0, tb: null }) : "");
  return (
    <Page crumbs={[{ label: "Rule gallery", href: back }, { label: page?.family.title ?? family }]}>
      <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 space-y-6 rise" data-testid="page-rule-family">
        {!page || !example ? (
          <EmptyState title="No such rule on this board" body={<>This board does not deal a rule called “{family}”. <Link href={back} className="underline underline-offset-4">See every rule</Link>.</>} testId="empty-rule-family" />
        ) : (<>
          <header className="space-y-3">
            <h1 className="font-display text-4xl md:text-5xl leading-none" data-testid="text-family-title">{page.family.title}</h1>
            <p className="max-w-[70ch] text-base" data-testid="text-family-card">{page.card}</p>
            <p className="text-xs text-muted-foreground">{page.presets.length ? `Dealt in ${page.presets.join(", ")}.` : "No setup deals this rule on this board yet."}</p>
          </header>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start">
            <div className="space-y-6 min-w-0">
              <Section title="Try a version" testId="section-family-choices">
                <div className="space-y-3 p-4 text-sm">
                  <BoardPicker board={page.setup.board} onPick={b => go({ board: b, params: 0, tb: null })} />
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Its numbers</span>
                    <select value={page.setup.params} onChange={e => go({ params: Number(e.target.value) })} disabled={page.params.length < 2} className={field} data-testid="select-family-params">
                      {page.params.map(p => <option key={p.index} value={p.index}>{p.label}</option>)}
                    </select>
                  </label>
                  <fieldset className="space-y-1">
                    <legend className="text-xs text-muted-foreground">Tie-breaker: it decides between lines the main part scores the same</legend>
                    {page.tieBreakers.map(t => (
                      <label key={t.id} className="flex items-start gap-2 py-1">
                        <input type="radio" name="tie-breaker" className="mt-1" checked={page.rule.tieBreaker === t.id} onChange={() => go({ tb: t.id })} data-testid={`radio-tie-breaker-${t.id}`} />
                        <span><span className="font-medium">{t.title}</span><span className="block text-muted-foreground">{t.sentence}</span></span>
                      </label>
                    ))}
                  </fieldset>
                </div>
              </Section>
              <Section title="How it scores" testId="section-family-parts">
                <dl className="space-y-2 p-4 text-sm">
                  <div><dt className="font-medium">Main part: {page.main.title}</dt><dd className="text-muted-foreground">{page.main.sentence}</dd></div>
                  <div><dt className="font-medium">It reads the line as</dt><dd className="text-muted-foreground" data-testid="text-family-reads">{page.reads.join(", ")}</dd></div>
                </dl>
              </Section>
            </div>
            <div className="min-w-0 border bg-card p-3 md:p-4" data-testid="goal-card">
              <GoalCard rule={page.rule} example={example} {...(rarities ? { rarities } : {})} />
              {!rarities && <p className="mt-2 text-xs text-muted-foreground">In a game, a line also shows its rarity in bits (each bit = twice as rare) and its chance: how rarely a random line scores that well.</p>}
            </div>
          </div>
        </>)}
      </div>
    </Page>
  );
}
