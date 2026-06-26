/**
 * LOCAL PDF TEXT EXTRACTION — runs entirely in the browser via pdf.js. FREE, no
 * server, no API, no credits. Reconstructs each PDF page into visual text rows
 * (group by Y, sort by X) so the pure bank-statement parser (api/pdf-statement-core)
 * can turn them into transactions. This is how Figgy reads a PDF bank statement
 * without spending anything — the firm-critical PDF→CSV→QBO path.
 */
import * as pdfjsLib from "pdfjs-dist";
// Self-hosted worker (no CDN) so it works offline and costs nothing.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** Extract a PDF into visual text lines (one string per row). */
export async function extractPdfLines(file: File): Promise<string[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows: { y: number; items: { x: number; str: string }[] }[] = [];
    for (const it of content.items as any[]) {
      const str = typeof it?.str === "string" ? it.str : "";
      if (!str.trim()) continue;
      const x = it.transform?.[4] ?? 0;
      const y = it.transform?.[5] ?? 0;
      let row = rows.find((r) => Math.abs(r.y - y) <= 2.5); // same visual line
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, str });
    }
    rows.sort((a, b) => b.y - a.y); // top → bottom (PDF y grows upward)
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      const line = r.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    }
  }
  return lines;
}
