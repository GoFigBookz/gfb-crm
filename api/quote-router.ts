/**
 * FIGGY JR — SCOPE-BASED QUOTE (tRPC)
 * =============================================================================
 * Pulls a client's real scope (clients + client_onboarding) and runs it through
 * the pure quote core to produce a market-rate quote + an undercharging verdict
 * vs the flat fee. Read-only. The rate card / math lives in `quote-core.ts`.
 * =============================================================================
 */
import { z } from "zod";
import crypto from "crypto";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, clientOnboarding, signatureDocuments, portalSettings, portalTokens } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  computeQuote, compareToFlatFee,
  type QuoteScope, type BookkeepingFrequency, type HstFilingPeriod, type PayrollRunFrequency, type PayrollRemitter,
} from "./quote-core";
import { getFirmSettings } from "./firm-settings";
import { renderQuoteHtml, renderEngagementHtml } from "./quote-doc";

/** Create a signable document on the e-sign rail and send it: enables the
 *  client portal, mints/reuses a token, inserts the signatureDocument as "sent",
 *  and returns the client-facing portal URL. Shared by quote + engagement. */
export async function createAndSendDoc(opts: {
  db: any; clientId: number; userId: number; title: string; description: string;
  content: string; documentType: "engagement_letter" | "custom"; clientEmail: string | null;
}): Promise<{ documentId: number; portalUrl: string }> {
  const { db, clientId } = opts;
  // ensure portal enabled
  const ps = await db.select().from(portalSettings).where(eq(portalSettings.clientId, clientId)).limit(1);
  if (ps.length === 0) {
    await db.insert(portalSettings).values({ clientId, isEnabled: true, showFinancialOverview: true, showTasks: true, showDocuments: true, showInvoices: true });
  } else if (!ps[0].isEnabled) {
    await db.update(portalSettings).set({ isEnabled: true }).where(eq(portalSettings.clientId, clientId));
  }
  // token
  const existing = await db.select().from(portalTokens).where(and(eq(portalTokens.clientId, clientId), eq(portalTokens.isActive, true))).limit(1);
  let token: string;
  if (existing[0]) token = existing[0].token;
  else {
    token = crypto.randomBytes(32).toString("hex");
    await db.insert(portalTokens).values({ clientId, token, email: opts.clientEmail, isActive: true, expiresAt: new Date(Date.now() + 90 * 86400000) });
  }
  const [doc] = await db.insert(signatureDocuments).values({
    clientId, userId: opts.userId, title: opts.title, description: opts.description,
    content: opts.content, documentType: opts.documentType, status: "sent",
    portalToken: token, sentAt: new Date(), sentBy: opts.userId,
    expiresAt: new Date(Date.now() + 30 * 86400000),
  }).returning();
  return { documentId: doc.id, portalUrl: `/portal/${token}?tab=documents` };
}

