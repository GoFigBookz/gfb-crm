/**
 * DEMO DATABASE — prepare a SEPARATE, fully-fake dataset for "Try Demo Mode".
 * =============================================================================
 * Demo requests (x-demo-mode header) resolve to demo.db, never the real books, so
 * a friend can be handed the demo with ZERO risk of seeing real client data.
 *
 * This (1) clones the real DB's table/index STRUCTURE into demo.db (no data) so the
 * app's queries work identically, then (2) seeds an invented firm — fake clients,
 * payroll, a company group + control book, tasks — so every page lights up with
 * obviously-made-up names. Idempotent: structure clone runs once; seed runs once.
 * =============================================================================
 */
import { getRealDb, getDemoDb, runInDemo } from "./queries/connection";
import { sql, getTableColumns } from "drizzle-orm";
import {
  users, clients, employees, payRuns, payRunLines, tasks,
  groupEntities, groupOwnership, groupProfit, groupFamilyBenefit,
} from "../db/schema";
import { seedDemoData } from "./seed-demo-data";

const rowsOf = (res: any): any[] => (res?.rows ?? res ?? []) as any[];

/** Add any Drizzle-schema column a (cloned) demo table is missing — bulletproofs
 *  the demo seed against a stale source structure, independent of column guards. */
async function syncColumns(table: any, name: string): Promise<void> {
  const demo = getDemoDb();
  const info = rowsOf(await demo.run(sql.raw(`PRAGMA table_info(${name})`)));
  const have = new Set(info.map((r: any) => String(r.name ?? r[1])));
  for (const col of Object.values(getTableColumns(table)) as any[]) {
    if (have.has(col.name)) continue;
    const ct = String(col.columnType || "");
    const t = /Integer|Boolean|Timestamp/.test(ct) ? "integer" : /Real|Number/.test(ct) ? "real" : "text";
    try { await demo.run(sql.raw(`ALTER TABLE ${name} ADD COLUMN "${col.name}" ${t}`)); } catch { /* exists */ }
  }
}

const SEEDED_TABLES: Array<[any, string]> = [
  [users, "users"], [clients, "clients"], [employees, "employees"], [payRuns, "pay_runs"],
  [payRunLines, "pay_run_lines"], [tasks, "tasks"], [groupEntities, "group_entities"],
  [groupOwnership, "group_ownership"], [groupProfit, "group_profit"], [groupFamilyBenefit, "group_family_benefit"],
];

/** Copy every CREATE TABLE/INDEX from the real DB into demo.db (structure only). */
async function cloneStructure(): Promise<number> {
  const real = getRealDb();
  const demo = getDemoDb();
  // Tables first, then indexes (indexes depend on their table existing).
  const defs = rowsOf(await real.run(sql.raw(
    "SELECT type, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
  )));
  let made = 0;
  for (const d of defs) {
    const stmt = String((d as any).sql ?? "");
    if (!stmt) continue;
    try { await demo.run(sql.raw(stmt)); made++; } catch { /* already exists — fine */ }
  }
  return made;
}

/** Clone any table/index present in the real DB but MISSING from demo.db (delta only).
 *  Runs every boot so new feature tables always appear in the demo. Idempotent. */
async function syncMissingStructure(): Promise<number> {
  const real = getRealDb();
  const demo = getDemoDb();
  const have = new Set(
    rowsOf(await demo.run(sql.raw("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"))).map((r: any) => String(r.name)),
  );
  const defs = rowsOf(await real.run(sql.raw(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
  )));
  let made = 0;
  for (const d of defs) {
    const name = String((d as any).name ?? "");
    if (!name || have.has(name)) continue;
    const stmt = String((d as any).sql ?? "");
    if (!stmt) continue;
    try { await demo.run(sql.raw(stmt)); made++; } catch { /* race / already exists */ }
  }
  return made;
}

/** Seed fake data into the headline NEW features so they're not empty in the demo.
 *  Own guard (cash_book account present?) so it runs even on an already-seeded demo. */
