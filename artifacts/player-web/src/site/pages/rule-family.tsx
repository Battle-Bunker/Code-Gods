/**
 * One rule family's page (/rule-gallery/:family): a form for everything that decides the rule's specification (the
 * object type and board, the family's params, the source language; all in GET params, so the gallery's tile links
 * here pre-filled), then the goal card exactly as "Your secret goal" shows it in a game (core/goal/goal-card.tsx).
 */
import { useEffect, useMemo } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { family } from "@workspace/game-utilities";
import { Page } from "@/site/components/layout";
import { EmptyState } from "@/site/components/page-parts";
import { GoalCard } from "@/core/goal/goal-card";
import { ParamFields, SetupForm, familyCard, familyExplainer, languageOf, type SourceLanguage } from "@/site/components/rule-gallery-parts";
import { galleryFamilies, gallerySearch, instOf, paramsFromSearch, setupFromSearch, withParam, type GallerySetup } from "@/site/lib/rule-gallery";
import type { Params } from "@workspace/game-utilities";

export default function RuleFamily() {
  const { family: familyId = "" } = useParams<{ family: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const setup = useMemo(() => setupFromSearch(search), [search]);
  const language = languageOf(search);
  const inst = useMemo(() => instOf(setup), [setup]);
  const offered = useMemo(() => galleryFamilies(inst).includes(familyId), [inst, familyId]);
  const params = useMemo(() => (offered ? paramsFromSearch(familyId, inst, search) : {}), [offered, familyId, inst, search]);
  const name = offered ? family(familyId).name : familyId;
  useEffect(() => { document.title = `${name} · Rule gallery · Code Gods`; }, [name]);
  const go = (s: GallerySetup, p: Params, l: SourceLanguage) =>
    navigate(`/rule-gallery/${encodeURIComponent(familyId)}${gallerySearch(s, p, l)}`, { replace: true });
  const card = useMemo(() => (offered ? familyCard(familyId, params, inst, language) : null), [offered, familyId, params, inst, language]);
  const goal = useMemo(() => (offered ? familyExplainer(familyId, params, inst) : null), [offered, familyId, params, inst]);
  const gallery = `/rule-gallery${gallerySearch(setup, {}, language)}`;
  return (
    <Page crumbs={[{ label: "Rule gallery", href: gallery }, { label: name }]}>
      <div className="mx-auto max-w-[900px] px-4 md:px-6 py-10 space-y-6 rise" data-testid="page-rule-family">
        <header className="space-y-1">
          <Link href={gallery} className="text-xs underline underline-offset-4" data-testid="link-back-to-gallery">← Rule gallery</Link>
          <h1 className="font-display text-4xl">{offered && <span aria-hidden>{family(familyId).emoji} </span>}{name}</h1>
        </header>
        <section className="space-y-3 border bg-card p-4" aria-label="Rule settings" data-testid="form-rule-family">
          {/* The params depend on the board, so a board change keeps the params the new board's support allows. */}
          <SetupForm setup={setup} language={language} onChange={s => go(s, params, language)} onLanguage={l => go(setup, params, l)} />
          {offered && <ParamFields familyId={familyId} inst={inst} params={params} onChange={(k, v) => go(setup, withParam(familyId, inst, params, k, v), language)} />}
        </section>
        {!offered || !card
          ? <EmptyState title="Not in the gallery" body={`There is no annotated rule "${familyId}" for this board.`} testId="empty-rule-family" />
          : <section className="border bg-card p-5"><GoalCard key={inst.key} card={card} goal={goal} inst={inst} /></section>}
      </div>
    </Page>
  );
}
