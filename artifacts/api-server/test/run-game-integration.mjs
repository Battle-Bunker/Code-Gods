import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

// No database credentials or live providers are used. All SQL terminates in a
// fresh in-memory fixture inside the isolated test process.
const here = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(here, ".integration-"));
try {
  await build({
    entryPoints: [join(here, "game-integration.test.ts")], outfile: join(temp, "test.mjs"),
    bundle: true, platform: "node", format: "esm", packages: "external",
    plugins: [{
      name: "isolated-authority",
      setup(build) {
        build.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({ path: fileURLToPath(new URL("../../../lib/api-zod/src/index.ts", import.meta.url)) }));
        build.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
        build.onResolve({ filter: /\/lib\/identity$/ }, () => ({ path: "identity", namespace: "fixture" }));
        build.onLoad({ filter: /^identity$/, namespace: "fixture" }, () => ({
          contents: `
            import {createHash} from "node:crypto";
            export const fixtureActors = new Map();
            export const hash = x => createHash("sha256").update(x).digest("hex");
            export const lookupSession = async token => fixtureActors.get(token);
            export function requireIdentity(req) {
              const actor = fixtureActors.get(req.headers.authorization?.slice(7));
              if (!actor) throw Object.assign(new Error("Unauthorized"),{status:401});
              return actor;
            }
          `,
        }));
        build.onLoad({ filter: /^db$/, namespace: "fixture" }, () => ({
          contents: `
            export const fixtureRooms = new Map(), fixtureGames = new Map(), fixtureAgents = new Map();
            async function query(sql,args=[]) {
              if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return {rows:[]};
              if (sql==="SELECT * FROM cg_ai_agents WHERE id=$1") return {rows:fixtureAgents.has(args[0])?[fixtureAgents.get(args[0])]:[]};
              if (sql.startsWith("SELECT id")) return {rows:[...fixtureGames.values()].map(g=>({id:g.id,prefix_length:g.shortCode.length}))};
              if (sql.startsWith("INSERT INTO cg_rooms")) {fixtureRooms.set(args[0],JSON.parse(args[3]));return {rows:[]};}
              if (sql.startsWith("INSERT INTO cg_games")) {fixtureGames.set(args[0],JSON.parse(args[3]));return {rows:[]};}
              if (sql==="UPDATE cg_rooms SET state=$2 WHERE id=$1") {fixtureRooms.set(args[0],JSON.parse(args[1]));return {rows:[]};}
              throw new Error("Unexpected fixture SQL: "+sql);
            }
            export const pool={query,connect:async()=>({query,release(){}})};
          `,
        }));
      },
    }],
  });
  const result = spawnSync(process.execPath, ["--experimental-transform-types", "--test", join(temp, "test.mjs")], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally { await rm(temp, { recursive: true, force: true }); }
