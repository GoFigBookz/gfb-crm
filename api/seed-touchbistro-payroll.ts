/**
 * SEED TOUCHBISTRO PAYROLL — idempotent, safe on boot.
 * Sets up the roster + pay rates for the TouchBistro restaurants from the client
 * payroll sheets ("Sher-E-Punja Payroll", "The Auld Spot Pub-Payroll") so Markie
 * can add hours and run payroll without hand-entering everyone.
 *
 * SAFE / NON-DESTRUCTIVE (same rules as the Collingwood seed):
 *  - Matches employees by name within the right client only (isolation).
 *  - Creates a missing employee with full data; for an EXISTING employee it only
 *    FILLS BLANK fields — never clobbers a rate Markie edited.
 *  - Verifies each client's name before touching anything.
 *  - "Not in Payroll" / terminated staff from the sheet are intentionally excluded.
 */
import { getDb } from "./queries/connection";
import { clients, employees } from "../db/schema";
import { eq } from "drizzle-orm";
import { recordRateChange } from "./employee-router";
import { employeeColumns } from "./ensure-employee-schema";

type SeedEmp = {
  first: string; last: string;
  payType: "salary" | "hourly";
  hourlyRate?: number; annualSalary?: number;
  position?: string;
};

// clientId → { nameMatch, roster }. nameMatch guards we're seeding the right realm.
const TOUCHBISTRO: { clientId: number; nameMatch: RegExp; roster: SeedEmp[] }[] = [
  {
    clientId: 16, nameMatch: /sher|punjab/i,
    roster: [
      { first: "Surya", last: "Bhattrai", payType: "hourly", hourlyRate: 21.0, position: "Chef" },
      { first: "Upendra", last: "Bahadur Poudel", payType: "salary", annualSalary: 70000, position: "BOH" },
      { first: "Akash", last: "Dahal", payType: "hourly", hourlyRate: 17.6, position: "FOH" },
      { first: "Rohit", last: "Dhimal", payType: "hourly", hourlyRate: 19.0, position: "BOH" },
      { first: "Dhiren", last: "Gurung", payType: "hourly", hourlyRate: 18.0, position: "BOH" },
      { first: "Suraj", last: "Limbu", payType: "hourly", hourlyRate: 18.0, position: "BOH" },
      { first: "Deepak", last: "Vasisth", payType: "hourly", hourlyRate: 17.6, position: "FOH" },
    ],
  },
  {
    clientId: 15, nameMatch: /auld|spot/i,
    roster: [
      { first: "James", last: "Allard", payType: "hourly", hourlyRate: 20.0, position: "BOH" },
      { first: "Bhima", last: "Bhattarai", payType: "hourly", hourlyRate: 17.6, position: "FOH" },
      { first: "Heather", last: "Capstick", payType: "hourly", hourlyRate: 18.0, position: "FOH" },
      { first: "Maddy", last: "Cooper", payType: "hourly", hourlyRate: 17.6, position: "FOH" },
      { first: "Eric", last: "Cressos", payType: "hourly", hourlyRate: 18.0, position: "FOH" },
      { first: "Karma", last: "Dozang", payType: "hourly", hourlyRate: 20.0, position: "BOH" },
      { first: "Paige", last: "Ferlatte", payType: "hourly", hourlyRate: 17.6, position: "FOH" },
      { first: "Charlotte", last: "Fowler", payType: "hourly", hourlyRate: 17.6, position: "FOH" },
      { first: "Breanna", last: "Fox", payType: "hourly", hourlyRate: 18.0, position: "FOH" },
      { first: "Lee Anne", last: "Hrabi", payType: "hourly", hourlyRate: 17.6, position: "FOH" },
      { first: "Robert", last: "Jacobson", payType: "hourly", hourlyRate: 30.0, position: "Chef Temp" },
      { first: "Bonnie", last: "Malone", payType: "hourly", hourlyRate: 17.6, position: "FOH" },
      { first: "Amal", last: "Ragh", payType: "hourly", hourlyRate: 21.0, position: "BOH" },
      { first: "Bryah", last: "Risdon", payType: "hourly", hourlyRate: 17.6, position: "FOH" },
      { first: "Jayvi Tri", last: "Tsan", payType: "hourly", hourlyRate: 20.0, position: "BOH" },
      { first: "Leah", last: "Young", payType: "hourly", hourlyRate: 17.6, position: "FOH" },
    ],
  },
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

export async function seedTouchbistroPayroll(): Promise<{ created: number; filled: number; skipped: string[] }> {
  const db = getDb();
  let created = 0, filled = 0;
  const skipped: string[] = [];
  for (const { clientId, nameMatch, roster } of TOUCHBISTRO) {
    try {
      const client = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
      if (!client) { skipped.push(`client ${clientId} not found`); continue; }
      if (!nameMatch.test(client.name || "")) { skipped.push(`client ${clientId} is "${client.name}", not a match`); continue; }
      const existing = (await db.select().from(employees).where(eq(employees.clientId, clientId))) as any[];
      for (const e of roster) {
        const match = existing.find((x) => norm(x.firstName) === norm(e.first) && norm(x.lastName) === norm(e.last));
        if (!match) {
          const vals = await keep({
            clientId, firstName: e.first, lastName: e.last, position: e.position ?? null,
            payType: e.payType,
            hourlyRate: e.payType === "hourly" ? e.hourlyRate ?? null : null,
            annualSalary: e.payType === "salary" ? e.annualSalary ?? null : null,
            isActive: true, createdAt: new Date(), updatedAt: new Date(),
          });
          const res = await db.insert(employees).values(vals as any);
          const employeeId = Number(res.lastInsertRowid);
          await recordRateChange(db, { employeeId, clientId, payType: e.payType, hourlyRate: e.hourlyRate, annualSalary: e.annualSalary, effectiveDate: new Date(), note: "Starting rate (TouchBistro sheet)", source: "import" });
          created++;
        } else {
          const patch: Record<string, any> = {};
          if (match.payType == null) patch.payType = e.payType;
          if (e.payType === "hourly" && match.hourlyRate == null && e.hourlyRate != null) patch.hourlyRate = e.hourlyRate;
          if (e.payType === "salary" && match.annualSalary == null && e.annualSalary != null) patch.annualSalary = e.annualSalary;
          if (match.position == null && e.position) patch.position = e.position;
          if (Object.keys(patch).length) {
            patch.updatedAt = new Date();
            await db.update(employees).set(await keep(patch)).where(eq(employees.id, match.id));
            filled++;
          }
        }
      }
    } catch (err) {
      skipped.push(`client ${clientId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (created || filled) console.log(`[seed-touchbistro] created ${created}, filled ${filled}`);
  return { created, filled, skipped };
}
