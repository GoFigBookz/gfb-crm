/**
 * JADE ROUTER — fractional-CFO pricing analysis from the firm's own QBO books.
 * Read-only. Senior-gated would be ideal; kept authed for now.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { pricingAnalysis } from "./jade-pricing";

export const jadeRouter = createRouter({
  pricing: authedQuery
    .input(z.object({ months: z.number().min(1).max(12).default(3) }).optional())
    .query(async ({ input }) => pricingAnalysis(input?.months ?? 3)),
});
