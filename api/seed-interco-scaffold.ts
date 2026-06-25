/**
 * INTERCO SCAFFOLD — get the inter-company tracker "ready to run" for the company
 * groups (Markie 2026-06-25). For each group it creates the CURRENT-MONTH interco
 * period shell for that group's primary paying entity (the holdco that fronts the
 * costs), so the Inter-Company page shows a live period to work the 3-step close
 * against. Any other entity can still be added on the page ("option open to do all").
 *
 * Idempotent: skips a (period, payer) that already exists; never overwrites. Real
 * balances fill in from the Interco Balances sheet / QBO as they come.
 */
import { getDb } from "./queries/connection";
import { clients, intercoPeriods } from "../db/schema";
import { and, eq } from "drizzle-orm";

// Each group's primary payer (fronts the costs / runs the bill-back), by name match.
const GROUP_PAYERS: { group: string; payer: RegExp; account: string }[] = [
  { group: "Jon Gillham", payer: /2303851/i, account: "Due to/from — interco (set from chart)" },
  { group: "Rocco", payer: /ovita\s*holdings/i, account: "Due to/from — interco (set from chart)" },
  { group: "Universal", payer: /universal\s*construction/i, account: "Due to/from — interco (set from chart)" },
];

export async function seedIntercoScaffold(): Promise<{ created: number; periods: string[] } | void> {
  const db = getDb();
  try {
    const period = new Date().toISOString().slice(0, 7); // current YYYY-MM
    const cs = (await db.select().from(clients)) as any[];
    let created = 0;
    const periods: string[] = [];
    for (const g of GROUP_PAYERS) {
      const payer = cs.find((c) => (c.groupName || "").trim() === g.group && g.payer.test(c.name || ""))
        // fall back to any entity in the group if the named payer isn't present
        || cs.find((c) => (c.groupName || "").trim() === g.group);
      if (!payer) continue;
      const [existing] = await db.select().from(intercoPeriods)
        .where(and(eq(intercoPeriods.period, period), eq(intercoPeriods.payerClientId, payer.id)));
      if (existing) continue;
      await db.insert(intercoPeriods).values({
        period, payerClientId: payer.id,
        intercoAccount: g.account,
        status: "open",
        notes: `Scaffold — ready for the 3-step interco close (${g.group})`,
        createdAt: new Date(), updatedAt: new Date(),
      } as any);
      created++;
      periods.push(`${g.group}: ${payer.name} ${period}`);
    }
    if (created) console.log(`[interco-scaffold] created ${created} period shell(s): ${periods.join("; ")}`);
    return { created, periods };
  } catch (err) {
    console.error("[interco-scaffold] failed:", err instanceof Error ? err.message : err);
  }
}
