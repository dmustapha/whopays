/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as crons from "../crons.js";
import type * as cycles from "../cycles.js";
import type * as emailRail from "../emailRail.js";
import type * as http from "../http.js";
import type * as lib_parse from "../lib/parse.js";
import type * as lib_shared from "../lib/shared.js";
import type * as membership from "../membership.js";
import type * as plans from "../plans.js";
import type * as prices from "../prices.js";
import type * as pricesDb from "../pricesDb.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  crons: typeof crons;
  cycles: typeof cycles;
  emailRail: typeof emailRail;
  http: typeof http;
  "lib/parse": typeof lib_parse;
  "lib/shared": typeof lib_shared;
  membership: typeof membership;
  plans: typeof plans;
  prices: typeof prices;
  pricesDb: typeof pricesDb;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
