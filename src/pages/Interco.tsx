import { useState, useMemo } from "react";
import { ArrowLeftRight, Plus, Trash2, Copy, CheckCircle2, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";

const money = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function Interco() {
  const utils = trpc.useUtils();
  const { data: clients } = trpc.interco.clients.useQuery();
  const { data: periods } = trpc.interco.listPeriods.useQuery();

  const [payerId, setPayerId] = useState<number | null>(null);
  const [period, setPeriod] = useState<string>(thisMonth());

  const selKey = payerId ? { period, payerClientId: payerId } : null;
  const { data: detail } = trpc.interco.getPeriod.useQuery(selKey!, { enabled: !!selKey });

  const refresh = () => { utils.interco.listPeriods.invalidate(); if (selKey) utils.interco.getPeriod.invalidate(selKey); };
  const upsert = trpc.interco.upsertPeriod.useMutation({ onSuccess: refresh });
  const setReadiness = trpc.interco.setReadiness.useMutation({ onSuccess: refresh, onError: (e) => alert(e.message) });
  const markPosted = trpc.interco.markPosted.useMutation({ onSuccess: refresh, onError: (e) => alert(e.message) });
  const addEntry = trpc.interco.addEntry.useMutation({ onSuccess: refresh, onError: (e) => alert(e.message) });
  const delEntry = trpc.interco.deleteEntry.useMutation({ onSuccess: refresh });

  // New-entry form state.
  const [cpId, setCpId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("payroll");

  const p = detail?.period;
  const je = detail?.je;
  const balanced = je?.balanced ?? true;

  const jeText = useMemo(() => {
    if (!je || je.lines.length === 0) return "";
    const rows = je.lines.map((l) => `${l.account}\t${l.debit ? money(l.debit) : ""}\t${l.credit ? money(l.credit) : ""}\t${l.description}`);
    return [`Interco JE — ${period} (${detail?.entries[0] ? "" : ""}payer ${clients?.find((c) => c.id === payerId)?.name ?? ""})`,
      "Account\tDebit\tCredit\tDescription", ...rows,
      `TOTAL\t${money(je.totalDebit)}\t${money(je.totalCredit)}\t`].join("\n");
  }, [je, period, payerId, clients, detail]);

  const payers = clients ?? [];
  const counterparties = (clients ?? []).filter((c) => c.id !== payerId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ArrowLeftRight className="h-6 w-6 text-lime-600" /> Inter-Company</h1>
        <p className="text-slate-500">Monthly bill-backs between related entities (e.g. 2303851 fronts Motion Invest / Seahorse payroll) → a reviewed draft settlement JE.</p>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-3 text-sm text-amber-900 flex items-start gap-2">
          <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span><b>Review-only.</b> Figgy never posts to QBO — this builds a draft JE for you to post by hand. Once the live QBO connection is on, entries pull from QBO and the readiness gate checks automatically. Accounts are picked from your locked chart — never invented.</span>
        </CardContent>
      </Card>

      {/* Period picker */}
      <Card>
        <CardContent className="py-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Paying entity (fronts the costs)</label>
            <select className="border rounded-md px-3 py-2 text-sm min-w-[220px]" value={payerId ?? ""} onChange={(e) => setPayerId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Select entity…</option>
              {payers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Month</label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-[160px]" />
          </div>
        </CardContent>
      </Card>

      {!payerId && (
        <p className="text-slate-500 text-sm px-1">Pick a paying entity and month to start, or open a recent period below.</p>
      )}

      {payerId && (
        <>
          {/* Readiness gate */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">Readiness gate</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4"
                  checked={!!p?.sourcePosted}
                  onChange={(e) => { if (p?.id) setReadiness.mutate({ id: p.id, sourcePosted: e.target.checked }); else upsert.mutate({ period, payerClientId: payerId }, { onSuccess: () => refresh() }); }}
                  disabled={!p?.id} />
                <span>All source transactions + Visa statements for this month are <b>posted in QBO</b>.</span>
              </label>
              {!p?.id && <p className="text-xs text-slate-400">Add an entry (or save accounts) to create this period, then the gate unlocks.</p>}
              <div className="flex items-center gap-2">
                {p?.status === "posted" ? <Badge className="bg-slate-600">Posted{p.postedJeRef ? ` · JE ${p.postedJeRef}` : ""}</Badge>
                  : p?.sourcePosted ? <Badge className="bg-emerald-600">Ready to post</Badge>
                  : <Badge variant="outline">Open — gate not confirmed</Badge>}
              </div>
            </CardContent>
          </Card>

          {/* Accounts (locked chart) */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">JE accounts (from your locked chart)</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[240px]">
                <label className="text-xs font-medium text-slate-500 block mb-1">Interco account (Due to/from)</label>
                <Input defaultValue={p?.intercoAccount ?? ""} placeholder="e.g. 1310 Interco:2303851 Ontario"
                  onBlur={(e) => upsert.mutate({ period, payerClientId: payerId, intercoAccount: e.target.value })} />
              </div>
              <div className="flex-1 min-w-[240px]">
                <label className="text-xs font-medium text-slate-500 block mb-1">Offset / contra account</label>
                <Input defaultValue={p?.offsetAccount ?? ""} placeholder="e.g. bank / clearing / expense"
                  onBlur={(e) => upsert.mutate({ period, payerClientId: payerId, offsetAccount: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          {/* Entries */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Bill-back entries</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {/* add form */}
              <div className="flex flex-wrap items-end gap-2 border-b pb-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Counterparty (owes the payer)</label>
                  <select className="border rounded-md px-3 py-2 text-sm min-w-[200px]" value={cpId ?? ""} onChange={(e) => setCpId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Select…</option>
                    {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Amount</label>
                  <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-[130px]" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Category</label>
                  <select className="border rounded-md px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="payroll">Payroll</option>
                    <option value="expense">Expense reimb</option>
                    <option value="reclass">Reclass</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="text-xs text-slate-500 block mb-1">Memo</label>
                  <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Paid by 230 — MI payroll" />
                </div>
                <Button disabled={!cpId || !amount || addEntry.isPending}
                  onClick={() => { addEntry.mutate({ period, payerClientId: payerId, counterpartyClientId: cpId!, amount: Number(amount), description: desc, category }); setAmount(""); setDesc(""); setCpId(null); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>

              {/* list */}
              {(detail?.entries.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-400">No entries yet for this month.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b"><th className="py-1">Counterparty</th><th>Category</th><th>Memo</th><th className="text-right">Amount</th><th></th></tr></thead>
                  <tbody>
                    {detail!.entries.map((e: any) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="py-1.5">{e.counterpartyName}</td>
                        <td className="text-slate-500">{e.category}</td>
                        <td className="text-slate-500">{e.description}</td>
                        <td className="text-right tabular-nums">{money(e.amount)}</td>
                        <td className="text-right"><button onClick={() => delEntry.mutate({ id: e.id })} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* net summary */}
              {(detail?.summary.length ?? 0) > 0 && (
                <div className="text-sm text-slate-600 pt-1">
                  Net owed to {clients?.find((c) => c.id === payerId)?.name}:{" "}
                  {detail!.summary.map((s: any) => <Badge key={s.counterpartyClientId} variant="outline" className="mr-1">{s.name}: {money(s.net)}</Badge>)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Draft JE */}
          {je && je.lines.length > 0 && (
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-base">Draft settlement JE</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(jeText)}><Copy className="h-4 w-4 mr-1" /> Copy</Button>
                  <Button size="sm" disabled={!p?.sourcePosted || p?.status === "posted"}
                    onClick={() => { const ref = prompt("QBO JE number (optional):") ?? undefined; if (p?.id) markPosted.mutate({ id: p.id, postedJeRef: ref }); }}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Mark posted
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!balanced && <p className="text-red-600 text-sm mb-2">⚠ JE does not balance — check entries/accounts.</p>}
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b"><th className="py-1">Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th>Description</th></tr></thead>
                  <tbody>
                    {je.lines.map((l, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5">{l.account}</td>
                        <td className="text-right tabular-nums">{l.debit ? money(l.debit) : ""}</td>
                        <td className="text-right tabular-nums">{l.credit ? money(l.credit) : ""}</td>
                        <td className="text-slate-500">{l.description}</td>
                      </tr>
                    ))}
                    <tr className="font-medium"><td className="py-1.5">TOTAL</td><td className="text-right tabular-nums">{money(je.totalDebit)}</td><td className="text-right tabular-nums">{money(je.totalCredit)}</td><td></td></tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Recent periods */}
      {(periods?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recent periods</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b"><th className="py-1">Month</th><th>Payer</th><th className="text-right">Total</th><th>Entries</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {periods!.map((row: any) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-1.5">{row.period}</td>
                    <td>{row.payerName}</td>
                    <td className="text-right tabular-nums">{money(row.total)}</td>
                    <td>{row.entryCount}</td>
                    <td>{row.status === "posted" ? <Badge className="bg-slate-600">Posted</Badge> : row.sourcePosted ? <Badge className="bg-emerald-600">Ready</Badge> : <Badge variant="outline">Open</Badge>}</td>
                    <td className="text-right"><Button variant="ghost" size="sm" onClick={() => { setPayerId(row.payerClientId); setPeriod(row.period); }}>Open</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
