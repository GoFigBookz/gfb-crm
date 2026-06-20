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

export async function seedPayrollEmployees(): Promise<{ matched: number; added: number; skipped: number; removed: number; unmatched: string[] }> {
  const db = getDb();
  const result = { matched: 0, added: 0, skipped: 0, removed: 0, unmatched: [] as string[] };
  if (!PAYROLL_EMPLOYEE_SEED.length) return result;

  const allClients = await db.select().from(clients);
  // Employee ids that are already used in a pay run — never auto-delete those.
  const usedLines = await db.select().from(payRunLines);
  const usedEmpIds = new Set((usedLines as any[]).map((l) => l.employeeId));

  for (const roster of PAYROLL_EMPLOYEE_SEED) {
    const match = roster.clientMatch.toLowerCase();
    const client = (allClients as any[]).find((c) => (c.name || "").toLowerCase().includes(match));
    if (!client) { result.unmatched.push(roster.clientMatch); continue; }
    result.matched++;

    // `replace` rosters (e.g. the corrected Clark OS/CW split) clear the
    // client's prior AUTO-seeded employees that aren't used in any pay run, so a
    // bad earlier seed self-corrects — but anyone already on a run is preserved.
    if ((roster as any).replace === true) {
      const current = await db.select().from(employees).where(eq(employees.clientId, client.id));
      for (const e of current as any[]) {
        if (!usedEmpIds.has(e.id)) { await db.delete(employees).where(eq(employees.id, e.id)); result.removed++; }
      }
    }

    const refreshed = await db.select().from(employees).where(eq(employees.clientId, client.id));
    const existing = new Set(
      (refreshed as any[]).map((e) => `${(e.firstName || "").toLowerCase()} ${(e.lastName || "").toLowerCase()}`.trim())
    );

    for (const emp of roster.employees) {
      const key = `${(emp.firstName || "").toLowerCase()} ${(emp.lastName || "").toLowerCase()}`.trim();
      if (existing.has(key)) { result.skipped++; continue; }
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
      existing.add(key);
      result.added++;
    }
  }
  if (result.added || result.removed) console.log(`[seed] payroll employees: +${result.added} -${result.removed} across ${result.matched} clients`);
  return result;
}
