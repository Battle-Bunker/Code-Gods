import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

// Explicit opt-in: create/drop ONLY a uniquely named benchmark schema.
if (process.env.RUN_ISOLATED_POSTGRES_BENCHMARK !== "1") throw new Error("Set RUN_ISOLATED_POSTGRES_BENCHMARK=1 to authorize isolated schema writes");
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = require("pg");
const admin = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const schema = `cg_bench_${randomBytes(12).toString("hex")}`;
const temp = await mkdtemp(join(here, ".postgres-benchmark-"));
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`CREATE TABLE "${schema}".cg_rooms (id text PRIMARY KEY,owner_id text NOT NULL,prefix_length integer NOT NULL,state jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE "${schema}".cg_games (id text PRIMARY KEY,room_id text NOT NULL,prefix_length integer NOT NULL,state jsonb NOT NULL,started_at timestamptz,ended_at timestamptz,summary jsonb);
    CREATE TABLE "${schema}".cg_interaction_batches (room_id text NOT NULL,game_id text NOT NULL,end_seq bigint NOT NULL,events jsonb NOT NULL,PRIMARY KEY(room_id,end_seq))`);
  await build({
    entryPoints: [join(here, "pipeline-postgres-benchmark.ts")], outfile: join(temp, "benchmark.mjs"),
    bundle: true, platform: "node", format: "esm", packages: "external",
    plugins: [{
      name: "isolated-postgres",
      setup(build) {
        build.onResolve({ filter: /^\//, namespace: "benchmark" }, args => ({ path: args.path, external: true }));
        build.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "benchmark" }));
        build.onLoad({ filter: /^db$/, namespace: "benchmark" }, () => ({
          contents: `
            import pg from ${JSON.stringify(require.resolve("pg"))};
            export const stats={queries:0,queryMs:0,breakdown:{}};
            export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,
              options:${JSON.stringify(`-c search_path=${schema} -c statement_timeout=5000`)},max:4,connectionTimeoutMillis:5000});
            pool.on("connect",client=>{
              const query=client.query.bind(client);
              client.query=(...args)=>{
                const start=performance.now();stats.queries++;
                const sql=args[0], tag=sql.startsWith("INSERT INTO cg_interaction_batches")?"interaction-append":sql.trim().split(/\\s+/).slice(0,3).join(" ");
                const bytes=Buffer.byteLength(JSON.stringify(args[1]??[]));
                const finish=()=>{
                  const ms=performance.now()-start;stats.queryMs+=ms;
                  const bucket=stats.breakdown[tag]??={count:0,ms:0,bytes:0};
                  bucket.count++;bucket.ms+=ms;bucket.bytes+=bytes;
                };
                if(typeof args.at(-1)==="function"){
                  const callback=args.pop();
                  args.push((...result)=>{finish();callback(...result)});
                  try{return query(...args)}catch(error){finish();throw error}
                }
                try{return query(...args).finally(finish)}catch(error){finish();throw error}
              };
            });
          `,
        }));
      },
    }],
  });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-transform-types", join(temp, "benchmark.mjs")], { stdio: "inherit" });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Benchmark exceeded 25-second bound")); }, 25000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Benchmark exited ${code}`)); });
  });
} finally {
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
  await rm(temp, { recursive: true, force: true });
}
