/**
 * EMAIL CORE — pure helpers for client-matching + outbound MIME (unit-testable).
 * =============================================================================
 * Used by the Gmail sync (match incoming mail to a client; only client mail is
 * kept) and by send/reply (build the raw RFC-822 message Gmail's API wants).
 * No I/O here so it's fully testable.
 * =============================================================================
 */

/** Pull the bare address out of a header value like `Jane Doe <jane@x.com>`. */
export function extractEmail(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/<([^>]+)>/);
  const addr = (m ? m[1] : raw).trim().toLowerCase();
  // Guard against stray text — only keep something that looks like an address.
  return /\S+@\S+\.\S+/.test(addr) ? addr.replace(/^.*?([^\s<,;]+@[^\s>,;]+).*$/, "$1") : "";
}

/** All addresses in a header (comma/semicolon separated). */
export function splitAddresses(header: string): string[] {
  if (!header) return [];
  return header
    .split(/[,;]/)
    .map((p) => extractEmail(p))
    .filter(Boolean);
}

/**
 * Match a set of email addresses to a client. `byAddr` maps lowercased address →
 * clientId. Returns the first matching clientId, or null if none match (so the
 * caller can SKIP non-client mail — only client emails enter the CRM).
 */
export function matchClientId(addresses: string[], byAddr: Map<string, number>): number | null {
  for (const a of addresses) {
    const id = byAddr.get(a.toLowerCase());
    if (id) return id;
  }
  return null;
}

function base64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * System prompt for Liv's tone-matched draft reply. We feed in a few of Markie's
 * OWN recent sent emails as style samples so the draft sounds like him (the
 * "learns my tone" part — lightweight RAG over his sent mail). Pure → testable.
 */
export function replyDraftSystem(styleSamples: string[]): string {
  const samples = styleSamples.filter(Boolean).slice(0, 5).map((s, i) => `--- Example ${i + 1} ---\n${s.slice(0, 800)}`).join("\n\n");
  return [
    "You are Liv, drafting an email reply ON BEHALF OF Markie (Go Fig Bookz, a bookkeeping firm).",
    "Write a reply to the client email the user gives you. Match MARKIE'S OWN TONE from the writing samples below — his greeting style, sign-off, warmth, and brevity. Be helpful, professional, and concise.",
    "Output ONLY the reply body text (no subject line, no quoted original, no preamble like 'Here is a draft'). It's a DRAFT Markie will review before sending.",
    samples ? `\nMARKIE'S WRITING SAMPLES:\n${samples}` : "\n(No samples available yet — use a warm, concise, professional bookkeeper's tone.)",
  ].join("\n");
}

/** System prompt for suggesting a task from an inbound client email. */
export function taskSuggestSystem(): string {
  return [
    "You read a client email and decide if it implies a task for the bookkeeper.",
    'Return ONLY JSON: {"task": "<short imperative task title, or empty if none>", "due": "YYYY-MM-DD or empty"}.',
    "Task only if the email asks for or requires an action (send a report, file something, answer a question, fix an issue). Greetings/FYIs/thank-yous → empty task.",
    "Keep the title short and action-first, e.g. 'Send May bank statements' or 'Confirm HST filing date'.",
  ].join("\n");
}

/** Build the base64url raw message Gmail's users.messages.send expects. */
export function buildRawMessage(opts: {
  fromName?: string;
  fromEmail: string;
  to: string;
  cc?: string | null;
  subject: string;
  html: string;
}): string {
  const from = opts.fromName ? `${opts.fromName} <${opts.fromEmail}>` : opts.fromEmail;
  const lines = [
    `From: ${from}`,
    `To: ${opts.to}`,
  ];
  if (opts.cc) lines.push(`Cc: ${opts.cc}`);
  lines.push(
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.html,
  );
  return base64url(lines.join("\r\n"));
}
