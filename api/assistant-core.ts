/**
 * FIGGY ASSISTANT — core prompt, tool schemas, and pure formatters.
 * =============================================================================
 * A phone-friendly chatbot so Markie can add tasks and ask about his agenda when
 * he can't get into the CRM (e.g. driving). Claude drives it with two tools
 * (add_task, get_agenda); the DB work + Claude loop live in assistant-router.ts.
 * Pure pieces here are unit-tested.
 * =============================================================================
 */
export const ASSISTANT_SYSTEM = [
  "You are Figgy, the assistant for Markie's bookkeeping practice (Go Fig Bookz).",
  "Markie is often on his phone or driving — be BRIEF and direct. Short sentences, no fluff, no preamble.",
  "You can do two things:",
  "1) Add a task — call add_task with the FULL natural-language request (include the client name, the action, and any due date/priority Markie said).",
  "2) Report his agenda — call get_agenda when he asks what's on his plate / today / this week / if he's behind.",
  "After a tool runs, confirm in one short line. If asked something you can't do yet, say so briefly. Never invent client names or data.",
].join("\n");

export const ASSISTANT_TOOLS = [
  {
    name: "add_task",
    description: "Create a task from a natural-language request, e.g. \"add a task for Clark Owen Sound to file HST by Friday\". Pass the whole request (client + action + any due date/priority) in `text`.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string", description: "The full task request in plain English." } },
      required: ["text"],
    },
  },
  {
    name: "get_agenda",
    description: "Get Markie's current agenda — overdue, due-today, and upcoming tasks plus calendar events.",
    input_schema: {
      type: "object",
      properties: { range: { type: "string", enum: ["today", "week", "overdue", "all"], description: "Time window; defaults to today + overdue." } },
    },
  },
];

export type AgendaItem = { title: string; client?: string | null; due?: string | null };
export type AgendaEvent = { title: string; when: string };

/** Concise, phone-readable agenda text. Pure → unit-tested. */
export function formatAgenda(a: {
  overdue: AgendaItem[];
  today: AgendaItem[];
  upcoming: AgendaItem[];
  events: AgendaEvent[];
}): string {
  const line = (t: AgendaItem) => `• ${t.title}${t.client ? ` (${t.client})` : ""}${t.due ? ` — due ${t.due}` : ""}`;
  const parts: string[] = [];
  if (a.events.length) parts.push("📅 Today's calendar:\n" + a.events.map((e) => `• ${e.when} — ${e.title}`).join("\n"));
  if (a.overdue.length) parts.push(`🔴 Overdue (${a.overdue.length}):\n` + a.overdue.slice(0, 10).map(line).join("\n"));
  if (a.today.length) parts.push(`⭐ Due today (${a.today.length}):\n` + a.today.slice(0, 10).map(line).join("\n"));
  if (a.upcoming.length) parts.push(`🗓️ Coming up:\n` + a.upcoming.slice(0, 8).map(line).join("\n"));
  if (!parts.length) return "You're all clear — nothing overdue, due today, or on the calendar.";
  return parts.join("\n\n");
}
