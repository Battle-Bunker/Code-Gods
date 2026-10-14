import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import test from "node:test";

test("single-instance recovery and shutdown drain writes without session locks", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cg-shutdown-"));
  const outfile = join(temp, "test.mjs");
  try {
    await build({
      stdin: {
        resolveDir: fileURLToPath(new URL("../src/game", import.meta.url)),
        contents: `
          import assert from "node:assert/strict";
          import {initializeStore, resolveRoom, mutate, closeStore} from "./store";
          import {state, events} from "@workspace/db";
          await initializeStore();
          assert.equal(resolveRoom(state.id).game.phase, "recovery");
          assert.equal(state.game.phase, "recovery");
          let proceed;
          const gate = new Promise(r => proceed = r);
          const write = mutate(state.id, async room => { await gate; room.aiUsed += 7; });
          const closing = closeStore();
          await assert.rejects(mutate(state.id, async () => {}), /shutting down/);
          assert.equal(state.aiUsed, 0);
          proceed();
          await write; await closing;
          assert.equal(state.aiUsed, 7);
          assert.deepEqual(events.slice(-2), ["persist", "release"]);
          assert.equal(events.filter(x => x === "connect").length, events.filter(x => x === "release").length);
        `,
      },
      outfile, bundle: true, platform: "node", format: "esm",
      plugins: [{
        name: "isolated-shutdown",
        setup(builder) {
          builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
          builder.onResolve({ filter: /\/lib\/logger$/ }, () => ({ path: "logger", namespace: "fixture" }));
          builder.onLoad({ filter: /^logger$/, namespace: "fixture" }, () => ({ contents: "export const logger={fatal(){}};" }));
          builder.onLoad({ filter: /^db$/, namespace: "fixture" }, () => ({ contents: `
            export let state={id:"11111111-1111-4111-8111-111111111111",ownerId:"owner",shortCode:"11111111",
              seq:0,aiUsed:0,game:{id:"22222222-2222-4222-8222-222222222222",shortCode:"22222222",phase:"running"}};
            export const events=[];
            async function query(sql,args=[]) {
              if(sql.includes("advisory")) throw new Error("Session locks must not be used");
              if(sql==="SELECT state FROM cg_rooms") return {rows:[{state:structuredClone(state)}]};
              if(sql.startsWith("SELECT id,prefix_length")) return {rows:[{id:state.game.id,prefix_length:8}]};
              if(sql.startsWith("INSERT INTO cg_rooms")) {state=JSON.parse(args[3]);events.push("persist");}
              if(sql==="UPDATE cg_rooms SET state=$2 WHERE id=$1") state=JSON.parse(args[1]);
              return {rows:[]};
            }
            export const pool={query,connect:async()=>{events.push("connect");return {query,release(){events.push("release");}}}};
          ` }));
        },
      }],
    });
    await import(pathToFileURL(outfile).href);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
