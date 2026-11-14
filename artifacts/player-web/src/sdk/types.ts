/**
 * The v2 data the app reads, typed from the server's contract (artifacts/engine/convex/v2/validators.ts): every
 * shape comes from the generated api, so a change on the server is a type error here, not a silent drift.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "@workspace/engine/convex/_generated/api";

export type Room = FunctionReturnType<typeof api.v2.rooms.get>;
export type Member = Room["members"][number];
export type ChatPage = FunctionReturnType<typeof api.v2.rooms.chat>;
export type ChatMessage = ChatPage["page"][number];
export type PastGame = FunctionReturnType<typeof api.v2.rooms.history>["page"][number];
export type Header = FunctionReturnType<typeof api.v2.games.header>;
export type Phase = Header["phase"];
export type Standings = NonNullable<FunctionReturnType<typeof api.v2.games.standings>>;
export type Standing = Standings["rows"][number];
export type StandingsPoint = FunctionReturnType<typeof api.v2.games.standingsHistory>[number];
export type MyRuleRow = FunctionReturnType<typeof api.v2.play.myRule>;
export type Me = FunctionReturnType<typeof api.v2.play.me>;
export type ObjectSort = "points" | "rarity" | "want" | "born" | "recent";
export type PlayObject = FunctionReturnType<typeof api.v2.play.object>;
export type ObjectValue = NonNullable<PlayObject["value"]>;
export type Agent = FunctionReturnType<typeof api.v2.play.agents>[number];
export type AgentEnergy = FunctionReturnType<typeof api.v2.play.agentEnergy>;
export type AgentProgram = FunctionReturnType<typeof api.v2.play.agentPrograms>[number];
export type Move = FunctionReturnType<typeof api.v2.play.moves>["page"][number];
export type Digest = NonNullable<FunctionReturnType<typeof api.v2.play.digest>>;
