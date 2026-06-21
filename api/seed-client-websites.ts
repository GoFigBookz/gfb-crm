/**
 * Auto-fill client websites (so logos appear) WITHOUT manual entry, using the
 * one reliable signal we already have server-side: the client's email domain.
 * A business email like jane@clarkpools.ca → website clarkpools.ca. Personal
 * inboxes (gmail/outlook/etc.) and our own domains are skipped. Only fills when
 * the website is currently blank — never clobbers a value you've set. Idempotent.
 */
import { getDb } from "./queries/connection";
import { clients } from "../db/schema";
import { eq } from "drizzle-orm";

// Free/personal inboxes (no business domain) + our own — never use as a website.
const SKIP_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "live.ca",
  "yahoo.com", "yahoo.ca", "icloud.com", "me.com", "mac.com", "aol.com", "msn.com",
  "protonmail.com", "proton.me", "gmx.com", "ymail.com", "rogers.com", "bell.net",
  "sympatico.ca", "shaw.ca", "telus.net", "hotmail.ca", "outlook.ca",
  "gofig.ca", "gofigbookz.com", "gofigbookz.ca",
]);

function domainFromEmail(email: string): string | null {
  const m = /@([^@\s>]+)$/.exec((email || "").trim().toLowerCase());
  if (!m) return null;
  const d = m[1].replace(/[.,;]+$/, "");
  if (!d.includes(".") || /\s/.test(d)) return null;
  if (SKIP_DOMAINS.has(d)) return null;
  return d;
}

export async function seedClientWebsites(): Promise<{ filled: number }> {
  const db = getDb();
  let filled = 0;
  try {
    const all = (await db.select({ id: clients.id, email: clients.email, website: (clients as any).website })
      .from(clients)) as any[];
    for (const c of all) {
      if (c.website && String(c.website).trim()) continue; // never clobber
      const d = domainFromEmail(c.email || "");
      if (!d) continue;
      await db.update(clients).set({ website: d, updatedAt: new Date() }).where(eq(clients.id, c.id));
      filled++;
    }
    if (filled) console.log(`[seed] client websites: ${filled} filled from email domains`);
  } catch (e) {
    console.error("[seed] seedClientWebsites failed (non-fatal):", e instanceof Error ? e.message : e);
  }
  return { filled };
}
