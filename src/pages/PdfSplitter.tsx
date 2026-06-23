import { useState, useCallback } from "react";
import { Upload, FileText, Download, Trash2, Scissors, AlertCircle, Plus, FileStack } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

type Doc = { startPage: number; endPage: number; type: string; date: string; name: string };

/** Filesystem-safe filename (no path separators / illegal chars). */
function safeName(s: string): string {
  return (s || "Document").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Document";
}

function abToBase64(buf: ArrayBuffer | Uint8Array): string {
  let binary = "";
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

// Keep each chunk sent to the AI under the API limit (well below 32MB) and ≤100 pages.
const MAX_CHUNK_BYTES = 18 * 1024 * 1024;
const MAX_CHUNK_PAGES = 100;

export default function PdfSplitter() {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");
  const plan = trpc.pdfSplitter.plan.useMutation();

  const reset = () => { setFile(null); setBuffer(null); setPageCount(0); setDocs(null); setError(null); setProgress(""); };

  const processFile = useCallback(async (f: File) => {
    setError(null); setDocs(null); setProgress("");
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { setError("Please upload a PDF file."); return; }
    setWorking(true);
    try {
      const buf = await f.arrayBuffer();
      const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
      const total = pdf.getPageCount();
      setFile(f); setBuffer(buf); setPageCount(total);

      // Decide chunking: keep each AI read under the size + page limits. A big 80MB+
      // scan is read in several chunks AUTOMATICALLY (in parallel) and merged — the
      // user just uploads the one file.
      const bytesPerPage = Math.max(1, f.size / total);
      const chunkPages = Math.max(1, Math.min(MAX_CHUNK_PAGES, Math.floor(MAX_CHUNK_BYTES / bytesPerPage)));
      const chunks: { start: number; end: number }[] = [];
      for (let s = 1; s <= total; s += chunkPages) chunks.push({ start: s, end: Math.min(total, s + chunkPages - 1) });

      // Build each chunk's base64 (whole file if it fits in one).
      const buildChunkB64 = async (c: { start: number; end: number }): Promise<string> => {
        if (chunks.length === 1) return abToBase64(buf);
        const sub = await PDFDocument.create();
        const idx: number[] = [];
        for (let p = c.start; p <= c.end; p++) idx.push(p - 1);
        const copied = await sub.copyPages(pdf, idx);
        copied.forEach((pg) => sub.addPage(pg));
        return abToBase64(await sub.save());
      };

      let done = 0;
      const note = () => setProgress(chunks.length > 1 ? `Reading ${total} pages in ${chunks.length} parts — ${done}/${chunks.length} done…` : "Reading your scan…");
      note();

      // Process chunks with limited concurrency (fast, but kind to API rate limits).
      const CONCURRENCY = 4;
      const results: { offset: number; docs: Doc[] }[] = new Array(chunks.length);
      let next = 0;
      const worker = async () => {
        while (next < chunks.length) {
          const i = next++;
          const c = chunks[i];
          const b64 = await buildChunkB64(c);
          const r = await plan.mutateAsync({ base64: b64, fileName: f.name, pageCount: c.end - c.start + 1 });
          if (!r.ok) throw new Error(r.error);
          results[i] = { offset: c.start - 1, docs: r.documents as Doc[] };
          done++; note();
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));

      // Merge: shift each chunk's page numbers by its offset, keep in order.
      const merged: Doc[] = [];
      results.forEach((res) => res.docs.forEach((d) => merged.push({
        ...d,
        startPage: Math.min(Math.max(1, d.startPage + res.offset), total),
        endPage: Math.min(Math.max(1, d.endPage + res.offset), total),
      })));
      merged.sort((a, b) => a.startPage - b.startPage);
      if (!merged.length) { setError("No documents detected. Try a clearer scan."); return; }
      setDocs(merged);
    } catch (e: any) {
      setError(e?.message || "Could not read that PDF.");
    } finally {
      setWorking(false);
      setProgress("");
    }
  }, [plan]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0]; if (f) processFile(f);
  }, [processFile]);

  const setDoc = (i: number, patch: Partial<Doc>) => setDocs((d) => d ? d.map((x, j) => j === i ? { ...x, ...patch } : x) : d);
  const removeDoc = (i: number) => setDocs((d) => d ? d.filter((_, j) => j !== i) : d);
  const addDoc = () => setDocs((d) => [...(d || []), { startPage: 1, endPage: 1, type: "other", date: "", name: "Document" }]);

  const splitAndDownload = async () => {
    if (!buffer || !docs) return;
    setSplitting(true);
    try {
      const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const total = src.getPageCount();
      const zip = new JSZip();
      const used = new Set<string>();
      for (const d of docs) {
        const start = Math.min(Math.max(1, d.startPage), total);
        const end = Math.min(Math.max(start, d.endPage), total);
        const indices: number[] = [];
        for (let p = start; p <= end; p++) indices.push(p - 1);
        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, indices);
        copied.forEach((pg) => out.addPage(pg));
        const bytes = await out.save();
        let fname = safeName(d.name);
        let n = fname; let k = 2;
        while (used.has(n.toLowerCase())) { n = `${fname} (${k++})`; }
        used.add(n.toLowerCase());
        zip.file(`${n}.pdf`, bytes);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(file?.name || "scan").replace(/\.pdf$/i, "")}_split.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "Split failed.");
    } finally {
      setSplitting(false);
    }
  };

  // Coverage check — warn if the ranges miss or overlap pages.
  const covered = new Set<number>();
  let overlap = false;
  (docs || []).forEach((d) => {
    for (let p = d.startPage; p <= d.endPage; p++) { if (covered.has(p)) overlap = true; covered.add(p); }
  });
  const missing = pageCount > 0 ? Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => !covered.has(p)) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileStack className="h-6 w-6 text-lime-500" /> PDF Splitter
        </h1>
        <p className="text-slate-500">Scan a stack of documents into one PDF — Figgy finds each document, names it, and gives you clean separate files.</p>
      </div>

      {!docs && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={cn("border-2 border-dashed rounded-xl p-12 text-center transition-all",
            working ? "border-lime-400 bg-lime-50/60" : isDragging ? "border-lime-500 bg-lime-50" : "border-slate-300 bg-slate-50")}
        >
          {working ? (
            <>
              <div className="h-12 w-12 mx-auto mb-4 rounded-full border-4 border-lime-200 border-t-lime-500 animate-spin" />
              <p className="text-lg font-medium text-slate-700 mb-2">{progress || "Reading your scan…"}</p>
              <p className="text-sm text-slate-500">Figgy is finding where each document starts and ends. Large scans are read in parts automatically — this can take a couple of minutes.</p>
            </>
          ) : (
            <>
              <Upload className={cn("h-12 w-12 mx-auto mb-4", isDragging ? "text-lime-500" : "text-slate-400")} />
              <p className="text-lg font-medium text-slate-700 mb-2">{isDragging ? "Drop your scanned PDF here" : "Drag & drop your scanned PDF"}</p>
              <p className="text-sm text-slate-500 mb-4">One PDF containing several documents (statements, invoices, receipts, asset docs…). Any size — big scans are read in parts automatically.</p>
              <input type="file" accept=".pdf" className="hidden" id="split-file"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
              <Button variant="outline" onClick={() => document.getElementById("split-file")?.click()}>
                <FileText className="h-4 w-4 mr-2" /> Browse Files
              </Button>
            </>
          )}
          {error && (
            <div className="mt-5 mx-auto max-w-lg flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {docs && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2"><Scissors className="h-5 w-5 text-lime-500" /> {docs.length} documents found</CardTitle>
              <CardDescription>
                {file?.name} · {pageCount} pages. Review the names and page ranges, then split. Each becomes its own PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(overlap || missing.length > 0) && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    {overlap && "Some page ranges overlap. "}
                    {missing.length > 0 && `Pages not included in any document: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? "…" : ""}. `}
                    Adjust the ranges below if needed.
                  </span>
                </div>
              )}
              {docs.map((d, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 p-2 rounded-lg border hover:bg-slate-50">
                  <Badge variant="outline" className="text-xs capitalize">{d.type}</Badge>
                  <Input value={d.name} onChange={(e) => setDoc(i, { name: e.target.value })} className="h-8 flex-1 min-w-[220px]" placeholder="File name" />
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    pages
                    <Input type="number" min={1} max={pageCount} value={d.startPage} onChange={(e) => setDoc(i, { startPage: Number(e.target.value) })} className="h-8 w-16 text-center" />
                    –
                    <Input type="number" min={1} max={pageCount} value={d.endPage} onChange={(e) => setDoc(i, { endPage: Number(e.target.value) })} className="h-8 w-16 text-center" />
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-red-400 hover:text-red-600" onClick={() => removeDoc(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="mt-1" onClick={addDoc}><Plus className="h-3.5 w-3.5 mr-1" /> Add a document</Button>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button className="bg-lime-500" disabled={splitting || docs.length === 0} onClick={splitAndDownload}>
              <Download className="h-4 w-4 mr-2" /> {splitting ? "Splitting…" : `Split & download ${docs.length} files (.zip)`}
            </Button>
            <Button variant="outline" onClick={reset}><Trash2 className="h-4 w-4 mr-2" /> Start over</Button>
          </div>
          <p className="text-xs text-slate-400">Tip: rename anything before splitting — the names you set here become the file names. Splitting happens in your browser; the file isn't stored on our server.</p>
        </>
      )}
    </div>
  );
}
