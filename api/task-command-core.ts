/**
 * NATURAL-LANGUAGE TASK COMMAND PARSER (pure, unit-testable)
 * =============================================================================
 * Turns a free-text command — typed in Quick Add today, texted to the bot later —
 * into a structured task: which client, the title, an optional due date, and a
 * priority. The same core powers the Quick Add box and a future SMS webhook so
 * "add a task for Clark OS: file HST by Friday" works identically in both.
 *
 * Deliberately dependency-free + deterministic (no LLM) so it's fast, cheap, and
 * testable. An LLM fallback can wrap this later for fuzzier phrasing.
 * =============================================================================
 */
export type ParsedTaskCommand = {
  title: string;
  clientId?: number;
  clientName?: string;
  dueDate?: Date;
  priority: "low" | "medium" | "high";
  matchedClient: boolean;
};

export type ClientLite = { id: number; name: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Strip a leading verb like "add task to/for", "create a task", "remind me to". */
function stripLeadVerb(text: string): string {
  return text
    .replace(/^\s*(please\s+)?(add|create|make|new|log|set up|setup)\s+(a\s+|an\s+)?task\s*(to|for|:)?\s*/i, "")
    .replace(/^\s*(remind me to|todo|to-do|reminder)\s*:?\s*/i, "")
    .trim();
}

/** Detect + remove a priority hint, returning the cleaned text + priority. */
function extractPriority(text: string): { text: string; priority: "low" | "medium" | "high" } {
  let priority: "low" | "medium" | "high" = "medium";
  let out = text;
  if (/\b(urgent|asap|high priority|important|critical)\b/i.test(out) || /!{2,}/.test(out)) {
    priority = "high";
    out = out.replace(/\b(urgent|asap|high priority|important|critical)\b/gi, "").replace(/!{2,}/g, "");
  } else if (/\b(low priority|whenever|no rush|someday)\b/i.test(out)) {
    priority = "low";
    out = out.replace(/\b(low priority|whenever|no rush|someday)\b/gi, "");
  }
  return { text: out.replace(/\s+/g, " ").trim(), priority };
}

/** Parse a due date phrase out of text. Returns the cleaned text + date (if any). */
export function extractDueDate(text: string, now: Date = new Date()): { text: string; dueDate?: Date } {
  const at = (d: Date) => { d.setHours(17, 0, 0, 0); return d; }; // default 5pm
  const lower = text.toLowerCase();

  const rel: [RegExp, () => Date][] = [
    [/\b(today|tonight|eod|end of day)\b/, () => at(new Date(now))],
    [/\btomorrow\b/, () => at(addDays(now, 1))],
    [/\b(this week|by end of week|eow)\b/, () => at(endOfWeek(now))],
    [/\b(next week)\b/, () => at(addDays(now, 7))],
    [/\b(this month|end of month|eom)\b/, () => at(endOfMonth(now))],
    [/\bin (\d+) days?\b/, () => { const m = lower.match(/\bin (\d+) days?\b/); return at(addDays(now, Number(m![1]))); }],
    [/\bin (\d+) weeks?\b/, () => { const m = lower.match(/\bin (\d+) weeks?\b/); return at(addDays(now, Number(m![1]) * 7)); }],
  ];
  for (const [re, fn] of rel) {
    if (re.test(lower)) return { text: stripMatch(text, re), dueDate: fn() };
  }

  // "friday" / "by monday" → next occurrence of that weekday.
  const wd = lower.match(/\b(?:by |on |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1]);
    const d = new Date(now);
    let delta = (target - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7; // "friday" said on a Friday → next Friday
    return { text: stripMatch(text, /\b(?:by |on |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i), dueDate: at(addDays(now, delta)) };
  }

  // "by Jun 30" / "june 30" / "by 30 jun"
  const md = lower.match(/\b(?:by |on |due )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
  if (md) {
    const month = MONTHS.indexOf(md[1]);
    const day = Number(md[2]);
    let year = now.getFullYear();
    const cand = new Date(year, month, day);
    if (cand.getTime() < now.getTime() - 86400000) year += 1; // already passed → next year
    return { text: stripMatch(text, /\b(?:by |on |due )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i), dueDate: at(new Date(year, month, day)) };
  }

  return { text };
}

function stripMatch(text: string, re: RegExp): string {
  return text.replace(re, "").replace(/\s{2,}/g, " ").replace(/\s+([:,.;])/g, "$1").trim().replace(/^[\s:,-]+|[\s:,-]+$/g, "").trim();
}

function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function endOfWeek(d: Date): Date { return addDays(d, (5 - d.getDay() + 7) % 7 || 0); } // Friday this week
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

/**
 * Find a client referenced in the text by name. Picks the LONGEST name match (so
 * "Clark Pools Owen Sound" beats "Clark"), and strips the matched "for <client>"
 * phrasing out of the title. Returns the cleaned title + the matched client.
 */
export function matchClient(text: string, clients: ClientLite[]): { text: string; client?: ClientLite } {
  const n = norm(text);
  let best: { client: ClientLite; idx: number; len: number } | null = null;
  for (const c of clients) {
    const cn = norm(c.name);
    if (!cn) continue;
    const idx = n.indexOf(cn);
    if (idx >= 0 && (!best || cn.length > best.len)) best = { client: c, idx, len: cn.length };
  }
  if (!best) return { text };
  // Remove the client name (and a preceding "for"/"to") from the ORIGINAL text.
  const re = new RegExp(`\\b(for|to)?\\s*${best.client.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const cleaned = text.replace(re, "").replace(/\s{2,}/g, " ").replace(/^[\s:,-]+|[\s:,-]+$/g, "").trim();
  return { text: cleaned, client: best.client };
}

/** Full parse: client → due date → priority → title. */
export function parseTaskCommand(raw: string, clients: ClientLite[], now: Date = new Date()): ParsedTaskCommand {
  let text = stripLeadVerb(raw);
  const c = matchClient(text, clients);
  text = c.text;
  const d = extractDueDate(text, now);
  text = d.text;
  const p = extractPriority(text);
  text = p.text;
  const title = text.replace(/\s+/g, " ").trim() || raw.trim();
  return {
    title,
    clientId: c.client?.id,
    clientName: c.client?.name,
    dueDate: d.dueDate,
    priority: p.priority,
    matchedClient: !!c.client,
  };
}
