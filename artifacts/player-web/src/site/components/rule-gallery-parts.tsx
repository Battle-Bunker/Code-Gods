/**
 * What the rule gallery's two pages share (site/pages/rule-gallery.tsx, rule-family.tsx): the setup form (object type
 * and its type args), a family's param fields, and the family's card as the goal card shows it. Pure library data
 * (lib/game-utilities, lib/game-types): nothing here reads the server.
 */
import { useMemo } from "react";
import type { Instantiation } from "@workspace/game-types";
import { card as cardOf, context, explainer, family, type Params } from "@workspace/game-utilities";
import type { UtilityCardLike } from "@workspace/object-views";
import { galleryObjectTypes, paramFields, setupFields, type GallerySetup } from "@/site/lib/rule-gallery";

export type SourceLanguage = "python" | "typescript";
export const languageOf = (search: string): SourceLanguage => (new URLSearchParams(search).get("lang") === "typescript" ? "typescript" : "python");

const fieldClass = "border bg-background px-2 py-1 text-sm";

/** The rule-determining settings: the object type, then each of its type args, from the boards the game can play. */
export function SetupForm({ setup, onChange, language, onLanguage }: {
  setup: GallerySetup; onChange: (setup: GallerySetup) => void; language: SourceLanguage; onLanguage: (l: SourceLanguage) => void;
}) {
  const fields = useMemo(() => setupFields(setup.objectType), [setup.objectType]);
  return (
    <fieldset className="flex flex-wrap items-end gap-4" data-testid="form-gallery-setup">
      <legend className="sr-only">Board</legend>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Object type</span>
        <select className={fieldClass} value={setup.objectType} data-testid="select-object-type"
          onChange={e => onChange({ objectType: e.target.value, typeArgs: {} })}>
          {galleryObjectTypes().map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
        </select>
      </label>
      {fields.map(f => (
        <label key={f.id} className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{f.label}</span>
          <select className={fieldClass} value={String(setup.typeArgs[f.id] ?? "")} data-testid={`select-setup-${f.id}`}
            onChange={e => {
              const option = f.options.find(o => String(o.value) === e.target.value);
              if (option) onChange({ objectType: setup.objectType, typeArgs: { ...setup.typeArgs, [f.id]: option.value } });
            }}>
            {f.options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
        </label>
      ))}
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Source language</span>
        <select className={fieldClass} value={language} data-testid="select-language" onChange={e => onLanguage(e.target.value as SourceLanguage)}>
          <option value="python">Python</option>
          <option value="typescript">TypeScript</option>
        </select>
      </label>
    </fieldset>
  );
}

/** One field per family param, offering exactly the values its support allows here. */
export function ParamFields({ familyId, inst, params, onChange, compact = false }: {
  familyId: string; inst: Instantiation; params: Params; onChange: (key: string, value: string | number | boolean) => void; compact?: boolean;
}) {
  const fields = useMemo(() => paramFields(familyId, inst), [familyId, inst]);
  if (!fields.length) return <p className="text-xs text-muted-foreground">No parameters.</p>;
  return (
    <div className={`flex flex-wrap items-end ${compact ? "gap-2" : "gap-4"}`} data-testid={`params-${familyId}`}>
      {fields.map(f => (
        <label key={f.key} className="flex flex-col gap-0.5 text-[11px]">
          <span className="font-mono text-muted-foreground">{f.key}</span>
          <select className={compact ? "border bg-background px-1 py-0.5 text-xs" : fieldClass} value={String(params[f.key])}
            data-testid={`select-param-${familyId}-${f.key}`}
            onChange={e => { const v = f.options.find(o => String(o) === e.target.value); if (v !== undefined) onChange(f.key, v); }}>
            {f.options.map(o => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

/** A draw's card as the goal card shows it (UtilityCardView), in the chosen source language. */
export function familyCard(familyId: string, params: Params, inst: Instantiation, language: SourceLanguage): UtilityCardLike {
  const c = cardOf({ familyId, params }, context(inst));
  return {
    familyId: c.familyId, emoji: c.emoji, name: c.name, theme: c.theme, summary: c.summary, language, source: c.source[language],
    ...(c.example ? { example: { value: String(c.example.value), size: c.example.size, caption: c.example.caption } } : {}),
  };
}

/** The draw's explainer on the board (the annotations), or null when the board's type has none. */
export const familyExplainer = (familyId: string, params: Params, inst: Instantiation) => explainer({ familyId, params }, inst);

/** The family's plain description for these params. */
export const familySummary = (familyId: string, params: Params, inst: Instantiation) => family(familyId).summary(params as never, context(inst));
