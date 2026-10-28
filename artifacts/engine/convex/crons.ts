import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
/** Restart games whose tick lease expired; park live games when the engine is idle. */
crons.interval("engine watchdog", { minutes: 1 }, internal.engine.loop.watchdog, {});
export default crons;
