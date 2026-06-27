/**
 * VENDOR RULES — lock a vendor's default account/tax so recurring expenses auto-code
 * (Markie 2026-06-27: "Bell Canada is a utility → it should have a rule, stop wasting
 * time re-posting the same account").
 * =============================================================================
 * A confirmed rule lives in `vendorMemory` (confirmedByHuman=true) keyed by
 * (connectionId, qboVendorId). The vendor brain already PREFERS a confirmed rule over
 * history-derived coding and never overwrites it — so locking a rule here makes that
 * vendor code green/automatically on every future post. SAFE: writes only Figgy's
 * memory, never the client's books. Read-only QBO pulls for the vendor + account lists.
 * Per-client isolation via getConnectionForClient (one realm per connection).
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { vendorMemory } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getConnectionForClient, suggestForClient } from "./qbo-vendor-brain";
import { qboRequest } from "./qbo-router";

const arr = (data: any, entity: string): any[] => (data?.QueryResponse?.[entity] ?? []) as any[];

export const vendorRulesRouter = createRouter({
  /** The locked rules for a client (confirmed vendorMemory entries). */
  list: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const cr = await getConnectionForClient(input.clientId);
      const connId = "conn" in cr ? (cr.conn as any).id : null;
      const rows = connId != null
        ? await db.select().from(vendorMemory).where(eq(vendorMemory.connectionId, connId)).orderBy(desc(vendorMemory.confirmedByHuman), desc(vendorMemory.updatedAt))
        : await db.select().from(vendorMemory).where(eq(vendorMemory.clientId, input.clientId)).orderBy(desc(vendorMemory.updatedAt));
      return rows.map((r: any) => ({
        id: r.id, qboVendorId: r.qboVendorId, vendorName: r.vendorName,
        accountId: r.preferredAccountId, accountName: r.preferredAccountName, taxCode: r.preferredTaxCode,
        sampleCount: r.sampleCount, confirmed: !!r.confirmedByHuman,
      }));
    }),

  /** Read-only pick-lists for building a rule: the client's QBO vendors + accounts + tax codes. */
  options: staffQuery
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ input }) => {
      const cr = await getConnectionForClient(input.clientId);
      if ("error" in cr) return { ok: false as const, error: cr.error };
      try {
        const conn = cr.conn;
        const q = (s: string) => qboRequest(conn, `/query?query=${encodeURIComponent(s)}`);
        const vendors = arr(await q("SELECT Id, DisplayName FROM Vendor WHERE Active = true ORDER BY DisplayName MAXRESULTS 1000"), "Vendor")
          .map((v: any) => ({ id: String(v.Id), name: v.DisplayName })).sort((a, b) => a.name.localeCompare(b.name));
        const accounts = arr(await q("SELECT Id, Name, AccountType FROM Account WHERE Active = true MAXRESULTS 1000"), "Account")
          .filter((a: any) => /expense|cost of goods/i.test(a.AccountType || ""))
          .map((a: any) => ({ id: String(a.Id), name: a.Name, type: a.AccountType })).sort((a, b) => a.name.localeCompare(b.name));
        const taxCodes = arr(await q("SELECT Id, Name FROM TaxCode MAXRESULTS 1000"), "TaxCode")
          .map((t: any) => ({ id: String(t.Id), name: t.Name }));
        return { ok: true as const, vendors, accounts, taxCodes };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/async ack|non-JSON|Make bridge/i.test(msg)) return { ok: false as const, error: "bridge_not_returning_data" };
        return { ok: false as const, error: msg };
      }
    }),

  /**
   * Suggest rules from history: scan the client's vendors, run the brain on each,
   * and return the ones whose history is CONSISTENT (green) and don't already have a
   * confirmed rule — so Markie locks the obvious recurring vendors (Bell, hydro, rent)
   * in bulk instead of building each by hand. Deliberate scan: uses live QBO calls,
   * so it's capped (default 40 vendors, most-recent-first by QBO order) and labelled.
   */
  suggestRules: staffQuery
    .input(z.object({ clientId: z.number(), limit: z.number().min(1).max(100).optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const cr = await getConnectionForClient(input.clientId);
      if ("error" in cr) return { ok: false as const, error: cr.error };
      const conn = cr.conn as any;
      const cap = input.limit ?? 40;
      let vendors: Array<{ id: string; name: string }>;
      try {
        const data = await qboRequest(conn, `/query?query=${encodeURIComponent("SELECT Id, DisplayName FROM Vendor WHERE Active = true ORDER BY DisplayName MAXRESULTS 1000")}`);
        vendors = arr(data, "Vendor").map((v: any) => ({ id: String(v.Id), name: v.DisplayName }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/async ack|non-JSON|Make bridge/i.test(msg)) return { ok: false as const, error: "bridge_not_returning_data" };
        return { ok: false as const, error: msg };
      }

      // Skip vendors that already have a confirmed rule.
      const ruled = new Set(
        (await db.select().from(vendorMemory).where(and(eq(vendorMemory.connectionId, conn.id), eq(vendorMemory.confirmedByHuman, true))))
          .map((r: any) => String(r.qboVendorId)),
      );
      const todo = vendors.filter((v) => !ruled.has(v.id)).slice(0, cap);

      const suggestions: any[] = [];
      let scanned = 0, errors = 0;
      for (const v of todo) {
        scanned++;
        try {
          const r = await suggestForClient(input.clientId, { vendorName: v.name });
          if (!r.ok) { errors++; continue; }
          const c: any = r.coding ?? {};
          // Only the clean, repeating vendors become silent rules (green + has an account).
          if (c.triage === "green" && c.suggestedAccountId) {
            suggestions.push({
              qboVendorId: r.resolution?.vendorId ?? v.id,
              vendorName: r.resolution?.displayName ?? v.name,
              accountId: c.suggestedAccountId,
              accountName: c.suggestedAccountName ?? null,
              taxCode: c.suggestedTaxCode ?? null,
              confidence: typeof c.confidence === "number" ? c.confidence : null,
              sampleCount: c.sampleCount ?? null,
              rationale: c.rationale ?? null,
            });
          }
        } catch { errors++; }
      }
      return {
        ok: true as const,
        suggestions,
        meta: { totalVendors: vendors.length, alreadyRuled: ruled.size, scanned, errors, capped: vendors.length - ruled.size > cap },
      };
    }),

  /** Lock a rule: this vendor always codes to this account/tax (confirmed → wins over history). */
  setRule: staffQuery
    .input(z.object({
      clientId: z.number(),
      qboVendorId: z.string(),
      vendorName: z.string(),
      accountId: z.string(),
      accountName: z.string(),
      taxCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const cr = await getConnectionForClient(input.clientId);
      if ("error" in cr) return { ok: false as const, error: cr.error };
      const connId = (cr.conn as any).id;
      const now = new Date();
      const patch: any = {
        connectionId: connId, clientId: input.clientId, qboVendorId: input.qboVendorId, vendorName: input.vendorName,
        preferredAccountId: input.accountId, preferredAccountName: input.accountName, preferredTaxCode: input.taxCode ?? null,
        confirmedByHuman: true, confirmedAt: now, updatedAt: now,
      };
      const existing = (await db.select().from(vendorMemory).where(and(eq(vendorMemory.connectionId, connId), eq(vendorMemory.qboVendorId, input.qboVendorId))).limit(1))[0];
      if (existing) await db.update(vendorMemory).set(patch).where(eq(vendorMemory.id, (existing as any).id));
      else await db.insert(vendorMemory).values(patch);
      return { ok: true as const };
    }),

  /** Remove a rule (vendor goes back to history-derived / review coding). */
  removeRule: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(vendorMemory).where(eq(vendorMemory.id, input.id));
      return { ok: true as const };
    }),
});
