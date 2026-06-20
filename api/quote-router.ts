/**
 * FIGGY JR — SCOPE-BASED QUOTE (tRPC)
 * =============================================================================
 * Pulls a client's real scope (clients + client_onboarding) and runs it through
 * the pure quote core to produce a market-rate quote + an undercharging verdict
 * vs the flat fee. Read-only. The rate card / math lives in `quote-core.ts`.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, clientOnboarding } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import {
  computeQuote, compareToFlatFee,
  type QuoteScope, type BookkeepingFrequency, type HstFilingPeriod, type PayrollRunFrequency, type PayrollRemitter,
} from "./quote-core";

/** Map the live client + latest onboarding rows into a QuoteScope. Onboarding is
 *  the richer source; the client row is the fallback so a quote works even before
 *  a full intake exists. */
export function buildScopeForClient(client: any, onb: any | null): QuoteScope {
  const num = (...vals: any[]) => {
    for (const v of vals) { const n = Number(v); if (Number.isFinite(n) && n > 0) return n; }
    return 0;
  };
  const bool = (...vals: any[]) => vals.some((v) => v === true || v === 1);

  const salesPlatformCount = onb
    ? [onb.usesStripe, onb.usesSquare, onb.usesJobber, onb.usesTouchBistro].filter((v) => v === true || v === 1).length
    : 0;

  return {
    avgMonthlyTransactions: num(onb?.avgMonthlyTransactions, client?.transactionsPerMonth),
    bookkeepingFrequency: (onb?.bookkeepingFrequency as BookkeepingFrequency) ?? "monthly",
    bankAccountCount: num(onb?.bankAccountCount) || 1,
    creditCardCount: num(onb?.creditCardCount),
    hasHST: bool(client?.hasHST, onb?.hstGstFrequency && onb.hstGstFrequency !== "none"),
    hstPeriod: normalizeHstPeriod(client?.hstPeriod, onb?.hstGstFrequency),
    hasPayroll: bool(client?.hasPayroll, onb?.hasEmployees, (onb?.payrollFrequency && onb.payrollFrequency !== "none")),
    employeeCount: num(onb?.employeeCount),
    payrollFrequency: normalizePayrollFreq(onb?.payrollFrequency, client?.payrollFrequency),
    payrollRemitterFreq: (client?.payrollRemitterFreq as PayrollRemitter) ?? "regular",
    hasWSIB: bool(client?.hasWSIB, onb?.wsibRequired),
    hasEHT: bool(onb?.hasEHT),
    paysDividends: bool(onb?.paysDividends),
    hasInvestments: bool(onb?.hasInvestments),
    hasSubcontractors: bool(onb?.hasSubcontractors),
    needsYearEnd: onb ? bool(onb?.needsYearEnd) : true,
    salesPlatformCount,
    invoicingByUs: onb?.invoicingResponsibility === "we_invoice",
    billPayByUs: onb?.billPayResponsibility === "we_pay",
    hasJobCosting: bool(onb?.hasJobCosting),
    monthsBehind: num(onb?.monthsBehind),
  };
}

function normalizeHstPeriod(clientPeriod: any, onbFreq: any): HstFilingPeriod {
  const p = String(clientPeriod ?? onbFreq ?? "").toLowerCase();
  if (p.startsWith("month")) return "monthly";
  if (p.startsWith("quarter")) return "quarterly";
  if (p.startsWith("ann")) return "annual";
  return null;
}

function normalizePayrollFreq(onbFreq: any, clientFreq: any): PayrollRunFrequency {
  const p = String(onbFreq ?? clientFreq ?? "").toLowerCase().replace(/[-\s]/g, "_");
  if (p === "weekly") return "weekly";
  if (p === "biweekly" || p === "bi_weekly") return "biweekly";
  if (p === "semi_monthly" || p === "semimonthly") return "semi_monthly";
  if (p === "monthly") return "monthly";
  return "none";
}

export const quoteRouter = createRouter({
  // Scope-based quote for one client + comparison to its flat fee.
  forClient: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const crows = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
      const client = crows[0];
      if (!client) return null;
      const orows = await db.select().from(clientOnboarding)
        .where(eq(clientOnboarding.clientId, input.clientId))
        .orderBy(desc(clientOnboarding.id)).limit(1);
      const onb = orows[0] ?? null;

      const scope = buildScopeForClient(client, onb);
      const quote = computeQuote(scope);
      const comparison = compareToFlatFee(quote.recurringMonthly, client.monthlyFee ?? null);
      return {
        clientId: client.id,
        clientName: client.name,
        hasOnboarding: !!onb,
        scope,
        quote,
        flatFee: client.monthlyFee ?? null,
        comparison,
      };
    }),
});