function servicesFromClient(client: any): string[] {
  const s: string[] = ["Bookkeeping & accounting", "Monthly reconciliation"];
  if (client.hasHST) s.push(`HST/GST filing (${client.hstPeriod || "quarterly"})`);
  if (client.hasPayroll) s.push(`Payroll & PD7A remittance (${client.payrollFrequency || "as scheduled"})`);
  if (client.hasWSIB) s.push("WSIB reporting");
  s.push("Year-end file preparation");
  return s;
}

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

  // Documents already generated for a client (quote + engagement), newest first.
  documents: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(signatureDocuments)
        .where(eq(signatureDocuments.clientId, input.clientId))
        .orderBy(desc(signatureDocuments.id));
      return rows.map((d: any) => ({
        id: d.id, title: d.title, documentType: d.documentType, status: d.status,
        portalUrl: d.portalToken ? `/portal/${d.portalToken}?tab=documents` : null,
        sentAt: d.sentAt, signedAt: d.signedAt, signedBy: d.signedBy,
      }));
    }),

  // Generate a branded, signable quote and send it to the client portal.
  createSignableQuote: authedQuery
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const client = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      if (!client) throw new Error("Client not found");
      const onb = (await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, input.clientId)).orderBy(desc(clientOnboarding.id)).limit(1))[0] ?? null;
      const quote = computeQuote(buildScopeForClient(client, onb));
      const comparison = compareToFlatFee(quote.recurringMonthly, client.monthlyFee ?? null);
      const firm = getFirmSettings();
      const content = renderQuoteHtml({ firm, clientName: client.name, clientCompany: client.company, quote, comparison });
      const res = await createAndSendDoc({
        db, clientId: client.id, userId: ctx.user.id,
        title: `Quote — ${client.company || client.name}`,
        description: `Scope-based quote · ${quote.recurringMonthly}/mo`,
        content, documentType: "custom", clientEmail: client.email || null,
      });
      await db.update(clients).set({
        quoteAmount: quote.recurringMonthly, quoteSentAt: new Date(), workflowStatus: "quote_sent",
      }).where(eq(clients.id, client.id));
      return res;
    }),

  // Generate a branded, signable letter of engagement and send it.
  createEngagementLetter: authedQuery
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const client = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      if (!client) throw new Error("Client not found");
      const onb = (await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, input.clientId)).orderBy(desc(clientOnboarding.id)).limit(1))[0] ?? null;
      const quote = computeQuote(buildScopeForClient(client, onb));
      const firm = getFirmSettings();
      const content = renderEngagementHtml({
        firm, clientName: client.name, clientCompany: client.company,
        monthlyFee: client.monthlyFee ?? null, quote, services: servicesFromClient(client),
        yearEnd: client.yearEndMonth ?? null,
      });
      const res = await createAndSendDoc({
        db, clientId: client.id, userId: ctx.user.id,
        title: `Letter of Engagement — ${client.company || client.name}`,
        description: "Engagement terms for signature",
        content, documentType: "engagement_letter", clientEmail: client.email || null,
      });
      await db.update(clients).set({ engagementSentAt: new Date(), workflowStatus: "engagement_sent" }).where(eq(clients.id, client.id));
      return res;
    }),

  // Final step: make the client active and generate their recurring tasks.
  activateClient: authedQuery
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const client = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      if (!client) throw new Error("Client not found");
      await db.update(clients).set({
        status: "active", workflowStatus: "active",
        engagementSignedAt: client.engagementSignedAt ?? new Date(),
      }).where(eq(clients.id, client.id));

      // Generate recurring task rules if this client has none yet (idempotent).
      const { clientTaskRules, tasks } = await import("../db/schema");
      const hasRules = (await db.select().from(clientTaskRules).where(eq(clientTaskRules.clientId, client.id)).limit(1)).length > 0;
      let tasksCreated = 0;
      if (!hasRules) {
        const onb = (await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, client.id)).orderBy(desc(clientOnboarding.id)).limit(1))[0] ?? null;
        const { createClientTaskRules } = await import("./task-generator");
        const res = await createClientTaskRules({
          clientId: client.id, userId: client.userId ?? ctx.user.id, assignedTo: client.assignedTo ?? null,
          hasHST: Boolean(client.hasHST), hstPeriod: client.hstPeriod ?? undefined,
          hasWSIB: Boolean(client.hasWSIB), wsibQuarter: client.wsibQuarter ?? undefined,
          hasPayroll: Boolean(client.hasPayroll), payrollFrequency: client.payrollFrequency ?? undefined,
          payrollRemitterFreq: client.payrollRemitterFreq ?? undefined,
          yearEnd: client.yearEndMonth ?? undefined,
          bookkeepingFrequency: (onb?.bookkeepingFrequency as any) ?? "monthly",
          hasInvestments: Boolean(onb?.hasInvestments), paysDividends: Boolean(onb?.paysDividends),
          hasSubcontractors: Boolean(onb?.hasSubcontractors), hasEHT: Boolean(onb?.hasEHT),
          needsYearEnd: onb ? Boolean(onb?.needsYearEnd) : true,
        } as any);
        tasksCreated = res.tasks.length;
      } else {
        // reactivate any paused tasks/rules
        await db.update(clientTaskRules).set({ active: true }).where(eq(clientTaskRules.clientId, client.id));
      }
      return { success: true, tasksCreated };
    }),
});
