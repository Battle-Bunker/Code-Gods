/** @jsxRuntime automatic */
/** A coloured board (lib/v2-grid-boards) in the grid scene: each tile in its colour with its letter; plain boards unchanged. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { board4Type, board7Type, decodeBoard } from "@workspace/v2-grid-boards";
import { RepView, repText } from "../src/index.ts";

test("a coloured board draws each tile in its colour, always with the colour's letter, and reads as the old wire", () => {
  const s = decodeBoard("7R,3G,0B,1R/2R,9B,4G,4G/8R,0R,0R,0R/1B,1B,1B,1B");
  const html = renderToStaticMarkup(<RepView type={board4Type} state={s} rep="cells" size="expanded" marks={[]} terms={[]} />);
  assert.match(html, /fill:#d7263d/, "red tiles");
  assert.match(html, /fill:#2667c9/, "blue tiles");
  assert.equal([...html.matchAll(/class="colour-letter"/g)].length, 16, "every tile has its letter");
  assert.match(repText(board4Type, s, "cells"), /^7R 3G 0B 1R \/ 2R 9B/);
  // The colour is its own rect under cell-bg, so focus and highlights (cell-bg fills) still show on a coloured tile.
  assert.ok(html.indexOf('class="cell-colour"') < html.indexOf('class="cell-bg"'));
  assert.match(html, /class="cell tinted"/);
});

test("cards show their glyphs", () => {
  const s = board7Type.origin(board7Type.variants[0]!);
  const html = renderToStaticMarkup(<RepView type={board7Type} state={s} rep="cells" size="expanded" marks={[]} terms={[]} />);
  assert.match(html, />A♠</);
});
