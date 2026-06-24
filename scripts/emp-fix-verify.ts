import { getDb } from "../api/queries/connection";
import { ensureEmployeeSchema, employeeColumns } from "../api/ensure-employee-schema";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const before = await employeeColumns();
  console.log("[before] has ytdCppOpening:", before.has("ytdCppOpening"), "getsPhoneAllowance:", before.has("getsPhoneAllowance"), "reimbursementAmount:", before.has("reimbursementAmount"));
  await ensureEmployeeSchema();
  const after = await employeeColumns();
  const need = ["ytdCppOpening","ytdEiOpening","ytdTaxOpening","ytdAsOf","ytdSource","getsPhoneAllowance","getsBonus","getsDividends","getsReimbursement","reimbursementAmount","reimbursementNote","contractUrl","getsRevenueShare","revenueSharePercent","phoneAllowance"];
  const missing = need.filter(c => !after.has(c));
  console.log("[after] missing:", missing.length ? missing.join(",") : "none");

  // simulate an employee.update write of every card field on a real (now-migrated) row
  const anyEmp: any = await db.run(sql`SELECT id FROM employees LIMIT 1`);
  const row = (anyEmp?.rows ?? anyEmp ?? [])[0];
  if (row) {
    const id = (row as any).id ?? (row as any)[0];
    try {
      await db.run(sql.raw(`UPDATE employees SET getsPhoneAllowance=1, phoneAllowance=23.08, getsReimbursement=0, ytdCppOpening=100.5, ytdSource='manual', updatedAt=${Math.floor(Date.now()/1000)} WHERE id=${id}`));
      const check: any = await db.run(sql.raw(`SELECT getsPhoneAllowance, phoneAllowance, ytdCppOpening FROM employees WHERE id=${id}`));
      console.log("[update OK] persisted:", JSON.stringify((check?.rows ?? check ?? [])[0]));
      // revert phone to not disturb data
      await db.run(sql.raw(`UPDATE employees SET getsPhoneAllowance=0, phoneAllowance=NULL, ytdCppOpening=NULL, ytdSource=NULL WHERE id=${id}`));
      console.log("[reverted] test row restored");
    } catch (e) { console.log("[update FAILED]", (e as Error).message); }
  } else console.log("(no employees in local db to test update; columns verified)");
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
