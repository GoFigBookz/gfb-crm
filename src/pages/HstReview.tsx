import { useState } from "react";
import { ClipboardCheck, AlertTriangle, AlertCircle, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * PRE-HST REVIEW — read-only data-accuracy sweep before filing.
 * QuickBooks does the reconcile + the HST return; this verifies the DATA is clean
 * first (tax-code gaps, sales without HST, control-account coding, uncategorized
 * balances, duplicates, meals ITC) and gives an implied-HST tie-out to compare
 * against QBO's own Sales Tax report. Nothing posts. Pick a client + period → Run.
 */
const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
const SEV: Record<string, { icon: any; cls: string; label: string }> = {
  high: { icon: AlertCircle, cls: "text-red-600", label: "High" },
  medium: { icon: AlertTriangle, cls: "text-amber-600", label: "Medium" },
  low: { icon: Info, cls: "text-sky-600", label: "Low" },
};

export default function HstReview() {
  const clients = trpc.clients.list.useQuery(undefined, { staleTime: 60000 });
  const [clientId, setClientId] = useState<number | "">("");
  const [startDate, setStartDate] = useState("2024-12-01");
  const [endDate, setEndDate] = useState("2025-05-31");
  const run = trpc.hstReview.run.useMutation();
  const r = run.data;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pre-HST Review</h1>
          <p className="text-sm text-slate-500">Read-only accuracy sweep before you run QuickBooks' HST report. Nothing is changed or posted.</p>
        </div>
      </div>

      <Card><CardContent className="p-3 grid sm:grid-cols-4 gap-2 items-end">
        <div className="sm:col-span-2">
          <label className="text-xs text-slate-500">Client</label>
          <select className="w-full border rounded px-2 py-2 text-sm bg-white" value={clientId} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Select a client…</option>
            {(clients.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="text-xs text-slate-500">From</label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div><label className="text-xs text-slate-500">To</label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        <div className="sm:col-span-4">
          <Button size="sm" disabled={!clientId || run.isPending} onClick={() => clientId && run.mutate({ clientId: Number(clientId), startDate, endDate })}>
            {run.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Run review
          </Button>
          <span className="text-xs text-slate-400 ml-2">Pulls QBO read-only via the live connection. Validate the output against a known entity before relying on it for a filing.</span>
        </div>
      </CardContent></Card>

      {run.isError && <Card><CardContent className="p-3 text-sm text-red-600">{(run.error as any)?.message || "Failed to run."}</CardContent></Card>}
      {r && !r.ok && <Card><CardContent className="p-3 text-sm text-amber-600">No usable QBO connection for this client ({r.error}). Connect it first.</CardContent></Card>}

      {r && r.ok && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Implied HST collected" value={money(r.report.tie.collected)} />
            <Tile label="Implied ITCs" value={money(r.report.tie.itc)} />
            <Tile label="Implied net HST" value={money(r.report.tie.net)} />
            <Tile label="Issues found" value={String(r.report.findings.length)} sub={`${r.report.bySeverity.high} high · ${r.report.bySeverity.medium} med`} />
          </div>
          <p className="text-xs text-slate-500">
            Pulled {r.pulled.transactions} transactions, {r.pulled.accounts} accounts ({r.period.start} → {r.period.end}).
            Compare the implied net HST to QuickBooks' own Sales Tax report — if they differ, something is coded outside the tax system.
            {r.errors.length > 0 && <span className="text-amber-600"> · Pull warnings: {r.errors.join("; ")}</span>}
          </p>

          {r.report.findings.length === 0 ? (
            <Card><CardContent className="p-4 text-sm text-emerald-600">No accuracy issues flagged in this period. Still reconcile in QBO and sanity-check the tie-out above.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {r.report.findings.map((f: any, i: number) => {
                const s = SEV[f.severity] || SEV.low; const Icon = s.icon;
                return (
                  <Card key={i}><CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${s.cls}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{f.message} {f.amount != null && <span className="text-slate-400">· {money(f.amount)}</span>}</div>
                        <div className="text-xs text-slate-500">{f.ref}</div>
                        <div className="text-xs text-slate-600 mt-0.5"><b className="text-slate-500">Fix:</b> {f.fix}</div>
                      </div>
                      <span className={`text-[10px] uppercase font-semibold ${s.cls}`}>{s.label}</span>
                    </div>
                  </CardContent></Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </CardContent></Card>
  );
}
