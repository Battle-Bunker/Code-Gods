/**
 * A paged site query throws a failed read into render (useLivePages, as Convex's usePaginatedQuery does). What would
 * break: a component using it with no error boundary of its own, so one failed list (the setups, a game's objects or
 * chat) blanks the whole page, header and all. Each such component sits inside an ErrorBoundary in its own file, and
 * every site page renders inside the layout's boundary, which keeps the header and clears on a new route.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dirname, "../src");
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name)) yield path;
  }
}
const read = (path: string) => readFileSync(path, "utf8");
const code = (text: string) => text.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/** Hooks that page through a query and so throw: useLivePages itself, and every exported hook that calls it. */
function throwingHooks(): string[] {
  const hooks = ["useLivePages"];
  for (const path of sources(join(SRC, "site/hooks"))) {
    const text = code(read(path));
    for (const m of text.matchAll(/export function (use\w+)\([^]*?\n\}/g)) if (/\buseLivePages\(/.test(m[0])) hooks.push(m[1]!);
    // An arrow hook on one line: export const useX = (…) => useLivePages(…).
    for (const m of text.matchAll(/export const (use\w+)\s*=[^\n]*\buseLivePages\(/g)) hooks.push(m[1]!);
  }
  return hooks;
}

test("every component that pages through a site query has an error boundary in its own file", () => {
  const hooks = throwingHooks();
  assert.ok(hooks.includes("useSetupPages"), "the setup picker's paged hook is found");
  const users: string[] = [];
  for (const path of sources(SRC)) {
    if (!path.endsWith(".tsx")) continue;
    const text = code(read(path));
    if (!hooks.some(h => new RegExp(`\\b${h}\\(`).test(text))) continue;
    users.push(relative(SRC, path));
    assert.match(text, /<ErrorBoundary\b/, `${relative(SRC, path)} pages through a query, so it renders that part inside an ErrorBoundary`);
  }
  assert.ok(users.length >= 2, `found the paged lists (${users.join(", ")})`);
});

test("every site page renders inside the layout's error boundary, which resets on a new route", () => {
  const layout = code(read(join(SRC, "site/components/layout.tsx")));
  assert.match(layout, /<main[^>]*><ErrorBoundary FallbackComponent=\{PageError\} resetKey=\{path\}>\{children\}<\/ErrorBoundary><\/main>/);
});
