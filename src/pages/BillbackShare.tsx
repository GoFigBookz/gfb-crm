import { useParams } from "react-router";
import { Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

/**
 * Public, token-gated, read-only INTER-COMPANY BILLBACK WORKSHEET. Shows the period's
 * recharged costs (by account), the HST, the totals, and the posted invoice/bill #s —
 * a snapshot captured at post time, so the link always works without a live QBO pull.
 */
export default function BillbackShare() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading } = trpc.intercoRecharge.publicView.useQuery({ token: token! }, { enabled: !!token });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-500">This link isn’t valid or has been revoked.</div>;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-6 w-6 text-lime-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Inter-company billback — {data.payerName} → {data.counterpartyName}</h1>
            <p className="text-sm text-slate-500">{data.periodLabel}{data.periodStart ? ` (${data.periodStart} → ${data.periodEnd})` : ""}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Costs recharged" value={money(data.subtotal)} />
          <Tile label={`HST (${data.hstRatePct}%)`} value={money(data.hst)} />
          <Tile label="Total billed" value={money(data.total)} />
          <Tile label="Status" value={data.reconciled ? "Reconciled" : "Posted"} />
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Costs recharged by account</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {data.byAccount.length === 0 ? (
              <p className="text-sm text-slate-400">Line detail not captured for this period.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead><tr className="border-b text-xs text-slate-500">
                  <th className="text-left py-2 pr-2">Account</th>
                  <th className="text-right pl-2">Amount</th>
                </tr></thead>
                <tbody>
                  {data.byAccount.map((a: any, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="py-2 pr-2">{a.accountName}</td>
                      <td className="text-right pl-2 tabular-nums">{money(a.net)}</td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className="py-2 pr-2">Subtotal</td>
                    <td className="text-right pl-2 tabular-nums">{money(data.subtotal)}</td>
                  </tr>
                  {data.chargeHst && (
                    <tr>
                      <td className="py-2 pr-2 text-slate-500">HST ({data.hstRatePct}%)</td>
                      <td className="text-right pl-2 tabular-nums">{money(data.hst)}</td>
                    </tr>
                  )}
                  <tr className="font-semibold border-t-2">
                    <td className="py-2 pr-2">Total</td>
                    <td className="text-right pl-2 tabular-nums">{money(data.total)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {data.excluded?.lines > 0 && (
          <Card>
            <CardContent className="p-3 text-xs text-slate-500">
              Excluded from the billback: {data.excluded.lines} bank-charge line(s) ({money(data.excluded.total)})
              {data.excluded.accounts?.length ? ` — ${data.excluded.accounts.join(", ")}` : ""}. These are {data.payerName}’s own banking costs, not recharged.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-3 text-sm text-slate-600 space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">Invoice in {data.payerName}</span><span className="font-mono">#{data.invoiceId || "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Bill in {data.counterpartyName}</span><span className="font-mono">#{data.billId || "—"}</span></div>
            {data.zeroOut && <p className="text-xs text-slate-400 pt-1">The recharge credits {data.payerName}’s cost accounts so its expenses and HST net to zero for the period; {data.counterpartyName} carries the cost and claims the ITC.</p>}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400">Generated {new Date(data.generatedAt).toLocaleString()} · Go Fig Bookz</p>
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
