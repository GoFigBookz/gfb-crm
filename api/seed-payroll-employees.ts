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
import { clients, employees } from "../db/schema";
import { PAYROLL_EMPLOYEE_SEED } from "./payroll-employee-seed";

export async function seedPayrollEmployees(): Promise<{ matched: number; added: number; skipped: number; unmatched: string[] }> {
  const db = getDb();
  const result = { matched: 0, added: 0, skipped: 0, unmatched: [] as string[] };
  if (!PAYROLL_EMPLOYEE_SEED.length) return result;

  const allClients = await db.select().from(clients);
  const allEmps = await db.select().from(employees);

  for (const roster of PAYROLL_EMPLOYEE_SEED) {
    const match = roster.clientMatch.toLowerCase();
    // Prefer an exact-ish match; fall back to first name-substring hit.
    const client = (allClients as any[]).find((c) => (c.name || "").toLowerCase().includes(match));
    if (!client) { result.unmatched.push(roster.clientMatch); continue; }
    result.matched++;

    const existing = new Set(
      (allEmps as any[])
        .filter((e) => e.clientId === client.id)
        .map((e) => `${(e.firstName || "").toLowerCase()} ${(e.lastName || "").toLowerCase()}`.trim())
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
  if (result.added) console.log(`[seed] payroll employees: +${result.added} across ${result.matched} clients`);
  return result;
}
