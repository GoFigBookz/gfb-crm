import { useState } from "react";
import { TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * JADE — PRICING ANALYSIS. Pulls what each client is billed per month straight
 * from the firm's own QBO books (GoFig Bookz Inc.), joined with the Subscriptions
 * cost ledger → margin per client. Read-only; "am I charging right?"
 */
const money = (n: number | null) => n == null ? "—" : `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function JadePricing() {
  const [months, setMonths] = useState(3);
  const q = trpc.jade.pricing.useQuery({ months }, { staleTime: 5 * 60_000 });
  const d = q.data as any;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-6 w-6 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jade — Pricing Analysis</h1>
          <p className="text-sm text-slate-500">What each client is billed per month, pulled live from your firm's books (GoFig Bookz Inc.), vs your cost.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select className="border rounded px-2 py-1.5 text-sm bg-white" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            <option value={3}>Last 3 months</option><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      {q.isLoading && <p className="text-sm text-slate-500">Pulling from your firm's QBO…</p>}
      {d?.error && (
        <Card className="border-amber-300 bg-amber-50"><CardContent className="p-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {d.error} <span className="text-xs text-amber-600">(Jade reads invoices from the firm's QBO connection — confirm GoFig Bookz Inc. is connected.)</span>
        </CardContent></Card>
      )}

      {d && !d.error && (
        <>
          <div className="text-xs text-slate-500">From {d.firm || "firm books"} · invoices since {d.period?.start} · monthly = total ÷ {d.period?.months}</div>
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b">
                <th className="p-2">Client</th><th className="p-2 text-right">Billed / mo</th><th className="p-2 text-right">Your cost / mo</th><th className="p-2 text-right">Margin / mo</th><th className="p-2 text-right"># inv</th><th className="p-2">Flag</th>
              </tr></thead>
              <tbody>
                {(d.rows || []).length === 0 && <tr><td colSpan={6} className="p-3 text-xs text-slate-400">No invoices found in the period.</td></tr>}
                {(d.rows || []).map((r: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-2 text-slate-800">{r.customer}</td>
                    <td className="p-2 text-right font-medium">{money(r.monthlyAvg)}</td>
                    <td className="p-2 text-right text-slate-500">{money(r.monthlyCost)}</td>
                    <td className={`p-2 text-right font-medium ${r.margin == null ? "text-slate-400" : r.margin < 0 ? "text-red-600" : "text-lime-700"}`}>{money(r.margin)}</td>
                    <td className="p-2 text-right text-slate-400">{r.invoices}</td>
                    <td className="p-2 text-xs text-amber-600">{r.flag || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
          <p className="text-xs text-slate-400">Cost comes from the Subscriptions ledger (matched by client name). Fill that in to see margin. This is Jade's first pass — workload-weighting (transaction volume) comes once we pull transactions per client.</p>
        </>
      )}
    </div>
  );
}
