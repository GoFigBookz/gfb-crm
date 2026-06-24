import { getDb } from "../api/queries/connection";
import { ensureBankedHoursSchema } from "../api/ensure-banked-hours-schema";
import { buildLedger, summarize, parseOpeningBalances } from "../api/banked-hours-core";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  await ensureBankedHoursSchema();
  console.log("[1] schema guard ran");

  // find a client with employees
  const c: any = await db.run(sql`SELECT clientId, COUNT(*) n FROM employees GROUP BY clientId ORDER BY n DESC LIMIT 1`);
  const row = (c?.rows ?? c ?? [])[0];
  const clientId = (row as any).clientId ?? (row as any)[0];
  const emp: any = await db.run(sql.raw(`SELECT id, firstName, lastName FROM employees WHERE clientId=${clientId} LIMIT 1`));
  const e = (emp?.rows ?? emp ?? [])[0];
  const employeeId = (e as any).id ?? (e as any)[0];
  console.log(`[2] using client ${clientId}, employee ${employeeId} (${(e as any).firstName} ${(e as any).lastName})`);

  const now = Math.floor(Date.now()/1000);
  await db.run(sql.raw(`INSERT INTO banked_hour_entries (clientId,employeeId,entryDate,hours,kind,source,createdAt) VALUES (${clientId},${employeeId},${now-86400*30},10,'opening','import',${now})`));
  await db.run(sql.raw(`INSERT INTO banked_hour_entries (clientId,employeeId,entryDate,hours,kind,source,createdAt) VALUES (${clientId},${employeeId},${now-86400*10},5,'accrue','manual',${now})`));
  await db.run(sql.raw(`INSERT INTO banked_hour_entries (clientId,employeeId,entryDate,hours,kind,source,createdAt) VALUES (${clientId},${employeeId},${now-86400},-8,'redeem','client',${now})`));

  const got: any = await db.run(sql.raw(`SELECT id,entryDate,hours,kind FROM banked_hour_entries WHERE employeeId=${employeeId}`));
  const rows = (got?.rows ?? got ?? []).map((r: any) => ({ id: r.id ?? r[0], entryDate: new Date((r.entryDate ?? r[1])*1000), hours: r.hours ?? r[2], kind: r.kind ?? r[3] }));
  const led = buildLedger(rows);
  const s = summarize(rows);
  console.log("[3] ledger balances:", led.map(r => r.runningBalance).join(" -> "));
  console.log("[4] summary:", JSON.stringify(s));
  console.log(s.balance === 7 && s.totalBanked === 15 && s.totalTaken === 8 ? "[PASS] balance math correct" : "[FAIL]");

  // import parser tie to real names
  const parsed = parseOpeningBalances(`${(e as any).lastName}, ${(e as any).firstName}\t12.5`);
  console.log("[5] parser:", JSON.stringify(parsed));

  // cleanup
  await db.run(sql.raw(`DELETE FROM banked_hour_entries WHERE employeeId=${employeeId} AND createdAt=${now}`));
  console.log("[6] cleaned up");
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
