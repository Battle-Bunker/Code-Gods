/**
 * The rule gallery (/rule-gallery): independent of any room or game. The rule-determining settings at the top (object
 * type and board, in GET params), then a tile per richly annotated rule family that board can deal. Each tile offers
 * its params (random to start), describes the rule for them live, keeps its source in a collapsed section, and links
 * to the family's own page in a new tab with the board and every param in its GET params.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import type { Instantiation } from "@workspace/game-types";
import { card as cardOf, context, family, type Params } from "@workspace/game-utilities";
import { Page } from "@/site/components/layout";
import { EmptyState } from "@/site/components/page-parts";
import { ParamFields, SetupForm, familySummary, languageOf, type SourceLanguage } from "@/site/components/rule-gallery-parts";
import { galleryFamilies, gallerySearch, instOf, randomParams, setupFromSearch, withParam, type GallerySetup } from "@/site/lib/rule-gallery";
import { routeHref } from "@/core/routes";

export default function RuleGallery() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const setup = useMemo(() => setupFromSearch(search), [search]);
  const language = languageOf(search);
  const inst = useMemo(() => instOf(setup), [setup]);
  const families = useMemo(() => galleryFamilies(inst), [inst]);
  useEffect(() => { document.title = "Rule gallery · Code Gods"; }, []);
  const go = (s: GallerySetup, l: SourceLanguage) => navigate(`/rule-gallery${gallerySearch(s, {}, l)}`, { replace: true });
  return (
    <Page crumbs={[{ label: "Rule gallery" }]}>
      <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-10 space-y-6 rise" data-testid="page-rule-gallery">
        <header className="space-y-2">
          <h1 className="font-display text-5xl">Rule gallery</h1>
          <p className="max-w-[70ch] text-sm text-muted-foreground">
            Every rule with picture-by-picture explanations that a board like this can deal. Pick the board, then try each
            rule's settings: its description follows them. Open a rule's page to try it on a board of your own.
          </p>
        </header>
        <SetupForm setup={setup} language={language} onChange={s => go(s, language)} onLanguage={l => go(setup, l)} />
        {families.length === 0
          ? <EmptyState title="No annotated rules here yet" body="Only Grid boards have rules with rich annotations so far. Pick Grid as the object type." testId="empty-rule-gallery" />
          : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="list-rule-families">
              {families.map(id => <Tile key={`${inst.key}:${id}`} familyId={id} inst={inst} setup={setup} language={language} />)}
            </ul>
          )}
      </div>
    </Page>
  );
}

function Tile({ familyId, inst, setup, language }: { familyId: string; inst: Instantiation; setup: GallerySetup; language: SourceLanguage }) {
  const f = family(familyId);
  const [params, setParams] = useState<Params>(() => randomParams(familyId, inst, Math.floor(Math.random() * 2 ** 31)));
  const summary = useMemo(() => familySummary(familyId, params, inst), [familyId, params, inst]);
  const href = routeHref(import.meta.env.BASE_URL, { kind: "ruleFamily", family: familyId }, gallerySearch(setup, params, language));
  return (
    <li className="flex flex-col gap-3 border bg-card p-4" data-testid={`tile-${familyId}`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold leading-tight"><span aria-hidden>{f.emoji} </span>{f.name}</h2>
          <p className="text-xs text-muted-foreground">{f.theme}</p>
        </div>
        <a href={href} target="_blank" rel="noopener" className="shrink-0 text-xs underline underline-offset-4" data-testid={`link-family-${familyId}`}>Open page ↗</a>
      </header>
      <div className="flex items-end gap-2">
        <ParamFields familyId={familyId} inst={inst} params={params} compact onChange={(k, v) => setParams(p => withParam(familyId, inst, p, k, v))} />
        <button type="button" className="border px-1.5 py-0.5 text-xs hover:bg-muted" title="Random settings" aria-label={`Random settings for ${f.name}`}
          onClick={() => setParams(randomParams(familyId, inst, Math.floor(Math.random() * 2 ** 31)))}>🎲</button>
      </div>
      <p className="text-sm leading-relaxed" data-testid={`text-summary-${familyId}`}>{summary}</p>
      <details className="mt-auto text-xs" data-testid={`source-${familyId}`}>
        <summary className="cursor-pointer text-muted-foreground">Source ({language === "python" ? "Python" : "TypeScript"})</summary>
        <Source familyId={familyId} params={params} inst={inst} language={language} />
      </details>
    </li>
  );
}

/** The card program for these params, in the chosen language. */
function Source({ familyId, params, inst, language }: { familyId: string; params: Params; inst: Instantiation; language: SourceLanguage }) {
  const text = useMemo(() => cardOf({ familyId, params }, context(inst)).source[language], [familyId, params, inst, language]);
  return <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words bg-muted p-2 font-mono text-[11px] leading-snug">{text}</pre>;
}
