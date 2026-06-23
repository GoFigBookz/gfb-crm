/**
 * FIGGY ASSISTANT ROUTER — phone-friendly chatbot (add tasks + ask your agenda).
 * Claude drives a small tool loop (add_task, get_agenda). Read/act only on Markie's
 * own data; never invents clients. Needs ANTHROPIC_API_KEY (already set).
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tasks, calendarEvents, clients, personalItems, triageFindings, connectedAccounts, agentLearnings, chatMessages } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getValidGoogleAccessToken } from "./google-token";
import { buildRawMessage, extractEmail } from "./email-core";
import { selectRelevant, formatLessonsBlock } from "./learning-core";
import { recordAudit } from "./agent-audit";

// Tools that DO something (vs read-only) — these get written to the audit trail.
const ACTION_TOOLS = new Set(["add_task", "add_personal", "schedule_event", "complete_task", "draft_email", "remember"]);

const TZ = "America/Toronto";
import { parseTaskCommand } from "./task-command-core";
import { ASSISTANT_TOOLS, formatAgenda, detectAgent, frontDeskSystem, AGENT_ROSTER, type AgentKey } from "./assistant-core";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

async function execAddTask(text: string, userId: number): Promise<string> {
  const db = getDb();
  const cls = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const parsed = parseTaskCommand(text, cls as any);
  await db.insert(tasks).values({
    userId, clientId: parsed.clientId, title: parsed.title,
    dueDate: parsed.dueDate, priority: parsed.priority, status: "pending", completed: false,
  } as any);
  const who = parsed.clientName ? ` for ${parsed.clientName}` : "";
  const when = parsed.dueDate ? ` (due ${parsed.dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })})` : "";
  return `Added task: "${parsed.title}"${who}${when}.`;
}

async function execGetAgenda(userId: number): Promise<string> {
  const db = getDb();
  const cls = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const nameById = new Map((cls as any[]).map((c) => [c.id, c.name]));
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const open = (await db.select().from(tasks).where(eq(tasks.completed, false))) as any[];
  const dstr = (d: any) => { try { return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; } };
  const overdue: any[] = [], today: any[] = [], upcoming: any[] = [];
  for (const t of open) {
    if (!t.dueDate) continue;
    const d = new Date(t.dueDate);
    const item = { title: t.title, client: t.clientId ? nameById.get(t.clientId) : null, due: dstr(d) };
    if (d < todayStart) overdue.push(item);
    else if (d < todayEnd) today.push({ ...item, due: null });
    else upcoming.push(item);
  }
  overdue.sort((a, b) => a.due.localeCompare(b.due));
  upcoming.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  const evs = (await db.select().from(calendarEvents).where(eq(calendarEvents.userId, userId))) as any[];
  const events = evs
    .filter((e) => { const s = new Date(e.startDate); return s >= todayStart && s < todayEnd; })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .map((e) => ({ title: e.title, when: e.isAllDay ? "all day" : new Date(e.startDate).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) }));

  return formatAgenda({ overdue, today, upcoming, events });
}

async function execAddPersonal(input: any, userId: number): Promise<string> {
  const db = getDb();
  const title = String(input?.title ?? "").trim();
  if (!title) return "I need a bit more detail to add that.";
  const kind = ["task", "reminder", "note"].includes(input?.kind) ? input.kind : "task";
  let dueDate: Date | null = null;
  if (input?.due && /^\d{4}-\d{2}-\d{2}$/.test(input.due)) dueDate = new Date(input.due + "T12:00:00");
  await db.insert(personalItems).values({ userId, kind, title, dueDate, priority: "medium", done: false } as any);
  const when = dueDate ? ` (due ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })})` : "";
  return `Added to your personal space: "${title}"${when}.`;
}

async function execRemember(input: any, userId: number, activeAgent: string): Promise<string> {
  const lesson = String(input?.lesson ?? "").trim();
  if (!lesson) return "What should I remember?";
  // Default to the ACTIVE agent's own knowledge base (so e.g. tax research Tess
  // does lands in Tess's knowledge), unless explicitly told "all" or another agent.
  const scope = String(input?.scope ?? activeAgent ?? "all").trim().toLowerCase() || "all";
  const source = input?.source === "research" ? "research" : "markie";
  const db = getDb();
  await db.insert(agentLearnings).values({ userId, scope, lesson, source } as any);
  return `Saved to ${scope === "all" ? "the team's" : scope + "'s"} knowledge: "${lesson}".`;
}

async function execDraftEmail(input: any, userId: number): Promise<string> {
  const to = extractEmail(String(input?.to ?? ""));
  if (!to) return "Who's it going to? I need the recipient's email address.";
  const body = String(input?.body ?? "").trim();
  if (!body) return "What should the email say?";
  const subject = String(input?.subject ?? "").trim() || "(no subject)";
  const db = getDb();
  const accts = (await db.select().from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, userId), eq(connectedAccounts.provider, "google")))) as any[];
  const account = accts.find((a) => a.isActive) || accts[0];
  if (!account) return "I need your Google email connected first (Integrations → Google) before I can draft mail.";
  try {
    const token = await getValidGoogleAccessToken(account);
    const html = body.replace(/\n/g, "<br>");
    const raw = buildRawMessage({ fromEmail: account.accountEmail || "", to, subject, html });
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw } }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return `Couldn't save the draft (${res.status}). ${t.slice(0, 120)}`;
    }
    return `Drafted an email to ${to} ("${subject}") — it's in your Gmail Drafts to review and send.`;
  } catch (e) {
    return `Couldn't draft that: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function execScheduleEvent(input: any, userId: number): Promise<string> {
  const title = String(input?.title ?? "").trim();
  if (!title) return "What should I call the event?";
  const start = new Date(input?.start);
  if (isNaN(start.getTime())) return "I couldn't read that date/time — give me the day and time again.";
  const allDay = !!input?.allDay;
  const dur = Number(input?.durationMinutes) || 60;
  const end = allDay ? new Date(start.getTime() + 86400000) : new Date(start.getTime() + dur * 60000);
  const db = getDb();
  await db.insert(calendarEvents).values({ userId, title, startDate: start, endDate: end, isAllDay: allDay, status: "confirmed" } as any);
  const when = allDay
    ? start.toLocaleDateString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })
    : start.toLocaleString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `Added to your calendar: "${title}" — ${when}.`;
}

async function execCompleteTask(input: any, userId: number): Promise<string> {
  const m = String(input?.match ?? "").trim().toLowerCase();
  if (!m) return "Which task should I mark done?";
  const db = getDb();
  const open = (await db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.completed, false)))) as any[];
  const hits = open.filter((t) => String(t.title ?? "").toLowerCase().includes(m));
  if (!hits.length) return `I don't see an open task matching "${input.match}".`;
  if (hits.length > 1) return `A few match — which one? ${hits.slice(0, 5).map((h) => `"${h.title}"`).join(", ")}.`;
  const t = hits[0];
  await db.update(tasks).set({ completed: true, status: "completed", stage: "done", completedAt: new Date() }).where(eq(tasks.id, t.id));
  return `Done — marked "${t.title}" complete.`;
}

async function execFirmStatus(userId: number): Promise<string> {
  const db = getDb();
  // Active clients.
  const cls = (await db.select({ id: clients.id, status: clients.status }).from(clients)) as any[];
  const activeClients = cls.filter((c) => (c.status ?? "active") === "active").length;
  // Open + overdue tasks (Markie's).
  const open = (await db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.completed, false)))) as any[];
  const now = Date.now();
  const overdue = open.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now).length;
  // Triage findings waiting for review (status "new"), by severity.
  const findings = (await db.select({ severity: triageFindings.severity, status: triageFindings.status }).from(triageFindings)) as any[];
  const pending = findings.filter((f) => f.status === "new");
  const crit = pending.filter((f) => f.severity === "critical").length;
  const warn = pending.filter((f) => f.severity === "warning").length;

  const parts = [
    `${activeClients} active client${activeClients === 1 ? "" : "s"}`,
    `${open.length} open task${open.length === 1 ? "" : "s"}${overdue ? ` (${overdue} overdue)` : ""}`,
    `${pending.length} item${pending.length === 1 ? "" : "s"} awaiting review${pending.length ? ` — ${crit} critical, ${warn} warnings` : ""}`,
  ];
  return `Firm snapshot: ${parts.join("; ")}.`;
}

async function execAgentScorecard(): Promise<string> {
  const { runAgentScorecard } = await import("./qa-router");
  const sc = await runAgentScorecard();
  if (!sc.agents.length) return "No agent work has been reviewed yet — scores show up once agents post proposals and you approve/dismiss them.";
  const lines = sc.agents.map((a) => {
    const rate = a.acceptanceRate != null ? `${a.acceptanceRate}%` : "—";
    const trend = a.trend === "up" ? " ↑" : a.trend === "down" ? " ↓" : "";
    return `${a.agent}: ${rate} accepted (${a.reviewed} reviewed)${trend} — ${a.grade === "n/a" ? "needs data" : a.grade}`;
  });
  const overall = sc.overall.acceptanceRate != null ? `Overall ${sc.overall.acceptanceRate}% accepted across ${sc.overall.reviewed} reviewed.` : "";
  return `${overall}\n${lines.join("\n")}`.trim();
}

async function execSystemHealth(): Promise<string> {
  const { runHealthReport } = await import("./qa-router");
  const r = await runHealthReport();
  const problems = r.checks.filter((c) => c.status !== "ok");
  const head = r.status === "ok"
    ? `All good — ${r.counts.ok} checks green.`
    : `${r.counts.fail} problem(s), ${r.counts.warn} need attention (${r.counts.ok} OK).`;
  if (!problems.length) return head;
  const lines = problems.slice(0, 8).map((c) => `${c.status === "fail" ? "🔴" : "🟡"} ${c.label}: ${c.detail}`);
  return `${head}\n${lines.join("\n")}`;
}

async function runTool(name: string, input: any, userId: number, activeAgent: string): Promise<string> {
  try {
    if (name === "add_task") return await execAddTask(String(input?.text ?? ""), userId);
    if (name === "get_agenda") return await execGetAgenda(userId);
    if (name === "add_personal") return await execAddPersonal(input, userId);
    if (name === "schedule_event") return await execScheduleEvent(input, userId);
    if (name === "complete_task") return await execCompleteTask(input, userId);
    if (name === "draft_email") return await execDraftEmail(input, userId);
    if (name === "remember") return await execRemember(input, userId, activeAgent);
    if (name === "system_health") return await execSystemHealth();
    if (name === "agent_scorecard") return await execAgentScorecard();
    if (name === "firm_status") return await execFirmStatus(userId);
    return `Unknown tool: ${name}`;
  } catch (e) {
    return `That action failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export const assistantRouter = createRouter({
  ask: authedQuery
    .input(z.object({
      message: z.string().min(1).max(2000),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20).optional(),
      agent: z.enum(["fig", "sage", "wren", "liv", "jinx", "tess", "jade", "skye"]).optional(),
      location: z.object({ lat: z.number(), lon: z.number(), label: z.string().max(120).optional() }).optional(),
      conversationId: z.string().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      // Who is Markie addressing? An explicit name in the message wins; else stay
      // with the agent the UI last had (sticky); else default to Fig.
      const agent: AgentKey = detectAgent(input.message, input.agent ?? null);
      if (!apiKey) return { reply: "The assistant needs ANTHROPIC_API_KEY set on the server.", actions: [] as string[], agent };
      // Must be a tool-capable model — Haiku snapshots reject programmatic tool
      // calling (that 400 broke the whole chatbot). Sonnet handles tools + is the
      // right balance for an all-day assistant.
      const model = process.env.FIGGY_ASSISTANT_MODEL || "claude-sonnet-4-6";
      // Tell it "now" so it can answer time/date without searching, in Markie's TZ.
      const nowLine = `Current date & time: ${new Date().toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "full", timeStyle: "short" })} (America/Toronto).`;
      // Location: Markie travels, so use his live device location when the app sent
      // it; otherwise tell the agent to ASK rather than assume a town.
      const locLine = input.location
        ? `Markie's CURRENT location (live from his device — he travels, so this is where he is right now): latitude ${input.location.lat}, longitude ${input.location.lon}${input.location.label ? ` (${input.location.label})` : ""}. Use it for "near me"/local questions (weather, stores, hours) — search around this spot.`
        : `Markie travels and his location is UNKNOWN right now. If a question needs where he is ("near me", local weather/stores/hours), briefly ASK what city he's in before answering — do NOT assume a town.`;
      // Learning loop: inject the lessons Markie has taught/confirmed for this agent.
      let lessonsBlock = "";
      try {
        const db = getDb();
        const rows = (await db.select({ scope: agentLearnings.scope, lesson: agentLearnings.lesson, createdAt: agentLearnings.createdAt })
          .from(agentLearnings).where(eq(agentLearnings.userId, ctx.user.id)).orderBy(desc(agentLearnings.createdAt)).limit(100)) as any[];
        lessonsBlock = formatLessonsBlock(selectRelevant(rows, agent));
      } catch { /* table may not exist yet — skip */ }
      const system = [frontDeskSystem(agent), nowLine, locLine, lessonsBlock].filter(Boolean).join("\n");
      // Server-side web search for general/current/local questions (weather, prices,
      // where-to-buy, hours, news…). Off only if explicitly disabled.
      const webSearch = process.env.FIGGY_WEB_SEARCH === "off"
        ? []
        : [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }];
      const tools = [...ASSISTANT_TOOLS, ...webSearch];

      const messages: any[] = [
        ...(input.history || []).map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: input.message },
      ];
      const actions: string[] = [];

      // Persist the turn (user message + reply) so the conversation survives
      // refresh/close. Only when the UI supplies a conversationId.
      const convId = input.conversationId;
      const saveTurn = async (replyText: string) => {
        if (!convId || !replyText) return;
        try {
          const db = getDb();
          await db.insert(chatMessages).values([
            { userId: ctx.user.id, conversationId: convId, agent, role: "user", content: input.message },
            { userId: ctx.user.id, conversationId: convId, agent, role: "assistant", content: replyText },
          ] as any);
        } catch { /* history is best-effort — never block the reply */ }
      };

      let useTools = true; // drop to false if the model rejects tool calling
      for (let i = 0; i < 6; i++) {
        const body: any = { model, max_tokens: 1024, system, messages };
        if (useTools) body.tools = tools;
        const res = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const b = await res.text().catch(() => "");
          // If the model can't do tool calling, retry once as a plain chat so the
          // assistant still answers instead of hard-erroring.
          if (res.status === 400 && useTools && /tool/i.test(b)) { useTools = false; continue; }
          return { reply: `Assistant error (${res.status}). ${b.slice(0, 160)}`, actions, agent };
        }
        const data: any = await res.json();
        if (data.stop_reason === "tool_use") {
          messages.push({ role: "assistant", content: data.content });
          const results: any[] = [];
          for (const block of data.content || []) {
            if (block.type === "tool_use") {
              const out = await runTool(block.name, block.input, ctx.user.id, agent);
              if (["add_task", "add_personal", "schedule_event", "complete_task"].includes(block.name)) actions.push(out);
              if (ACTION_TOOLS.has(block.name)) {
                await recordAudit({ userId: ctx.user.id, agentScope: agent, action: block.name, summary: out, decision: "done" });
              }
              results.push({ type: "tool_result", tool_use_id: block.id, content: out });
            }
          }
          messages.push({ role: "user", content: results });
          continue;
        }
        // web_search runs server-side; a long search can pause — resend to continue.
        if (data.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content: data.content });
          continue;
        }
        const reply = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
        await saveTurn(reply || "(no reply)");
        return { reply: reply || "(no reply)", actions, agent };
      }
      return { reply: "Sorry — I got stuck in a loop. Try rephrasing.", actions, agent };
    }),
});
