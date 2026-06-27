import HelpButton from "@/components/HelpButton";
import { useState } from "react";
import { GitCompareArrows, CheckCircle2, AlertTriangle, ArrowDownToLine, Loader2, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parseCsvTransactions, matchStatements, findCleanupFlags, type ReconResult, type CleanupFlags } from "../../api/recon-match-core";
import { extractPdfLines } from "@/lib/pdf-extract";
import { parseBankStatement } from "../../api/pdf-statement-core";

/**
 * RECONCILIATION MATCHER — drop the bank statement + the QBO register, get the
 * match report. Matches statement ↔ books (it can't read an in-progress QBO
 * reconcile — that lives only in QBO's screen — and doesn't need to). All client-
 * side + deterministic (recon-match-core); nothing posts. v2 will auto-pull the
 * QBO side once the bridge is fixed so you only drop the statement.
 */
const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export default function ReconMatch() {
  const [stmtText, setStmtText] = useState("");
  const [booksText, setBooksText] = useState("");
  const [result, setResult] = useState<ReconResult | null>(null);
  const [cleanup, setCleanup] = useState<CleanupFlags | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  // Drop a PDF bank statement → read it free (in-browser) → fill the statement box as CSV.
  const onPdf = async (file?: File | null) => {
    if (!file) return;
    setErr(""); setPdfBusy(true);
    try {
      const lines = await extractPdfLines(file);
      const r = parseBankStatement(lines, { year: new Date().getFullYear() });
      if (!r.transactions.length) { setErr("That PDF has no readable text (likely a scan). Use Bank → QBO's AI fallback, or paste the rows."); return; }
      setStmtText("Date,Description,Amount\n" + r.transactions.map((t) => `${t.date},"${t.description.replace(/"/g, "'")}",${t.amount}`).join("\n"));
    } catch (e) { setErr(`Couldn't read that PDF (${e instanceof Error ? e.message : "error"}).`); }
    finally { setPdfBusy(false); }
  };

  const run = () => {
    setErr(""); setBusy(true);
    try {
      const stmt = parseCsvTransactions(stmtText);
      const books = parseCsvTransactions(booksText);
      if (!stmt.length) { setErr("Couldn't read any transactions from the bank statement side. Paste CSV with Date + Amount (or Debit/Credit) columns."); setBusy(false); return; }
      if (!books.length) { setErr("Couldn't read any transactions from the QuickBooks side. Export the account register to CSV and paste it."); setBusy(false); return; }
      const matched = matchStatements(stmt, books);
      setResult(matched);
      // Post-recon cleanup: stale outstanding (uncashed cheques) + likely duplicates in the register.
      setCleanup(findCleanupFlags(matched.onlyBooks, books));
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to match."); }
    setBusy(false);
  };

  const r = result;
  const tiesOut = r && Math.abs(r.totals.netDifference) < 0.01;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <GitCompareArrows className="h-6 w-6 text-violet-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-1.5">Reconciliation Matcher <HelpButton id="reconcile-matcher" /></h1>
          <p className="text-sm text-slate-500">Drop the bank statement + the QuickBooks register → get matched / outstanding / missing. Nothing posts.</p>
        </div>
      </div>

      <Card><CardContent className="p-3 text-xs text-slate-500 space-y-1">
        <p><b>1. Bank statement</b> — paste CSV (export from TD online banking). If it's a PDF, run it through <b>Bank → QBO</b> first to get rows.</p>
        <p><b>2. QuickBooks</b> — open the bank account <b>register</b> in QBO → <b>Export to Excel/CSV</b> → paste it here.</p>
        <p className="text-slate-400">Matches by amount within ~6 days. It can't read your half-done QBO reconcile screen (no tool can) — it matches to the register, which is the same answer.</p>
      </CardContent></Card>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Bank statement (CSV / text / PDF)</label>
            <label className="text-[11px] text-violet-600 hover:underline cursor-pointer inline-flex items-center gap-1">
              {pdfBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileUp className="h-3 w-3" />} drop a PDF (free)
              <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => onPdf(e.target.files?.[0])} />
            </label>
          </div>
          <textarea className="w-full border rounded px-2 py-2 text-xs font-mono min-h-[180px]" placeholder="Date,Description,Amount&#10;2026-03-01,Deposit,1000.00&#10;2026-03-02,Cheque 101,-250.50" value={stmtText} onChange={(e) => setStmtText(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">QuickBooks register (export CSV)</label>
          <textarea className="w-full border rounded px-2 py-2 text-xs font-mono min-h-[180px]" placeholder="Date,Transaction Type,Payee,Decrease,Increase&#10;2026-03-02,Cheque,Home Depot,1234.56,&#10;2026-03-05,Deposit,Client,,2000.00" value={booksText} onChange={(e) => setBooksText(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button disabled={busy || !stmtText.trim() || !booksText.trim()} onClick={run}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <GitCompareArrows className="h-4 w-4 mr-1" />} Match
        </Button>
        {err && <span className="text-xs text-amber-600">{err}</span>}
      </div>

      {r && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Matched" value={String(r.counts.matched)} tone="emerald" />
            <Tile label="Outstanding in QBO" value={String(r.counts.onlyBooks)} sub="not on statement (e.g. uncashed cheques)" tone="amber" />
            <Tile label="Missing from books" value={String(r.counts.onlyStatement)} sub="on statement, not in QBO" tone="amber" />
            <Tile label={tiesOut ? "Ties out ✓" : "Net difference"} value={money(r.totals.netDifference)} sub={`stmt ${money(r.totals.statementNet)} vs books ${money(r.totals.booksNet)}`} tone={tiesOut ? "emerald" : "red"} />
          </div>

          <Section title="Outstanding in QuickBooks — not on the statement" hint="Uncleared/outstanding: cheques that haven't cashed, deposits in transit. Expected — leave uncleared in the reconcile." icon={<ArrowDownToLine className="h-4 w-4 text-amber-600" />} rows={r.onlyBooks} />
          <Section title="On the statement — missing from the books" hint="The bank shows these but QBO doesn't — add them in QBO before you finish reconciling." icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} rows={r.onlyStatement} />
          <Section title="Matched" hint="Statement ↔ QBO, same amount within ~6 days. Tick these as cleared in QBO." icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} rows={r.matched.map((m) => ({ ...m.statement, description: `${m.statement.description} ↔ ${m.books.description}${m.dateGapDays ? ` (${m.dateGapDays}d)` : ""}` }))} startCollapsed />

          {cleanup && (cleanup.stale.length > 0 || cleanup.duplicates.length > 0) && (
            <Card className="border-amber-200 bg-amber-50/40"><CardContent className="p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                <AlertTriangle className="h-4 w-4" /> Post-reconciliation cleanup — chase or flag the client
              </div>
              <Section
                title="Stale / uncashed cheques (outstanding 6+ months)"
                hint="Outstanding in QBO and older than 6 months — likely never cashed. Follow up or void/re-issue; in Ontario a cheque goes stale-dated at 6 months."
                icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                rows={cleanup.stale.map((s) => ({ date: s.date, description: `${s.description || "—"} · ${s.ageDays}d old`, amount: s.amount }))}
              />
              <DupSection pairs={cleanup.duplicates} />
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "emerald" | "amber" | "red" }) {
  const cls = { emerald: "bg-emerald-50 border-emerald-200 text-emerald-700", amber: "bg-amber-50 border-amber-200 text-amber-700", red: "bg-red-50 border-red-200 text-red-700" }[tone];
  return (
    <Card className={cls}><CardContent className="p-3">
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {sub && <div className="text-[11px] opacity-70">{sub}</div>}
    </CardContent></Card>
  );
}

function Section({ title, hint, icon, rows, startCollapsed }: { title: string; hint: string; icon: React.ReactNode; rows: { date: string; description: string; amount: number }[]; startCollapsed?: boolean }) {
  const [open, setOpen] = useState(!startCollapsed);
  return (
    <Card><CardContent className="p-3">
      <button className="w-full flex items-center gap-2 text-sm font-semibold text-slate-700" onClick={() => setOpen((v) => !v)}>
        {icon} {title} <span className="text-slate-400 font-normal">({rows.length})</span>
        <span className="ml-auto text-xs text-slate-400">{open ? "hide" : "show"}</span>
      </button>
      <p className="text-xs text-slate-400 mt-0.5">{hint}</p>
      {open && rows.length > 0 && (
        <div className="mt-2 divide-y text-sm">
          {rows.map((t, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="text-xs text-slate-400 w-24 shrink-0">{t.date}</span>
              <span className="flex-1 min-w-0 truncate text-slate-700">{t.description || "—"}</span>
              <span className={`font-mono ${t.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{money(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {open && rows.length === 0 && <p className="text-xs text-emerald-600 mt-1">None — all clear.</p>}
    </CardContent></Card>
  );
}

function DupSection({ pairs }: { pairs: CleanupFlags["duplicates"] }) {
  const [open, setOpen] = useState(true);
  return (
    <Card><CardContent className="p-3">
      <button className="w-full flex items-center gap-2 text-sm font-semibold text-slate-700" onClick={() => setOpen((v) => !v)}>
        <AlertTriangle className="h-4 w-4 text-amber-600" /> Possible duplicates (double-entered)
        <span className="text-slate-400 font-normal">({pairs.length})</span>
        <span className="ml-auto text-xs text-slate-400">{open ? "hide" : "show"}</span>
      </button>
      <p className="text-xs text-slate-400 mt-0.5">Same amount + similar payee within a few days — likely entered twice. Check QBO before deleting one.</p>
      {open && pairs.length > 0 && (
        <div className="mt-2 divide-y text-sm">
          {pairs.map((p, i) => (
            <div key={i} className="py-1.5">
              <div className="text-xs text-amber-700">{p.reason}</div>
              <div className="flex items-center gap-2 text-slate-600">
                <span className="text-xs text-slate-400 w-24 shrink-0">{p.a.date}</span>
                <span className="flex-1 min-w-0 truncate">{p.a.description || "—"}</span>
                <span className={`font-mono ${p.a.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{money(p.a.amount)}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <span className="text-xs text-slate-400 w-24 shrink-0">{p.b.date}</span>
                <span className="flex-1 min-w-0 truncate">{p.b.description || "—"}</span>
                <span className={`font-mono ${p.b.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{money(p.b.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && pairs.length === 0 && <p className="text-xs text-emerald-600 mt-1">None found.</p>}
    </CardContent></Card>
  );
}
