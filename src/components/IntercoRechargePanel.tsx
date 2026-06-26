import { useState, useEffect } from "react";
import { Receipt, Loader2, CheckCircle2, AlertTriangle, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/providers/trpc";

const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

/**
 * INTER-COMPANY RECHARGE generator (Markie 2026-06-26, first: Alderson → Ovita
 * Holdings). Pick the payer + fiscal quarter → pulls the payer's expenses read-only
 * → builds the DRAFT invoice (payer → counterparty) + mirror bill, with HST. Nothing
 * posts; you review, then post on approval. Reconcile each quarter from the log.
 */
export default function IntercoRechargePanel() {
  const { data: clients } = trpc.interco.clients.useQuery();
  const [payerId, setPayerId] = useState<number | null>(null);

  // Default to Alderson if present (the first configured payer).
  useEffect(() => {
    if (payerId == null && clients?.length) {
      const ald = clients.find((c: any) => /alderson/i.test(c.name || ""));
      setPayerId(ald?.id ?? clients[0].id);
    }
  }, [clients, payerId]);

  const payer = clients?.find((c: any) => c.id === payerId);
  const { data: cfg } = trpc.intercoRecharge.getConfig.useQuery({ payerClientId: payerId! }, { enabled: !!payerId });
  const { data: log } = trpc.intercoRecharge.log.useQuery({ payerClientId: payerId! }, { enabled: !!payerId });
  const utils = trpc.useUtils();

  const [counterparty, setCounterparty] = useState("");
  const [revenueAccount, setRevenueAccount] = useState("");
  const [expenseAccount, setExpenseAccount] = useState("");
  const [payerClearing, setPayerClearing] = useState("");
  const [counterpartyClearing, setCounterpartyClearing] = useState("");
  const [hstRatePct, setHstRatePct] = useState(13);
  const [chargeHst, setChargeHst] = useState(true);
  const [start, setStart] = useState("2026-03-01");
  const [end, setEnd] = useState("2026-05-31");

  // Prefill from saved config when it loads.
  useEffect(() => {
    if (cfg) {
      setCounterparty(cfg.counterpartyName || "");
      setRevenueAccount(cfg.revenueAccount || "");
      setExpenseAccount(cfg.expenseAccount || "");
      setPayerClearing((cfg as any).payerClearingAccount || "");
      setCounterpartyClearing((cfg as any).counterpartyClearingAccount || "");
      setHstRatePct(cfg.hstRatePct ?? 13);
      setChargeHst(cfg.chargeHst ?? true);
    }
  }, [cfg]);

  const preview = trpc.intercoRecharge.preview.useMutation();
  const recon = trpc.intercoRecharge.reconcileCheck.useMutation();
  const record = trpc.intercoRecharge.recordPeriod.useMutation({ onSuccess: () => utils.intercoRecharge.log.invalidate({ payerClientId: payerId! }) });
  const markRec = trpc.intercoRecharge.markReconciled.useMutation({ onSuccess: () => utils.intercoRecharge.log.invalidate({ payerClientId: payerId! }) });
  const r = preview.data;
  const draft = r && r.ok ? r.draft : null;
  const rc = recon.data;

  const checkRecon = () => {
    if (!payerId) return;
    recon.mutate({
      payerClientId: payerId, payerClearingAccount: payerClearing,
      counterpartyName: counterparty, counterpartyClearingAccount: counterpartyClearing,
    });
  };

  const run = () => {
    if (!payerId || !payer) return;
    preview.mutate({
      payerClientId: payerId, payerName: payer.name,
      counterpartyName: counterparty, revenueAccount, expenseAccount,
      hstRatePct, chargeHst, startDate: start, endDate: end,
      periodLabel: `${start} → ${end}`,
    });
  };

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="h-4 w-4 text-violet-600" /> Inter-company recharge (draft)
        </CardTitle>
        <CardDescription>
          Pull the payer's expenses for the quarter → draft invoice (payer → counterparty) + mirror bill, with HST. Nothing posts — review, then post on approval. Reconcile each quarter below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Payer (invoices)</Label>
            <select className="w-full border rounded px-2 py-2 text-sm bg-white" value={payerId ?? ""} onChange={(e) => setPayerId(Number(e.target.value) || null)}>
              {(clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Counterparty (billed)</Label><Input className="h-9" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Ovita Holdings Inc." /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">From</Label><Input type="date" className="h-9" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label className="text-xs">To</Label><Input type="date" className="h-9" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          <div><Label className="text-xs">Revenue acct (payer)</Label><Input className="h-9" value={revenueAccount} onChange={(e) => setRevenueAccount(e.target.value)} placeholder="Sales" /></div>
          <div><Label className="text-xs">Expense acct (counterparty)</Label><Input className="h-9" value={expenseAccount} onChange={(e) => setExpenseAccount(e.target.value)} placeholder="Alderson Project Management Costs" /></div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={chargeHst} onChange={(e) => setChargeHst(e.target.checked)} /> HST</label>
            <div className="w-20"><Label className="text-xs">Rate %</Label><Input type="number" className="h-9" value={hstRatePct} onChange={(e) => setHstRatePct(Number(e.target.value) || 0)} /></div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Clearing acct — payer's books</Label>
            <Input className="h-9" value={payerClearing} onChange={(e) => setPayerClearing(e.target.value)} placeholder="Holdings clearing account" />
          </div>
          <div>
            <Label className="text-xs">Clearing acct — counterparty's books</Label>
            <Input className="h-9" value={counterpartyClearing} onChange={(e) => setCounterpartyClearing(e.target.value)} placeholder="Alderson Development clearing account" />
          </div>
          <p className="text-[11px] text-slate-400 sm:col-span-2">The settlement payment lands as a <b>transfer</b> in each entity's clearing account (each named for the other company); reconcile <b>both</b> to zero each quarter — they mirror each other.</p>
        </div>

        {/* INTERCO RECONCILIATION CHECK — pull both clearing balances live, confirm they offset. */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={recon.isPending || !payerId || !payerClearing || !counterpartyClearing} onClick={checkRecon}>
              {recon.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Check interco reconciliation (live)
            </Button>
            <span className="text-[11px] text-slate-400">Pulls both clearing-account balances from QBO and confirms they net to zero.</span>
          </div>
          {rc && !rc.ok && rc.error === "bridge_not_returning_data" && <div className="text-xs text-amber-700">The live QBO connection isn't returning data yet (bridge config — not the books).</div>}
          {rc && !rc.ok && /clearing_account_not_found/.test(rc.error) && (
            <div className="text-xs text-amber-700">
              Couldn't find that clearing account name in {rc.error.includes("counterparty") ? "the counterparty's" : "the payer's"} chart. Check the spelling. {(rc as any).candidates ? <span className="text-slate-400">Accounts include: {(rc as any).candidates.slice(0, 12).join(", ")}…</span> : null}
            </div>
          )}
          {rc && !rc.ok && !/clearing_account_not_found|bridge_not_returning_data/.test(rc.error) && <div className="text-xs text-amber-600">Couldn't check ({rc.error}).</div>}
          {rc && rc.ok && (
            <div className={`text-sm rounded-md p-2 ${rc.result.reconciled ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
              <div className="font-semibold flex items-center gap-1.5">
                {rc.result.reconciled ? <><CheckCircle2 className="h-4 w-4" /> Reconciled — the two clearing accounts net to zero.</> : <><AlertTriangle className="h-4 w-4" /> NOT reconciled — variance {money(rc.result.variance)} to chase.</>}
              </div>
              <div className="text-xs mt-1 grid grid-cols-2 gap-x-4">
                <span>{rc.payerAccount}: <b className="font-mono">{money(rc.result.payerBalance)}</b></span>
                <span>{rc.counterpartyAccount}: <b className="font-mono">{money(rc.result.counterpartyBalance)}</b></span>
                <span className="text-slate-500">sum: {money(rc.result.sum)}</span>
                <span className="text-slate-500">magnitude diff: {money(rc.result.absDiff)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={preview.isPending || !payerId || !counterparty || !revenueAccount} onClick={run}>
            {preview.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />} Generate draft
          </Button>
          {!chargeHst && <span className="text-xs text-amber-600">No HST (Section 156 election).</span>}
        </div>

        {r && !r.ok && r.error === "bridge_not_returning_data" && <div className="text-xs text-amber-700">The live QBO connection isn't returning data yet (bridge config fix needed — not the books).</div>}
        {r && !r.ok && r.error !== "bridge_not_returning_data" && <div className="text-xs text-amber-600">Couldn't pull the payer's books ({r.error}).</div>}

        {draft && (
          <div className="space-y-2 border-t pt-2">
            <div className="text-xs text-slate-500">{r!.pulled} expense line(s) pulled · {draft.periodLabel}{r!.errors.length ? ` · warnings: ${r!.errors.join("; ")}` : ""}</div>
            {!draft.validation.ok && <div className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {draft.validation.errors.join("; ")}</div>}
            <div className="grid sm:grid-cols-2 gap-2">
              <DocCard title={`Invoice — ${payer?.name} → ${draft.invoice.party}`} doc={draft.invoice} sub={`Income: ${draft.invoice.account}`} />
              <DocCard title={`Mirror bill — ${draft.bill.party} → ${draft.invoice.party}`} doc={draft.bill} sub={`Expense: ${draft.bill.account}`} />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={record.isPending || !draft.validation.ok}
                onClick={() => record.mutate({ payerClientId: payerId!, periodLabel: draft.periodLabel, periodStart: start, periodEnd: end, subtotal: draft.invoice.subtotal, hst: draft.invoice.hst, total: draft.invoice.total })}>
                Record this quarter (to reconcile)
              </Button>
              <span className="text-[11px] text-slate-400">Posting to QBO needs the write connection; until then post the approved draft by hand.</span>
            </div>
          </div>
        )}

        {(log?.length ?? 0) > 0 && (
          <div className="border-t pt-2">
            <div className="text-xs font-medium text-slate-600 mb-1">Quarterly reconcile log</div>
            <div className="divide-y text-sm">
              {(log || []).map((x: any) => (
                <div key={x.id} className="flex items-center gap-2 py-1">
                  <span className="text-xs text-slate-500 flex-1 truncate">{x.periodLabel} · {money(x.total)} ({money(x.hst)} HST)</span>
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="checkbox" checked={!!x.reconciled} onChange={(e) => markRec.mutate({ id: x.id, reconciled: e.target.checked })} />
                    {x.reconciled ? <span className="text-emerald-600 inline-flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> reconciled</span> : <span className="text-amber-600">to reconcile</span>}
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        <details className="text-xs text-slate-500 border-t pt-2">
          <summary className="cursor-pointer font-medium text-slate-600">Precise steps (the SOP)</summary>
          <ol className="list-decimal ml-4 mt-1 space-y-0.5">
            <li>Reconcile Alderson's bank + clearing accounts for the quarter; run the Pre-HST review.</li>
            <li>Above: Payer = Alderson, Counterparty = Ovita Holdings, dates = the fiscal quarter (e.g. Mar 1–May 31). Generate draft.</li>
            <li>Review the pulled expense lines; confirm invoice total = bill total.</li>
            <li><b>Alderson (QBO):</b> create the Invoice — Customer = Ovita Holdings; lines → <b>Sales</b>; HST 13% (output tax).</li>
            <li><b>Holdings (QBO):</b> create the Bill — Vendor = Alderson; expense → <b>Alderson Project Management Costs</b>; HST 13% (ITC).</li>
            <li><b>Settlement:</b> Holdings pays Alderson → record as a <b>transfer</b> into the clearing accounts (Alderson → "Holdings clearing account"; Holdings → "Alderson Development clearing account").</li>
            <li><b>Reconcile</b> both clearing accounts to zero each quarter (they mirror). Tick "reconciled" above.</li>
            <li>File the invoice + bill in the client folder.</li>
          </ol>
          <p className="mt-1 text-slate-400">Drafts only — nothing posts to QBO without your review.</p>
        </details>
      </CardContent>
    </Card>
  );
}

function DocCard({ title, doc, sub }: { title: string; doc: any; sub: string }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="text-xs font-semibold text-slate-700">{title}</div>
      <div className="text-[11px] text-slate-400 mb-1">{sub}</div>
      <div className="max-h-40 overflow-auto divide-y text-xs">
        {doc.lines.map((l: any, i: number) => (
          <div key={i} className="flex items-center gap-2 py-0.5">
            <span className="flex-1 truncate text-slate-600">{l.description}</span>
            <span className="font-mono text-slate-700">{money(l.amount)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-xs flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono">{money(doc.subtotal)}</span></div>
      <div className="text-xs flex justify-between"><span className="text-slate-500">HST</span><span className="font-mono">{money(doc.hst)}</span></div>
      <div className="text-sm flex justify-between font-semibold"><span>Total</span><span className="font-mono">{money(doc.total)}</span></div>
    </div>
  );
}
