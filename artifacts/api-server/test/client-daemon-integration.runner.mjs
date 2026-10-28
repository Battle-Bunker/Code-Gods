import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(here, ".client-integration-"));
try {
  await build({
    entryPoints: [join(here, "client-daemon-integration.test.ts"), join(here, "device-security.test.ts"), join(here, "assistant-authority-integration.test.ts"), join(here, "client-daemon-integration.worker.ts")],
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
            export const fixtureSessions = new Map();
            export const fixtureStats = {sessionReads:0};
            const rooms = new Map(), games = new Map(), sessions = fixtureSessions;
            async function query(sql,a=[]) {
              const rows = value => ({rows:value});
              if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return rows([]);
              if (sql.startsWith("INSERT INTO cg_sessions")) {sessions.set(a[0],{data:JSON.parse(a[1]),expires:a[2]});return rows([]);}
              if (sql.startsWith("SELECT data,expires FROM cg_sessions WHERE hash")) {fixtureStats.sessionReads++;const s=sessions.get(a[0]);return rows(s && s.expires>Date.now()?[s]:[]);}
              if (sql.startsWith("SELECT data,expires FROM cg_sessions")) return rows([...sessions.values()].filter(s=>s.data.id===a[0] && s.data.scope==="player" && s.data.delegateId && s.expires>Date.now()));
              if (sql.startsWith("DELETE FROM cg_sessions")) {
                const deleted=[];
                for(const [key,s] of sessions) {
                  const match=sql.includes("WHERE hash=")?key===a[0]:s.data.delegateId===a[0] && (!sql.includes("AND data->>'id'") || s.data.id===a[1]);
                  if(match){sessions.delete(key);deleted.push({hash:key,...s});}
                }
                return rows(deleted);
              }
              if (sql.startsWith("INSERT INTO cg_devices")) {fixtureDevices.set(a[0],{id:a[0],code:a[1],secret_hash:a[2],challenge:a[3],room_id:a[4],expires:a[5],client_label:a[6],permission:a[7],status:"pending"});return rows([]);}
              if (sql.startsWith("SELECT * FROM cg_devices WHERE code")) return rows([...fixtureDevices.values()].filter(d=>d.code===a[0]));
              if (sql.startsWith("UPDATE cg_devices SET user_id")) {
                const updated=[];
                for(const d of fixtureDevices.values()) if(d.code===a[2] && d.status==="pending" && !d.user_id && d.expires>Date.now()) {
                  Object.assign(d,{user_id:a[0],user_name:a[1],status:a[3]});updated.push({id:d.id});
                }
                return rows(updated);
              }
              if (sql.startsWith("UPDATE cg_devices SET status='redeemed'") || sql.startsWith("SELECT status FROM cg_devices") || sql.startsWith("DELETE FROM cg_devices")) {
                const d=fixtureDevices.get(a[0]), valid=d && d.secret_hash===a[1] && d.challenge===a[2] && d.expires>Date.now();
                if(sql.startsWith("DELETE")) {if(d && d.secret_hash===a[1] && d.challenge===a[2]) {fixtureDevices.delete(a[0]);return rows([d]);}return rows([]);}
                if(sql.startsWith("UPDATE")) {if(valid && (d.status==="approved" || (d.status==="pending" && d.user_id))) {d.status="redeemed";return rows([d]);}return rows([]);}
                return rows(valid?[{status:d.status}]:[]);
              }
              if (sql.startsWith("SELECT id")) return rows([...games.values()].map(g=>({id:g.id,prefix_length:g.shortCode.length})));
              if (sql.startsWith("INSERT INTO cg_rooms")) {rooms.set(a[0],JSON.parse(a[3]));return rows([]);}
              if (sql.startsWith("INSERT INTO cg_games")) {games.set(a[0],JSON.parse(a[3]));return rows([]);}
              if (sql==="UPDATE cg_rooms SET state=$2 WHERE id=$1") {rooms.set(a[0],JSON.parse(a[1]));return rows([]);}
              // Interaction batches are a write-ahead log; this fixture keeps whole-room snapshots only.
              if (/^(INSERT INTO|DELETE FROM) cg_interaction_batches/.test(sql.trim())) return rows([]);
              throw new Error("Unexpected isolated fixture SQL");
            }
            export const pool={query,connect:async()=>({query,release(){}})};
          `,
        }));
      },
    }],
  });
  // Deliberately whitelist, not inherit: no DB credentials/model keys in children.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test", LOG_LEVEL: "silent" };
  const result = spawnSync(process.execPath, ["--experimental-transform-types", "--test", join(temp, "client-daemon-integration.test.mjs"), join(temp, "device-security.test.mjs"), join(temp, "assistant-authority-integration.test.mjs")], { env, stdio: "inherit", timeout: 120000 });
  process.exitCode = result.status ?? 1;
} finally { await rm(temp, { recursive: true, force: true }); }
