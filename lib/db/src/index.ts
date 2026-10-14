import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// pg removes broken idle clients itself. Handle its pool-level notification
// without killing the server; checked-out query errors still reject normally.
pool.on("error", () => {
  console.error("Database idle connection closed unexpectedly; pool will replace it on demand.");
});
export const db = drizzle(pool, { schema });

export * from "./schema";
