/**
 * CASH POSITION — "do they have enough money?" card for a client.
 * On-demand pull of account BALANCES (not transactions): cash on hand, credit-card
 * owing, enough for the next payroll?, and a heads-up if the balance is heading below
 * the cash buffer (→ transfer money IN). Honest about the bank-feed limitation.
 */
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import HelpButton from "@/components/HelpButton";
import { Wallet, RefreshCw, Loader2, AlertTriangle, CheckCircle2, ArrowDownToLine, CreditCard } from "lucide-react";

const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const STATUS: Record<string, { cls: string; icon: any; label: string }> = {
  ok: { cls: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2, label: "Healthy" },
  watch: { cls: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle, label: "Watch" },
  alert: { cls: "border-red-200 bg-red-50 text-red-800", icon: AlertTriangle, label: "Needs attention" },
};

export function CashPositionCard({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const buffer = trpc.cashPosition.buffer.useQuery({ clientId });
  const setBuffer = trpc.cashPosition.setBuffer.useMutation({ onSuccess: () => utils.cashPosition.buffer.invalidate({ clientId }) });
  const check = trpc.cashPosition.forClient.useMutation();
  const [bufferDraft, setBufferDraft] = useState<string | null>(null);

  const r: any = check.data;
  const pos = r?.position;
  const st = pos ? STATUS[pos.status] || STATUS.ok : null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Wallet className="h-5 w-5 text-emerald-600" />
          <h3 className="font-semibold text-slate-800">Cash position</h3>
          <HelpButton id="cash-position" />
          <Button size="sm" variant="outline" className="ml-auto" disabled={check.isPending} onClick={() => check.mutate({ clientId })}>
            {check.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />} Check now
          </Button>
        </div>

        {/* Cash buffer setting */}
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span>Keep at least</span>
          <Input type="number" className="h-7 w-28" value={bufferDraft ?? String(buffer.data?.minCashBuffer ?? 0)} onChange={(e) => setBufferDraft(e.target.value)} />
          <span>in the bank.</span>
          {bufferDraft != null && bufferDraft !== String(buffer.data?.minCashBuffer ?? 0) && (
            <Button size="sm" variant="ghost" disabled={setBuffer.isPending} onClick={() => setBuffer.mutate({ clientId, minCashBuffer: parseFloat(bufferDraft) || 0 }, { onSuccess: () => setBufferDraft(null) })}>Save buffer</Button>
          )}
        </div>

        {!r && <p className="text-xs text-slate-400">Click “Check now” to pull the live balances from QuickBooks (balances only — not transactions).</p>}

        {r && r.connected === false && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            {r.reason === "no_active_qbo_connection_for_client" ? "Not connected to QuickBooks yet — connect this client to see live balances." : r.reason === "ambiguous_qbo_connections_for_client" ? "More than one QBO connection for this client — resolve that first." : "Couldn't read the connection."}
          </div>
        )}
        {r && r.connected && r.error && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">Couldn’t pull balances right now ({r.error}). Try again in a moment.</div>
        )}

        {pos && st && (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${st.cls}`}>
              <st.icon className="h-4 w-4 shrink-0" />
              <span className="font-semibold">{st.label}</span>
              <span className="text-xs ml-auto">as of {new Date(r.asOf).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Cash on hand" value={money(pos.cashTotal)} accent />
              <Stat label="Credit cards owing" value={money(pos.creditCardOwed)} neg={pos.ccHigh} />
              <Stat label="Next payroll need" value={pos.payrollNeed != null ? money(pos.payrollNeed) : "—"} />
              <Stat label={pos.payrollNeed != null ? "After payroll" : "Vs buffer"} value={money(pos.afterPayroll != null ? pos.afterPayroll : pos.headroom)} neg={(pos.afterPayroll ?? pos.headroom) < 0} />
            </div>

            <ul className="space-y-1">
              {pos.flags.map((f: string, i: number) => (
                <li key={i} className="text-sm text-slate-700 flex items-start gap-1.5">
                  {pos.needsTransfer && /transfer/.test(f) ? <ArrowDownToLine className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" /> :
                   pos.ccHigh && /credit card/i.test(f) ? <CreditCard className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" /> :
                   <span className="text-slate-300 mt-0.5">•</span>}
                  {f}
                </li>
              ))}
            </ul>

            {r.bankAccounts?.length > 0 && (
              <div className="text-xs text-slate-500">
                {r.bankAccounts.map((a: any, i: number) => (
                  <span key={i} className="inline-block mr-3">{a.name}: <b className={a.balance < 0 ? "text-red-600" : "text-slate-700"}>{money(a.balance)}</b> {a.currency}</span>
                ))}
              </div>
            )}

            <p className="text-[11px] text-slate-400">Balances pulled live from the chart of accounts. Note: QuickBooks doesn’t expose the bank-feed “For Review” count through its API, so “what’s left to post” isn’t shown here — that still needs a look in QBO.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent, neg }: { label: string; value: string; accent?: boolean; neg?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-base font-semibold ${neg ? "text-red-600" : accent ? "text-emerald-700" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}
