import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Cycle heartbeat: opens, nags, closes. Demo plans cycle every 3 min → 1-min resolution.
crons.interval("cycle tick", { minutes: 1 }, internal.cycles.tick, {});

// Weekly price watch across crawled plans (F4 — peer-review cadence; owner button covers freshness).
crons.interval("price watch", { hours: 168 }, internal.prices.priceWatchAll, {});

// Inbound polling fallback (E6 belt+braces): webhook outage never kills the rail.
crons.interval("inbound poll fallback", { minutes: 1 }, internal.emailRail.pollInbound, {});

// Keep-alive through the judging window (overlay: live through Sep 25).
crons.interval("keep alive", { minutes: 10 }, internal.cycles.tick, {});

export default crons;
