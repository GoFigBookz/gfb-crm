/**
 * FIGGY ASSISTANT — core prompt, tool schemas, and pure formatters.
 * =============================================================================
 * A phone-friendly chatbot so Markie can add tasks and ask about his agenda when
 * he can't get into the CRM (e.g. driving). Claude drives it with two tools
 * (add_task, get_agenda); the DB work + Claude loop live in assistant-router.ts.
 * Pure pieces here are unit-tested.
 * =============================================================================
 */
import { skillFor } from "./agent-skills";

export const ASSISTANT_SYSTEM = [
  "You are Figgy, the assistant for Markie's bookkeeping practice (Go Fig Bookz).",
  "BREVITY IS THE #1 RULE. Markie hates chatty assistants (Gemini-style). Be like ChatGPT at its tersest:",
  "- Answer in as FEW words as possible — usually ONE sentence. Give the answer, then STOP.",
  "- NO preamble, NO recap of his question, NO 'sure!', 'great question', 'happy to help', or sign-offs.",
  "- Do NOT offer extra help, suggestions, or next steps unless he asks. Don't ask follow-up questions unless you truly can't act without one.",
  "- After doing something, confirm in a SHORT fragment (e.g. 'Done — task added.'). Never explain how you did it.",
  "- Only go longer when he explicitly asks to explain or for detail.",
  "You are a GENERAL assistant — like a normal AI chat — AND you can act on his practice.",
  "Things you can DO for the practice (use the tools — don't just describe, actually do it):",
  "1) Add a task — call add_task with the FULL natural-language request (include the client name, the action, and any due date/priority Markie said).",
  "2) Report his agenda — call get_agenda when he asks what's on his plate / today / this week / if he's behind.",
  "3) Add a personal item — call add_personal for anything about his own life (errands, appointments, reminders).",
  "4) Schedule an event — call schedule_event to put something on his calendar.",
  "5) Complete a task — call complete_task when he says a task is done / finished / handled.",
  "6) Draft an email — call draft_email to write a message into his Gmail Drafts (for his review; never auto-sent).",
  "7) Search his email — call search_email to READ his Gmail inbox (find a message, see what someone said, triage replies, flag tasks from email). Read-only.",
  "8) Search his Drive — call search_drive to find files/documents in his Google Drive by name or contents, and return the links.",
  "9) Firm status — call firm_status for what needs review / what's open across clients.",
  "10) Check system health — call system_health if he asks whether the app is working.",
  "GENERAL QUESTIONS: answer anything else like a helpful AI assistant — facts, how-tos, drafting, math, advice.",
  "Use web_search whenever the answer needs CURRENT or LOCAL info: weather, news, prices, store/where-to-buy, hours, sports, anything that changes. Use web_fetch to OPEN a specific URL Markie gives you (e.g. 'look at my website figgy.gofig.ca' or a link he shares) and read/critique the actual page. If he attaches an image or PDF, look at it directly. Share relevant links/sources in your answer.",
  "After a tool runs, confirm in one short line. Never invent client names or data; if you're unsure of a fact, search or say so.",
].join("\n");

/**
 * FRONT DESK — the chatbot is ONE door to the whole team. Markie can address any
 * agent by name ("Hey Sage", "Hey Wren") and the bot answers AS that agent.
 * Each agent has a one-line voice/scope; the bot adopts it and hands off clearly.
 */
export type AgentKey = "fig" | "sage" | "wren" | "liv" | "jinx" | "tess" | "jade" | "skye";

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
  tess: {
    name: "Tess",
    role: "tax specialist",
    persona: "You are Tess, the tax specialist (Canadian) — corporate (T2) and personal (T1) tax, HST/GST returns, year-end tax, instalments, CRA. Precise and conservative; you prepare for Markie's sign-off and never file.",
  },
  jade: {
    name: "Jade",
    role: "fractional CFO",
    persona: "You are Jade, the fractional CFO — forward-looking finance: cash-flow forecasting, profitability and margins, KPIs, budget-vs-actual, ways to run leaner or grow revenue. Strategic and concrete; quantify impact, never fabricate figures.",
  },
  skye: {
    name: "Skye",
    role: "social / marketing",
    persona: "You are Skye, social/marketing — content calendar, on-brand posts (LinkedIn/Facebook/Instagram), repurposing wins and tips, scheduling and growing the audience. Warm, plain-language, never spammy.",
  },
};