async function seedDemoExtras(): Promise<void> {
  const demo = getDemoDb();
  try {
    // Pick a demo client to attach to (first one).
    const client = rowsOf(await demo.run(sql.raw("SELECT id FROM clients ORDER BY id LIMIT 1")))[0];
    const clientId = client ? Number((client as any).id) : null;
    if (clientId == null) return;
    const now = Date.now();

    // CASH BOOK — an account + a few money-in/out entries (incl. HST) so the tab works.
    const haveCash = rowsOf(await demo.run(sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='cash_book_accounts'"))).length;
    const seededCash = haveCash && rowsOf(await demo.run(sql.raw(`SELECT id FROM cash_book_accounts WHERE clientId=${clientId} LIMIT 1`))).length;
    if (haveCash && !seededCash) {
      await demo.run(sql.raw(`INSERT INTO cash_book_accounts (clientId, name, institution, openingBalance, openingDate, currency, active, createdAt, updatedAt)
        VALUES (${clientId}, 'Operating chequing', 'Demo Bank', 5000, '2026-01-01', 'CAD', 1, ${now}, ${now})`));
      const acct = rowsOf(await demo.run(sql.raw(`SELECT id FROM cash_book_accounts WHERE clientId=${clientId} ORDER BY id DESC LIMIT 1`)))[0];
      const aId = Number((acct as any).id);
      const E = (d: string, dir: string, amt: number, hst: number | null, cat: string, desc: string, cleared: number) =>
        `INSERT INTO cash_book_entries (clientId, accountId, entryDate, direction, amount, category, description, hst, cleared, source, createdAt, updatedAt) VALUES (${clientId}, ${aId}, '${d}', '${dir}', ${amt}, '${cat}', '${desc}', ${hst == null ? "NULL" : hst}, ${cleared}, 'demo', ${now}, ${now})`;
      for (const stmt of [
        E("2026-04-03", "in", 2260, 260, "Sales / revenue", "Invoice #1042 — Maple Reno", 1),
        E("2026-04-08", "out", 565, 65, "Materials / supplies", "Lumber yard", 1),
        E("2026-04-15", "in", 1130, 130, "Sales / revenue", "Invoice #1043 — Birch Cafe", 1),
        E("2026-04-20", "out", 95, null, "Bank charges", "Monthly account fee", 1),
        E("2026-04-28", "out", 339, 39, "Vehicle / fuel", "Fuel + supplies", 0),
      ]) await demo.run(sql.raw(stmt));
    }

    // SMART MONEY — a couple of saved opportunities so the tab shows examples.
    const haveOpp = rowsOf(await demo.run(sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='client_opportunities'"))).length;
    const seededOpp = haveOpp && rowsOf(await demo.run(sql.raw(`SELECT id FROM client_opportunities WHERE clientId=${clientId} LIMIT 1`))).length;
    if (haveOpp && !seededOpp) {
      const O = (cat: string, title: string, summary: string, est: string, elig: string, url: string, src: string, status: string) =>
        `INSERT INTO client_opportunities (clientId, category, title, summary, estValue, eligibility, url, source, status, createdAt, updatedAt) VALUES (${clientId}, '${cat}', '${title.replace(/'/g, "''")}', '${summary.replace(/'/g, "''")}', '${est}', '${elig.replace(/'/g, "''")}', '${url}', '${src}', '${status}', ${now}, ${now})`;
      for (const stmt of [
        O("grants", "Canada Digital Adoption Program (example)", "Funding to adopt digital tools and e-commerce.", "up to $15,000", "Canadian SMBs", "https://ised-isde.canada.ca", "ISED", "reviewing"),
        O("wsib", "WSIB Health & Safety Excellence (example)", "Rebates for completing safety topics.", "premium rebate", "WSIB-registered employers", "https://www.wsib.ca", "WSIB", "suggested"),
        O("software", "Proposal/quoting tool (example)", "Send branded quotes and track acceptance.", "from $29/mo", "Service businesses", "https://example.com", "Demo Vendor", "applied"),
      ]) await demo.run(sql.raw(stmt));
    }
    // MONTH-END RECON — a few accounts so the tracker shows examples (one behind).
    const haveRecon = rowsOf(await demo.run(sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='client_recon_accounts'"))).length;
    const seededRecon = haveRecon && rowsOf(await demo.run(sql.raw(`SELECT id FROM client_recon_accounts WHERE clientId=${clientId} LIMIT 1`))).length;
    if (haveRecon && !seededRecon) {
      const R = (name: string, kind: string, through: string, needs: string | null, ord: number) =>
        `INSERT INTO client_recon_accounts (clientId, name, kind, reconciledThrough, needsStatements, source, sortOrder, active, updatedAt) VALUES (${clientId}, '${name}', '${kind}', '${through}', ${needs ? `'${needs}'` : "NULL"}, 'demo', ${ord}, 1, ${now})`;
      for (const stmt of [
        R("Demo Bank Chequing", "bank", "2026-05-31", null, 0),
        R("Demo Visa *4242", "credit_card", "2026-03-31", "Apr & May", 1),
        R("PayPal", "processor", "2026-05-31", null, 2),
      ]) await demo.run(sql.raw(stmt));
    }

    // SEND-A-FAX — a couple of sent faxes so the tool's history shows examples.
    const haveFax = rowsOf(await demo.run(sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='faxes'"))).length;
    const seededFax = haveFax && rowsOf(await demo.run(sql.raw("SELECT id FROM faxes LIMIT 1"))).length;
    if (haveFax && !seededFax) {
      const F = (toNumber: string, toName: string, subject: string, fileName: string, status: string, ref: string) =>
        `INSERT INTO faxes (userId, clientId, toNumber, toName, subject, fileName, pages, provider, providerReference, status, createdAt, sentAt) VALUES (1, ${clientId}, '${toNumber}', '${toName}', '${subject}', '${fileName}', 2, 'srfax', '${ref}', '${status}', ${now}, ${now})`;
      for (const stmt of [
        F("18334419644", "CRA — Authorization Services", "RC59 business authorization", "RC59_signed.pdf", "sent", "DEMO-88231"),
        F("17055551234", "Demo Bank — Lending", "Account confirmation letter", "bank_letter.pdf", "queued", "DEMO-88240"),
      ]) await demo.run(sql.raw(stmt));
    }
  } catch (e) {
    console.error("[demo-db] seedDemoExtras failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}

/** Ensure demo.db exists with structure + fake data. Safe to call every boot. */
export async function prepareDemoDb(): Promise<void> {
  try {
    await runInDemo(async () => {
      const demo = getDemoDb();
      // Has the demo DB been built yet? (clients table present?)
      const tbls = rowsOf(await demo.run(sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='clients'")));
      if (!tbls.length) {
        const made = await cloneStructure();
        console.log(`[demo-db] cloned ${made} table/index definitions into demo.db`);
      }
      // EVERY boot: mirror any table/index that exists in the real DB but is missing
      // from demo.db. This keeps the demo current with EVERY feature we ship (Cash
      // Book, Smart Money, Backups, …) WITHOUT enumerating tables — new builds appear
      // in the demo automatically instead of erroring on a missing table.
      const added = await syncMissingStructure();
      if (added) console.log(`[demo-db] synced ${added} new table/index def(s) into demo.db`);
      // Make sure the tables we seed exist + carry every column the schema defines
      // (the cloned source structure can be stale). Belt-and-suspenders create +
      // generic column sync — independent of the per-table column guards.
      const ec = await import("./ensure-clients-schema");
      await ec.ensurePayrollTables();
      const { ensureGroupBookTables } = await import("./ensure-group-book-schema");
      await ensureGroupBookTables();
      for (const [table, name] of SEEDED_TABLES) await syncColumns(table, name);
      await seedDemoData();
      // Seed a little fake data into the headline NEW features so their tabs light up
      // in the demo (its own guard — runs even on an already-seeded demo DB).
      await seedDemoExtras();
    });
  } catch (e) {
    console.error("[demo-db] prepare failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}
