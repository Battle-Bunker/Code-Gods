import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(here, ".client-integration-"));
try {
  await build({
    entryPoints: [join(here, "client-daemon-integration.test.ts"), join(here, "client-daemon-integration.worker.ts")],
    outdir: temp, outExtension: { ".js": ".mjs" },
    bundle: true, platform: "node", format: "esm", packages: "external",
    plugins: [{
      name: "isolated-sql",
      setup(build) {
        build.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({ path: fileURLToPath(new URL("../../../lib/api-zod/src/index.ts", import.meta.url)) }));
        build.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `
            export const fixtureDevices = new Map();
            const rooms = new Map(), games = new Map(), sessions = new Map();
            async function query(sql,a=[]) {
              const rows = value => ({rows:value});
              if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return rows([]);
              if (sql.startsWith("INSERT INTO cg_sessions")) {sessions.set(a[0],{data:JSON.parse(a[1]),expires:a[2]});return rows([]);}
              if (sql.startsWith("SELECT data FROM cg_sessions")) {const s=sessions.get(a[0]);return rows(s && s.expires>Date.now()?[s]:[]);}
              if (sql.startsWith("INSERT INTO cg_devices")) {fixtureDevices.set(a[0],{id:a[0],code:a[1],secret_hash:a[2],challenge:a[3],room_id:a[4],expires:a[5]});return rows([]);}
              if (sql.startsWith("SELECT room_id FROM cg_devices")) return rows([...fixtureDevices.values()].filter(d=>d.code===a[0] && d.expires>Date.now() && !d.user_id));
              if (sql.startsWith("UPDATE cg_devices")) {for(const d of fixtureDevices.values()) if(d.code===a[2] && !d.user_id) Object.assign(d,{user_id:a[0],user_name:a[1]});return rows([]);}
              if (sql.startsWith("DELETE FROM cg_devices") || sql.startsWith("SELECT id FROM cg_devices")) {
                const d=fixtureDevices.get(a[0]), valid=d && d.secret_hash===a[1] && d.challenge===a[2] && d.expires>Date.now();
                if(sql.startsWith("DELETE")) {if(valid && d.user_id) {fixtureDevices.delete(a[0]);return rows([d]);}return rows([]);}
                return rows(valid?[{id:d.id}]:[]);
              }
              if (sql.startsWith("SELECT id")) return rows([...games.values()].map(g=>({id:g.id,prefix_length:g.shortCode.length})));
              if (sql.startsWith("INSERT INTO cg_rooms")) {rooms.set(a[0],JSON.parse(a[3]));return rows([]);}
              if (sql.startsWith("INSERT INTO cg_games")) {games.set(a[0],JSON.parse(a[3]));return rows([]);}
              if (sql==="UPDATE cg_rooms SET state=$2 WHERE id=$1") {rooms.set(a[0],JSON.parse(a[1]));return rows([]);}
              throw new Error("Unexpected isolated fixture SQL");
            }
            export const pool={query,connect:async()=>({query,release(){}})};
          `,
        }));
      },
    }],
  });
  // Deliberately whitelist, not inherit: no DB credentials/model keys in children.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" };
  const result = spawnSync(process.execPath, ["--experimental-transform-types", "--test", join(temp, "client-daemon-integration.test.mjs")], { env, stdio: "inherit", timeout: 120000 });
  process.exitCode = result.status ?? 1;
} finally { await rm(temp, { recursive: true, force: true }); }
