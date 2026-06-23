/**
 * PDF SPLITTER — detect document boundaries + names in a scanned batch.
 * =============================================================================
 * Markie scans a STACK of documents into one big PDF (bank statements, invoices,
 * asset docs, receipts…). This asks Claude (which reads PDFs natively) to find
 * where each document starts/ends and propose a clean filename + type + date.
 *
 * Server only plans (cheap, JSON). The actual page-splitting + zipping happens in
 * the browser with pdf-lib/jszip, so big binaries never round-trip through here.
 *
 * Defensive: needs ANTHROPIC_API_KEY; returns {ok:false,error} (never throws raw).
 * Model via FIGGY_PDF_SPLIT_MODEL (default claude-haiku-4-5). Human reviews/edits
 * the plan before anything is split.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";

export type SplitDoc = { startPage: number; endPage: number; type: string; folder: string; name: string; date: string };

const SYSTEM = [
  "You split a SCANNED BATCH PDF (many separate documents stacked into one file) into its individual documents. We KEEP the original scanned pages — never flatten to text.",
  "Return ONLY valid JSON, no prose, no code fences, EXACTLY:",
  `{"documents":[{"startPage":1,"endPage":2,"type":"<short doc type>","folder":"Assets|Donations|","date":"YYYY-MM-DD or empty","name":"<clean filename, no extension>"}]}`,
  "Rules:",
  "- Pages are 1-indexed. Ranges are inclusive and must cover the document fully; a document can be 1 or many pages.",
  "- Documents must NOT overlap and should be in page order. Together they cover the whole file (don't drop pages).",
  "- READ each document and identify WHAT IT IS — e.g. bank statement, credit card statement, invoice, receipt, purchase/loan agreement, donation receipt, tax slip (T4/T5/etc.), tax return, cheque, remittance, contract, other. Put a short lowercase label in `type`.",
  "- date: the document's own key date (statement period END, invoice/receipt date, slip tax year) as YYYY-MM-DD; empty if none.",
  "- NAME each document clearly and consistently from what you actually read — file-safe, no slashes or special characters. General pattern: \"<YYYY-MM-DD> - <party/institution> - <what it is>\". Examples by type:",
  "  * bank statement → \"2026-05-31 - RBC - Chequing Statement\"",
  "  * credit card statement → \"2026-05-20 - Visa - Credit Card Statement\"",
  "  * invoice → \"2026-04-12 - Home Depot - Invoice 10453\"",
  "  * receipt → \"2026-04-12 - Esso - Receipt $84.20\"",
  "  * tax slip → \"2025 - T4 - <employer>\"",
  "  * purchase/loan or asset agreement → \"<loan/acct # if shown> - <asset name>\" e.g. \"2152 - Ford F-450\" (no acct # → just the asset name); set folder = \"Assets\".",
  "  * donation receipt → \"2025-10-03 - Delia Social Cultural Centre - Donation $1000\"; set folder = \"Donations\".",
  "  * anything else → \"<YYYY-MM-DD> - <party or short description> - <document type>\".",
  "- folder: set \"Assets\" ONLY for asset/loan agreements and \"Donations\" ONLY for donation receipts; otherwise \"\".",
  "- Extract real numbers from the text when present (loan/account #, invoice #, dollar amounts).",
].join("\n");

function extractJson(text: string): any | null {
  if (!text) return null;
  const fenced = text.replace(/```json\s*|\s*```/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

export const pdfSplitterRouter = createRouter({
  plan: staffQuery
    .input(z.object({
      base64: z.string().min(1),
      fileName: z.string().optional(),
      pageCount: z.number().min(1).max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return { ok: false as const, error: "PDF splitting needs ANTHROPIC_API_KEY set on the server." };
      if (input.base64.length > 28_000_000) return { ok: false as const, error: "PDF too large (over ~20MB). Scan in smaller batches." };
      if ((input.pageCount ?? 0) > 100) return { ok: false as const, error: "Over 100 pages — scan in smaller batches (AI reads up to 100 pages at once)." };
      const model = process.env.FIGGY_PDF_SPLIT_MODEL || "claude-haiku-4-5";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120_000);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: SYSTEM,
            messages: [{
              role: "user",
              content: [
                { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 } },
                { type: "text", text: `This file has ${input.pageCount ?? "an unknown number of"} pages. Identify each separate document and return the JSON.` },
              ],
            }],
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return { ok: false as const, error: `Claude PDF read failed (${res.status}). ${body.slice(0, 200)}` };
        }
        const data: any = await res.json();
        const text: string = (data?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("\n");
        const parsed = extractJson(text);
        if (!parsed || !Array.isArray(parsed.documents)) {
          return { ok: false as const, error: "Couldn't detect document boundaries. Try a clearer scan." };
        }
        const docs: SplitDoc[] = parsed.documents
          .map((d: any) => ({
            startPage: Math.max(1, parseInt(String(d?.startPage)) || 1),
            endPage: Math.max(1, parseInt(String(d?.endPage)) || 1),
            type: String(d?.type ?? "other").trim() || "other",
            folder: String(d?.folder ?? "").trim().replace(/[\\/:*?"<>|]+/g, ""),
            date: String(d?.date ?? "").trim(),
            name: String(d?.name ?? "").trim() || "Document",
          }))
          .filter((d: SplitDoc) => d.endPage >= d.startPage)
          .sort((a: SplitDoc, b: SplitDoc) => a.startPage - b.startPage);
        return { ok: true as const, documents: docs };
      } catch (e) {
        const msg = e instanceof Error && e.name === "AbortError" ? "Timed out reading the PDF (120s). Scan a smaller batch." : (e instanceof Error ? e.message : String(e));
        return { ok: false as const, error: msg };
      } finally {
        clearTimeout(timer);
      }
    }),
});
