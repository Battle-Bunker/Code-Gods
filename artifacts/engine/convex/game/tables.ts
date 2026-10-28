import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Rooms, games, objects, agents, events, chat, receipts, AI library and budgets (owned by convex/game). */
export const gameTables = {
  rooms: defineTable({ shortCode: v.string(), ownerId: v.string(), createdAt: v.number() }).index("by_short_code", ["shortCode"]),
};
