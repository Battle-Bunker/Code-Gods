import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
/** Restart games whose tick lease expired; park live games when the engine is idle. */
crons.interval("engine watchdog", { minutes: 1 }, internal.engine.loop.watchdog, {});
/** Fail assistant turns past their deadline, finish dead cancellations, deny unanswered confirmations. */
crons.interval("assistant sweeper", { minutes: 1 }, internal.assistant.store.sweep, {});
/** Keep the OAuth tables bounded: retired refresh tokens, never-used DCR clients, stale metadata, old requests. */
crons.interval("oauth sweep", { hours: 1 }, internal.agent.oauthStore.sweep, {});
export default crons;
