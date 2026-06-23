/**
 * FIGGY JR — SEED PAYROLL EMPLOYEES FROM CLIENT SHEETS
 * =============================================================================
 * Populates the `employees` table from rosters extracted out of each client's
 * Google payroll sheet (api/payroll-employee-seed.ts). Idempotent: matches the
 * client by a name substring, and dedupes employees by (clientId, first+last,
 * case-insensitive) so re-running never creates duplicates. Only ADDS missing
 * people — never deletes or overwrites edited records.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { eq } from "drizzle-orm";
import { clients, employees, payRunLines } from "../db/schema";
import { PAYROLL_EMPLOYEE_SEED } from "./payroll-employee-seed";
import { PAYROLL_CONTRACT_LINKS } from "./payroll-contract-links";

// Employees who have moved between clients (idempotent reassignment by name).
const PAYROLL_EMPLOYEE_MOVES: Array<{ firstName: string; lastName: string; fromMatch: string; toMatch: string; note?: string }> = [
  { firstName: "Stacey", lastName: "Gillham", fromMatch: "2303851", toMatch: "originality", note: "Moved to Originality as of the 15th" },
];

const norm = (s: string) => (s || "").toLowerCase().trim();
const findClient = (all: any[], match: string) => all.find((c) => norm(c.name).includes(norm(match)));

/** Parse "Monthly salary $6,833.33" / "Weekly salary $1,250" from notes → annual. */
function annualFromNotes(notes: string | null | undefined): number | undefined {
  if (!notes) return undefined;
  const m = notes.match(/(monthly|weekly|annual|yearly)\s+salary\s*\$?([\d,]+(?:\.\d+)?)/i);
  if (!m) return undefined;
  const amt = parseFloat(m[2].replace(/,/g, ""));
  if (isNaN(amt)) return undefined;
  const per = m[1].toLowerCase();
  if (per === "monthly") return Math.round(amt * 12 * 100) / 100;
  if (per === "weekly") return Math.round(amt * 52 * 100) / 100;
  return Math.round(amt * 100) / 100; // annual/yearly
}

export async function seedPayrollEmployees(): Promise<{ matched: number; added: number; skipped: number; removed: number; unmatched: string[] }> {
  const db = getDb();
  const result = { matched: 0, added: 0, skipped: 0, removed: 0, unmatched: [] as string[] };
  if (!PAYROLL_EMPLOYEE_SEED.length) return result;

  const allClients = await db.select().from(clients);
  for (const roster of PAYROLL_EMPLOYEE_SEED) {
    const match = roster.clientMatch.toLowerCase();
    const client = (allClients as any[]).find((c) => (c.name || "").toLowerCase().includes(match));
    if (!client) { result.unmatched.push(roster.clientMatch); continue; }
    result.matched++;

    // ONE-TIME, NON-DESTRUCTIVE seed (Markie 2026-06-22): if this client already has
    // ANY employees, leave them completely alone — never delete or overwrite live
    // edits. We only populate a client whose roster is still empty. (The old
    // `replace:true` wipe ran on a prior deploy to fix the bad rosters; from here the
    // DB is the source of truth and employees are managed in the UI / synced from QBO.)
    const current = await db.select().from(employees).where(eq(employees.clientId, client.id));
    if (current.length > 0 && !roster.merge) { result.skipped += roster.employees.length; continue; }

    // MERGE rosters (restaurants from TouchBistro sheets): add any seed employee
    // not already on the client by name — never delete or overwrite live edits.
    // This unblocks a roster that a stray/partial record would otherwise skip.
    const have = new Set((current as any[]).map((e) => `${norm(e.firstName)} ${norm(e.lastName)}`.trim()));

    for (const emp of roster.employees) {
      if (roster.merge && have.has(`${norm(emp.firstName)} ${norm(emp.lastName || "")}`.trim())) { result.skipped++; continue; }
      await db.insert(employees).values({
        clientId: client.id,
        firstName: emp.firstName,
        lastName: emp.lastName || "",
        payType: emp.payType || "hourly",
        hourlyRate: emp.hourlyRate,
        annualSalary: emp.annualSalary,
        position: emp.position,
        email: emp.email,
        notes: emp.notes,
        isActive: true,
      });
      result.added++;
    }
  }

  // ---- Employee moves (e.g. Stacey → Originality) — idempotent by name ----
  let moved = 0;
  const clientsNow = await db.select().from(clients);
  for (const mv of PAYROLL_EMPLOYEE_MOVES) {
    const to = findClient(clientsNow as any[], mv.toMatch);
    if (!to) continue;
    const matches = (await db.select().from(employees)).filter((e: any) =>
      norm(e.firstName) === norm(mv.firstName) && norm(e.lastName) === norm(mv.lastName));
    for (const e of matches as any[]) {
      if (e.clientId === to.id) continue; // already moved
      const from = findClient(clientsNow as any[], mv.fromMatch);
      if (from && e.clientId !== from.id) continue; // only move the one under `from`
      await db.update(employees).set({ clientId: to.id, notes: mv.note || e.notes, updatedAt: new Date() }).where(eq(employees.id, e.id));
      moved++;
    }
  }

  // ---- Backfill salary/rate from the notes we extracted (only when missing) ----
  let filled = 0;
  for (const e of (await db.select().from(employees)) as any[]) {
    if (e.payType === "salary" && (e.annualSalary == null || e.annualSalary === 0)) {
      const annual = annualFromNotes(e.notes);
      if (annual) { await db.update(employees).set({ annualSalary: annual, updatedAt: new Date() }).where(eq(employees.id, e.id)); filled++; }
    }
  }

  // ---- Apply contract links found in Drive (by client + name) ----
  let contracts = 0;
  if (PAYROLL_CONTRACT_LINKS.length) {
    const all = await db.select().from(employees);
    for (const link of PAYROLL_CONTRACT_LINKS) {
      const client = findClient(clientsNow as any[], link.clientMatch);
      if (!client) continue;
      const emp = (all as any[]).find((e) => e.clientId === client.id
        && norm(e.firstName) === norm(link.firstName)
        && (!link.lastName || norm(e.lastName) === norm(link.lastName)));
      if (emp && !emp.contractUrl) { await db.update(employees).set({ contractUrl: link.contractUrl, updatedAt: new Date() }).where(eq(employees.id, emp.id)); contracts++; }
    }
  }

  if (result.added || result.removed || moved || filled || contracts)
    console.log(`[seed] payroll employees: +${result.added} -${result.removed} moved ${moved} salary-filled ${filled} contracts ${contracts}`);
  return { ...result, moved, filled, contracts } as any;
}
