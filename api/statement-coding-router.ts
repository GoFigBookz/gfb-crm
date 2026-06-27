/**
 * STATEMENT CODING — drop a bank/credit-card CSV → Fig codes every spend row
 * (Markie 2026-06-27: "my biggest time-sink is posting transactions + reconciling
 * from Hubdoc, bank feeds, credit-card statements").
 * =============================================================================
 * Purpose:  Turn a raw statement export into a coded review queue. Each money-out
 *           row is run through the vendor brain (suggestForClient) to propose an
 *           account + tax code + traffic-light, so Markie reviews a coded list
 *           instead of coding every line by hand. Confirmed vendor RULES make
 *           recurring vendors (Bell, hydro, rent) land green automatically.
 * Inputs:   clientId, raw CSV text (Date + Amount, or Debit/Credit columns).
 * Outputs:  coded rows { date, description, amount, account, tax, triage,
 *           confidence, rationale } + a summary (greens auto-postable, count).
 * Dependencies: parseCsvTransactions (recon-match-core — same parser the recon
 *           matcher uses), suggestForClient (qbo-vendor-brain), getConnectionForClient.
 * Config:   none. Caps at 500 rows/run; dedupes by normalized payee so the brain
 *           hits QBO once per distinct vendor (cheap on a big statement).
 * Errors:   read-only; per-row failures degrade to an uncoded "review" row, never
 *           throw the batch. No connection → ok:false with the reason.
 * Limitations: READ-ONLY. Suggests coding; nothing posts to QBO (golden rule —
 *           Markie's review gate). Inflows (deposits/credits) are listed but not
 *           coded as expenses. Posting path lands once QBO write is on.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { parseCsvTransactions } from "./recon-match-core";
import { suggestForClient, getConnectionForClient } from "./qbo-vendor-brain";

/** Normalize a statement description to a vendor key: strip card-noise, store #s,
 *  dates, long digit runs, and reference codes so "TIM HORTONS #4821 OWEN SOUND"
 *  and "TIM HORTONS #318 BARRIE" both resolve to one vendor lookup. */
function vendorKey(desc: string): string {
  return (desc || "")
    .toUpperCase()
    .replace(/\b(POS|PURCHASE|PAYMENT|DEBIT|VISA|MASTERCARD|MC|WWW|HTTP\S*)\b/g, " ")
    .replace(/#\s*\d+/g, " ")
    .replace(/\b\d{2}[/-]\d{2}([/-]\d{2,4})?\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/[^A-Z& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ").slice(0, 4).join(" "); // first few significant words = the payee
}

export const statementCodingRouter = createRouter({
  /**
   * Parse a pasted statement CSV and code each spend row via the vendor brain.
   * Read-only; nothing posts. Returns coded rows + a roll-up summary.
   */
  code: staffQuery
    .input(z.object({
      clientId: z.number(),
      csvText: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const cr = await getConnectionForClient(input.clientId);
      if ("error" in cr) return { ok: false as const, error: cr.error };

      const txns = parseCsvTransactions(input.csvText);
      if (!txns.length) {
        return { ok: false as const, error: "no_rows", message: "Couldn't read any transactions. Paste CSV with a Date column and an Amount (or Debit/Credit) column." };
      }

      // Money-out = expenses to code (amount < 0). Inflows are listed, not coded.
      const MAX = 500;
      const rows = txns.slice(0, MAX);
      const truncated = txns.length > MAX;

      // Dedupe vendor lookups: one brain call per distinct payee key.
      const cache = new Map<string, any>();
      const distinctOut = new Set<string>();
      for (const t of rows) if (t.amount < 0) distinctOut.add(vendorKey(t.description));

      for (const key of distinctOut) {
        if (!key) { cache.set(key, null); continue; }
        try {
          const r = await suggestForClient(input.clientId, { vendorName: key });
          cache.set(key, r.ok ? r : null);
        } catch {
          cache.set(key, null);
        }
      }

      const coded = rows.map((t) => {
        const inflow = t.amount > 0;
        const key = vendorKey(t.description);
        const r = inflow ? null : cache.get(key);
        const c: any = r && r.ok ? (r.coding ?? {}) : {};
        const triage: "green" | "yellow" | "red" | "inflow" =
          inflow ? "inflow" : (c.triage ?? "red");
        return {
          date: t.date,
          description: t.description,
          amount: t.amount,                       // signed: − out, + in
          spend: !inflow,
          vendorKey: key,
          vendorMatched: r && r.ok ? (r.resolution?.displayName ?? null) : null,
          accountId: c.suggestedAccountId ?? null,
          accountName: c.suggestedAccountName ?? null,
          taxCode: c.suggestedTaxCode ?? null,
          confidence: typeof c.confidence === "number" ? c.confidence : null,
          triage,
          rationale: c.rationale ?? (inflow ? "Money in — not coded as an expense." : "No history for this vendor — needs review."),
        };
      });

      const spendRows = coded.filter((c) => c.spend);
      const greens = spendRows.filter((c) => c.triage === "green");
      const summary = {
        total: coded.length,
        spend: spendRows.length,
        inflow: coded.length - spendRows.length,
        green: greens.length,
        yellow: spendRows.filter((c) => c.triage === "yellow").length,
        red: spendRows.filter((c) => c.triage === "red").length,
        spendTotal: Math.round(spendRows.reduce((s, c) => s + Math.abs(c.amount), 0) * 100) / 100,
        autoCodableTotal: Math.round(greens.reduce((s, c) => s + Math.abs(c.amount), 0) * 100) / 100,
        truncated,
      };

      return { ok: true as const, rows: coded, summary };
    }),
});
