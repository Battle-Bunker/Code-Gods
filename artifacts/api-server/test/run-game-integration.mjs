import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

// No database credentials or live providers are used. The isolated SQL fixture
// fsyncs a temporary snapshot on COMMIT; this is NOT a PostgreSQL benchmark.
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
            export const assertSessionActive = () => {};
            export const requireAct = actor => {if(actor.permission==="read") throw new Error("Read-only authorization");};
            export const watchSession = () => () => {};
            export function requireIdentity(req) {
              const actor = fixtureActors.get(req.headers.authorization?.slice(7));
              if (!actor) throw Object.assign(new Error("Unauthorized"),{status:401});
              return actor;
            }
          `,
        }));
        build.onLoad({ filter: /^db$/, namespace: "fixture" }, () => ({
          contents: `
            import {openSync,writeFileSync,readFileSync,fsyncSync,closeSync} from "node:fs";
            export const fixtureRooms = new Map(), fixtureGames = new Map(), fixtureAgents = new Map(), fixtureBatches = new Map();
            // Per-game row columns beside the state snapshot: room, start time and public summary.
            export const fixtureGameRows = new Map();
            export function fixtureDurableRoom(id) {
              let room;
              for(const line of readFileSync(${JSON.stringify(join(temp, "durable.json"))},"utf8").trim().split("\\n")) {
                for(const [key,value] of JSON.parse(line).rooms) if(key===id)room=value;
              }
              return room;
            }
            export function fixtureDurableBatches() {
              const lines=readFileSync(${JSON.stringify(join(temp, "durable.json"))},"utf8").trim().split("\\n");
              return JSON.parse(lines.at(-1)).batches??[];
            }
            export const fixtureControl = {failCommit:false,failCheckpoint:false,loseAppendAck:false, commits:0, interactionWrites:0};
            let prior;
            async function query(sql,args=[]) {
              if (sql==="BEGIN") {prior=[new Map(fixtureRooms),new Map(fixtureGames),new Map(fixtureBatches),new Map(fixtureGameRows)];return {rows:[]};}
              if (sql==="ROLLBACK") {
                if(prior) {fixtureRooms.clear();fixtureGames.clear();fixtureBatches.clear();for(const [k,v] of prior[0])fixtureRooms.set(k,v);for(const [k,v] of prior[1])fixtureGames.set(k,v);for(const [k,v] of prior[2])fixtureBatches.set(k,v);fixtureGameRows.clear();for(const [k,v] of prior[3])fixtureGameRows.set(k,v);}
                prior=undefined;return {rows:[]};
              }
              if (sql==="COMMIT") {
                if(fixtureControl.failCommit) throw new Error("fixture commit failure");
                if(fixtureControl.failCheckpoint&&[...fixtureRooms].some(([id,value])=>prior?.[0].get(id)!==value))
                  throw new Error("fixture checkpoint failure");
                const fd=openSync(${JSON.stringify(join(temp, "durable.json"))},"a");
                try {
                  writeFileSync(fd,JSON.stringify({
                    rooms:[...fixtureRooms].filter(([id,value])=>prior?.[0].get(id)!==value),
                    games:[...fixtureGames].filter(([id,value])=>prior?.[1].get(id)!==value),
                    batches:[...fixtureBatches.values()]
                  })+"\\n");fsyncSync(fd);
                } finally{closeSync(fd);}
                fixtureControl.commits++;prior=undefined;return {rows:[]};
              }
              if(sql.startsWith("INSERT INTO cg_interaction_batches")) {
                if(!prior) {
                  await query("BEGIN");
                  try {
                    const result=await query(sql,args);await query("COMMIT");
                    if(fixtureControl.loseAppendAck){fixtureControl.loseAppendAck=false;throw new Error("fixture lost append acknowledgement");}
                    return result;
                  }
                  catch(error){await query("ROLLBACK");throw error;}
                }
                const key=args[0]+":"+args[2];
                if(!fixtureBatches.has(key))fixtureBatches.set(key,{room_id:args[0],game_id:args[1],end_seq:args[2],events:JSON.parse(args[3])});
                fixtureControl.interactionWrites++;
                return {rows:[],rowCount:1};
              }
              if(sql.startsWith("DELETE FROM cg_interaction_batches")) {
                for(const [key,batch] of fixtureBatches)if(batch.room_id===args[0]&&batch.end_seq<=args[1])fixtureBatches.delete(key);
                return {rows:[]};
              }
              if(sql.startsWith("SELECT room_id,game_id,end_seq,events FROM cg_interaction_batches"))
                return {rows:[...fixtureBatches.values()].filter(b=>b.room_id===args[0]&&b.end_seq>args[1]).sort((a,b)=>a.end_seq-b.end_seq)};
              if (sql==="SELECT id,state FROM cg_rooms") return {rows:[...fixtureRooms].map(([id,state])=>({id,state:structuredClone(state)}))};
              if (sql==="SELECT * FROM cg_ai_agents WHERE id=$1") return {rows:fixtureAgents.has(args[0])?[fixtureAgents.get(args[0])]:[]};
              if (sql.startsWith("SELECT id,prefix_length,summary FROM cg_games WHERE room_id=$1"))
                return {rows:[...fixtureGameRows.values()].filter(r=>r.room_id===args[0]&&r.summary?.scoring==="information-v1")
                  .sort((a,b)=>b.started_at-a.started_at).slice(0,args[1]).map(r=>({id:r.id,prefix_length:r.prefix_length,summary:r.summary}))};
              if (sql==="SELECT state,prefix_length FROM cg_games WHERE id=$1")
                return {rows:fixtureGames.has(args[0])?[{state:structuredClone(fixtureGames.get(args[0])),prefix_length:fixtureGameRows.get(args[0]).prefix_length}]:[]};
              if (sql.startsWith("SELECT id")) return {rows:[...fixtureGames.values()].map(g=>({id:g.id,room_id:fixtureGameRows.get(g.id)?.room_id,prefix_length:g.shortCode.length}))};
              if (sql.startsWith("INSERT INTO cg_rooms")) {fixtureRooms.set(args[0],JSON.parse(args[3]));return {rows:[]};}
              if (sql.startsWith("INSERT INTO cg_games")) {
                fixtureGames.set(args[0],JSON.parse(args[3]));
                fixtureGameRows.set(args[0],{id:args[0],room_id:args[1],prefix_length:args[2],started_at:args[4],ended_at:args[5],summary:args[6]&&JSON.parse(args[6])});
                return {rows:[]};
              }
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
