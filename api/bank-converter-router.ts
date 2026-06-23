/**
 * BANK STATEMENT PDF → TRANSACTIONS (Claude-powered extraction)
 * =============================================================================
 * Bank statement PDFs have wildly different layouts per bank, so instead of a
 * brittle per-bank text parser we hand the PDF straight to Claude (which reads
 * PDFs natively) and ask for a clean, normalized transaction list. The client
 * then runs those through the SAME QBO CSV export pipeline as a CSV upload.
 *
 * Output convention (matches the QBO bank-feed CSV): one SIGNED amount per row —
 * NEGATIVE = money out (withdrawal/debit), POSITIVE = money in (deposit/credit).
 *
 * Defensive: needs ANTHROPIC_API_KEY; returns a clear error (never throws raw) so
 * the UI can tell Markie exactly what to do. Raw REST (no SDK dependency), mirror
 * of qbo-vendor-web-classify.ts. Model via FIGGY_BANK_PDF_MODEL (default
 * claude-haiku-4-5). A human reviews the parsed rows in the UI before exporting.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";

export type ExtractedTxn = { date: string; description: string; amount: number };

const SYSTEM = [
  "You extract transactions from a bank or credit-card statement PDF for bookkeeping import.",
  "Return ONLY valid JSON, no prose, no code fences, in EXACTLY this shape:",
  `{"bank":"<bank name or empty>","account":"<masked acct # or empty>","transactions":[{"date":"YYYY-MM-DD","description":"<payee/description>","amount":<number>}]}`,
  "Rules:",
  "- One row per posted transaction, in statement order.",
  "- amount is a SINGLE SIGNED number: NEGATIVE for money OUT (withdrawals, debits, purchases, fees, payments made); POSITIVE for money IN (deposits, credits, refunds).",
  "- For a credit-card statement, purchases are NEGATIVE and payments/credits are POSITIVE.",
  "- date is the transaction (not posted) date when both exist, ISO YYYY-MM-DD. Infer the year from the statement period if a row omits it.",
  "- Do NOT include opening/closing balance lines, running balances, subtotals, interest-summary boxes, or marketing text — only real transactions.",
  "- Strip currency symbols and thousands separators from amount.",
  "- If you cannot read it, return an empty transactions array.",
].join("\n");

function extractJson(text: string): any | null {
  if (!text) return null;
  // Tolerate code fences / surrounding prose by grabbing the outermost JSON object.
  const fenced = text.replace(/```json\s*|\s*```/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

export const bankConverterRouter = createRouter({
  parsePdf: staffQuery
    .input(z.object({
      base64: z.string().min(1),        // raw base64 (no data: prefix)
      fileName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return { ok: false as const, error: "PDF parsing needs ANTHROPIC_API_KEY set on the server. (CSV/QFX/OFX uploads work without it.)" };
      }
      // ~8MB base64 ≈ 6MB PDF — bank statements are far smaller; guard runaway input.
      if (input.base64.length > 8_000_000) {
        return { ok: false as const, error: "PDF too large (over ~6MB). Split it or export a shorter date range." };
      }
      const model = process.env.FIGGY_BANK_PDF_MODEL || "claude-haiku-4-5";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90_000); // statements can be multi-page
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model,
            max_tokens: 8192,
            system: SYSTEM,
            messages: [{
              role: "user",
              content: [
                { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 } },
                { type: "text", text: "Extract every transaction from this statement as the JSON described. JSON only." },
              ],
            }],
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return { ok: false as const, error: `Claude PDF read failed (${res.status}). ${body.slice(0, 200)}` };
        }
        const data: any = await res.json();
        const text: string = (data?.content ?? [])
          .filter((b: any) => b?.type === "text")
          .map((b: any) => String(b.text ?? ""))
          .join("\n");
        const parsed = extractJson(text);
        if (!parsed || !Array.isArray(parsed.transactions)) {
          return { ok: false as const, error: "Couldn't read transactions from that PDF. Try a clearer copy, or export CSV from online banking." };
        }
        const txns: ExtractedTxn[] = parsed.transactions
          .map((t: any) => ({
            date: String(t?.date ?? "").trim(),
            description: String(t?.description ?? "").trim(),
            amount: typeof t?.amount === "number" ? t.amount : parseFloat(String(t?.amount ?? "").replace(/[$,\s]/g, "")),
          }))
          .filter((t: ExtractedTxn) => t.date && Number.isFinite(t.amount));
        return {
          ok: true as const,
          bank: String(parsed.bank ?? "").trim() || "PDF Statement",
          account: String(parsed.account ?? "").trim(),
          transactions: txns,
        };
      } catch (e) {
        const msg = e instanceof Error && e.name === "AbortError" ? "Timed out reading the PDF (90s). Try a shorter statement." : (e instanceof Error ? e.message : String(e));
        return { ok: false as const, error: msg };
      } finally {
        clearTimeout(timer);
      }
    }),
});
