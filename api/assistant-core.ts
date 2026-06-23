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

/**
 * FRONT DESK — the chatbot is ONE door to the whole team. Markie can address any
 * agent by name ("Hey Sage", "Hey Wren") and the bot answers AS that agent.
 * Each agent has a one-line voice/scope; the bot adopts it and hands off clearly.
 */
export type AgentKey = "fig" | "sage" | "wren" | "liv" | "jinx";

export const AGENT_ROSTER: Record<AgentKey, { name: string; role: string; persona: string }> = {
  fig: {
    name: "Fig",
    role: "junior bookkeeper",
    persona: "You are Fig, the junior bookkeeper — day-to-day books: coding transactions from vendor history, reconciling, receipts, first-pass HST/payroll. Practical and precise. You never post without review.",
  },
  sage: {
    name: "Sage",
    role: "senior bookkeeper",
    persona: "You are Sage, the senior bookkeeper — you review Fig's work and own compliance prep (HST returns, WSIB/EHT, payroll). Calm, thorough, catch-the-slip mindset.",
  },
  wren: {
    name: "Wren",
    role: "controller / auditor",
    persona: "You are Wren, the controller/auditor — assurance: month-end tie-outs, variance checks, CRA-style HST audit, signed workpaper. Rigorous and skeptical; you sign off last.",
  },
  liv: {
    name: "Liv",
    role: "executive assistant",
    persona: "You are Liv, Markie's executive assistant — email triage, drafting replies in his tone, calendar, and his personal life (kept private, separate from clients). Warm, organized, anticipates needs.",
  },
  jinx: {
    name: "Jinx",
    role: "QA / IT watchdog",
    persona: "You are Jinx, the QA/IT watchdog — you make sure the app actually works (database, data, integrations, config, core flows). Plain-spoken; you report status and flag problems. Read-only.",
  },
};

/**
 * Detect which agent Markie is addressing. Recognizes "hey <name>", "<name>,",
 * or "ask <name>" at the START of the message. Returns the agent key, or the
 * `current` sticky agent if none is named (so a conversation stays with whoever
 * he last addressed), defaulting to Fig. Pure → unit-tested.
 */
export function detectAgent(message: string, current?: AgentKey | null): AgentKey {
  const m = (message || "").toLowerCase().trimStart();
  for (const key of Object.keys(AGENT_ROSTER) as AgentKey[]) {
    const n = key; // names are the same as keys, lowercased
    const re = new RegExp(`^(hey|hi|hello|yo|ok|okay|ask|tell|get)?[ ,]*${n}\\b`);
    if (re.test(m)) return key;
  }
  return current ?? "fig";
}

/** Build the system prompt for the addressed agent (base tools + persona). */
export function frontDeskSystem(agent: AgentKey): string {
  const a = AGENT_ROSTER[agent];
  const team = (Object.keys(AGENT_ROSTER) as AgentKey[])
    .map((k) => `${AGENT_ROSTER[k].name} (${AGENT_ROSTER[k].role})`)
    .join(", ");
  return [
    ASSISTANT_SYSTEM,
    "",
    `RIGHT NOW you are answering as ${a.name}. ${a.persona}`,
    `Open with your name if it's the first reply in this thread, e.g. "${a.name} here —".`,
    `Your teammates: ${team}. If a request really belongs to a teammate, say who should take it (e.g. "I'll flag Sage to prep the HST"), then still help as much as you can. Markie can switch to anyone by saying "Hey <name>".`,
    "You can still add tasks and report the agenda for Markie regardless of which agent you are.",
  ].join("\n");
}

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
  {
    name: "system_health",
    description: "Run a live system health check (Jinx's job): database, key data, integrations, configuration, recent errors. Use when Markie asks if everything is working / if anything is broken / what's down.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_personal",
    description: "Add a PERSONAL item (task, reminder, or note) to Markie's private personal space — NOT client work. Use this for anything about his own life (errands, appointments, family, reminders). This is Liv's domain.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The personal item, in plain English." },
        kind: { type: "string", enum: ["task", "reminder", "note"], description: "Defaults to task." },
        due: { type: "string", description: "Optional due date as YYYY-MM-DD." },
      },
      required: ["title"],
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
