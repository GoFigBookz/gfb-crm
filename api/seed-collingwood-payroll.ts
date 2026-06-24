/**
 * SEED CLARK COLLINGWOOD PAYROLL — idempotent, safe to run on boot.
 * Sets up the Clark Pools & Spas Collingwood (client 7) payroll roster from the
 * client's old payroll sheet ("CP-Collingwood Payroll …") so Markie can run a
 * real pay run without hand-entering everyone: employees, pay type, rate/salary,
 * phone allowance (per-employee), and banked-hours opening balances.
 *
 * SAFE / NON-DESTRUCTIVE:
 *  - Matches employees by name within client 7 only (per-client isolation).
 *  - Creates a missing employee with full data; for an EXISTING employee it only
 *    FILLS BLANK fields — it never clobbers a rate/phone Markie later edits.
 *  - Banked-hours opening balance is inserted only if that employee has none yet.
 *  - Verifies the client really is Collingwood before touching anything.
 * Re-running is a no-op once everyone is set.
 */
import { getDb } from "./queries/connection";
import { clients, employees, bankedHourEntries } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { recordRateChange } from "./employee-router";
import { employeeColumns } from "./ensure-employee-schema";

const CLIENT_ID = 7; // Clark Pools and Spas Collingwood Inc.

type SeedEmp = {
  first: string;
  last: string;
  payType: "salary" | "hourly";
  hourlyRate?: number;
  annualSalary?: number;
  phone?: number;   // phone allowance $/pay; omit/0 = none
  banked?: number;  // opening banked-hours balance; omit = no banked data
};

// Roster = the current Collingwood payroll Markie provided (this is the live set,
// a superset of the old sheet's 5/1/2026 block which had fewer staff + pre-raise
// rates). Cross-checked against the Drive file "CP-Collingwood Payroll & Cap
// Table": phone allowance = $23.08/pay, pay frequency = BIWEEKLY (26/yr),
// vacation = 4% on hourly earnings. The file has NO banked-hours data (both
// banked columns are empty), so no opening balances are seeded — the banked
// ledger starts fresh.
// FLAGGED for Markie to confirm (file shows different values — using the newer
// provided roster): Brendan Essex salary 80k (file 5/1 block = 60k); Haight 27
// (file 25); Corey Hawton 26.5 (file 25.75); Robbeson 24 (file 23). All editable
// on the employee card. phone = per-pay phone allowance.
const ROSTER: SeedEmp[] = [
  { first: "Chris", last: "Hawton", payType: "salary", annualSalary: 60000, phone: 23.08 },
  { first: "Brendan", last: "Essex", payType: "salary", annualSalary: 80000, phone: 23.08 },
  { first: "Matteo", last: "Companion", payType: "hourly", hourlyRate: 18.0 },
  { first: "Logan", last: "Greig", payType: "hourly", hourlyRate: 24.0 },
  { first: "Chris", last: "Haight", payType: "hourly", hourlyRate: 27.0, phone: 23.08 },
  { first: "Corey", last: "Hawton", payType: "hourly", hourlyRate: 26.5, phone: 23.08 },
  { first: "Justin", last: "Koutsomichos", payType: "hourly", hourlyRate: 23.0, phone: 23.08 },
  { first: "Dave", last: "Lally", payType: "hourly", hourlyRate: 24.0 },
  { first: "Aidan", last: "MacDonald", payType: "hourly", hourlyRate: 21.0, phone: 23.08 },
  { first: "Justin", last: "Pool", payType: "hourly", hourlyRate: 22.0 },
  { first: "Adrian", last: "Robbeson", payType: "hourly", hourlyRate: 24.0, phone: 23.08 },
  { first: "Chris", last: "Thompson", payType: "hourly", hourlyRate: 24.0, phone: 23.08 },
  { first: "Lisa", last: "Venditti", payType: "hourly", hourlyRate: 25.0, phone: 23.08 },
  { first: "Alan", last: "Weaver", payType: "hourly", hourlyRate: 35.0, phone: 23.08 },
];

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");

async function keep(obj: Record<string, any>): Promise<Record<string, any>> {
  try {
    const cols = await employeeColumns();
    if (!cols.size) return obj;
    const out: Record<string, any> = {};
    for (const k of Object.keys(obj)) if (cols.has(k)) out[k] = obj[k];
    return out;
  } catch { return obj; }
}

