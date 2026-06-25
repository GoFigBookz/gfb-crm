/**
 * COMPANY GROUPS SEED — tags related entities with a shared `groupName` so the CRM
 * can surface them together (consolidated rollup, interco reconciliation, etc.).
 *
 * John Gillham's group (Markie 2026-06-25): the interco-linked cluster plus his other
 * holdings. Idempotent: only sets groupName where it's blank/different; never clobbers
 * a group a human already set to something else for that client. Matches by name.
 */
import { getDb } from "./queries/connection";
import { clients } from "../db/schema";
import { eq } from "drizzle-orm";

const GROUPS: { group: string; match: RegExp[] }[] = [
  {
    group: "John Gillham",
    match: [
      /2303851/i,
      /\badbank\b/i,
      /fractal\s*saas/i,
      /motion\s*invest/i,
      /seahorse/i,
      /originality/i,
      /clark.*colling/i,
      /clark.*(owen|sound)/i,
      /marketing\s*strategy\s*ventures/i,
      /listing\s*eagle/i,
    ],
  },
];

export async function seedCompanyGroups(): Promise<{ tagged: number; groups: Record<string, string[]> } | void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    let tagged = 0;
    const groups: Record<string, string[]> = {};
    for (const g of GROUPS) {
      groups[g.group] = [];
      for (const c of cs) {
        const name = c.name || "";
        if (!g.match.some((re) => re.test(name))) continue;
        groups[g.group].push(name);
        if ((c.groupName || "").trim() === g.group) continue;
        // Only fill blanks (don't overwrite a different human-set group).
        if (c.groupName && c.groupName.trim() && c.groupName.trim() !== g.group) continue;
        await db.update(clients).set({ groupName: g.group, updatedAt: new Date() } as any).where(eq(clients.id, c.id));
        tagged++;
      }
    }
    if (tagged) console.log(`[company-groups] tagged ${tagged} client(s)`);
    return { tagged, groups };
  } catch (err) {
    console.error("[company-groups] failed:", err instanceof Error ? err.message : err);
  }
}
