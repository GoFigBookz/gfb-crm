/**
 * CONTACT HARVESTER — pure extraction logic.
 *
 * Purpose: turn the raw From/To/Cc headers of a client's email threads into a
 * deduped, ranked list of real people we actually deal with (e.g. Alderson →
 * rocco@ovitaconstruction.com, gabriella@cfaaccounting.ca), so the Contacts
 * section fills with real addresses instead of a placeholder. NEVER auto-saves —
 * it returns *candidates* for Markie to confirm.
 *
 * No I/O here. The router fetches the Gmail headers (via the firm's OAuth token)
 * and hands them in; this decides who's a real contact, infers a role, and ranks
 * by how often they appear. That keeps it unit-testable without a live mailbox.
 *
 * Inputs:  HarvestInput (messages' from/to/cc/date + addresses to exclude + firm domains)
 * Outputs: HarvestCandidate[] (email, name, role, occurrences, lastSeen, from/to counts)
 * Dependencies: none (pure).
 * Errors:  defensive — malformed headers are skipped, never thrown.
 * Limitations: role inference is keyword-based (a hint, editable on confirm);
 *   automated/no-reply senders are dropped, not proposed.
 */

export interface HarvestMessage {
  from?: string | null;
  to?: string | null;
  cc?: string | null;
  replyTo?: string | null;
  date?: string | null; // RFC date header; best-effort
}

export interface HarvestInput {
  messages: HarvestMessage[];
  /** Addresses we already know (firm + client primary + saved contacts) — never re-propose. */
  excludeEmails?: string[];
  /** Firm domains (gofig.ca, gofigbooks.com) — our own people, always skipped. */
  firmDomains?: string[];
}

export interface HarvestCandidate {
  email: string;
  name: string;
  role: string;          // inferred hint ("" = unknown → "Contact")
  occurrences: number;   // total times seen across from/to/cc
  fromCount: number;     // times they were the SENDER (strongest signal of a real person)
  toCount: number;
  lastSeen: number | null; // ms epoch of most recent message they appeared on
}

/** Addresses that are machines, not people — never propose these. */
const AUTOMATED = [
  "noreply", "no-reply", "no_reply", "donotreply", "do-not-reply", "do_not_reply",
  "notifications", "notification", "mailer-daemon", "postmaster", "bounce", "bounces",
  "automated", "auto-reply", "autoreply", "alerts", "alert", "support@", "no.reply",
];

/** Role hints from the local-part (before @). */
const LOCAL_ROLES: Array<[RegExp, string]> = [
  [/^(ap|accountspayable|accounts\.payable)$/i, "Accounts Payable"],
  [/^(ar|accountsreceivable|accounts\.receivable)$/i, "Accounts Receivable"],
  [/(payroll)/i, "Payroll"],
  [/(billing|invoices?|accounts)/i, "Billing"],
  [/(bookkeep)/i, "Bookkeeper"],
  [/^(admin|administration|office)$/i, "Admin"],
  [/^(info|hello|contact|inquiries|enquiries|reception)$/i, "General"],
  [/(sales)/i, "Sales"],
  [/(hr|humanresources)/i, "HR"],
];

/** Role hints from the domain (after @). */
const DOMAIN_ROLES: Array<[RegExp, string]> = [
  [/(account|cpa|\bcga\b|\bllp\b|bookkeep|taxservices|\btax\b)/i, "Accountant"],
  [/(rbc|td|scotia|bmo|cibc|tangerine|nationalbank|desjardins|\bbank\b|creditunion)/i, "Bank"],
  [/(insurance|insur)/i, "Insurance"],
  [/(law|legal|barrister|solicitor)/i, "Lawyer"],
];

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}
function localOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(0, at).toLowerCase() : email.toLowerCase();
}

export function inferRole(email: string, _name?: string): string {
  const local = localOf(email).replace(/\+.*$/, ""); // drop +tags
  const domain = domainOf(email);
  for (const [re, role] of LOCAL_ROLES) if (re.test(local)) return role;
  for (const [re, role] of DOMAIN_ROLES) if (re.test(domain)) return role;
  return "";
}