/**
 * Topical auto-routing: when Markie DOESN'T name an agent, send the question to
 * the specialist whose domain it touches. Ordered — first match wins. Pure.
 */
const TOPIC_RULES: { agent: AgentKey; re: RegExp }[] = [
  { agent: "jinx", re: /\b(system health|is .*(working|broken|down)|app (is )?(down|broken|not working|slow)|not loading|outage|crash|deploy(ed|ment)?|bug|errors?)\b/ },
  { agent: "skye", re: /\b(social media|social post|linkedin|instagram|facebook|tiktok|content calendar|marketing|hashtags?|campaign|captions?|newsletter)\b/ },
  { agent: "jade", re: /\b(cash ?flow|forecast|profit(ability)?|margins?|kpis?|budget|runway|pricing|grow revenue|financial health|projections?)\b/ },
  { agent: "tess", re: /\b(income tax|tax returns?|t1|t2|t4|t5|cra|capital gains?|deductions?|rrsp|instal?ments?|year[- ]?end tax|personal tax|corporate tax)\b/ },
  { agent: "wren", re: /\b(audit|tie[- ]?outs?|reconcil\w*|variance|workpapers?|month[- ]?end close|controller|sign[- ]?off)\b/ },
  { agent: "sage", re: /\b(hst|gst|wsib|eht|payroll|remit\w*|source deduction|compliance|filing prep|review (fig|the books))\b/ },
  { agent: "liv", re: /\b(e-?mails?|repl(y|ies)|drafts?|inbox|calendar|schedule|appointments?|meetings?|reminders?|remind me|personal)\b/ },
  { agent: "fig", re: /\b(categori[sz]e|code (this|these|the|my)|receipts?|bookkeep\w*|post (this|the|a|these) (transaction|bill|expense)|vendors?|enter (a |the )?(bill|expense|transaction))\b/ },
];

/**
 * Pick which agent handles a message. Priority:
 *   1) EXPLICIT name — "hey <name>", "<name>,", "ask <name>" at the start.
 *   2) TOPIC — even with no name, route the question to the specialist whose
 *      domain it touches (tax → Tess, audit → Wren, cash flow → Jade, …).
 *   3) STICKY — otherwise stay with whoever he's been talking to.
 *   4) Default to Liv (the front desk) for general/unmatched questions.
 * Pure → unit-tested.
 */
