/**
 * SEED PHOENIX STARTER — pre-build Markie's Estate plan so it's structured, not blank.
 * =============================================================================
 * Purpose:  Seed estate_items for the owner with (a) pointers to the REAL will/
 *           legal docs Liv found in Google Drive, and (b) a prompt in every
 *           estate category (executor, business succession, accounts, assets,
 *           debts, insurance, digital, wishes, contacts) — so each section asks
 *           Markie the right question to fill it in. NOT legal advice.
 * Idempotent: guarded on the sentinel will item for the owner.
 * Note:      Only the WILL is referenced by name (unambiguously Markie's). Insurance
 *           and property are left as prompts — Liv found insurance docs but some are
 *           client certs, so we ask rather than assume (never guess).
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

type Item = { category: string; title: string; detail?: string; location?: string; contact?: string };

const STARTER: Item[] = [
  { category: "will", title: "Will — confirm location + GET IT NOTARIZED",
    detail: "Liv found your will in Google Drive: 'Markie Antle - Last Will and Testament.pdf' and 'Markie Draft Will (2).pdf', plus a 'Will Gift Memorandum.pdf'. ACTION: confirm which is the current version and get it notarized / reviewed by a lawyer so it's valid. Tell your executor where the signed original is.",
    location: "Google Drive → Operations → '03 - Documents (Legal, Insurance)'" },
  { category: "executor", title: "Name your executor (and an alternate)",
    detail: "Who administers your estate if you pass? Add their full name, relationship, and how to reach them — plus a backup in case they can't act." },
  { category: "business", title: "Go Fig Bookz — succession plan",
    detail: "What happens to the firm and your CLIENTS if you pass: who takes over the books, who tells the clients, what happens to staff (e.g. Rachelle). Decide the path — sell the practice, transfer clients to a trusted bookkeeper/CPA, or wind down — and write the step-by-step so it can be executed without you." },
  { category: "business", title: "Client list, QBO access & logins",
    detail: "Where the master client list and all access live (the Figgy CRM + QBO connections + the connector keys). Make sure your executor / successor can get in: who has admin, where the password manager is." },
  { category: "accounts", title: "Bank & financial accounts",
    detail: "List your banks, investment/brokerage accounts (incl. the trading bot), and where statements/access are. Don't write passwords here — point to the password manager." },
  { category: "assets", title: "Property & major assets",
    detail: "Real estate, vehicles, valuables — what you own and where the ownership docs are." },
  { category: "debts", title: "Debts & recurring obligations",
    detail: "Mortgages, loans, lines of credit, and recurring bills that would need to be paid or cancelled." },
  { category: "insurance", title: "Insurance policies (confirm which are personal)",
    detail: "Liv found insurance documents in your Drive (Federated, Wawanesa, Ferrari & Associates, travel insurance, others) — some look like client certificates, so confirm which are YOURS. List your personal life / home / auto / travel policies + policy numbers + the broker contact." },
  { category: "digital", title: "Digital accounts & password manager",
    detail: "Where the keys to everything are: your password manager, primary email, phone, and any accounts your executor will need. This is the master key — keep the location secure." },
  { category: "wishes", title: "Final wishes",
    detail: "Funeral / burial / cremation preferences, organ donation, and any messages or instructions you want carried out." },
  { category: "contacts", title: "Key contacts",
    detail: "Your lawyer, accountant, financial advisor, and anyone your executor should call first. Names + numbers." },
];

export async function seedPhoenixStarter(): Promise<void> {
  const db = getDb();
  try {
    const owner = (await db.all(sql`SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1`)) as any[];
    const fb = owner[0] ? owner : ((await db.all(sql`SELECT id FROM users ORDER BY id ASC LIMIT 1`)) as any[]);
    const uid = fb[0]?.id;
    if (!uid) return;

    const sentinel = "Will — confirm location + GET IT NOTARIZED";
    const have = (await db.all(sql`SELECT COUNT(*) AS n FROM estate_items WHERE userId=${uid} AND title=${sentinel}`)) as any[];
    if (Number(have[0]?.n || 0) > 0) return;

    const now = Date.now();
    for (const it of STARTER) {
      await db.run(sql`INSERT INTO estate_items (userId, category, title, detail, location, contact, status, createdAt, updatedAt)
        VALUES (${uid}, ${it.category}, ${it.title}, ${it.detail ?? null}, ${it.location ?? null}, ${it.contact ?? null}, 'open', ${now}, ${now})`);
    }
    console.log(`[phoenix] seeded ${STARTER.length} estate-plan starter items for user ${uid}`);
  } catch (e) {
    console.error("[phoenix] seedPhoenixStarter failed:", e instanceof Error ? e.message : e);
  }
}
