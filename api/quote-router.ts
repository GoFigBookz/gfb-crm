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
import { renderQuoteHtml, renderEngagementHtml, renderCraAuthRequestHtml } from "./quote-doc";

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
  return { documentId: doc.id, portalUrl: `/portal/${token}?tab=signatures` };
}

/** Next quote number, Q-1000+. Scans existing quote doc titles for the max. */
export async function nextQuoteNumber(db: any): Promise<string> {
  const rows = await db.select().from(signatureDocuments);
  let max = 999;
  for (const d of rows as any[]) {
    const m = /Q-(\d+)/.exec(String(d.title || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Q-${max + 1}`;
}

function servicesFromClient(client: any, onb: any): string[] {
  const s: string[] = [
    "Bookkeeping, transaction categorization, and monthly bank/credit-card reconciliation",
    "Monthly financial reporting (profit & loss, balance sheet)",
  ];
  if (client.hasHST) s.push(`HST/GST preparation and filing (${client.hstPeriod || "quarterly"})`);
  if (client.hasPayroll) {
    s.push(`Payroll processing and source-deduction remittances (PD7A, ${client.payrollFrequency || "as scheduled"})`);
    s.push("T4 preparation and filing");
  }
  if (onb?.paysDividends || onb?.hasInvestments) s.push("T5 preparation");
  if (onb?.hasSubcontractors) s.push("T5018 subcontractor reporting");
  if (client.hasWSIB) s.push("WSIB reporting and remittance");
  if (onb?.hasEHT) s.push("Employer Health Tax (EHT) reporting");
  return s;
}

function clientAppsList(onb: any): string[] {
  const a: string[] = [];
  if (onb?.usesStripe) a.push("Stripe");
  if (onb?.usesSquare) a.push("Square");
  if (onb?.usesJobber) a.push("Jobber");
  if (onb?.usesTouchBistro) a.push("TouchBistro");
  if (onb?.usesPayPal) a.push("PayPal");
  if (onb?.usesHubdoc) a.push("Hubdoc");
  return a;
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
    ? [onb.usesStripe, onb.usesSquare, onb.usesJobber, onb.usesTouchBistro, onb.usesPayPal].filter((v) => v === true || v === 1).length
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
    qboSoftwareTier: (onb?.qboSoftwareTier as any) ?? "none",
    qboSoftwareWholesale: bool(onb?.qboSoftwareWholesale),
    qboPayrollWholesale: bool(onb?.qboPayrollWholesale),
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

  // Recompute the quote with an overridden monthly transaction count (live
  // preview in the editor before the real numbers come from QBO).
  preview: authedQuery
    .input(z.object({
      clientId: z.number(),
      avgMonthlyTransactions: z.number().min(0),
      employeeCount: z.number().min(0).optional(),
      creditCardCount: z.number().min(0).optional(),
      bankAccountCount: z.number().min(0).optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const client = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      if (!client) return null;
      const onb = (await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, input.clientId)).orderBy(desc(clientOnboarding.id)).limit(1))[0] ?? null;
      const scope = buildScopeForClient(client, onb);
      scope.avgMonthlyTransactions = input.avgMonthlyTransactions;
      if (input.employeeCount != null) { scope.employeeCount = input.employeeCount; scope.hasPayroll = input.employeeCount > 0; }
      if (input.creditCardCount != null) scope.creditCardCount = input.creditCardCount;
      if (input.bankAccountCount != null) scope.bankAccountCount = input.bankAccountCount;
      const quote = computeQuote(scope);
      return { quote, comparison: compareToFlatFee(quote.recurringMonthly, client.monthlyFee ?? null) };
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
        portalUrl: d.portalToken ? `/portal/${d.portalToken}?tab=signatures` : null,
        sentAt: d.sentAt, signedAt: d.signedAt, signedBy: d.signedBy,
      }));
    }),

  // Generate a branded, signable quote and send it to the client portal.
  // Accepts optional edited line items so the quote can be tailored per client
  // (toggle services off, change amounts) before it goes out.
  createSignableQuote: authedQuery
    .input(z.object({
      clientId: z.number(),
      transactions: z.number().min(0).optional(),
      lines: z.array(z.object({ label: z.string(), amount: z.number(), rationale: z.string().optional() })).optional(),
      oneTime: z.array(z.object({ label: z.string(), amount: z.number(), rationale: z.string().optional() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const client = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      if (!client) throw new Error("Client not found");
      const onb = (await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, input.clientId)).orderBy(desc(clientOnboarding.id)).limit(1))[0] ?? null;
      let quote = computeQuote(buildScopeForClient(client, onb));
      if (input.lines) {
        const { nearestPackage } = await import("./quote-core");
        const monthlyLineItems = input.lines.map((l) => ({ label: l.label, amount: l.amount, rationale: l.rationale ?? "" }));
        const oneTimeLineItems = (input.oneTime ?? quote.oneTimeLineItems).map((l: any) => ({ label: l.label, amount: l.amount, rationale: l.rationale ?? "" }));
        const recurringMonthly = Math.round(monthlyLineItems.reduce((s, l) => s + (l.amount || 0), 0));
        const oneTimeTotal = Math.round(oneTimeLineItems.reduce((s, l) => s + (l.amount || 0), 0));
        quote = {
          ...quote, monthlyLineItems, oneTimeLineItems, recurringMonthly, oneTimeTotal,
          recurringRange: { low: Math.round(recurringMonthly * 0.85 / 5) * 5, high: Math.round(recurringMonthly * 1.15 / 5) * 5 },
          nearestPackage: nearestPackage(recurringMonthly),
        };
      }
      const comparison = compareToFlatFee(quote.recurringMonthly, client.monthlyFee ?? null);
      const firm = getFirmSettings();
      const qNum = await nextQuoteNumber(db);
      const content = renderQuoteHtml({ firm, clientName: client.name, clientCompany: client.company, quote, comparison, quoteNumber: qNum });
      const res = await createAndSendDoc({
        db, clientId: client.id, userId: ctx.user.id,
        title: `Quote ${qNum} — ${client.company || client.name}`,
        description: `Scope-based quote · ${quote.recurringMonthly}/mo`,
        content, documentType: "custom", clientEmail: client.email || null,
      });
      await db.update(clients).set({
        quoteAmount: quote.recurringMonthly, quoteSentAt: new Date(), workflowStatus: "quote_sent",
        ...(input.transactions != null ? { transactionsPerMonth: input.transactions } : {}),
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
        monthlyFee: client.monthlyFee ?? null, quote, services: servicesFromClient(client, onb),
        yearEnd: client.yearEndMonth ?? null,
        contactName: client.contactName || onb?.primaryContactName || null,
        contactEmail: client.email || onb?.primaryContactEmail || null,
        address: client.address || null,
        closeSchedule: onb?.bookkeepingFrequency || "monthly",
        clientApps: clientAppsList(onb),
        isCanadian: (client.qboAccountType ?? "ca_clients") !== "us_clients",
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

  // Generate a branded, signable CRA Represent-a-Client authorization request.
  createCraAuthRequest: authedQuery
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const client = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      if (!client) throw new Error("Client not found");
      const content = renderCraAuthRequestHtml({ firm: getFirmSettings(), clientName: client.name, clientCompany: client.company });
      return createAndSendDoc({
        db, clientId: client.id, userId: ctx.user.id,
        title: `CRA Authorization Request — ${client.company || client.name}`,
        description: "Represent a Client (RAC) authorization",
        content, documentType: "consent", clientEmail: client.email || null,
      });
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
