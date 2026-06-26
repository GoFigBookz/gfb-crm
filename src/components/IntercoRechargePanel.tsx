import { useState, useEffect } from "react";
import { Receipt, Loader2, CheckCircle2, AlertTriangle, FileDown, ChevronDown } from "lucide-react";
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
export default function IntercoRechargePanel({ defaultPayerId }: { defaultPayerId?: number } = {}) {
  const { data: clients } = trpc.interco.clients.useQuery();
  const [payerId, setPayerId] = useState<number | null>(defaultPayerId ?? null);

  // Default to the given client (on a client card) or Alderson (standalone).
  useEffect(() => {
    if (payerId == null && clients?.length) {
      if (defaultPayerId) { setPayerId(defaultPayerId); return; }
      const ald = clients.find((c: any) => /alderson/i.test(c.name || ""));
      setPayerId(ald?.id ?? clients[0].id);
    }
  }, [clients, payerId, defaultPayerId]);

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
  const post = trpc.intercoRecharge.post.useMutation({ onSuccess: () => utils.intercoRecharge.log.invalidate({ payerClientId: payerId! }) });
  const record = trpc.intercoRecharge.recordPeriod.useMutation({ onSuccess: () => utils.intercoRecharge.log.invalidate({ payerClientId: payerId! }) });
  const markRec = trpc.intercoRecharge.markReconciled.useMutation({ onSuccess: () => utils.intercoRecharge.log.invalidate({ payerClientId: payerId! }) });
  const r = preview.data;
  const draft = r && r.ok ? r.draft : null;
  const rc = recon.data;
  const pr = post.data;

  const postLive = () => {
    if (!payerId || !payer) return;
    if (!confirm(`Fig will POST LIVE to QuickBooks:\n• Invoice in ${payer.name} → ${counterparty}\n• Bill in ${counterparty}\nfor ${start} → ${end}.\n\nBoth companies must be on the DIRECT (native) connection. Proceed?`)) return;
    post.mutate({
      payerClientId: payerId, payerName: payer.name,
      counterpartyName: counterparty, revenueAccount, expenseAccount,
      hstRatePct, chargeHst, startDate: start, endDate: end,
      periodLabel: `${start} → ${end}`, approve: true,
    });
  };

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
          Pull the payer's expenses for the quarter → draft invoice (payer → counterparty) + mirror bill, with HST. Review, then <b>Fig posts both live</b> on your approval (both companies must be connected DIRECT). Zero-out mode leaves the payer with $0 expenses + $0 HST. Reconcile each quarter below.
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

        {/* INTERCO RECONCILIATION CHECK — the FINAL step, run only AFTER the invoice +
            bill are posted and the settlement transfer is recorded. */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-2 space-y-2">
          <div className="text-[11px] font-medium text-sky-700">Final step — run AFTER the invoice + bill are posted and the settlement transfer is recorded</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={recon.isPending || !payerId} onClick={checkRecon}>
              {recon.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Check interco reconciliation (live)
            </Button>
            <span className="text-[11px] text-slate-400">Confirms both clearing accounts net to zero. It won't balance until the invoice, bill, and settlement transfer are all in QBO.</span>
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
          <Button size="sm" disabled={preview.isPending || !payerId} onClick={run}>
            {preview.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />} Generate draft
          </Button>
          {!chargeHst && <span className="text-xs text-amber-600">No HST (Section 156 election).</span>}
        </div>

        {r && !r.ok && r.error === "bridge_not_returning_data" && <div className="text-xs text-amber-700">The live QBO connection isn't returning data yet (bridge config fix needed — not the books).</div>}
        {r && !r.ok && r.error !== "bridge_not_returning_data" && <div className="text-xs text-amber-600">Couldn't pull the payer's books ({r.error}).</div>}

        {draft && (
          <div className="space-y-2 border-t pt-2">
            <div className="text-xs text-slate-500">{r!.pulled} expense line(s) pulled · {draft.periodLabel}{r!.errors.length ? ` · warnings: ${r!.errors.join("; ")}` : ""}</div>
            {(r as any)?.excluded?.lines > 0 && (
              <div className="text-[11px] text-slate-500">
                Excluded {(r as any).excluded.lines} bank-charge line(s) ({money((r as any).excluded.total)}) — not billed to {counterparty || "Holdings"}{(r as any).excluded.accounts?.length ? `: ${(r as any).excluded.accounts.join(", ")}` : ""}.
              </div>
            )}
            {!draft.validation.ok && <div className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {draft.validation.errors.join("; ")}</div>}
            {(r as any)?.zeroOut && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2 text-xs text-emerald-900 space-y-1">
                <div className="font-semibold flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Zero-out mode</div>
                <div>The invoice credits each cost back to the <b>same expense account</b> it came from, so {payer?.name}'s expenses net to <b>$0</b>. The 13% HST charged offsets the ITCs already claimed → {payer?.name}'s HST nets to <b>$0</b> for the period.</div>
                {Array.isArray((r as any).byAccount) && (r as any).byAccount.length > 0 && (
                  <div className="mt-1 divide-y divide-emerald-100 border-t border-emerald-100">
                    {(r as any).byAccount.map((a: any, i: number) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span className="truncate text-emerald-800">{a.accountName}{a.accountId ? "" : " (by name — id missing)"}</span>
                        <span className="font-mono">{money(a.net)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-2">
              <DocCard title={`Invoice — ${payer?.name} → ${draft.invoice.party}`} doc={draft.invoice} sub={(r as any)?.zeroOut ? "Credits the source expense accounts (zero-out)" : `Income: ${draft.invoice.account}`} />
              <DocCard title={`Mirror bill — ${draft.bill.party} → ${draft.invoice.party}`} doc={draft.bill} sub={`Expense: ${draft.bill.account}`} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={post.isPending || !draft.validation.ok}
                onClick={postLive}>
                {post.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Approve & post (Fig) — LIVE
              </Button>
              <Button size="sm" variant="outline" disabled={record.isPending || !draft.validation.ok}
                onClick={() => record.mutate({ payerClientId: payerId!, periodLabel: draft.periodLabel, periodStart: start, periodEnd: end, subtotal: draft.invoice.subtotal, hst: draft.invoice.hst, total: draft.invoice.total })}>
                Record this quarter (to reconcile)
              </Button>
              <span className="text-[11px] text-slate-400">Posting needs both companies on the DIRECT (native) connection.</span>
            </div>
            {pr && pr.ok && (
              <>
                <div className="text-sm rounded-md p-2 bg-emerald-50 text-emerald-800">
                  ✓ Posted live — Invoice <b>#{pr.invoiceId}</b> in {payer?.name}, Bill <b>#{pr.billId}</b> in {counterparty} ({money(pr.total)}). See System Health → Recent Agent Activity for the audit entry.
                </div>
                <PostedRecords
                  payerClientId={payerId!}
                  counterpartyClientId={(pr as any).counterpartyClientId}
                  counterpartyName={counterparty}
                  payerName={payer?.name || "Payer"}
                  invoiceId={pr.invoiceId}
                  billId={pr.billId}
                  defaultOpen
                />
              </>
            )}
            {pr && !pr.ok && (
              <div className="text-sm rounded-md p-2 bg-amber-50 text-amber-800">
                Didn't post ({pr.error}). {(pr as any).detail || ""}
              </div>
            )}
            {post.isError && <div className="text-xs text-red-600">{(post.error as any)?.message}</div>}
          </div>
        )}

        {(log?.length ?? 0) > 0 && (
          <div className="border-t pt-2">
            <div className="text-xs font-medium text-slate-600 mb-1">Quarterly reconcile log</div>
            <div className="divide-y text-sm">
              {(log || []).map((x: any) => (
                <div key={x.id} className="py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 flex-1 truncate">{x.periodLabel} · {money(x.total)} ({money(x.hst)} HST){x.invoiceRef ? ` · Inv #${x.invoiceRef} / Bill #${x.billRef}` : ""}</span>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input type="checkbox" checked={!!x.reconciled} onChange={(e) => markRec.mutate({ id: x.id, reconciled: e.target.checked })} />
                      {x.reconciled ? <span className="text-emerald-600 inline-flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> reconciled</span> : <span className="text-amber-600">to reconcile</span>}
                    </label>
                  </div>
                  {x.invoiceRef && x.billRef && (
                    <PostedRecords
                      payerClientId={payerId!}
                      counterpartyClientId={x.counterpartyClientId}
                      counterpartyName={counterparty}
                      payerName={payer?.name || "Payer"}
                      invoiceId={String(x.invoiceRef)}
                      billId={String(x.billRef)}
                    />
                  )}
                  <BillbackShareLink logId={x.id} />
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
            <li>Review the pulled expense lines (grouped by account); confirm invoice total = bill total.</li>
            <li>Click <b>Approve &amp; post (Fig) — LIVE</b>. Fig posts the <b>Alderson Invoice</b> (Customer = Ovita Holdings; one line per expense account credited back to the <b>same account</b> → zero-out; HST 13%) and the <b>Holdings Bill</b> (Vendor = Alderson; expense → <b>Alderson Project Management Costs</b>; HST 13% ITC).</li>
            <li><b>Cross-check in QBO:</b> Alderson's expenses = <b>$0</b> and HST = <b>$0</b> for the period. If anything remains, a cost was dated outside the period — fix and re-run.</li>
            <li><b>Settlement:</b> Holdings pays Alderson → record as a <b>transfer</b> into the clearing accounts (Alderson → "Holdings clearing account"; Holdings → "Alderson Development clearing account").</li>
            <li><b>Reconcile</b> (final step) both clearing accounts to zero (they mirror). Tick "reconciled" above.</li>
            <li>File the invoice + bill in the client folder.</li>
          </ol>
          <p className="mt-1 text-slate-400">Fig posts these two documents live (Markie-approved for Alderson); everything else stays review-only.</p>
        </details>
      </CardContent>
    </Card>
  );
}

/** Create / show / copy the shareable read-only billback worksheet link for a posted
 *  period. Also files a copy to BOTH clients' Drive folders (Alderson + Holdings). */
function BillbackShareLink({ logId }: { logId: number }) {
  const utils = trpc.useUtils();
  const { data } = trpc.intercoRecharge.shareFor.useQuery({ logId });
  const create = trpc.intercoRecharge.shareCreate.useMutation({ onSuccess: () => utils.intercoRecharge.shareFor.invalidate({ logId }) });
  const revoke = trpc.intercoRecharge.shareRevoke.useMutation({ onSuccess: () => utils.intercoRecharge.shareFor.invalidate({ logId }) });
  const fileToDrive = trpc.intercoRecharge.fileToDrive.useMutation();
  const [copied, setCopied] = useState(false);
  const token = data?.token;
  const url = token ? `${window.location.origin}/share/billback/${token}` : "";

  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };

  if (!token) {
    return (
      <button type="button" className="mt-1 text-[11px] text-violet-700 hover:underline disabled:opacity-50"
        disabled={create.isPending} onClick={() => create.mutate({ logId })}>
        {create.isPending ? "Creating…" : "+ Create shareable worksheet link"}
      </button>
    );
  }
  return (
    <div className="mt-1 rounded-md border border-violet-200 bg-violet-50/40 p-2 space-y-1">
      <div className="flex items-center gap-2">
        <input readOnly value={url} className="flex-1 text-[11px] bg-white border rounded px-2 py-1 font-mono text-slate-600" onFocus={(e) => e.target.select()} />
        <button type="button" className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-slate-50" onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
        <a href={url} target="_blank" rel="noreferrer" className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-slate-50">Open</a>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="text-[11px] text-violet-700 hover:underline disabled:opacity-50"
          disabled={fileToDrive.isPending} onClick={() => fileToDrive.mutate({ logId })}>
          {fileToDrive.isPending ? "Filing…" : "File to both clients' Drive folders"}
        </button>
        <button type="button" className="text-[11px] text-slate-400 hover:underline" onClick={() => revoke.mutate({ logId })}>Revoke</button>
      </div>
      {fileToDrive.data && (
        <div className={`text-[11px] ${fileToDrive.data.ok ? "text-emerald-700" : "text-amber-700"}`}>
          {fileToDrive.data.ok
            ? `Filed: ${fileToDrive.data.filed.map((f: any) => f.clientName).join(", ")}${fileToDrive.data.skipped?.length ? ` · skipped: ${fileToDrive.data.skipped.join(", ")}` : ""}`
            : `Couldn't file (${fileToDrive.data.error}). ${(fileToDrive.data as any).detail || ""}`}
        </div>
      )}
    </div>
  );
}

/** Expandable dropdown that re-reads the POSTED Invoice (payer) + Bill (counterparty)
 *  live from QBO so you can see both records under the post and that they balance. */
function PostedRecords(props: {
  payerClientId: number; counterpartyClientId?: number; counterpartyName?: string;
  payerName: string; invoiceId: string; billId: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!props.defaultOpen);
  const fetchPosted = trpc.intercoRecharge.fetchPosted.useMutation();
  const d = fetchPosted.data;

  const load = () => fetchPosted.mutate({
    payerClientId: props.payerClientId,
    counterpartyClientId: props.counterpartyClientId,
    counterpartyName: props.counterpartyName,
    invoiceId: props.invoiceId, billId: props.billId,
  });

  // Auto-load on first open.
  useEffect(() => { if (open && !fetchPosted.data && !fetchPosted.isPending) load(); /* eslint-disable-next-line */ }, [open]);

  return (
    <div className="mt-1 rounded-md border border-slate-200 bg-slate-50/50">
      <button type="button" className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md"
        onClick={() => setOpen((o) => !o)}>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
        Posted records (both companies)
        {fetchPosted.isPending && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
        {d && d.ok && (
          <span className={`ml-auto inline-flex items-center gap-1 text-[11px] ${d.balances ? "text-emerald-600" : "text-red-600"}`}>
            {d.balances ? <><CheckCircle2 className="h-3 w-3" /> balances</> : <><AlertTriangle className="h-3 w-3" /> mismatch</>}
          </span>
        )}
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-2">
          {fetchPosted.isPending && <div className="text-xs text-slate-400">Reading the live records from QuickBooks…</div>}
          {d && !d.ok && (
            <div className="text-xs text-amber-700">
              {d.error === "bridge_not_returning_data"
                ? "The live QBO connection isn't returning data yet (bridge config — not the books)."
                : `Couldn't read the records (${d.error}).`}
              <button type="button" className="ml-2 underline text-slate-500" onClick={load}>retry</button>
            </div>
          )}
          {d && d.ok && (
            <>
              <div className="grid sm:grid-cols-2 gap-2">
                <PostedDocCard title={`Invoice — ${props.payerName}`} doc={d.invoice} />
                <PostedDocCard title={`Bill — ${props.counterpartyName || "Counterparty"}`} doc={d.bill} />
              </div>
              <div className={`text-xs rounded-md p-1.5 text-center ${d.balances ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                {d.balances
                  ? <>✓ Balanced — both documents total {money(d.invoice.total)} (invoice = bill).</>
                  : <>⚠ Mismatch — invoice {money(d.invoice.total)} vs bill {money(d.bill.total)}. Review before filing.</>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PostedDocCard({ title, doc }: { title: string; doc: any }) {
  return (
    <div className="rounded-lg border bg-white p-2">
      <div className="text-xs font-semibold text-slate-700 flex justify-between">
        <span>{title}</span>
        <span className="text-slate-400 font-normal">#{doc.docNumber} · {doc.date}</span>
      </div>
      <div className="text-[11px] text-slate-400 mb-1">{doc.type === "invoice" ? "Customer" : "Vendor"}: {doc.party || "—"}</div>
      <div className="max-h-40 overflow-auto divide-y text-xs">
        {doc.lines.map((l: any, i: number) => (
          <div key={i} className="flex items-center gap-2 py-0.5">
            <span className="flex-1 truncate text-slate-600">{l.description || l.account}</span>
            <span className="font-mono text-slate-700">{money(l.amount)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-xs flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono">{money(doc.subtotal)}</span></div>
      <div className="text-xs flex justify-between"><span className="text-slate-500">HST</span><span className="font-mono">{money(doc.hst)}</span></div>
      <div className="text-sm flex justify-between font-semibold"><span>Total</span><span className="font-mono">{money(doc.total)}</span></div>
      {typeof doc.balance === "number" && <div className="text-[11px] flex justify-between text-slate-400"><span>Open balance</span><span className="font-mono">{money(doc.balance)}</span></div>}
    </div>
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
