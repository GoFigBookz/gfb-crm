/**
 * FIGGY ASSISTANT ROUTER — phone-friendly chatbot (add tasks + ask your agenda).
 * Claude drives a small tool loop (add_task, get_agenda). Read/act only on Markie's
 * own data; never invents clients. Needs ANTHROPIC_API_KEY (already set).
 */
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tasks, calendarEvents, clients, personalItems, triageFindings, connectedAccounts, agentLearnings, chatMessages, lifeEntries } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getValidGoogleAccessToken } from "./google-token";
import { buildRawMessage, extractEmail } from "./email-core";
import { selectRelevant, formatLessonsBlock } from "./learning-core";
import { recordAudit } from "./agent-audit";
import { brainAsk } from "./brain-store";
import { renderAnswer } from "./brain-core";

/** When the AI API is unavailable (no credits / down), still try to ANSWER from the
 *  Brain so the chat keeps working instead of begging for a top-up. Returns the
 *  rendered Brain answer, or null if the Brain doesn't know. */
async function brainFallback(message: string, userId: number): Promise<string | null> {
  try {
    const res = await brainAsk(message, { kind: "firm" }, { userId, askedBy: "assistant" });
    if (res.answered) return `${renderAnswer(res)}\n\n_(Answered from the Brain — the AI service is unavailable right now, so I'm working from what we know.)_`;
  } catch { /* brain best-effort */ }
  return null;
}

// Tools that DO something (vs read-only) — these get written to the audit trail.
const ACTION_TOOLS = new Set(["add_task", "add_personal", "add_life_item", "schedule_event", "complete_task", "draft_email", "remember", "remember_personal"]);

const TZ = "America/Toronto";
import { parseTaskCommand } from "./task-command-core";
import { ASSISTANT_TOOLS, formatAgenda, detectAgent, detectIntent, frontDeskSystem, AGENT_ROSTER, type AgentKey } from "./assistant-core";


async function execAddTask(text: string, userId: number): Promise<string> {
  const db = getDb();
  const cls = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const parsed = parseTaskCommand(text, cls as any);
  const [created] = await db.insert(tasks).values({
    userId, clientId: parsed.clientId, title: parsed.title,
    dueDate: parsed.dueDate, priority: parsed.priority, status: "pending", completed: false,
  } as any).returning();
  if (created) import("./google-push").then((m) => m.pushTaskToGoogle(created.id)).catch(() => {}); // two-way: mirror to Google Tasks
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
    .map((e) => ({ title: e.title, when: e.isAllDay ? "all day" : new Date(e.startDate).toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }) }));

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

