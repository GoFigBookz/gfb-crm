import { useState, useCallback } from "react";
import { Upload, FileText, Download, Trash2, Scissors, AlertCircle, Plus, FileStack, FolderInput } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

type Doc = { startPage: number; endPage: number; type: string; folder: string; date: string; name: string };

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

// Keep each request SMALL so big scans upload reliably (no "failed to fetch" from
// a slow/heavy POST). Many small chunks, read in parallel, beats a few huge ones.
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_CHUNK_PAGES = 8;

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
  // "smart" = AI reads + names each document. "simple" = mechanical split into
  // even pieces (no AI, no server — always works, instant).
  const [mode, setMode] = useState<"smart" | "simple">("smart");
  const [simpleBy, setSimpleBy] = useState<"pages" | "parts">("pages");
  const [simpleN, setSimpleN] = useState(5);
  const plan = trpc.pdfSplitter.plan.useMutation();

  const reset = () => { setFile(null); setBuffer(null); setPageCount(0); setDocs(null); setError(null); setProgress(""); };

  const processFile = useCallback(async (f: File) => {
    setError(null); setDocs(null); setProgress("");
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { setError("Please upload a PDF file."); return; }
    try {
      const buf = await f.arrayBuffer();
      const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
      const total = pdf.getPageCount();
      setFile(f); setBuffer(buf); setPageCount(total);

      // Simple mode: just load it and show the mechanical-split controls — no AI.
      if (mode === "simple") return;
      setWorking(true);

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
          // Retry a couple of times — a single dropped request shouldn't sink the batch.
          let r: any = null; let lastErr = "";
          for (let attempt = 0; attempt < 3 && !r?.ok; attempt++) {
            if (attempt > 0) await new Promise((res) => setTimeout(res, 1500 * attempt));
            try { r = await plan.mutateAsync({ base64: b64, fileName: f.name, pageCount: c.end - c.start + 1 }); }
            catch (err: any) { lastErr = err?.message || "request failed"; r = null; }
          }
          if (!r || !r.ok) throw new Error(r?.error || lastErr || `Couldn't read pages ${c.start}–${c.end}.`);
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
  }, [plan, mode]);

  // Simple, mechanical split — even pieces, no AI, no server. Always works.
  const doSimpleSplit = async () => {
    if (!buffer) return;
    setSplitting(true); setError(null);
    try {
      const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const total = src.getPageCount();
      const ranges: [number, number][] = [];
      if (simpleBy === "pages") {
        const n = Math.max(1, Math.floor(simpleN));
        for (let s = 1; s <= total; s += n) ranges.push([s, Math.min(total, s + n - 1)]);
      } else {
        const parts = Math.max(1, Math.min(total, Math.floor(simpleN)));
        const per = Math.ceil(total / parts);
        for (let s = 1; s <= total; s += per) ranges.push([s, Math.min(total, s + per - 1)]);
      }
      const zip = new JSZip();
      const base = (file?.name || "scan").replace(/\.pdf$/i, "");
      let idx = 1;
      for (const [start, end] of ranges) {
        const out = await PDFDocument.create();
        const indices: number[] = [];
        for (let p = start; p <= end; p++) indices.push(p - 1);
        const copied = await out.copyPages(src, indices);
        copied.forEach((pg) => out.addPage(pg));
        const bytes = await out.save();
        zip.file(`${base} - part ${idx} (p${start}${end > start ? `-${end}` : ""}).pdf`, bytes);
        idx++;
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${base}_pieces.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "Split failed.");
    } finally {
      setSplitting(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0]; if (f) processFile(f);
  }, [processFile]);

  const setDoc = (i: number, patch: Partial<Doc>) => setDocs((d) => d ? d.map((x, j) => j === i ? { ...x, ...patch } : x) : d);
  const removeDoc = (i: number) => setDocs((d) => d ? d.filter((_, j) => j !== i) : d);
  const addDoc = () => setDocs((d) => [...(d || []), { startPage: 1, endPage: 1, type: "other", folder: "", date: "", name: "Document" }]);

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
        const fname = safeName(d.name);
        const folder = (d.folder || "").replace(/[\\/:*?"<>|]+/g, "").trim();
        // Dedupe within the destination folder (keeps the Assets/Donations layout clean).
        let path = folder ? `${folder}/${fname}` : fname;
        let k = 2;
        while (used.has(path.toLowerCase())) { path = folder ? `${folder}/${fname} (${k++})` : `${fname} (${k++})`; }
        used.add(path.toLowerCase());
        zip.file(`${path}.pdf`, bytes);
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
        <p className="text-slate-500">Scan a stack of documents into one PDF — Figs finds each document, names it, and gives you clean separate files.</p>
      </div>

      {/* Mode chooser */}
      {!docs && !(mode === "simple" && buffer) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode("smart")}
            className={cn("rounded-lg border p-3 text-left transition-all", mode === "smart" ? "border-lime-500 bg-lime-50 ring-1 ring-lime-200" : "border-slate-200 bg-white hover:border-slate-300")}>
            <p className="font-medium text-sm flex items-center gap-1.5"><Scissors className="h-4 w-4 text-lime-600" /> Smart split (AI)</p>
            <p className="text-xs text-slate-500 mt-0.5">Reads each document, names it (bank statement, invoice, etc.), one file per document.</p>
          </button>
          <button type="button" onClick={() => setMode("simple")}
            className={cn("rounded-lg border p-3 text-left transition-all", mode === "simple" ? "border-lime-500 bg-lime-50 ring-1 ring-lime-200" : "border-slate-200 bg-white hover:border-slate-300")}>
            <p className="font-medium text-sm flex items-center gap-1.5"><FileStack className="h-4 w-4 text-slate-500" /> Simple split</p>
            <p className="text-xs text-slate-500 mt-0.5">Just break into even pieces (every N pages, or X equal parts). No AI — instant, never fails.</p>
          </button>
        </div>
      )}

      {!docs && !(mode === "simple" && buffer) && (
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
              <p className="text-sm text-slate-500">Figs is finding where each document starts and ends. Large scans are read in parts automatically — this can take a couple of minutes.</p>
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

      {/* Simple split panel — shown once a file is loaded in simple mode */}
      {mode === "simple" && buffer && !docs && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><FileStack className="h-5 w-5 text-lime-500" /> Simple split</CardTitle>
            <CardDescription>{file?.name} · {pageCount} pages. Break it into even pieces — no AI, instant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border bg-white p-0.5">
                <button onClick={() => setSimpleBy("pages")} className={cn("px-3 py-1.5 text-sm rounded-md", simpleBy === "pages" ? "bg-lime-500 text-white" : "text-slate-600")}>Every N pages</button>
                <button onClick={() => setSimpleBy("parts")} className={cn("px-3 py-1.5 text-sm rounded-md", simpleBy === "parts" ? "bg-lime-500 text-white" : "text-slate-600")}>Into N equal parts</button>
              </div>
              <Input type="number" min={1} max={pageCount} value={simpleN} onChange={(e) => setSimpleN(Math.max(1, Number(e.target.value)))} className="h-9 w-24" />
              <span className="text-sm text-slate-500">{simpleBy === "pages" ? "pages per file" : "files"}</span>
            </div>
            <p className="text-xs text-slate-500">
              {simpleBy === "pages"
                ? `→ ${Math.max(1, Math.ceil(pageCount / Math.max(1, simpleN)))} files of up to ${simpleN} page${simpleN > 1 ? "s" : ""} each.`
                : `→ ${Math.min(pageCount, Math.max(1, simpleN))} files of about ${Math.ceil(pageCount / Math.max(1, Math.min(pageCount, simpleN)))} pages each.`}
            </p>
            {error && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
            <div className="flex gap-3">
              <Button className="bg-lime-500" disabled={splitting} onClick={doSimpleSplit}>
                <Download className="h-4 w-4 mr-2" /> {splitting ? "Splitting…" : "Split & download (.zip)"}
              </Button>
              <Button variant="outline" onClick={reset}><Trash2 className="h-4 w-4 mr-2" /> Start over</Button>
            </div>
          </CardContent>
        </Card>
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
                  <Badge variant="outline" className="text-xs capitalize">{d.type.replace(/_/g, " ")}</Badge>
                  <Input value={d.name} onChange={(e) => setDoc(i, { name: e.target.value })} className="h-8 flex-1 min-w-[200px]" placeholder="File name" />
                  <div className="flex items-center gap-1 text-xs text-slate-500" title="Subfolder inside the ZIP">
                    <FolderInput className="h-3.5 w-3.5 text-slate-400" />
                    <Input value={d.folder} onChange={(e) => setDoc(i, { folder: e.target.value })} className="h-8 w-28" placeholder="(folder)" />
                  </div>
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
