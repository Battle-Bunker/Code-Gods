import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
/** Keep the OAuth tables bounded: retired refresh tokens, never-used DCR clients, stale metadata, old requests. */
crons.interval("oauth sweep", { hours: 1 }, internal.agent.oauthStore.sweep, {});
export default crons;
