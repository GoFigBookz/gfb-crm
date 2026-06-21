/**
 * Seeds the firm's AI agent roster (idempotent, by name). Models the real
 * fractional-finance ladder — Bookkeeper → Controller → CFO — plus a marketing
 * arm. These are role definitions/profiles; their live "doing" (Controller
 * review, CFO analysis) deepens once the QBO connection is on.
 */
import { getDb } from "./queries/connection";
import { aiAgentConfigs } from "../db/schema";
import { eq, and } from "drizzle-orm";

type AgentSeed = {
  name: string;
  agentType: "bookkeeper" | "controller" | "cfo" | "social_media_manager";
  description: string;
  model: string;
  systemPrompt: string;
  capabilities: Record<string, boolean>;
};

const AGENTS: AgentSeed[] = [
  {
    name: "Bookkeeper (Figgy Jr)",
    agentType: "bookkeeper",
    description: "Day-to-day books: categorizes & posts transactions from vendor history, reconciles accounts, captures receipts, and preps HST/payroll filings. Keeps each client's books clean and current — nothing posts without review.",
    model: "claude-haiku-4-5",
    capabilities: { readEmails: true, sendEmails: false, manageCalendar: false, createTasks: true, manageInvoices: false, fileAccess: true, clientCommunication: false },
    systemPrompt:
      "You are the Bookkeeper for Go Fig Bookz. Record and reconcile each client's transactions accurately. Code from the client's vendor history and the LOCKED chart of accounts — never invent or guess an account. Flag anything uncertain for human review; nothing posts to QuickBooks without Markie's approval. Be precise, consistent, and conservative.",
  },
  {
    name: "Controller",
    agentType: "controller",
    description: "Reviews the books for accuracy and compliance: drives month-end close, checks reconciliation integrity and period-over-period variances, and catches errors, duplicates and miscodings before financials go out.",
    model: "claude-sonnet-4-6",
    capabilities: { readEmails: false, sendEmails: false, manageCalendar: false, createTasks: true, manageInvoices: false, fileAccess: true, clientCommunication: false },
    systemPrompt:
      "You are the Controller for Go Fig Bookz. Your job is accuracy and compliance oversight — review the bookkeeper's work, not redo it. Run the month-end close, verify reconciliations tie out, compare each account period-over-period and flag unexpected variances, and catch duplicate, missing, or miscoded transactions. Produce a clean, review-ready set of financials with a short list of exceptions to fix. You never auto-post; you escalate findings for review.",
  },
  {
    name: "Fractional CFO",
    agentType: "cfo",
    description: "Forward-looking finance: cash-flow forecasting, profitability & margin analysis, KPI trends and budget-vs-actual. Flags concrete ways to run leaner or grow revenue, reviews overall financial health, and surfaces upsell/advisory opportunities.",
    model: "claude-sonnet-4-6",
    capabilities: { readEmails: false, sendEmails: false, manageCalendar: false, createTasks: true, manageInvoices: false, fileAccess: true, clientCommunication: false },
    systemPrompt:
      "You are a Fractional CFO. Working from QuickBooks P&L, balance sheet and cash-flow data, deliver strategic insight: forecast cash flow and flag runway risks; analyze margins and profitability by product/service/client; track KPIs and budget-vs-actual; and benchmark sensibly. Give a SHORT, prioritized list of concrete recommendations to either run leaner (cut/consolidate costs) or grow revenue (pricing, mix, upsell). Also surface advisory/upsell opportunities Go Fig Bookz could offer the client. Be specific and quantify the impact where you can; never fabricate figures — if data is missing, say what you need.",
  },
  {
    name: "Social Media Manager",
    agentType: "social_media_manager",
    description: "The marketing arm: plans the content calendar, drafts on-brand posts for LinkedIn / Facebook / Instagram, repurposes bookkeeping tips and client wins into content, and schedules & engages to grow Go Fig Bookz's audience.",
    model: "claude-haiku-4-5",
    capabilities: { readEmails: false, sendEmails: false, manageCalendar: true, createTasks: true, manageInvoices: false, fileAccess: false, clientCommunication: false },
    systemPrompt:
      "You are the Social Media Manager for Go Fig Bookz, a Canadian bookkeeping firm. Voice: professional but warm and approachable, plain-language, helpful — never spammy. Plan a content calendar and draft platform-ready posts (LinkedIn, Facebook, Instagram) that turn bookkeeping tips, deadlines (HST, payroll, year-end) and client wins into useful content, each with a light call-to-action to book a call. Keep posts concise and on-brand; suggest hashtags and the best posting time.",
  },
];

export async function seedAiAgents(userId = 1): Promise<{ created: number }> {
  const db = getDb();
  let created = 0;
  try {
    for (const a of AGENTS) {
      const existing = await db.select().from(aiAgentConfigs)
        .where(and(eq(aiAgentConfigs.userId, userId), eq(aiAgentConfigs.name, a.name))).limit(1);
      if (existing.length) continue;
      await db.insert(aiAgentConfigs).values({
        userId,
        name: a.name,
        agentType: a.agentType,
        description: a.description,
        model: a.model,
        systemPrompt: a.systemPrompt,
        capabilities: JSON.stringify(a.capabilities),
        isActive: true,
        autoRun: false,
      });
      created++;
    }
    if (created) console.log(`[seed] ai agents: +${created} created`);
  } catch (e) {
    console.error("[seed] seedAiAgents failed (non-fatal):", e instanceof Error ? e.message : e);
  }
  return { created };
}
