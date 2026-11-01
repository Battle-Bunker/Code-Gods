/**
 * Room-settings pickers driven by the manifest's object types, and the rule shelf (the public
 * catalog of utility functions, grouped by badge, with locked reasons and an unlock action).
 */
import { useMemo, useState } from "react";
import { BadgeChips } from "./card.tsx";
import { groupByBadge, lockedText, shelfCounts, type ArgsLike, type BadgeLike, type CatalogEntryLike } from "./catalog.ts";
import {
  componentBadges, findOffered, intLabel, offeredValues, ruleDelta, snapToOffered,
  type ObjectTypeInfoLike, type ParamSchemaLike,
} from "./settings.ts";

export interface TypeChoice { objectType: string; typeArgs: ArgsLike }

function Delta({ gained, lost }: { gained: number; lost: number }) {
  if (!gained && !lost) return <span className="text-[10px] text-muted-foreground">same rules</span>;
  return (
    <span className="text-[10px] font-mono" title={`${gained} more and ${lost} fewer utility functions than now`}>
      {gained > 0 && <span className="text-primary">+{gained}</span>}{gained > 0 && lost > 0 && " "}{lost > 0 && <span className="text-destructive">−{lost}</span>}
    </span>
  );
}

const cardCls = (selected: boolean, disabled: boolean) =>
  `text-left border px-2 py-1.5 min-w-0 transition-colors ${selected ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`;

/**
 * Object type and type arguments. Each option shows its badges and how the rule shelf would change;
 * choices snap to an instantiation the server offers. `highlight` outlines params an unlock changed.
 */
