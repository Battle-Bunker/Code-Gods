import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentName } from "../src/core/panels/agent-name.ts";

test("an agent's name shows prominently, with an accessible (i) carrying the whole description", () => {
  const html = renderToStaticMarkup(createElement(AgentName, { id: "a1", name: "Corner hoarder", description: "Moves big values to the corner.\nThen waits." }));
  assert.match(html, /Corner hoarder/);
  assert.match(html, /<button[^>]*aria-label="About Corner hoarder"[^>]*>\(i\)<\/button>/);
  assert.match(html, /title="Moves big values to the corner\.\nThen waits\."/);
  assert.match(html, /role="tooltip"[^>]*>Moves big values to the corner\./);
});

test("an agent without a description has no (i)", () => {
  const html = renderToStaticMarkup(createElement(AgentName, { id: "a2", name: "Agent 2" }));
  assert.match(html, /Agent 2/);
  assert.doesNotMatch(html, /\(i\)|tooltip/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(AgentName, { id: "a3", name: "X", description: "   " })), /\(i\)/);
});
