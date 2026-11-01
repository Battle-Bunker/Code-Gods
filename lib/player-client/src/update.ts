/**
 * Updating a running client after a deploy, so nobody has to know about deploys or refresh.
 *
 * The signal: every hosted build carries its id in index.html (`<meta name="code-gods-build">`, written by the
 * Vite plugin in `./vite-build-id`), and deploy-static records each uploaded build in the engine. The public query
 * `version:current` answers, per site ("engine" UI at /, "player" client at /client/, and "functions"), the live
 * build and the recent ones. A page whose build is a recent but not the live one is outdated.
 *
 * - **Hosted builds** (`startAutoUpdate` with `reload: true`) update themselves at a safe moment: at once when the
 *   tab is hidden or idle, after a short visible countdown when nobody is typing and no draft is open, and otherwise
 *   at the next safe moment, with a one-click banner meanwhile. Drafts registered with `registerDraft` are saved
 *   before the reload and restored after it; other non-empty text input blocks the automatic reload altogether.
 *   `location.reload()` keeps the URL, so the route survives.
 * - **Compatibility guard**: a call the server rejects because the client is too old (the error code
 *   `CLIENT_OUTDATED`, or the argument/unknown-function errors a newer server gives an older client) takes the
 *   same path at once (`guardConvexClient`), instead of a raw error.
 * - **Dev servers and third-party clients** decide for themselves: `watchEngineVersion` is the signal, and
 *   `startAutoUpdate` with `reload: false` only offers a dismissible note when the engine's functions change.
 *
 * The rules (`assessBuild`, `updateTarget`, `decideUpdate`, `mayReload`, `incompatibility`) are pure and unit-tested;
 * the controller below only feeds them the page's state.
 */
import { api } from "@workspace/engine/convex/_generated/api.js";
import { BUILD_META, readBuildMeta } from "./build-meta.ts";

export { BUILD_META, readBuildMeta };
export type HostedSite = "engine" | "player";
export type VersionSite = HostedSite | "functions";
/** One site's live build, and its recent builds newest first (the live one included). */
export interface SiteVersion { build: string; deployedAt: number; recent: string[] }
export type EngineVersion = Record<VersionSite, SiteVersion | null>;

export const UPDATE_TIMING = {
  /** No pointer or key input for this long: the tab is idle and reloads at once. */
  idleMs: 60_000,
  /** The visible "Updated: reloading in…" countdown on an untouched page. */
  countdownMs: 5_000,
  /** A keystroke this recent holds even an urgent reload. */
  typingMs: 2_000,
  /** One automatic reload per target in this window (the new build may not be served yet). */
  retryMs: 5 * 60_000,
} as const;

// ---------------------------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------------------------

/**
 * current: this is the live build. outdated: an earlier recorded build. unknown: no build id (dev server), nothing
 * recorded, or a build not recorded yet (uploaded a moment before deploy-static records it): never act on unknown.
 */
export function assessBuild(own: string | null, site: SiteVersion | null): "current" | "outdated" | "unknown" {
  if (!own || !site) return "unknown";
  if (own === site.build) return "current";
  return site.recent.includes(own) ? "outdated" : "unknown";
}

export type Incompatibility = "client-outdated" | "shape";

/** Why a failed call shows that the client is too old for the server, or null. */
export function incompatibility(error: unknown): Incompatibility | null {
  if (!error || typeof error !== "object") return null;
  const data = (error as { data?: unknown }).data;
  if (data && typeof data === "object" && (data as { code?: unknown }).code === "CLIENT_OUTDATED") return "client-outdated";
  const message = error instanceof Error ? error.message : "";
  return /\bArgumentValidationError\b|Could not find public function/.test(message) ? "shape" : null;
}

/** What to update to, and whether it is urgent; null: stay. */
export function updateTarget(own: string | null, site: SiteVersion | null, seen: Incompatibility | null): { target: string; urgent: boolean } | null {
  const state = assessBuild(own, site);
  if (state === "outdated") return { target: site!.build, urgent: seen !== null };
  // The functions can go out minutes before the static site: a current build waits for the next one to be recorded.
  if (state === "current" || !own) return null;
  // The server names this client too old but never recorded its build: reload once to whatever is live.
  return seen === "client-outdated" ? { target: `incompatible:${own}`, urgent: true } : null;
}

