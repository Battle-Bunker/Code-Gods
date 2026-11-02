/**
 * Grid glyphs gallery (dev only: `pnpm --filter @workspace/player-web dev`, then /glyphs.html): 7×7 card grids with and
 * without tens, and the single-character digit sets, in both Grid renderers, the letter cue, and the dark scheme's
 * shades. e2e/grid-glyphs.ts checks here that every card grid's columns are the same width in every row and that a grid
 * with tens is exactly as wide as one without, and takes the screenshots in docs/screenshots/ten-glyph/.
 */
import { StrictMode, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { SYMBOL_COMPONENTS, type GridSymbolSet } from "@workspace/game-types";
import { DIGIT_SHADES, GridObject, PAGE, setColourCue, textShadeToken } from "@workspace/object-views";
import "../index.css";

const LETTERS = ["R", "O", "Y", "G", "B", "V"];
/** A deterministic n×n board of a symbol set; `pick` chooses the symbol index for cell k. */
function board(n: number, symbols: GridSymbolSet, pick: (k: number) => number): string {
  const codes = SYMBOL_COMPONENTS[symbols].codes;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => {
    const k = r * n + c;
    return `${codes[pick(k) % codes.length]}${LETTERS[(k * 5 + r) % LETTERS.length]}`;
  }).join(",")).join("/");
}

const CARDS = { size: 7, symbols: "cards", colours: "rainbow6" } as const;
// Card index = suit · 13 + rank; rank 9 is the ten. "Tens" puts a ten in most rows, at different columns.
const BOARDS = [
  { id: "cards-tens", title: "7×7 cards, tens in most rows", grid: CARDS, value: board(7, "cards", k => (k % 9 === 2 ? 9 + 13 * (k % 4) : k * 7 + 3)) },
  { id: "cards-no-tens", title: "7×7 cards, no tens", grid: CARDS, value: board(7, "cards", k => { const i = (k * 7 + 3) % 52; return i % 13 === 9 ? i + 1 : i; }) },
  { id: "cards-all-tens", title: "4×4 cards, only tens", grid: { ...CARDS, size: 4 }, value: board(4, "cards", k => 9 + 13 * (k % 4)) },
  { id: "base12", title: "6×6 base 12", grid: { size: 6, symbols: "base12", colours: "rainbow6" }, value: board(6, "base12", k => k * 5) },
  { id: "base16", title: "6×6 hex", grid: { size: 6, symbols: "base16", colours: "rainbow6" }, value: board(6, "base16", k => k * 7) },
] as const;

/** The dark scheme's digit shades on its page, as the engine UI's .dark sets them. */
const DARK: CSSProperties = Object.fromEntries([
  ...Object.entries(DIGIT_SHADES.rainbow6.dark).map(([l, hex]) => [textShadeToken(l), hex]),
  ["background", PAGE.dark], ["color", "#e8e6e3"],
]);

function Board({ id, title, grid, value, renderer }: (typeof BOARDS)[number] & { renderer: "digits" | "tiles" }) {
  return (
    <figure className="space-y-1" data-board={`${id}-${renderer}`}>
      <figcaption className="text-xs opacity-70">{title} · {renderer}</figcaption>
      <GridObject value={value} grid={grid} renderer={renderer} />
    </figure>
  );
}

function Panel({ scheme }: { scheme: "light" | "dark" }) {
  return (
    <section className="flex flex-wrap items-start gap-8 p-5" style={scheme === "dark" ? DARK : { background: PAGE.light }} data-scheme={scheme}>
      {BOARDS.map(b => <Board key={`${b.id}-d`} {...b} renderer="digits" />)}
      {BOARDS.slice(0, 3).map(b => <Board key={`${b.id}-t`} {...b} renderer="tiles" />)}
    </section>
  );
}

// The cue is set before the first render, so the page is measured as it asks.
setColourCue(new URLSearchParams(location.search).get("cue") === "letter" ? "letter" : "pattern");

function Gallery() {
  return <main className="space-y-2" data-ready="true"><Panel scheme="light" /><Panel scheme="dark" /></main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Gallery /></StrictMode>);