async function execAddLifeItem(input: any, userId: number): Promise<string> {
  const db = getDb();
  const sections = ["finance", "social", "milestones", "travel", "health", "growth"];
  const section = sections.includes(input?.section) ? input.section : null;
  const title = String(input?.title ?? "").trim();
  if (!section || !title) return "I need a section (finance/travel/health/growth) and a title to add that to your life hub.";
  let date: Date | null = null;
  if (input?.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) date = new Date(input.date + "T12:00:00");
  const amount = typeof input?.amount === "number" ? input.amount : null;
  let meta: string | null = null;
  // Social entries with a date sync to the main calendar (so it's all in one place).
  if (section === "social" && date) {
    const ev = (await db.insert(calendarEvents).values({
      userId, title, startDate: date, endDate: date, isAllDay: true,
      color: "purple", description: "Phoenix Rising · Social", status: "confirmed",
      createdAt: new Date(), updatedAt: new Date(),
    } as any).returning()) as any[];
    if (ev[0]?.id) meta = JSON.stringify({ calendarEventId: ev[0].id });
  }
  await db.insert(lifeEntries).values({
    userId, section, type: input?.type ? String(input.type).slice(0, 40) : null,
    title, amount, date, notes: input?.notes ? String(input.notes).slice(0, 5000) : null,
    meta, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const onCal = section === "social" && date ? " (also on your calendar)" : "";
  return `Added to your ${section} section: "${title}"${amount != null ? ` (${amount.toLocaleString("en-CA", { style: "currency", currency: "CAD" })})` : ""}${onCal}.`;
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

async function execRememberPersonal(input: any, userId: number): Promise<string> {
  const fact = String(input?.fact ?? "").trim();
  if (!fact) return "What about your life should I remember?";
  const { normalizeCategory } = await import("./personal-core");
  const { personalFacts } = await import("../db/schema");
  const category = normalizeCategory(input?.category);
  const db = getDb();
  await db.insert(personalFacts).values({ userId, category, fact, pinned: !!input?.pinned, source: "liv" } as any);
  return `Got it — saved to your private notes (${category}): "${fact}".`;
}

async function execRecallPersonal(input: any, userId: number): Promise<string> {
  const { personalFacts } = await import("../db/schema");
  const db = getDb();
  const rows = (await db.select().from(personalFacts).where(eq(personalFacts.userId, userId))) as any[];
  const q = String(input?.query ?? "").trim().toLowerCase();
  const hits = q
    ? rows.filter((r) => `${r.fact} ${r.category} ${r.tags ?? ""}`.toLowerCase().includes(q))
    : rows;
  if (!hits.length) return q ? `I don't have anything on "${q}" in your personal notes yet.` : "Your personal knowledge base is empty so far.";
  hits.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  return hits.slice(0, 25).map((r) => `- [${r.category}] ${r.fact}`).join("\n");
}

async function execDraftEmail(input: any, userId: number): Promise<string> {
  const to = extractEmail(String(input?.to ?? ""));
  if (!to) return "Who's it going to? I need the recipient's email address.";
  const body = String(input?.body ?? "").trim();
  if (!body) return "What should the email say?";
  const subject = String(input?.subject ?? "").trim() || "(no subject)";
  const { getFirmGoogleAccount } = await import("./google-token");
  const account = await getFirmGoogleAccount(userId); // firm-wide Google login
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

async function execSearchEmail(input: any, userId: number): Promise<string> {
  const query = String(input?.query ?? "").trim();
  if (!query) return "What should I search your email for?";
  const max = Math.min(Math.max(Number(input?.maxResults) || 8, 1), 15);
  const { getFirmGoogleAccount } = await import("./google-token");
  const account = await getFirmGoogleAccount(userId);
  if (!account) return "I need your Google email connected first (Integrations → Google) before I can read your inbox.";
  try {
    const token = await getValidGoogleAccessToken(account);
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!listRes.ok) return `Couldn't search email (${listRes.status}).`;
    const list = await listRes.json();
    const ids: string[] = (list.messages || []).map((m: any) => m.id);
    if (!ids.length) return `No emails matched "${query}".`;
    const rows: string[] = [];
    for (const id of ids) {
      const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) continue;
      const m = await r.json();
      const h = (n: string) => (m.payload?.headers || []).find((x: any) => x.name === n)?.value || "";
      const from = h("From").replace(/<.*>/, "").trim() || h("From");
      const date = h("Date") ? new Date(h("Date")).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
      rows.push(`• ${from}${date ? ` (${date})` : ""} — ${h("Subject") || "(no subject)"}\n  ${(m.snippet || "").slice(0, 140)}`);
    }
    return rows.length ? `Found ${rows.length} email(s) for "${query}":\n${rows.join("\n")}` : `No readable emails matched "${query}".`;
  } catch (e) {
    return `Couldn't read your email: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function execSearchDrive(input: any, userId: number): Promise<string> {
  const query = String(input?.query ?? "").trim();
  if (!query) return "What file should I look for in your Drive?";
  const max = Math.min(Math.max(Number(input?.maxResults) || 8, 1), 15);
  const { getFirmGoogleAccount } = await import("./google-token");
  const account = await getFirmGoogleAccount(userId);
  if (!account) return "I need your Google account connected first (Integrations → Google) before I can search your Drive.";
  try {
    const token = await getValidGoogleAccessToken(account);
    const esc = query.replace(/'/g, "\\'");
    const q = `(name contains '${esc}' or fullText contains '${esc}') and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=${max}&orderBy=${encodeURIComponent("modifiedTime desc")}&fields=${encodeURIComponent("files(id,name,modifiedTime,webViewLink,mimeType)")}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return `Couldn't search Drive (${res.status}).`;
    const data = await res.json();
    const files: any[] = data.files || [];
    if (!files.length) return `No Drive files matched "${query}".`;
    const rows = files.map((f) => {
      const mod = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
      const kind = String(f.mimeType || "").includes("folder") ? "📁" : "📄";
      return `${kind} ${f.name}${mod ? ` (modified ${mod})` : ""}${f.webViewLink ? `\n  ${f.webViewLink}` : ""}`;
    });
    return `Found ${rows.length} file(s) for "${query}":\n${rows.join("\n")}`;
  } catch (e) {
    return `Couldn't search your Drive: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function execReadFile(input: any, userId: number): Promise<string> {
  const fileId = String(input?.fileId ?? "").trim();
  const query = String(input?.query ?? "").trim();
  if (!fileId && !query) return "Tell me which file to read — a name or some keywords.";
  const { getFirmGoogleAccount } = await import("./google-token");
  const account = await getFirmGoogleAccount(userId);
  if (!account) return "I need your Google account connected first (Integrations → Google) before I can read your files.";
  try {
    const token = await getValidGoogleAccessToken(account);
    const H = { Authorization: `Bearer ${token}` };
    const FIELDS = "id,name,mimeType,webViewLink";
    // Resolve the file: by id, else top search match (skip folders).
    let file: any = null;
    if (fileId) {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=${encodeURIComponent(FIELDS)}&supportsAllDrives=true`, { headers: H });
      if (r.ok) file = await r.json();
    } else {
      const esc = query.replace(/'/g, "\\'");
      const q = `(name contains '${esc}' or fullText contains '${esc}') and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=1&orderBy=${encodeURIComponent("modifiedTime desc")}&fields=${encodeURIComponent(`files(${FIELDS})`)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      const r = await fetch(url, { headers: H });
      if (r.ok) file = ((await r.json()).files || [])[0];
    }
    if (!file) return `I couldn't find a file matching "${query || fileId}".`;
    const mt = String(file.mimeType || "");
    const link = file.webViewLink ? `\n${file.webViewLink}` : "";
    let exportUrl = "";
    if (mt === "application/vnd.google-apps.document" || mt === "application/vnd.google-apps.presentation")
      exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
    else if (mt === "application/vnd.google-apps.spreadsheet")
      exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`;
    else if (mt.startsWith("text/") || mt === "application/json" || mt === "application/csv")
      exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`;
    else if (mt === "application/pdf")
      return `"${file.name}" is a PDF — drop it into the chat with the 📎 paperclip and I'll read it directly.${link}`;
    else if (mt.startsWith("image/"))
      return `"${file.name}" is an image — attach it with the 📎 paperclip and I can look at it.${link}`;
    else return `"${file.name}" is a ${mt} file I can't read as text here. Open it:${link}`;

    const r = await fetch(exportUrl, { headers: H });
    if (!r.ok) return `I found "${file.name}" but couldn't read it (${r.status}).`;
    const text = await r.text();
    const CAP = 7000;
    const body = text.length > CAP ? text.slice(0, CAP) + "\n…(truncated — ask me to read a specific part)" : text;
    return `📄 ${file.name}\n\n${body || "(the file is empty)"}`;
  } catch (e) {
    return `Couldn't read that file: ${e instanceof Error ? e.message : String(e)}`;
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
    if (name === "add_life_item") return await execAddLifeItem(input, userId);
    if (name === "schedule_event") return await execScheduleEvent(input, userId);
    if (name === "complete_task") return await execCompleteTask(input, userId);
    if (name === "draft_email") return await execDraftEmail(input, userId);
    if (name === "search_email") return await execSearchEmail(input, userId);
    if (name === "search_drive") return await execSearchDrive(input, userId);
    if (name === "read_file") return await execReadFile(input, userId);
    if (name === "remember") return await execRemember(input, userId, activeAgent);
    if (name === "remember_personal") return await execRememberPersonal(input, userId);
    if (name === "recall_personal") return await execRecallPersonal(input, userId);
    if (name === "system_health") return await execSystemHealth();
    if (name === "agent_scorecard") return await execAgentScorecard();
    if (name === "firm_status") return await execFirmStatus(userId);
    return `Unknown tool: ${name}`;
  } catch (e) {
    return `That action failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * OPERATIONAL FALLBACK — when the conversational model is unavailable (no key /
 * credits off / API error), still DO the job from the live CRM: route the message
 * to a deterministic tool (agenda / firm status / health / scorecard / add task).
 * Returns null when no operational intent matches (then we try the knowledge Brain).
 */
async function brainToolFallback(message: string, agent: AgentKey, userId: number): Promise<{ reply: string; actions: string[] } | null> {
  const intent = detectIntent(message);
  if (!intent) return null;
  const out = await runTool(intent.tool, intent.tool === "add_task" ? { text: intent.text } : {}, userId, agent);
  const name = AGENT_ROSTER[agent].name;
  const actions = intent.tool === "add_task" ? [out] : [];
  return { reply: `${name} — ${out}`, actions };
}

/**
 * FULL BRAIN ANSWER (no model): operational CRM tools FIRST (agenda/firm status/…),
 * then the knowledge Brain (brainAsk over seeded firm knowledge). Returns the reply
 * + any actions, or null if neither can help (caller shows the brain-only help).
 */
async function brainAnswer(message: string, agent: AgentKey, userId: number): Promise<{ reply: string; actions: string[] } | null> {
  const tool = await brainToolFallback(message, agent, userId);
  if (tool) return tool;
  const known = await brainFallback(message, userId);   // knowledge Brain (brainAsk)
  if (known) return { reply: `${AGENT_ROSTER[agent].name} — ${known}`, actions: [] };
  return null;
}

/** The honest "model is off" note, with what the Brain CAN still do. */
function brainOnlyHelp(agent: AgentKey): string {
  const name = AGENT_ROSTER[agent].name;
  return `${name} — the AI model is off right now, so I can't chat open-endedly, but I can still work from the Brain. Try: “agenda”, “firm status” (what needs posting / who's behind), “system health”, “scorecard”, or “add task …”. Turn the model back on (ANTHROPIC_API_KEY) for full conversation.`;
}

export const assistantRouter = createRouter({
  // Is the agent brain actually online? The whole team runs on ANTHROPIC_API_KEY;
  // when it's not set every agent can only reply "needs the key", which reads like
  // "the agents don't work". This lets the UI show a clear setup banner instead.
  health: authedQuery.query(() => {
    const openaiProvider = process.env.FIGGY_LLM_PROVIDER === "openai";
    // The cheaper/self-serve path needs a key unless it's a local Ollama endpoint.
    const openaiReady = openaiProvider && (!!process.env.FIGGY_LLM_API_KEY || /localhost|127\.0\.0\.1|ollama/i.test(process.env.FIGGY_LLM_BASE_URL || ""));
    const keyConfigured = openaiProvider ? openaiReady : !!process.env.ANTHROPIC_API_KEY;
    return {
      keyConfigured,
      provider: openaiProvider ? "openai" : "anthropic",
      model: openaiProvider ? (process.env.FIGGY_LLM_MODEL || "llama-3.3-70b-versatile") : (process.env.FIGGY_ASSISTANT_MODEL || "claude-sonnet-4-6"),
      webSearch: process.env.FIGGY_WEB_SEARCH !== "off",
    };
  }),

  ask: authedQuery
    .input(z.object({
      message: z.string().min(1).max(8000),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20).optional(),
      agent: z.enum(["fig", "sage", "wren", "liv", "jinx", "tess", "jade", "skye"]).optional(),
      location: z.object({ lat: z.number(), lon: z.number(), label: z.string().max(120).optional() }).optional(),
      conversationId: z.string().max(64).optional(),
      // An attached image or PDF the agent should SEE (base64, ~6MB cap).
      attachment: z.object({
        data: z.string().max(9_000_000),
        mediaType: z.string().max(60),
        name: z.string().max(200).optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      // Who is Markie addressing? An explicit name in the message wins; else stay
      // with the agent the UI last had (sticky); else default to Fig.
      const agent: AgentKey = detectAgent(input.message, input.agent ?? null);
      if (!apiKey) {
        // No model — still DO the job from the Brain (agenda/firm status/health/…).
        const fb = await brainAnswer(input.message, agent, ctx.user.id);
        return fb ? { ...fb, agent, degraded: true } : { reply: brainOnlyHelp(agent), actions: [] as string[], agent, degraded: true };
      }
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
      // Server-side web tools: SEARCH (find things) + FETCH (open a specific URL
      // the user shares). DEFAULT OFF for reliability — each web round-trip adds
      // several seconds and is the main cause of a turn overrunning the gateway and
      // returning the un-parseable "Unable to transform" page. Flip on per need with
      // FIGGY_WEB_SEARCH=on once the chat is proven stable.
      const webOn = process.env.FIGGY_WEB_SEARCH === "on";
      const serverTools: any[] = !webOn ? [] : [
        { type: "web_search_20260209", name: "web_search", max_uses: 1 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 1 },
      ];

      // Build the user turn — with an image/PDF block when something's attached
      // so the agent can actually SEE it (Skye reviewing a logo, Fig a receipt…).
      let userContent: any = input.message;
      if (input.attachment?.data && input.attachment?.mediaType) {
        const mt = input.attachment.mediaType;
        const block = mt === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: mt, data: input.attachment.data } }
          : { type: "image", source: { type: "base64", media_type: mt, data: input.attachment.data } };
        userContent = [block, { type: "text", text: input.message }];
      }
      const messages: any[] = [
        ...(input.history || []).map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: userContent },
      ];
      const actions: string[] = [];

      // Persist the turn (user message + reply) so the conversation survives
      // refresh/close. Only when the UI supplies a conversationId.
      const convId = input.conversationId;
      const userText = input.message + (input.attachment ? ` 📎 ${input.attachment.name || "attachment"}` : "");
      const saveTurn = async (replyText: string) => {
        if (!convId || !replyText) return;
        try {
          const db = getDb();
          await db.insert(chatMessages).values([
            { userId: ctx.user.id, conversationId: convId, agent, role: "user", content: userText },
            { userId: ctx.user.id, conversationId: convId, agent, role: "assistant", content: replyText },
          ] as any);
        } catch { /* history is best-effort — never block the reply */ }
      };

      // ── CHEAPER / SELF-SERVE MODEL PATH (Markie: "something I can use on my own
      // like Llama"). FIGGY_LLM_PROVIDER=openai routes the whole turn through any
      // OpenAI-compatible endpoint — Groq (free Llama 3.3 70B), DeepSeek (cheap),
      // OpenRouter, or a self-hosted Ollama. Opt-in; default stays Anthropic. On any
      // failure we fall back to the Brain so chat never dies. ──
      if (process.env.FIGGY_LLM_PROVIDER === "openai") {
        const base = process.env.FIGGY_LLM_BASE_URL || "https://api.groq.com/openai/v1";
        const oaiModel = process.env.FIGGY_LLM_MODEL || "llama-3.3-70b-versatile";
        const oaiKey = process.env.FIGGY_LLM_API_KEY;
        const out = await openaiToolChat({
          baseUrl: base, apiKey: oaiKey, model: oaiModel, system,
          history: (input.history || []) as any, userText: input.message,
          tools: ASSISTANT_TOOLS as any, actionToolNames: new Set(["add_task", "add_personal", "schedule_event", "complete_task"]),
          runTool: (name, args) => runTool(name, args, ctx.user.id, agent),
          onAction: async (name, output) => { if (ACTION_TOOLS.has(name)) await recordAudit({ userId: ctx.user.id, agentScope: agent, action: name, summary: output, decision: "done" }); },
          timeoutMs: Number(process.env.FIGGY_ASSISTANT_DEADLINE_MS || 19_000),
        });
        if (out) { await saveTurn(out.reply); return { reply: out.reply, actions: out.actions, agent }; }
        // endpoint failed → still answer from the Brain
        const fb = await brainAnswer(input.message, agent, ctx.user.id);
        if (fb) { await saveTurn(fb.reply); return { reply: fb.reply, actions: fb.actions, agent }; }
        return { reply: brainOnlyHelp(agent), actions, agent };
      }

      // Official Anthropic SDK — built-in retries/backoff for 429/5xx, typed errors,
      // a robust transport. We drive the tool loop ourselves (custom audit + actions).
      // maxRetries kept low + a per-request timeout so a flaky call can't stack
      // long backoffs past our reply deadline. The deadline below is the backstop.
      const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 });
      let dropServerTools = false; // set if a server-tool combo is rejected, then retry without them

      // Run the tool_use blocks from a response, append results, return how many ran.
      const handleToolUses = async (content: any[]): Promise<number> => {
        const toolUses = (content || []).filter((b: any) => b.type === "tool_use");
        if (!toolUses.length) return 0;
        messages.push({ role: "assistant", content });
        const results: any[] = [];
        for (const block of toolUses) {
          const out = await runTool(block.name, block.input, ctx.user.id, agent);
          if (["add_task", "add_personal", "schedule_event", "complete_task"].includes(block.name)) actions.push(out);
          if (ACTION_TOOLS.has(block.name)) await recordAudit({ userId: ctx.user.id, agentScope: agent, action: block.name, summary: out, decision: "done" });
          results.push({ type: "tool_result", tool_use_id: block.id, content: out });
        }
        messages.push({ role: "user", content: results });
        return toolUses.length;
      };

      const runLoop = async (): Promise<{ reply: string; actions: string[]; agent: AgentKey }> => {
      for (let i = 0; i < 5; i++) {
        const tools = [...ASSISTANT_TOOLS, ...(dropServerTools ? [] : serverTools)];
        let data: any;
        try {
          data = await client.messages.create({ model, max_tokens: 1024, system, messages, tools } as any);
        } catch (err: any) {
          // Transient overloads/rate limits are already retried by the SDK; a final
          // failure here is real. Surface a clear, typed reason.
          if (err instanceof Anthropic.BadRequestError && !dropServerTools && /tool|web_search|web_fetch/i.test(err.message || "")) {
            dropServerTools = true; // a server-tool combo was rejected — retry without them
            continue;
          }
          console.error("[assistant] API error", { name: err?.name, status: err?.status, message: err?.message });
          if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.APIConnectionError) {
            const fromBrain = await brainAnswer(input.message, agent, ctx.user.id);
            if (fromBrain) { await saveTurn(fromBrain.reply); return { reply: fromBrain.reply, actions: [...actions, ...fromBrain.actions], agent }; }
            return { reply: brainOnlyHelp(agent), actions, agent };
          }
          if (err instanceof Anthropic.RateLimitError) return { reply: "The AI is rate-limited right now — give it a minute and try again.", actions, agent };
          if (err instanceof Anthropic.InternalServerError) return { reply: "The AI is briefly overloaded — try again in a sec.", actions, agent };
          // Out of Anthropic credits → DON'T just beg for a top-up. Try to answer
          // from the Brain so the chat keeps working (Markie's ask: "fix it or just
          // work from the brain"). Only mention billing if the Brain can't help.
          if (/credit balance|too low|billing|insufficient (funds|credit)|purchase credits/i.test(err?.message || "")) {
            const fromBrain = await brainAnswer(input.message, agent, ctx.user.id);
            if (fromBrain) { await saveTurn(fromBrain.reply); return { reply: fromBrain.reply, actions: [...actions, ...fromBrain.actions], agent }; }
            return { reply: "That one needs the live AI and the Anthropic credits are out — but I can still answer anything that's in the Brain (agenda, firm status, system health, add task). To restore full chat: console.anthropic.com → Plans & Billing.", actions, agent };
          }
          const msg = err instanceof Anthropic.APIError ? `${err.status ?? ""} ${err.message}`.trim() : (err?.message || "unknown error");
          return { reply: `Snag talking to the AI: ${msg}`, actions, agent };
        }

        if (data.stop_reason === "tool_use") {
          await handleToolUses(data.content);
          continue;
        }
        // Server tools (web search/fetch) can pause mid-run — resend to continue.
        if (data.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content: data.content });
          continue;
        }

        let reply = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
        // Stopped on max_tokens mid-tool-call (a tool_use block but no text yet) — run it, continue.
        if (!reply && data.stop_reason === "max_tokens" && (await handleToolUses(data.content))) continue;
        // Fall back to tool-action confirmations if the model produced no prose.
        if (!reply && actions.length) reply = actions.join("\n");
        if (!reply) {
          console.error("[assistant] empty reply", { stop_reason: data.stop_reason, blocks: (data.content || []).map((b: any) => b.type), agent });
          reply = "I didn't catch that — say it once more?";
        }
        await saveTurn(reply);
        return { reply, actions, agent };
      }
        return { reply: "Sorry — I got stuck in a loop. Try rephrasing.", actions, agent };
      };

      // Always emit a small JSON reply BEFORE the platform's request timeout. If a
      // turn runs long (hung tool/Anthropic call, multi-search), the gateway kills
      // the request and returns a non-tRPC page → the client shows "Unable to
      // transform response from server". So we cap well under that timeout (~24s)
      // and reply with a graceful "still working" instead. (Genuinely long agent
      // work needs streaming/background — a follow-up; this keeps chat reliable.)
      const DEADLINE_MS = Number(process.env.FIGGY_ASSISTANT_DEADLINE_MS || 21_000);
      let deadlineTimer: any;
      const deadline = new Promise<{ reply: string; actions: string[]; agent: AgentKey }>((resolve) => {
        deadlineTimer = setTimeout(() => resolve({
          reply: "That's taking me longer than a quick reply — give me the first concrete step and I'll knock it out, or ask me to keep going.",
          actions, agent,
        }), DEADLINE_MS);
      });
      // .catch on runLoop so a rejection AFTER the deadline already won can't become
      // an unhandled rejection, and a rejection that wins still yields a clean reply.
      const guarded = runLoop().catch((err: any) => {
        console.error("[assistant] loop error", { name: err?.name, message: err?.message });
        return { reply: "Something glitched on my end just now — give it another go? If it keeps happening, tell me and I'll dig in.", actions, agent };
      });
      try {
        return await Promise.race([guarded, deadline]);
      } finally {
        clearTimeout(deadlineTimer);
      }
    }),
});
