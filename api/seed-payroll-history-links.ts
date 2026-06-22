import { getDb } from "./queries/connection";
import { clients } from "../db/schema";
import { eq, like, or } from "drizzle-orm";

/**
 * Seed the links to clients' OLD payroll-history Google Sheets so the info is
 * never lost and is one-click openable from the Payroll tab. Idempotent +
 * NON-destructive: only sets the link when it's currently blank (never overwrites
 * a hand-edited one). Matched by a name fragment.
 */
const SHEETS: Array<{ match: string; url: string }> = [
  { match: "owen sound", url: "https://docs.google.com/spreadsheets/d/1EB-oYiSSXHFXv2XaT7QzCWXTtqgaegDxToqv626LU1o/edit" },
  { match: "collingwood", url: "https://docs.google.com/spreadsheets/d/1P-m-fBBbKT-L8VrcYG6Fd73DeskmUfrO6z7HWOlnR7k/edit" },
  { match: "auld spot", url: "https://docs.google.com/spreadsheets/d/1BXK_SxiogGbFSfz1jX1uekyUG9n02huEDXmbmNCX51I/edit" },
  { match: "spot pub", url: "https://docs.google.com/spreadsheets/d/1BXK_SxiogGbFSfz1jX1uekyUG9n02huEDXmbmNCX51I/edit" },
  { match: "sher-e", url: "https://docs.google.com/spreadsheets/d/1BsiHTPaSnFhXZPwI_5YnLK32rdJhFOi6EWdCeujnPIo/edit" },
  { match: "punjab", url: "https://docs.google.com/spreadsheets/d/1BsiHTPaSnFhXZPwI_5YnLK32rdJhFOi6EWdCeujnPIo/edit" },
];

export async function seedPayrollHistoryLinks(): Promise<{ set: number }> {
  const db = getDb();
  let set = 0;
  for (const s of SHEETS) {
    try {
      const rows = (await db.select().from(clients).where(
        or(like(clients.name, `%${s.match}%`), like(clients.company, `%${s.match}%`)),
      )) as any[];
      for (const c of rows) {
        if (c.payrollHistoryUrl) continue;        // never overwrite a set link
        await db.update(clients).set({ payrollHistoryUrl: s.url, updatedAt: new Date() }).where(eq(clients.id, c.id));
        set++;
      }
    } catch (e) { console.error("[payroll-history] seed failed for", s.match, ":", e instanceof Error ? e.message : e); }
  }
  return { set };
}
