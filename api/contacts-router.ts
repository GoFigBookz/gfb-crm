/**
 * Per-client contacts — additional people inside a client company (receptionist,
 * AP clerk, etc.), independent of the primary client record. Staff manage these
 * for any client (same shared-practice model as the client list).
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clientContacts, clients, clientEmails } from "../db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { extractContacts } from "./contact-harvest-core";

// Our own domains — never harvested as a "contact". (gmail.com is NOT here: a
// client contact may use gmail; we exclude Markie's personal gmail by address.)
const FIRM_DOMAINS = ["gofig.ca", "gofigbooks.com"];
const FIRM_EXTRA_EMAILS = ["markie.antle@gmail.com"];

async function ensureTable() {
  try {
    await getDb().run(sql`CREATE TABLE IF NOT EXISTS client_contacts (
      id integer PRIMARY KEY AUTOINCREMENT,
      clientId integer NOT NULL,
      name text NOT NULL,
      title text, email text, phone text,
      isPrimary integer DEFAULT 0,
      notes text,
      createdAt integer, updatedAt integer
    )`);
  } catch (e) { console.error("[contacts] ensure table failed:", e instanceof Error ? e.message : e); }
}

const contactInput = {
  name: z.string().min(1).max(200),
  title: z.string().max(120).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(60).optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
};

export const contactsRouter = createRouter({
  list: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      await ensureTable();
      return getDb().select().from(clientContacts)
        .where(eq(clientContacts.clientId, input.clientId))
        .orderBy(desc(clientContacts.isPrimary), desc(clientContacts.updatedAt));
    }),

  create: authedQuery
    .input(z.object({ clientId: z.number(), ...contactInput }))
    .mutation(async ({ input }) => {
      await ensureTable();
      const { clientId, ...rest } = input;
      const [row] = await getDb().insert(clientContacts)
        .values({ clientId, ...rest, email: rest.email || null, updatedAt: new Date() })
        .returning();
      return row;
    }),

  update: authedQuery
    .input(z.object({ id: z.number(), ...contactInput }))
    .mutation(async ({ input }) => {
      await ensureTable();
      const { id, ...rest } = input;
      await getDb().update(clientContacts)
        .set({ ...rest, email: rest.email || null, updatedAt: new Date() })
        .where(eq(clientContacts.id, id));
      return { success: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(clientContacts).where(eq(clientContacts.id, input.id));
      return { success: true };
    }),

  // HARVEST — scour the firm's Gmail for the people we actually deal with on this
  // client, dedup them, infer a role, and return CANDIDATES (never auto-saves).
  // Read-only on Gmail. Defensive: a Google hiccup returns an error string, not a throw,
  // so the Contacts panel can show "couldn't reach Gmail" instead of a broken page.
  harvest: authedQuery
    .input(z.object({
      clientId: z.number(),
      query: z.string().max(400).optional(),  // override the auto Gmail query
      maxMessages: z.number().min(1).max(100).default(40),
    }))
    .mutation(async ({ input }) => {
      await ensureTable();
      const db = getDb();
      try {
        // The client + everything we already know (so we never re-propose them).
        const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
        if (!client) return { ok: false as const, error: "Client not found", candidates: [], query: "" };

        const saved = await db.select().from(clientContacts).where(eq(clientContacts.clientId, input.clientId));
        const cEmails = await db.select().from(clientEmails).where(eq(clientEmails.clientId, input.clientId));
        const exclude = new Set<string>(FIRM_EXTRA_EMAILS);
        const realDomains = new Set<string>();
        const noteReal = (e?: string | null) => {
          if (!e) return;
          const lc = String(e).toLowerCase().trim();
          if (!lc || lc.includes("@example.com")) return; // skip the seeded placeholder
          exclude.add(lc);
          const at = lc.lastIndexOf("@");
          if (at >= 0) realDomains.add(lc.slice(at + 1));
        };
        noteReal((client as any).email);
        for (const c of saved as any[]) noteReal(c.email);
        for (const ce of cEmails as any[]) noteReal(ce.email);

        // Build the Gmail query: the client's name (most reliable seed) OR any real
        // domain we already know. Markie can override via input.query.
        const nameTerm = `"${String((client as any).name || "").replace(/"/g, "")}"`;
        const domainTerms = Array.from(realDomains).map((d) => `from:${d} OR to:${d}`).join(" OR ");
        const autoQuery = [nameTerm, domainTerms].filter(Boolean).join(" OR ");
        const q = input.query || autoQuery;

        // Firm Google token (same proven accessor the Gmail sync uses).
        const { getFirmGoogleAccount, getValidGoogleAccessToken } = await import("./google-token");
        const account = await getFirmGoogleAccount();
        if (!account) return { ok: false as const, error: "No Google account connected", candidates: [], query: q };
        const token = await getValidGoogleAccessToken(account as any);

        // List matching message ids.
        const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
        listUrl.searchParams.set("maxResults", String(input.maxMessages));
        listUrl.searchParams.set("q", q);
        const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
        if (!listRes.ok) return { ok: false as const, error: `Gmail list ${listRes.status}`, candidates: [], query: q };
        const listData: any = await listRes.json();
        const ids: string[] = (listData.messages || []).map((m: any) => m.id);

        // Pull ONLY the address headers (format=metadata) — fast, no bodies.
        const messages: Array<{ from?: string; to?: string; cc?: string; replyTo?: string; date?: string }> = [];
        for (const id of ids) {
          const mUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
          mUrl.searchParams.set("format", "metadata");
          for (const h of ["From", "To", "Cc", "Reply-To", "Date"]) mUrl.searchParams.append("metadataHeaders", h);
          const mRes = await fetch(mUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
          if (!mRes.ok) continue;
          const mData: any = await mRes.json();
          const hdrs: any[] = mData.payload?.headers || [];
          const get = (n: string) => hdrs.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value || "";
          messages.push({ from: get("From"), to: get("To"), cc: get("Cc"), replyTo: get("Reply-To"), date: get("Date") });
        }

        const candidates = extractContacts({
          messages,
          excludeEmails: Array.from(exclude),
          firmDomains: FIRM_DOMAINS,
        });

        return { ok: true as const, candidates, query: q, scanned: messages.length };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e), candidates: [], query: "" };
      }
    }),

  // Save confirmed harvested candidates. Skips any email already on the client.
  harvestSave: authedQuery
    .input(z.object({
      clientId: z.number(),
      contacts: z.array(z.object({
        name: z.string().min(1).max(200),
        email: z.string().email(),
        title: z.string().max(120).optional(),
      })).min(1).max(50),
    }))
    .mutation(async ({ input }) => {
      await ensureTable();
      const db = getDb();
      const existing = await db.select({ email: clientContacts.email }).from(clientContacts)
        .where(eq(clientContacts.clientId, input.clientId));
      const have = new Set((existing as any[]).map((r) => String(r.email || "").toLowerCase()));
      let saved = 0;
      for (const c of input.contacts) {
        if (have.has(c.email.toLowerCase())) continue;
        await db.insert(clientContacts).values({
          clientId: input.clientId,
          name: c.name,
          title: c.title || null,
          email: c.email.toLowerCase(),
          updatedAt: new Date(),
        });
        have.add(c.email.toLowerCase());
        saved++;
      }
      return { success: true, saved };
    }),
});