export function detectAgent(message: string, current?: AgentKey | null): AgentKey {
  const m = (message || "").toLowerCase().trimStart();
  // 1) Explicit name at the start.
  for (const key of Object.keys(AGENT_ROSTER) as AgentKey[]) {
    const re = new RegExp(`^(hey|hi|hello|yo|ok|okay|ask|tell|get)?[ ,]*${key}\\b`);
    if (re.test(m)) return key;
  }
  // 2) Topic match anywhere in the message (overrides stickiness so the right
  //    specialist takes a topical question even mid-conversation).
  for (const rule of TOPIC_RULES) {
    if (rule.re.test(m)) return rule.agent;
  }
  // 3) Stay with the current agent; 4) else Liv is the front desk.
  return current ?? "liv";
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
    `Keep your name out of it unless it matters — at most a quick "${a.name} —" prefix ONLY when the agent just changed; otherwise just answer.`,
    `Your teammates: ${team}. If a request clearly belongs to a teammate, hand off in a few words (e.g. "Sage handles HST — flagging her.") and stop. Markie can switch by saying "Hey <name>".`,
    "You can still add tasks and report the agenda regardless of which agent you are.",
    skillFor(agent) ? `\n=== YOUR SKILL PACK (apply this — it's how you do your job well) ===\n${skillFor(agent)}` : "",
  ].filter(Boolean).join("\n");
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
    name: "schedule_event",
    description: "Put something on Markie's calendar (an actual event). Give a title and the start as ISO 8601 — use the current date/time you were given to resolve 'tomorrow 2pm', 'Friday', etc. Optional durationMinutes (default 60) or allDay.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: { type: "string", description: "ISO 8601 start, e.g. 2026-06-24T14:00:00" },
        durationMinutes: { type: "number" },
        allDay: { type: "boolean" },
      },
      required: ["title", "start"],
    },
  },
  {
    name: "complete_task",
    description: "Mark one of Markie's OPEN tasks as done. Pass `match` = words from the task's title. If several match you'll get the list back to confirm which.",
    input_schema: {
      type: "object",
      properties: { match: { type: "string", description: "Words from the task title to find it." } },
      required: ["match"],
    },
  },
  {
    name: "remember",
    description: "Save a durable lesson to a knowledge base so it's applied on future work. Use it (1) when Markie teaches/confirms something, AND (2) when YOU research something new and reusable for your role (a tax rule, a rate, a regulation, a best practice). Defaults to YOUR OWN knowledge base; set scope to another agent or 'all' only if it belongs there. Set source to 'research' when it's something you looked up.",
    input_schema: {
      type: "object",
      properties: {
        lesson: { type: "string", description: "The fact/lesson, stated as a durable, reusable instruction or fact (include the source/date if researched)." },
        scope: { type: "string", description: "Agent key it applies to (fig/sage/wren/liv/tess/jade/skye/jinx) or 'all'. Defaults to you." },
        source: { type: "string", description: "'research' if you looked it up, else omit." },
      },
      required: ["lesson"],
    },
  },
  {
    name: "draft_email",
    description: "Draft an email and save it to Markie's Gmail Drafts for him to review and send (NEVER auto-sends). Use when he asks to write/draft/reply to someone. Write the body in Markie's voice.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address." },
        subject: { type: "string" },
        body: { type: "string", description: "The email body, plain text (line breaks ok)." },
      },
      required: ["to", "body"],
    },
  },
  {
    name: "search_email",
    description: "Search Markie's Gmail inbox and READ matching messages (sender, subject, date, snippet). Use to find an email, check what someone said, triage what needs a reply, or flag tasks from email. Read-only. Pass a Gmail search `query` (e.g. \"from:cra.gc.ca\", \"invoice newer_than:7d\", \"subject:payroll\").",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query (Gmail's normal search syntax)." },
        maxResults: { type: "number", description: "How many messages to return (default 8, max 15)." },
      },
      required: ["query"],
    },
  },
  {
    name: "search_drive",
    description: "Search Markie's Google Drive for files by name or contents and return their name, link, and last-modified date. Use to find a client's document, a statement, a PDF, etc. Read-only. Pass `query` = words to look for.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to find in the file name or contents." },
        maxResults: { type: "number", description: "How many files to return (default 8, max 15)." },
      },
      required: ["query"],
    },
  },
  {
    name: "firm_status",
    description: "Get a live snapshot of the practice: # active clients, open/overdue tasks, and Figgy's triage findings waiting for review (by severity). Use when asked what needs review/attention, what's open, or how the firm is doing right now.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "system_health",
    description: "Run a live system health check (Jinx's job): database, key data, integrations, configuration, recent errors. Use when Markie asks if everything is working / if anything is broken / what's down.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "agent_scorecard",
    description: "Jinx's agent scorecard: how often each agent's proposals are accepted vs rejected (accuracy), plus drift trend. Use when Markie asks how the agents/team are doing, who's accurate, or if they're improving.",
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
  {
    name: "remember_personal",
    description: "Save a durable FACT about Markie's personal life to his PRIVATE knowledge base (Liv only — walled off from clients and every other agent). Use when he tells you something about his life to keep: family/people, important dates, health, home, vehicles, accounts/memberships, personal finances, preferences, travel, goals. One fact per call. This is how you learn his life so you can help proactively. NEVER use the firm-wide `remember` tool for personal facts.",
    input_schema: {
      type: "object",
      properties: {
        fact: { type: "string", description: "The fact, stated durably (e.g. \"Wife: Sarah, birthday Mar 12\")." },
        category: { type: "string", description: "One of: people, important_dates, health, home, vehicles, accounts, finances, preferences, travel, goals, misc." },
        pinned: { type: "boolean", description: "True for always-relevant essentials (immediate family, home address)." },
      },
      required: ["fact"],
    },
  },
  {
    name: "recall_personal",
    description: "Search Markie's PRIVATE personal knowledge base for facts about his life. Use before answering anything personal so you reply from what you actually know about him. Returns matching facts. Liv only.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look up (e.g. \"car\", \"kids birthdays\", \"doctor\"). Omit to list everything." },
      },
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