export interface Safety {
  now: number;
  hidden: boolean;
  /** Last pointer, key, wheel or touch input; and last key press. */
  lastInputAt: number;
  lastKeyAt: number;
  /** Focus is in a text field. */
  editing: boolean;
  /** A registered (persisted) draft has text. */
  draftOpen: boolean;
  /** Text input that nothing persists: never reload over it automatically. */
  unsaved: boolean;
  urgent: boolean;
  /** When the visible countdown started, or null. */
  countdownSince: number | null;
}
export type Decision = { action: "reload" } | { action: "countdown"; remainingMs: number } | { action: "wait"; reason: "unsaved" | "draft" };

/** The safe-moment rule. */
export function decideUpdate(s: Safety): Decision {
  if (s.unsaved) return { action: "wait", reason: "unsaved" };
  if (s.hidden || s.now - s.lastInputAt >= UPDATE_TIMING.idleMs) return { action: "reload" };
  if (s.urgent) return s.now - s.lastKeyAt < UPDATE_TIMING.typingMs ? { action: "wait", reason: "draft" } : { action: "reload" };
  if (s.draftOpen || s.editing) return { action: "wait", reason: "draft" };
  const remainingMs = s.countdownSince === null ? UPDATE_TIMING.countdownMs : UPDATE_TIMING.countdownMs - (s.now - s.countdownSince);
  return remainingMs <= 0 ? { action: "reload" } : { action: "countdown", remainingMs };
}

export interface ReloadMark { target: string; at: number }
/** At most one automatic reload per target per retry window. */
export function mayReload(mark: ReloadMark | null, target: string, now: number): boolean {
  return !mark || mark.target !== target || now - mark.at >= UPDATE_TIMING.retryMs;
}

// ---------------------------------------------------------------------------------------------
// The SDK signal
// ---------------------------------------------------------------------------------------------

type QueryRef = typeof api.version.current;
/** A ConvexClient (`convex/browser`) or ConvexReactClient (`convex/react`). */
export type VersionClient =
  | { onUpdate(query: QueryRef, args: Record<string, never>, cb: (v: EngineVersion) => void, onError?: (e: Error) => void): unknown }
  | { watchQuery(query: QueryRef, args: Record<string, never>): { onUpdate(cb: () => void): () => void; localQueryResult(): EngineVersion | undefined } };

/**
 * Calls `onVersion` with the engine's deployed versions now and after every deploy. Returns an unsubscribe function.
 * For any client: compare `version.functions` with the first value to learn the engine changed, or your page's
 * build id (`ownBuild()`) with `version.engine`/`version.player` through `assessBuild`.
 */
export function watchEngineVersion(client: VersionClient, onVersion: (version: EngineVersion) => void): () => void {
  if ("watchQuery" in client) {
    const watch = client.watchQuery(api.version.current, {});
    const emit = () => { try { const v = watch.localQueryResult(); if (v) onVersion(v); } catch { /* a failed read: wait for the next */ } };
    const stop = watch.onUpdate(emit);
    emit();
    return stop;
  }
  const sub = client.onUpdate(api.version.current, {}, onVersion, () => { /* transient: the subscription retries */ });
  return () => {
    if (typeof sub === "function") sub();
    else (sub as { unsubscribe?: () => void } | undefined)?.unsubscribe?.();
  };
}

/** This page's build id (the meta tag in its index.html), or null on a dev server. */
export function ownBuild(doc: Document = document): string | null {
  return doc.querySelector<HTMLMetaElement>(`meta[name="${BUILD_META}"]`)?.content || null;
}

// ---------------------------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------------------------

export interface DraftSource {
  /** A stable key (e.g. "assistant"); the saved draft is restored only on the same URL. */
  key: string;
  /** Elements this draft covers: they never count as unsaved input. */
  selector: string;
  read(): string;
  write(text: string): void;
}
const drafts = new Map<string, DraftSource>();
const DRAFT_STORE = "cg.update.drafts";

function session(): Storage | null { try { return globalThis.sessionStorage ?? null; } catch { return null; } }

/** Registers a draft to save before an update reload; restores the one saved for this URL, if any. Returns unregister. */
export function registerDraft(source: DraftSource): () => void {
  drafts.set(source.key, source);
  const store = session();
  try {
    const saved = JSON.parse(store?.getItem(DRAFT_STORE) ?? "{}") as Record<string, { url: string; text: string }>;
    const mine = saved[source.key];
    if (mine) {
      if (mine.url === location.pathname + location.search && !source.read().trim()) source.write(mine.text);
      delete saved[source.key];
      store?.setItem(DRAFT_STORE, JSON.stringify(saved));
    }
  } catch { /* unreadable: nothing to restore */ }
  return () => { if (drafts.get(source.key) === source) drafts.delete(source.key); };
}

