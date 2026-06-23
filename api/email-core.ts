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
