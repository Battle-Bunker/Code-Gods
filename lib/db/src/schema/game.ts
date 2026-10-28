import { pgTable, text, timestamp, jsonb, integer, bigint, primaryKey, index } from "drizzle-orm/pg-core";

// Snapshots contain private game state; only explicit projections leave the server.
export const roomsTable = pgTable("cg_rooms", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  prefixLength: integer("prefix_length").notNull().default(4),
  state: jsonb("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
// One row per game launched from a room. `summary` is the game's PUBLIC result
// (settings, roster, final leaderboard), written once it ends; null while it runs.
// These three columns are nullable additions so existing rows stay valid.
export const gamesTable = pgTable("cg_games", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  prefixLength: integer("prefix_length").notNull().default(4),
  state: jsonb("state").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  summary: jsonb("summary"),
}, table => [index("cg_games_room_started_idx").on(table.roomId, table.startedAt)]);
// Append-only interaction batches between room checkpoints. No source or credentials.
export const interactionBatchesTable = pgTable("cg_interaction_batches", {
  roomId: text("room_id").notNull(),
  gameId: text("game_id").notNull(),
  endSeq: bigint("end_seq", { mode: "number" }).notNull(),
  events: jsonb("events").notNull(),
}, table => [primaryKey({ columns: [table.roomId, table.endSeq] })]);
export const sessionsTable = pgTable("cg_sessions", {
  hash: text("hash").primaryKey(),
  data: jsonb("data").notNull(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});
export const deviceTable = pgTable("cg_devices", {
  id: text("id").primaryKey(),
  code: text("code").unique().notNull(),
  secretHash: text("secret_hash").notNull(),
  challenge: text("challenge").notNull(),
  roomId: text("room_id").notNull(),
  userId: text("user_id"),
  userName: text("user_name"),
  clientLabel: text("client_label").notNull().default("Room assistant"),
  permission: text("permission").notNull().default("act"),
  status: text("status").notNull().default("pending"),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});