function saveDrafts(): void {
  const saved: Record<string, { url: string; text: string }> = {};
  for (const d of drafts.values()) { const text = d.read(); if (text.trim()) saved[d.key] = { url: location.pathname + location.search, text }; }
  try { session()?.setItem(DRAFT_STORE, JSON.stringify(saved)); } catch { /* storage off: the draft cannot survive */ }
}

// ---------------------------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------------------------

const TEXT_INPUT = 'textarea, [contenteditable=""], [contenteditable="true"], input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], input[type=number], input[type=password], input[type=tel]';

function isTextField(el: Element | null): el is HTMLElement {
  return !!el && el.matches(TEXT_INPUT) && !(el as HTMLInputElement).readOnly && !(el as HTMLInputElement).disabled;
}
function textOf(el: HTMLElement): string {
  return "value" in el ? String((el as HTMLInputElement).value) : el.textContent ?? "";
}

/**
 * Unsaved text: a non-empty textarea or editor, the focused text field once it has text, or anything marked
 * `data-unsaved="true"`; never an element a registered draft covers or one marked `data-update-safe`.
 */
function pageSafety(): Pick<Safety, "editing" | "draftOpen" | "unsaved"> {
  const covered = (el: Element) => el.closest("[data-update-safe]") || [...drafts.values()].some(d => el.matches(d.selector));
  const active = document.activeElement;
  const editing = isTextField(active);
  let unsaved = !!document.querySelector('[data-unsaved="true"]');
  if (!unsaved) {
    for (const el of document.querySelectorAll<HTMLElement>(TEXT_INPUT)) {
      if (covered(el) || !textOf(el).trim() || !(el.matches('textarea, [contenteditable]') || el === active)) continue;
      if (el.offsetParent === null && el !== active) continue;   // hidden fields are not the player's draft
      unsaved = true; break;
    }
  }
  const draftOpen = [...drafts.values()].some(d => d.read().trim().length > 0);
  return { editing, draftOpen, unsaved };
}

export interface AutoUpdateOptions {
  client: VersionClient;
  site: HostedSite;
  /** true: a hosted build that reloads itself. false: a dev server or other client: notes only, never reloads. */
  reload: boolean;
  /** This page's build id; default `ownBuild()`. */
  build?: string | null;
}
export interface AutoUpdate {
  /** A call failed: when it shows the client is too old, update at once (or note it). */
  reportError(error: unknown): void;
  stop(): void;
}

const MARK = "cg.update.reload";
type G = typeof globalThis & { __cgAutoUpdate?: AutoUpdate };