export function ObjectTypePicker({ types, value, onChange, highlight = [], disabled = false, showOffered = true }: {
  types: readonly ObjectTypeInfoLike[]; value: TypeChoice; onChange: (next: TypeChoice) => void; highlight?: readonly string[]; disabled?: boolean;
  /** Also list every offered instantiation as a one-click chip (off when the page shows named presets). */
  showOffered?: boolean;
}) {
  const type = types.find(t => t.id === value.objectType);
  const args = useMemo(() => ({ ...(type?.defaults ?? {}), ...value.typeArgs }), [type, value.typeArgs]);
  const current = type ? findOffered(type, args) : undefined;
  const choose = (t: ObjectTypeInfoLike, patch: ArgsLike) => {
    const base = t.id === value.objectType ? args : t.defaults;
    const snap = snapToOffered(t, base, patch);
    if (snap) onChange({ objectType: t.id, typeArgs: { ...t.defaults, ...snap.args } });
  };
  return (
    <div className="space-y-3" data-testid="object-type-picker">
      <div role="radiogroup" aria-label="Object type" className="grid grid-cols-3 gap-1.5">
        {types.map(t => {
          const sel = t.id === value.objectType, none = !t.offered.length;
          return (
            <button key={t.id} type="button" role="radio" aria-checked={sel} disabled={disabled || none}
              onClick={() => !sel && choose(t, findOffered(t, t.defaults) ? {} : t.offered[0]?.args ?? {})}
              className={cardCls(sel, none)} title={t.kid} data-testid={`type-${t.id}`}>
              <span className="block text-sm font-medium truncate">{t.emoji} {t.label}{sel && " ✓"}</span>
              <span className="block text-[10px] text-muted-foreground truncate">{none ? "not offered" : `${t.offered.length} setting${t.offered.length === 1 ? "" : "s"}`}</span>
            </button>
          );
        })}
      </div>
      {type && <p className="text-xs text-muted-foreground">{type.kid}</p>}
      {type?.params.map(p => <ParamPicker key={p.id} type={type} param={p} args={args} onPick={v => choose(type, { [p.id]: v })}
        highlighted={highlight.includes(p.id)} disabled={disabled} />)}
      {showOffered && type && type.offered.length > 1 && type.offered.length <= 8 && (
        <div className="space-y-1">
          <span className="text-xs font-medium">Presets</span>
          <div className="flex flex-wrap gap-1.5" data-testid="offered-presets">
            {type.offered.map(o => {
              const sel = current?.key === o.key;
              return (
                <button key={o.key} type="button" disabled={disabled} aria-pressed={sel} onClick={() => onChange({ objectType: type.id, typeArgs: { ...type.defaults, ...o.args } })}
                  className={`text-[11px] border px-2 py-1 ${sel ? "border-primary bg-primary/10" : "hover:bg-muted"}`} data-testid={`preset-${o.key}`} title={o.key}>{o.label}</button>
              );
            })}
          </div>
        </div>
      )}
      {type && !current && <p role="alert" className="text-xs text-destructive" data-testid="text-not-offered">This combination isn't offered on this server. Pick another option.</p>}
    </div>
  );
}

function ParamPicker({ type, param, args, onPick, highlighted, disabled }: {
  type: ObjectTypeInfoLike; param: ParamSchemaLike; args: ArgsLike; onPick: (v: string | number) => void; highlighted: boolean; disabled: boolean;
}) {
  const offered = offeredValues(type, param.id);
  const cur = String(args[param.id]);
  const ring = highlighted ? "outline outline-2 outline-offset-2 outline-primary" : "";
  if (param.kind === "component") {
    return (
      <fieldset className={`space-y-1 min-w-0 ${ring}`} data-testid={`param-${param.id}`} data-highlight={highlighted || undefined}>
        <legend className="text-xs font-medium mb-1">{param.label}</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {[...(param.options ?? []), ...(param.legacy ?? []).filter(o => o.id === cur)].map(o => {
            const snap = snapToOffered(type, args, { [param.id]: o.id });
            const sel = cur === o.id;
            const badges = componentBadges(type.id, param, o.id, args);
            const delta = snap && !sel ? ruleDelta(type.id, args, type.id, { ...type.defaults, ...snap.args }) : null;
            return (
              <button key={o.id} type="button" aria-pressed={sel} disabled={disabled || !snap} onClick={() => !sel && onPick(o.id)}
                className={cardCls(sel, !snap)} title={snap ? o.kid : `${o.kid} (not offered on this server yet)`} data-testid={`option-${param.id}-${o.id}`}>
                <span className="flex items-baseline justify-between gap-1">
                  <span className="text-xs font-medium truncate">{o.emoji} {o.label}{sel && " ✓"}</span>
                  {delta && <Delta {...delta} />}
                </span>
                <span className="mt-1 block"><BadgeChips badges={badges} empty="" /></span>
                {!snap && <span className="block text-[10px] text-muted-foreground">not offered yet</span>}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }
  const values = [...new Set([...(param.presets ?? []).map(String), ...offered])].map(Number).sort((a, b) => a - b);
  return (
    <fieldset className={`space-y-1 min-w-0 ${ring}`} data-testid={`param-${param.id}`} data-highlight={highlighted || undefined}>
      <legend className="text-xs font-medium mb-1">{param.label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {values.map(v => {
          const snap = snapToOffered(type, args, { [param.id]: v });
          const sel = cur === String(v);
          const delta = snap && !sel ? ruleDelta(type.id, args, type.id, { ...type.defaults, ...snap.args }) : null;
          return (
            <button key={v} type="button" aria-pressed={sel} disabled={disabled || !snap} onClick={() => !sel && onPick(v)}
              className={`${cardCls(sel, !snap)} font-mono text-xs`} data-testid={`option-${param.id}-${v}`} title={snap ? undefined : "not offered yet"}>
              {intLabel(v)}{sel && " ✓"} {delta && <Delta {...delta} />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------

/**
 * The rule shelf / "possible gods": the families that can be dealt in this room grouped by badge, with
 * filter chips and a "show locked" toggle. Locked rows say why, and (for the owner) offer Unlock.
 */
export function RuleShelf({ entries, badges = [], onUnlock, onToggleExcluded, title = "Possible gods", unlockDisabled = false }: {
  entries: readonly CatalogEntryLike[];
  /** Owner only: deal or stop dealing a family in this room's games (settings.excludedFamilies). */
  onToggleExcluded?: (familyId: string, excluded: boolean) => void;
  /** Every capability badge (manifest classes), used to place locked rules in the group they would join. */
  badges?: readonly BadgeLike[];
  onUnlock?: (patch: ArgsLike) => void;
  title?: string;
  unlockDisabled?: boolean;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [showLocked, setShowLocked] = useState(false);
  const groups = useMemo(() => groupByBadge(entries, badges), [entries, badges]);
  const counts = shelfCounts(entries);
  const visible = groups.filter(g => filter === "all" || g.badge.id === filter);
  return (
    <div className="space-y-2 min-w-0" data-testid="rule-shelf">
      <div>
        <p className="text-sm"><b>{title}:</b> <span data-testid="text-shelf-count">{counts.available} of {counts.total}</span> rules can appear in this room</p>
        <div className="h-1.5 bg-muted mt-1 overflow-hidden" aria-hidden><div className="h-full bg-primary" style={{ width: `${counts.total ? (100 * counts.available) / counts.total : 0}%` }} /></div>
        <p className="text-xs text-muted-foreground mt-1">Each god secretly draws one utility function from these families, with secret settings. Who drew what is for you to work out.{counts.excluded > 0 && ` ${counts.excluded} ${counts.excluded === 1 ? "is" : "are"} not dealt in this game.`}{onToggleExcluded && " Untick a rule to stop dealing it."}</p>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter rules by badge">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={`text-[11px] border px-2 py-0.5 ${filter === "all" ? "bg-foreground text-background" : "hover:bg-muted"}`} data-testid="filter-all">All</button>
        {groups.map(g => (
          <button key={g.badge.id} type="button" aria-pressed={filter === g.badge.id} onClick={() => setFilter(g.badge.id)} title={g.badge.kid}
            className={`text-[11px] border px-2 py-0.5 whitespace-nowrap ${filter === g.badge.id ? "bg-foreground text-background" : "hover:bg-muted"}`} data-testid={`filter-${g.badge.id}`}>
            {g.badge.emoji} {g.badge.label} {g.available}
          </button>
        ))}
      </div>
      <div className="max-h-[420px] overflow-auto space-y-3 pr-1">
        {visible.map(g => {
          const rows = g.entries.filter(e => e.available || showLocked);
          if (!rows.length) return null;
          return (
            <section key={g.badge.id} data-testid={`shelf-group-${g.badge.id}`}>
              <h3 className="text-xs font-semibold" title={g.badge.kid}>{g.badge.emoji} {g.badge.label}</h3>
              <ul className="mt-1 space-y-1">
                {rows.map(e => (
                  <li key={e.id} className={`text-sm flex flex-wrap items-baseline gap-x-2 ${e.available && !e.excluded ? "" : "text-muted-foreground"}`} data-testid={`row-family-${e.id}`} data-excluded={e.excluded || undefined}>
                    {e.available && onToggleExcluded
                      ? <input type="checkbox" checked={!e.excluded} disabled={unlockDisabled} onChange={ev => onToggleExcluded(e.id, !ev.target.checked)}
                          aria-label={`Deal ${e.name} in this room's games`} className="self-center accent-[hsl(var(--primary))]" data-testid={`toggle-family-${e.id}`} />
                      : <span>{!e.available ? "🔒" : e.excluded ? "⊘" : "✓"}</span>}
                    <span className={`font-medium ${e.excluded ? "line-through" : ""}`}>{e.emoji} {e.name}</span>
                    {e.excluded && <span className="text-xs" data-testid={`text-excluded-${e.id}`}>not dealt in this game</span>}
                    <span className="text-xs text-muted-foreground min-w-0">{e.theme}</span>
                    {e.available && e.badges.length > 1 && <BadgeChips badges={e.badges.slice(1)} />}
                    {!e.available && (
                      <span className="basis-full pl-5 text-xs flex flex-wrap items-center gap-2">
                        <span data-testid={`text-locked-${e.id}`}>{lockedText(e.locked?.reason)}</span>
                        {onUnlock && e.locked?.unlock && (
                          <button type="button" disabled={unlockDisabled} onClick={() => onUnlock(e.locked!.unlock!)}
                            className="border px-1.5 py-0.5 text-foreground hover:bg-muted disabled:opacity-40" data-testid={`button-unlock-${e.id}`}>Unlock</button>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {counts.locked > 0 && (
        <button type="button" onClick={() => setShowLocked(s => !s)} className="text-xs underline" data-testid="button-show-locked" aria-expanded={showLocked}>
          {showLocked ? "hide locked" : `show locked (${counts.locked})`}
        </button>
      )}
    </div>
  );
}
