import { useParams } from "react-router";
import { Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import BackButton from "@/components/BackButton";

const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

/**
 * LIVE billback report (staff). Renders the worksheet built from the BILLABLE expenses
 * marked to the counterparty right now — no post needed. URL: /report/billback/:clientId.
 */
export default function BillbackReport() {
  const { clientId } = useParams<{ clientId: string }>();
  const id = Number(clientId);
  const { data, isLoading, refetch, isFetching } = trpc.intercoRecharge.previewWorksheet.useQuery({ payerClientId: id }, { enabled: id > 0 });

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <BackButton />
        <div className="flex items-center gap-2">
          <Receipt className="h-6 w-6 text-lime-600" />
          <h1 className="text-xl font-bold text-slate-900">Inter-company billback report</h1>
          <button onClick={() => refetch()} className="ml-auto text-xs px-2 py-1 rounded border bg-white hover:bg-slate-50">{isFetching ? "Refreshing…" : "Refresh"}</button>
        </div>

        {isLoading && <div className="text-slate-400">Loading the billable expenses…</div>}
        {data && !data.ok && (
          <Card><CardContent className="p-4 text-sm text-amber-700">
            {data.error === "bridge_not_returning_data" ? "The live QBO connection isn't returning data yet (bridge config — not the books)." : `Couldn't read the books (${data.error}).`}
          </CardContent></Card>
        )}
        {data && data.ok && (
          <>
            <p className="text-sm text-slate-500">{data.payerName} → {data.counterpartyName} · billable expenses {data.from} → {data.to} · {data.count} bills/expenses</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile label="Costs to recharge" value={money(data.subtotal)} />
              <Tile label={`HST (${data.hstRatePct}%)`} value={money(data.hst)} />
              <Tile label="Total to bill" value={money(data.total)} />
              <Tile label="Lines" value={String(data.byAccount.length)} />
            </div>

            <Card className={data.ties ? "border-emerald-300" : "border-amber-300"}>
              <CardContent className="p-3 text-sm">
                {data.ties
                  ? <span className="text-emerald-800">✓ HST ties out — this billback charges {money(data.hst)} and clears the HST account ({money(data.hstAccountBalance)}) to $0.</span>
                  : <span className="text-amber-800">HST on billables charges {money(data.hst)} vs HST account {money(data.hstAccountBalance)} → difference {money(data.tieVariance)}. If that's not $0, an expense still isn't marked Billable to {data.counterpartyName} (or the customer isn't attached).</span>}
                <div className="text-[11px] text-slate-400 mt-1">Actual HST on the billable bills: {money(data.hstActualOnBillables)}. HST account: {data.hstAccounts.map((a: any) => `${a.name} ${money(a.balance)}`).join(" · ")}.</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Billable expenses by account</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {data.byAccount.length === 0 ? (
                  <p className="text-sm text-slate-400">No expenses are marked Billable to {data.counterpartyName} yet. Mark them billable (with {data.counterpartyName} as the customer) in QuickBooks, then refresh.</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead><tr className="border-b text-xs text-slate-500"><th className="text-left py-2 pr-2">Account</th><th className="text-right pl-2">Amount</th></tr></thead>
                    <tbody>
                      {data.byAccount.map((a: any, i: number) => (
                        <tr key={i} className="border-b"><td className="py-2 pr-2">{a.accountName}</td><td className="text-right pl-2 tabular-nums">{money(a.net)}</td></tr>
                      ))}
                      <tr className="font-medium"><td className="py-2 pr-2">Subtotal</td><td className="text-right pl-2 tabular-nums">{money(data.subtotal)}</td></tr>
                      {data.chargeHst && <tr><td className="py-2 pr-2 text-slate-500">HST ({data.hstRatePct}%)</td><td className="text-right pl-2 tabular-nums">{money(data.hst)}</td></tr>}
                      <tr className="font-semibold border-t-2"><td className="py-2 pr-2">Total</td><td className="text-right pl-2 tabular-nums">{money(data.total)}</td></tr>
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <p className="text-center text-xs text-slate-400">Live from QuickBooks billable expenses · {new Date(data.generatedAt).toLocaleString()} · Go Fig Bookz</p>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </CardContent></Card>
  );
}
