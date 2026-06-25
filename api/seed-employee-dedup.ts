/**
 * EMPLOYEE DEDUP + NAME-CORRECTION — idempotent, safe on boot.
 *
 * Markie found duplicate employees on the Clark clients (same person seeded twice,
 * sometimes with first/last swapped) and inaccurate first/last splits. This routine,
 * per client, in isolation:
 *   1. Groups employees by a name-order-insensitive key (sorted letters of the full
 *      name) so "Bahadur Poudel, Upendra" and "Upendra, Bahadur Poudel" collapse.
 *   2. Keeps the most-complete record (most non-null fields; ties → has pay-run lines
 *      → lowest id), repoints every employeeId reference (pay_run_lines, timesheets,
 *      employee_rate_history, banked_hour_entries) to the keeper, deletes the dupes.
 *   3. Corrects the keeper's firstName/lastName to the authoritative roster spelling
 *      (so Clark OS / Collingwood show the right "Last, First").
 *
 * SAFE: scoped to one clientId at a time; only touches clients we have an authoritative
 * roster for; re-running is a no-op once clean.
 */
import { getDb } from "./queries/connection";
import { clients, employees, payRunLines, timesheets, employeeRateHistory, bankedHourEntries } from "../db/schema";
import { eq } from "drizzle-orm";

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
// Order-insensitive identity key: all letters of the full name, sorted.
const idKey = (first: string, last: string) => (norm(first) + norm(last)).split("").sort().join("");

// Authoritative name splits (first / last as they should display).
type Name = { first: string; last: string };
const OS_NAMES: Name[] = [
  { first: "Jammie", last: "Cook" }, { first: "Grace", last: "Dickerson" },
  { first: "Dean", last: "Dickerson" }, { first: "Bruce", last: "Funston" },
  { first: "Ethan", last: "Holt" }, { first: "Isabella", last: "Holt" },
  { first: "Chris", last: "Kennedy" }, { first: "Michael", last: "Kennedy" },
  { first: "Alexis", last: "Montgomery" }, { first: "Jamie", last: "Moseley" },
  { first: "Brad", last: "Nickle" }, { first: "Brad", last: "Shaw" },
  { first: "Debbie", last: "Maritin" }, { first: "Neil", last: "Korchak" },
];
const CW_NAMES: Name[] = [
  { first: "Chris", last: "Hawton" }, { first: "Brendan", last: "Essex" },
  { first: "Matteo", last: "Companion" }, { first: "Logan", last: "Greig" },
  { first: "Chris", last: "Haight" }, { first: "Corey", last: "Hawton" },
  { first: "Justin", last: "Koutsomichos" }, { first: "Dave", last: "Lally" },
  { first: "Aidan", last: "MacDonald" }, { first: "Justin", last: "Pool" },
  { first: "Adrian", last: "Robbeson" }, { first: "Chris", last: "Thompson" },
  { first: "Lisa", last: "Venditti" }, { first: "Alan", last: "Weaver" },
];
const SHER_NAMES: Name[] = [
  { first: "Surya", last: "Bhattrai" }, { first: "Upendra", last: "Bahadur Poudel" },
  { first: "Akash", last: "Dahal" }, { first: "Rohit", last: "Dhimal" },
  { first: "Dhiren", last: "Gurung" }, { first: "Suraj", last: "Limbu" },
  { first: "Deepak", last: "Vasisth" },
];

const completeness = (e: any) => {
  let n = 0;
  for (const k of ["firstName", "lastName", "position", "payType", "hourlyRate", "annualSalary", "jobberName", "jobberUserId", "phoneAllowance", "ytdGrossOpening"]) {
    if (e[k] != null && e[k] !== "") n++;
  }
  return n;
};

async function repoint(db: any, fromId: number, toId: number) {
  for (const tbl of [payRunLines, timesheets, employeeRateHistory, bankedHourEntries]) {
    try { await db.update(tbl).set({ employeeId: toId }).where(eq((tbl as any).employeeId, fromId)); } catch { /* table/col may not exist */ }
  }
}

async function dedupClient(clientId: number, names: Name[]): Promise<{ merged: number; renamed: number }> {
  const db = getDb();
  const nameByKey = new Map<string, Name>();
  for (const n of names) nameByKey.set(idKey(n.first, n.last), n);

  const emps = (await db.select().from(employees).where(eq(employees.clientId, clientId))) as any[];
  const groups = new Map<string, any[]>();
  for (const e of emps) {
    const k = idKey(e.firstName || "", e.lastName || "");
    const arr = groups.get(k) || [];
    arr.push(e);
    groups.set(k, arr);
  }

  let merged = 0, renamed = 0;
  for (const [k, group] of groups) {
    // Pick keeper: most complete, then has pay-run lines, then lowest id.
    let keeper = group[0];
    if (group.length > 1) {
      const lineCounts = new Map<number, number>();
      for (const g of group) {
        const lc = (await db.select().from(payRunLines).where(eq(payRunLines.employeeId, g.id))) as any[];
        lineCounts.set(g.id, lc.length);
      }
      keeper = [...group].sort((a, b) =>
        completeness(b) - completeness(a) ||
        (lineCounts.get(b.id)! - lineCounts.get(a.id)!) ||
        (a.id - b.id))[0];
      for (const g of group) {
        if (g.id === keeper.id) continue;
        // Carry any field the keeper is missing from the dupe before repointing.
        const patch: Record<string, any> = {};
        for (const f of ["position", "payType", "hourlyRate", "annualSalary", "jobberName", "jobberUserId", "phoneAllowance", "getsPhoneAllowance", "ytdGrossOpening"]) {
          if ((keeper[f] == null || keeper[f] === "") && g[f] != null && g[f] !== "") patch[f] = g[f];
        }
        if (Object.keys(patch).length) { patch.updatedAt = new Date(); await db.update(employees).set(patch).where(eq(employees.id, keeper.id)); Object.assign(keeper, patch); }
        await repoint(db, g.id, keeper.id);
        await db.delete(employees).where(eq(employees.id, g.id));
        merged++;
      }
    }
    // Correct the keeper's name split to the authoritative roster.
    const want = nameByKey.get(k);
    if (want && (keeper.firstName !== want.first || keeper.lastName !== want.last)) {
      await db.update(employees).set({ firstName: want.first, lastName: want.last, updatedAt: new Date() }).where(eq(employees.id, keeper.id));
      renamed++;
    }
  }
  return { merged, renamed };
}

export async function dedupEmployees(): Promise<{ merged: number; renamed: number; skipped: string } | void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    const targets: { match: (c: any) => boolean; names: Name[] }[] = [
      { match: (c) => /clark/i.test(c.name || "") && /(owen|sound)/i.test(c.name || ""), names: OS_NAMES },
      { match: (c) => /colling/i.test(c.name || ""), names: CW_NAMES },
      { match: (c) => /sher|punjab/i.test(c.name || ""), names: SHER_NAMES },
    ];
    let merged = 0, renamed = 0;
    for (const t of targets) {
      const client = cs.find(t.match);
      if (!client) continue;
      const r = await dedupClient(client.id, t.names);
      merged += r.merged; renamed += r.renamed;
    }
    if (merged || renamed) console.log(`[emp-dedup] merged ${merged} dupe(s), renamed ${renamed}`);
    return { merged, renamed, skipped: "" };
  } catch (err) {
    console.error("[emp-dedup] failed:", err instanceof Error ? err.message : err);
  }
}
