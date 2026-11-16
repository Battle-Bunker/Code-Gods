/**
 * `code.*`: v1's run_code (A15): a read-only script, `main(data, params)` in TypeScript or JavaScript, over one dataset of
 * the game in view, run in a sandbox of its own; each run is kept for its author (code.get, code.list; the Code results
 * pane). A script reads only: it cannot act in a game.
 */
import { z } from "zod/v4";
import { affordance, id, obj, page, paging, requestId } from "../define.ts";
import { IN_GAME, SIGNED_IN } from "../types.ts";

const GAME = [...IN_GAME, "ended", "replay"] as const;
const dataset = z.enum(["replay", "my-moves", "none"]).describe("replay: an ended game's whole record (every event and every rule); my-moves: your act log in this game (newest first, at most 2,000 rows, as you see it); none: no data.");
const status = z.enum(["ok", "error"]);
const scriptName = z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/).describe("A saved script's name: 1–64 letters, digits, _ - and dots.");

export const codeOps = [
  affordance({
    id: "code.run", title: "Run code over the game's data", group: "play", scope: "game",
    description: "Runs a read-only script over one dataset of this game and keeps the run (v1's run_code). Define `main(data, params)` in TypeScript or JavaScript and return JSON; console.log output is kept. 10 s and 256 MiB at most; the result at most 256 KiB of JSON (return a summary). Returns the run's id, a preview of the result and the output; code.get reads the whole run.",
    tooltip: "Analyse the game with a script.", keywords: ["run code", "script", "analyse", "analytics", "replay data", "compute"],
    params: obj({
      language: z.enum(["typescript", "javascript"]).optional().describe("Required with source."),
      source: z.string().min(1).max(64 * 1024).optional().describe("The script; or give `script` to run a saved one."),
      script: scriptName.optional().describe("Run this saved script instead of a source (code.scripts lists them)."),
      saveAs: scriptName.optional().describe("Save the source under this name once it runs without an error."),
      dataset,
      params: z.record(z.string(), z.unknown()).optional().describe("Passed to main as its second argument."),
      title: z.string().max(80).optional(), requestId: requestId.optional(),
    }),
    result: z.object({
      runId: id, status, title: z.string(), saved: z.string().nullable().describe("The name the source was saved under (saveAs), if it was."),
      saveRefused: z.string().optional(), resultPreview: z.string().nullable(), resultChars: z.number().int(),
      error: z.string().nullable(), output: z.string(), ms: z.number(),
    }),
    contexts: GAME, caller: "member", effect: "write", confirm: "none", runs: "server", action: true,
  }),
  affordance({
    id: "code.get", title: "Show a code run", group: "play", scope: "none",
    description: "One of your code runs whole: its source, dataset, outcome, result (JSON), error and console output.",
    tooltip: "A script's result.", keywords: ["code result", "run result", "script output"],
    params: obj({ runId: id }),
    result: z.object({
      runId: id, title: z.string(), language: z.string(), source: z.string(), dataset: z.string(), gameId: id.nullable(),
      status, result: z.unknown().nullable(), error: z.string().nullable(), output: z.string(), ms: z.number(), at: z.number(),
    }),
    contexts: SIGNED_IN, caller: "signedIn", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "code.list", title: "List my code runs", group: "play", scope: "none",
    description: "Your code runs, newest first: title, language, dataset, outcome and when.",
    tooltip: "Your scripts' runs.", keywords: ["code runs", "my scripts", "results"],
    params: obj({ ...paging }),
    result: page(z.object({ runId: id, title: z.string(), language: z.string(), dataset: z.string(), status, ms: z.number(), at: z.number() })),
    contexts: SIGNED_IN, caller: "signedIn", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "code.scripts", title: "List my saved scripts", group: "play", scope: "none",
    description: "Your saved scripts (code.run saveAs): name, language, title and when last saved. Run one with code.run's `script`.",
    tooltip: "Scripts you saved.", keywords: ["saved scripts", "my scripts", "code library"],
    params: obj({}), result: z.object({ scripts: z.array(z.object({ name: z.string(), language: z.string(), title: z.string(), updatedAt: z.number() })) }),
    contexts: SIGNED_IN, caller: "signedIn", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "code.deleteScript", title: "Delete a saved script", group: "play", scope: "none",
    description: "Deletes one of your saved scripts by name.",
    tooltip: "Remove a saved script.", keywords: ["delete script", "remove script"],
    params: obj({ name: scriptName, requestId: requestId.optional() }), result: z.object({ deleted: z.boolean() }),
    contexts: SIGNED_IN, caller: "signedIn", effect: "destructive", confirm: "modal", runs: "server",
  }),
] as const;