/** Starts watching for deploys (once per page; hot updates reuse it). */
export function startAutoUpdate(options: AutoUpdateOptions): AutoUpdate {
  const g = globalThis as G;
  if (g.__cgAutoUpdate) return g.__cgAutoUpdate;
  const own = options.build === undefined ? ownBuild() : options.build;
  let version: EngineVersion | null = null;
  let functionsAtLoad: string | null | undefined;
  let seen: Incompatibility | null = null;
  let countdownSince: number | null = null;
  let dismissed = false;
  let lastInputAt = Date.now(), lastKeyAt = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.dataset.testid = "update-banner";
  banner.dataset.updateSafe = "";
  Object.assign(banner.style, {
    position: "fixed", left: "50%", bottom: "16px", transform: "translateX(-50%)", zIndex: "2147483000", display: "none",
    alignItems: "center", gap: "10px", padding: "8px 12px", borderRadius: "8px", font: "13px/1.3 system-ui, sans-serif",
    background: "rgba(20,20,24,0.92)", color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.25)", maxWidth: "calc(100vw - 32px)",
  });
  const text = document.createElement("span");
  const button = (label: string, testid: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.dataset.testid = testid;
    Object.assign(b.style, { font: "inherit", color: "inherit", background: "transparent", border: "1px solid rgba(255,255,255,0.5)", borderRadius: "6px", padding: "2px 8px", cursor: "pointer" });
    b.addEventListener("click", onClick);
    return b;
  };
  const now = button("Reload now", "button-update-reload", () => reload(null));
  const dismiss = button("Dismiss", "button-update-dismiss", () => { dismissed = true; render(null); });
  banner.append(text, now, dismiss);
  const attach = () => { if (!banner.isConnected) document.body.append(banner); };

  function render(message: string | null, canDismiss = false) {
    if (!message) { banner.style.display = "none"; return; }
    attach();
    text.textContent = message;
    dismiss.style.display = canDismiss ? "" : "none";
    banner.style.display = "flex";
  }

  function readMark(): ReloadMark | null { try { return JSON.parse(session()?.getItem(MARK) ?? "null"); } catch { return null; } }
  function reload(target: string | null) {
    saveDrafts();
    if (target) { try { session()?.setItem(MARK, JSON.stringify({ target, at: Date.now() } satisfies ReloadMark)); } catch { /* best effort */ } }
    location.reload();
  }

  function evaluate() {
    if (!options.reload) {
      const changed = functionsAtLoad !== undefined && (version?.functions?.build ?? null) !== functionsAtLoad;
      render(!dismissed && (changed || seen) ? "The engine was updated: this client may be out of date." : null, true);
      return;
    }
    const goal = updateTarget(own, version ? version[options.site] : null, seen);
    if (!goal) { countdownSince = null; render(seen === "client-outdated" ? "Updating to the new version…" : null); return; }
    const t = Date.now();
    const decision = decideUpdate({ now: t, hidden: document.visibilityState === "hidden", lastInputAt, lastKeyAt, ...pageSafety(), urgent: goal.urgent, countdownSince });
    if (decision.action === "reload") {
      if (mayReload(readMark(), goal.target, t)) return reload(goal.target);
      countdownSince = null;
      render("A new version is ready.");
    } else if (decision.action === "countdown") {
      countdownSince ??= t;
      render(`Updated — reloading in ${Math.ceil(decision.remainingMs / 1000)} s…`);
    } else {
      countdownSince = null;
      render(decision.reason === "unsaved" ? "A new version is ready: reload when you have saved your work." : "A new version is ready: it loads when you pause.");
    }
    timer ??= setInterval(evaluate, 1000);
  }

  const onInput = (e: Event) => { lastInputAt = Date.now(); if (e.type === "keydown") lastKeyAt = lastInputAt; };
  const inputs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  for (const type of inputs) window.addEventListener(type, onInput, { capture: true, passive: true });
  document.addEventListener("visibilitychange", evaluate);

  const unwatch = watchEngineVersion(options.client, v => {
    version = v;
    if (functionsAtLoad === undefined) functionsAtLoad = v.functions?.build ?? null;
    evaluate();
  });

  const controller: AutoUpdate = {
    reportError(error) {
      const why = incompatibility(error);
      if (!why || seen === "client-outdated") return;
      seen = why;
      evaluate();
    },
    stop() {
      unwatch();
      if (timer) clearInterval(timer);
      for (const type of inputs) window.removeEventListener(type, onInput, { capture: true });
      document.removeEventListener("visibilitychange", evaluate);
      banner.remove();
      delete g.__cgAutoUpdate;
    },
  };
  return g.__cgAutoUpdate = controller;
}

type Callable = (...args: any[]) => Promise<unknown>;
type Watch = { localQueryResult(): unknown };
/**
 * Reports every failed mutation, action and (React client) query read of a Convex client to `onError`, then
 * rethrows, so an old client's rejected call reaches the update path wherever it was made. Idempotent.
 */
export function guardConvexClient<C extends { mutation: Callable; action: Callable }>(client: C, onError: (error: unknown) => void): C {
  const marked = client as C & { __cgGuarded?: boolean; watchQuery?: (...args: any[]) => Watch };
  if (marked.__cgGuarded) return client;
  for (const name of ["mutation", "action"] as const) {
    const original = client[name].bind(client) as Callable;
    (client as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      try { return await original(...args); } catch (error) { onError(error); throw error; }
    };
  }
  if (typeof marked.watchQuery === "function") {
    const watchQuery = marked.watchQuery.bind(client);
    marked.watchQuery = (...args: unknown[]) => {
      const watch = watchQuery(...args);
      const read = watch.localQueryResult.bind(watch);
      watch.localQueryResult = () => { try { return read(); } catch (error) { onError(error); throw error; } };
      return watch;
    };
  }
  marked.__cgGuarded = true;
  return client;
}
