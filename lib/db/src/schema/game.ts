import { pgTable, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

// Snapshots contain private game state; only explicit projections leave the server.
export const roomsTable = pgTable("cg_rooms", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  prefixLength: integer("prefix_length").notNull().default(4),
  state: jsonb("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const gamesTable = pgTable("cg_games", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  prefixLength: integer("prefix_length").notNull().default(4),
  state: jsonb("state").notNull(),
});
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
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});