export async function seedCollingwoodPayroll(): Promise<{ created: number; filled: number; banked: number; skipped: string } | void> {
  const db = getDb();
  try {
    const client = (await db.select().from(clients).where(eq(clients.id, CLIENT_ID)).limit(1))[0] as any;
    if (!client) return { created: 0, filled: 0, banked: 0, skipped: "client 7 not found" };
    if (!/colling/i.test(client.name || "")) return { created: 0, filled: 0, banked: 0, skipped: `client 7 is "${client.name}", not Collingwood` };

    const existing = (await db.select().from(employees).where(eq(employees.clientId, CLIENT_ID))) as any[];
    let created = 0, filled = 0, banked = 0;

    for (const e of ROSTER) {
      const match = existing.find((x) => norm(x.firstName) === norm(e.first) && norm(x.lastName) === norm(e.last));
      let employeeId: number;

      if (!match) {
        const vals = await keep({
          clientId: CLIENT_ID, firstName: e.first, lastName: e.last,
          payType: e.payType,
          hourlyRate: e.payType === "hourly" ? e.hourlyRate ?? null : null,
          annualSalary: e.payType === "salary" ? e.annualSalary ?? null : null,
          getsPhoneAllowance: !!e.phone, phoneAllowance: e.phone ?? null,
          isActive: true, createdAt: new Date(), updatedAt: new Date(),
        });
        const res = await db.insert(employees).values(vals as any);
        employeeId = Number(res.lastInsertRowid);
        await recordRateChange(db, { employeeId, clientId: CLIENT_ID, payType: e.payType, hourlyRate: e.hourlyRate, annualSalary: e.annualSalary, effectiveDate: new Date(), note: "Starting rate (Collingwood sheet)", source: "import" });
        created++;
      } else {
        employeeId = match.id;
        // Fill ONLY blanks — never clobber a value Markie may have edited.
        const patch: Record<string, any> = {};
        if (match.payType == null) patch.payType = e.payType;
        if (e.payType === "hourly" && match.hourlyRate == null && e.hourlyRate != null) patch.hourlyRate = e.hourlyRate;
        if (e.payType === "salary" && match.annualSalary == null && e.annualSalary != null) patch.annualSalary = e.annualSalary;
        if (e.phone && !match.getsPhoneAllowance && (match.phoneAllowance == null || match.phoneAllowance === 0)) {
          patch.getsPhoneAllowance = true; patch.phoneAllowance = e.phone;
        }
        if (Object.keys(patch).length) {
          patch.updatedAt = new Date();
          await db.update(employees).set(await keep(patch)).where(eq(employees.id, employeeId));
          filled++;
        }
      }

      // Banked-hours opening balance — only if the sheet has one AND none recorded yet.
      if (e.banked != null) {
        const have = await db.select().from(bankedHourEntries).where(and(eq(bankedHourEntries.employeeId, employeeId), eq(bankedHourEntries.kind, "opening")));
        if (!have.length) {
          await db.insert(bankedHourEntries).values({
            clientId: CLIENT_ID, employeeId, entryDate: new Date(), hours: e.banked, kind: "opening",
            note: "Opening balance (Collingwood sheet)", source: "import", enteredBy: "seed",
          } as any);
          banked++;
        }
      }
    }
    if (created || filled || banked) console.log(`[seed-collingwood] created ${created}, filled ${filled}, banked ${banked}`);
    await applyCollingwoodPhoneAllowances();
    return { created, filled, banked, skipped: "" };
  } catch (err) {
    console.error("[seed-collingwood] failed:", err instanceof Error ? err.message : err);
  }
}

// Authoritative phone-allowance list confirmed by Markie (2026-06-24): these
// Collingwood staff get a $23.08/pay phone allowance; everyone else does NOT.
// Unlike the fill-only seed above, this SETS the value to match Markie's
// instruction exactly (entitled → on $23.08; others → off).
const PHONE_ALLOWANCE = 23.08;
const PHONE_ENTITLED: [string, string][] = [
  ["Chris", "Hawton"],      // salary
  ["Brendan", "Essex"],
  ["Corey", "Hawton"],
  ["Chris", "Haight"],
  ["Justin", "Koutsomichos"],
  ["Aidan", "MacDonald"],
  ["Adrian", "Robbeson"],
  ["Chris", "Thompson"],
  ["Lisa", "Venditti"],
  ["Alan", "Weaver"],
  ["Logan", "Greig"],       // confirmed from Markie's live run data (2026-06-24)
];

export async function applyCollingwoodPhoneAllowances(): Promise<{ on: number; off: number; skipped: string } | void> {
  const db = getDb();
  try {
    const client = (await db.select().from(clients).where(eq(clients.id, CLIENT_ID)).limit(1))[0] as any;
    if (!client || !/colling/i.test(client.name || "")) return { on: 0, off: 0, skipped: "client 7 not Collingwood" };
    const emps = (await db.select().from(employees).where(eq(employees.clientId, CLIENT_ID))) as any[];
    let on = 0, off = 0;
    for (const e of emps) {
      const entitled = PHONE_ENTITLED.some(([f, l]) => norm(f) === norm(e.firstName) && norm(l) === norm(e.lastName));
      if (entitled) {
        if (e.getsPhoneAllowance !== true || e.phoneAllowance !== PHONE_ALLOWANCE) {
          await db.update(employees).set(await keep({ getsPhoneAllowance: true, phoneAllowance: PHONE_ALLOWANCE, updatedAt: new Date() })).where(eq(employees.id, e.id));
          on++;
        }
      } else if (e.getsPhoneAllowance || (e.phoneAllowance ?? 0) > 0) {
        // Not on Markie's entitled list → ensure no phone allowance.
        await db.update(employees).set(await keep({ getsPhoneAllowance: false, phoneAllowance: null, updatedAt: new Date() })).where(eq(employees.id, e.id));
        off++;
      }
    }
    if (on || off) console.log(`[collingwood-phone] set ${on} on, ${off} off`);
    return { on, off, skipped: "" };
  } catch (err) {
    console.error("[collingwood-phone] failed:", err instanceof Error ? err.message : err);
  }
}
