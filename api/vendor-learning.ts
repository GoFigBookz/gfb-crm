/**
 * FIGGY JR — LEARNING LOOP (approve teaches the brain)
 * =============================================================================
 * When Markie APPROVES a Triage card, that's a human signal about how this
 * vendor should be coded. We persist it as a CONFIRMED `vendorMemory` rule so
 * Figgy codes the same vendor correctly next time — the core of "an AI that
 * learns & grows per client."
 *
 * GOLDEN RULES (enforced here):
 *  - We only ever store a REAL account that was already on the card (Figgy's
 *    history-backed suggestion, or an explicit human override) — never invent.
 *  - Per-client isolation: the rule is keyed by (connectionId, qboVendorId) and
 *    we REFUSE to write unless the connection is active AND belongs to the
 *    finding's client. A Clark OS approval can never write a Clark CW rule.
 *  - Best-effort: a learning failure NEVER blocks the approve.
 *
 * Dependency note: a rule needs the QBO `vendorId` + `connectionId`, which the
 * brain stamps into the finding's `sourceData` during enrichment. Cards that
 * were never enriched (no live QBO identity yet) are skipped silently — they
 * simply don't teach until they've been run through the brain.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { vendorMemory, triageFindings, qboConnections } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";

/** Add the confirmed-rule columns to vendor_memory on the live DB (libsql ALTER
 *  is nullable-only, so we PRAGMA-check then add — mirrors bridge-bootstrap). */
export async function ensureVendorMemoryColumns(): Promise<void> {
  const db = getDb();
  // CREATE the table if missing — a live DB that predates vendor memory has no
  // vendor_memory table at all, so the brain's coding memory never persisted
  // between sessions. (The ALTERs below only add NEWER columns to an existing table.)
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS vendor_memory (
      id integer PRIMARY KEY AUTOINCREMENT,
      connectionId integer NOT NULL,
      clientId integer,
      qboVendorId text NOT NULL,
      vendorName text,
      preferredAccountId text,
      preferredAccountName text,
      preferredTaxCode text,
      sampleCount integer DEFAULT 0,
      confirmedByHuman integer DEFAULT 0,
      confirmedAt integer,
      lastValidatedAt integer,
      createdAt integer,
      updatedAt integer
    )`);
  } catch (e) { console.error("[learn] create vendor_memory failed:", e instanceof Error ? e.message : e); }
  const have = new Set<string>();
  try {
    const res: any = await db.run(sql`PRAGMA table_info(vendor_memory)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
  } catch (e) { console.error("[learn] table_info(vendor_memory) failed:", e instanceof Error ? e.message : e); }
  const adds: Array<[string, any]> = [
    ["confirmedByHuman", sql`ALTER TABLE vendor_memory ADD COLUMN "confirmedByHuman" integer DEFAULT 0`],
    ["confirmedAt", sql`ALTER TABLE vendor_memory ADD COLUMN "confirmedAt" integer`],
  ];
  for (const [col, stmt] of adds) {
    if (have.has(col)) continue;
    try { await db.run(stmt); console.log("[learn] added vendor_memory column:", col); }
    catch (e) { console.error("[learn] add column", col, "failed:", e instanceof Error ? e.message : e); }
  }
}

export type LearnResult = { learned: number; skipped: number };

/**
 * Persist a confirmed coding rule for each approved finding that carries a real
 * account + the QBO vendor identity. Isolation-guarded and fully defensive.
 */
export async function learnFromApprovals(ids: number[]): Promise<LearnResult> {
  const db = getDb();
  let learned = 0, skipped = 0;
  for (const id of ids) {
    try {
      const row = (await db.select().from(triageFindings).where(eq(triageFindings.id, id)).limit(1))[0];
      if (!row) { skipped++; continue; }
      let meta: any = {};
      try { meta = JSON.parse(row.sourceData || "{}"); } catch { meta = {}; }
      if (!meta || typeof meta !== "object") { skipped++; continue; }

      // Confirmed account: an explicit human override wins, else Figgy's suggestion.
      const accountId = meta.confirmedAccountId ?? meta.suggestedAccountId ?? null;
      const accountName = meta.confirmedAccountName ?? meta.suggestedAccount ?? null;
      const taxCode = meta.confirmedTaxCode ?? meta.suggestedTaxCode ?? null;
      const vendorId = meta.vendorId != null ? String(meta.vendorId) : null;
      const connectionId = meta.connectionId != null ? Number(meta.connectionId) : null;
      if (!accountId || !vendorId || !connectionId) { skipped++; continue; }

      // Isolation guard: connection must be active AND belong to this client.
      const conn = (await db.select().from(qboConnections).where(eq(qboConnections.id, connectionId)).limit(1))[0];
      if (!conn || !conn.isActive) { skipped++; continue; }
      if (row.clientId && conn.clientId && row.clientId !== conn.clientId) { skipped++; continue; }

      const existing = (await db.select().from(vendorMemory)
        .where(and(eq(vendorMemory.connectionId, connectionId), eq(vendorMemory.qboVendorId, vendorId))).limit(1))[0];
      const patch = {
        connectionId, clientId: row.clientId ?? conn.clientId ?? null, qboVendorId: vendorId,
        vendorName: meta.vendor != null ? String(meta.vendor) : (existing?.vendorName ?? null),
        preferredAccountId: String(accountId),
        preferredAccountName: accountName != null ? String(accountName) : null,
        preferredTaxCode: taxCode != null ? String(taxCode) : null,
        confirmedByHuman: true, confirmedAt: new Date(), lastValidatedAt: new Date(), updatedAt: new Date(),
      };
      if (existing) await db.update(vendorMemory).set(patch).where(eq(vendorMemory.id, existing.id));
      else await db.insert(vendorMemory).values(patch);
      learned++;
    } catch { skipped++; }
  }
  return { learned, skipped };
}
