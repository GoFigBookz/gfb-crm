/**
 * EMPLOYEE SCHEMA GUARD — idempotent, runs on boot.
 * The employees table has grown a lot of columns over time (per-employee payroll
 * features, reimbursement, phone allowance, contract link, YTD carry-forward …).
 * On an older live persistent-volume DB some of those columns may not exist yet —
 * and because the card's Save writes ALL of them, a single missing column makes
 * EVERY employee edit throw ("no such column") so the card looks un-editable.
 *
 * This guard adds the full set of newer columns idempotently (PRAGMA → ALTER ADD)
 * so employee edits always persist. Belt-and-suspenders alongside the patch
 * filtering in employee-router.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

// name → SQLite column type for every column that may post-date the original table.
const COLUMNS: [string, string][] = [
  ["startDate", "integer"],
  ["department", "text"],
  ["address", "text"],
  ["isContractor", "integer"],
  ["wsibEligible", "integer"],
  ["jobberName", "text"],
  ["jobberUserId", "text"],
  ["terminationDate", "integer"],
  ["terminationReason", "text"],
  ["hasHealthBenefits", "integer"],
  ["hasDentalBenefits", "integer"],
  ["hasRrsp", "integer"],
  ["rrspMatchPercent", "real"],
  ["onGovernmentGrant", "integer"],
  ["grantType", "text"],
  ["grantStartDate", "integer"],
  ["grantEndDate", "integer"],
  ["federalTaxCredits", "text"],
  ["provincialTaxCredits", "text"],
  ["t4Box14Wages", "real"],
  ["t4Box16Cpp", "real"],
  ["t4Box18Ei", "real"],
  ["t4Box20Rpp", "real"],
  ["t4Box44UnionDues", "real"],
  ["t4Box46Charitable", "real"],
  ["contractUrl", "text"],
  ["phoneAllowance", "real"],
  ["reimbursementAmount", "real"],
  ["reimbursementNote", "text"],
  ["getsRevenueShare", "integer"],
  ["revenueSharePercent", "real"],
  ["ytdGrossOpening", "real"],
  ["ytdCppOpening", "real"],
  ["ytdEiOpening", "real"],
  ["ytdTaxOpening", "real"],
  ["ytdAsOf", "integer"],
  ["ytdSource", "text"],
  ["getsBonus", "integer"],
  ["getsDividends", "integer"],
  ["getsPhoneAllowance", "integer"],
  ["getsReimbursement", "integer"],
  ["notes", "text"],
];

/** The set of columns that currently exist on the employees table. */
export async function employeeColumns(): Promise<Set<string>> {
  const db = getDb();
  const have = new Set<string>();
  try {
    const res: any = await db.run(sql`PRAGMA table_info(employees)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
  } catch (e) {
    console.error("[employee-schema] PRAGMA failed:", e instanceof Error ? e.message : e);
  }
  return have;
}

export async function ensureEmployeeSchema(): Promise<void> {
  const db = getDb();
  const have = await employeeColumns();
  for (const [name, type] of COLUMNS) {
    if (have.has(name)) continue;
    try {
      await db.run(sql.raw(`ALTER TABLE employees ADD COLUMN "${name}" ${type}`));
      console.log(`[employee-schema] added column: ${name}`);
    } catch (e) {
      console.error(`[employee-schema] add column ${name} failed:`, e instanceof Error ? e.message : e);
    }
  }
  // Same drift risk on pay_run_lines (phoneAllowance / reimbursement add-ons).
  try {
    const have2 = new Set<string>();
    const res: any = await db.run(sql`PRAGMA table_info(pay_run_lines)`);
    for (const r of (res?.rows ?? res ?? [])) have2.add(String((r as any).name ?? (r as any)[1] ?? ""));
    for (const [name, type] of [["phoneAllowance", "real"], ["reimbursement", "real"], ["vacationPayAccrued", "real"], ["vacationPayPaid", "real"]] as [string, string][]) {
      if (have2.has(name)) continue;
      try { await db.run(sql.raw(`ALTER TABLE pay_run_lines ADD COLUMN "${name}" ${type}`)); console.log(`[employee-schema] pay_run_lines added: ${name}`); }
      catch (e) { console.error(`[employee-schema] pay_run_lines add ${name} failed:`, e instanceof Error ? e.message : e); }
    }
  } catch { /* table may not exist yet */ }
}