function isAutomated(email: string): boolean {
  const lc = email.toLowerCase();
  const local = localOf(lc);
  return AUTOMATED.some((a) => (a.endsWith("@") ? lc.startsWith(a) : local.includes(a)));
}

/**
 * Parse an RFC2822 address-list header into {name,email} pairs.
 * Handles: `"Rocco Pugliese" <rocco@x.com>, dan@x.com, Gabriella <g@y.ca>`.
 * Splits on commas that are NOT inside quotes or angle brackets.
 */
export function parseAddressList(raw?: string | null): Array<{ name: string; email: string }> {
  if (!raw) return [];
  const out: Array<{ name: string; email: string }> = [];
  let buf = "";
  let inQuote = false;
  let inAngle = false;
  const flush = () => {
    const part = buf.trim();
    buf = "";
    if (!part) return;
    let name = "";
    let email = "";
    const angle = part.match(/<([^>]+)>/);
    if (angle) {
      email = angle[1].trim();
      name = part.slice(0, angle.index).trim();
    } else {
      email = part.trim();
    }
    // strip surrounding quotes from name
    name = name.replace(/^["']|["']$/g, "").trim();
    email = email.replace(/^["']|["']$/g, "").trim().toLowerCase();
    // basic validity
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    out.push({ name, email });
  };
  for (const ch of raw) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === "<") inAngle = true;
    else if (ch === ">") inAngle = false;
    if (ch === "," && !inQuote && !inAngle) { flush(); continue; }
    buf += ch;
  }
  flush();
  return out;
}

/** Title-case a bare-local-part name like "rocco.pugliese" → "Rocco Pugliese". */
function nameFromLocal(email: string): string {
  const local = localOf(email).replace(/\+.*$/, "");
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function extractContacts(input: HarvestInput): HarvestCandidate[] {
  const exclude = new Set((input.excludeEmails || []).map((e) => e.toLowerCase().trim()).filter(Boolean));
  const firmDomains = (input.firmDomains || []).map((d) => d.toLowerCase().trim()).filter(Boolean);

  const acc = new Map<string, HarvestCandidate>();

  for (const msg of input.messages || []) {
    const ts = msg.date ? Date.parse(msg.date) : NaN;
    const lastSeen = Number.isFinite(ts) ? ts : null;

    const buckets: Array<["from" | "to", Array<{ name: string; email: string }>]> = [
      ["from", parseAddressList(msg.from)],
      ["to", parseAddressList(msg.to)],
      ["to", parseAddressList(msg.cc)],
      ["to", parseAddressList(msg.replyTo)],
    ];

    for (const [kind, people] of buckets) {
      for (const p of people) {
        const email = p.email;
        if (!email || exclude.has(email)) continue;
        if (isAutomated(email)) continue;
        const dom = domainOf(email);
        if (firmDomains.some((fd) => dom === fd || dom.endsWith("." + fd))) continue;

        let c = acc.get(email);
        if (!c) {
          c = {
            email,
            name: p.name || nameFromLocal(email),
            role: inferRole(email, p.name),
            occurrences: 0,
            fromCount: 0,
            toCount: 0,
            lastSeen,
          };
          acc.set(email, c);
        }
        // Prefer a real display name over a derived one if we later find it.
        if (p.name && (!c.name || c.name === nameFromLocal(email))) c.name = p.name;
        c.occurrences += 1;
        if (kind === "from") c.fromCount += 1;
        else c.toCount += 1;
        if (lastSeen && (!c.lastSeen || lastSeen > c.lastSeen)) c.lastSeen = lastSeen;
      }
    }
  }

  // Rank: senders first (real people who write us), then by frequency, then recency.
  return Array.from(acc.values()).sort((a, b) => {
    if ((b.fromCount > 0 ? 1 : 0) !== (a.fromCount > 0 ? 1 : 0)) return (b.fromCount > 0 ? 1 : 0) - (a.fromCount > 0 ? 1 : 0);
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return (b.lastSeen || 0) - (a.lastSeen || 0);
  });
}
