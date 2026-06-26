import { useState } from "react";
import { DollarSign, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * FIRM SUBSCRIPTIONS — what Markie bills each client vs his cost (the margin).
 * One row per client subscription (e.g. their QBO wholesale cost vs what he
 * charges them). Firm totals at the top.
 */
const money = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Subscriptions() {
  const list = trpc.subscriptions.list.useQuery();
  const clients = trpc.crmClient.list.useQuery(undefined, { staleTime: 60000 });
  const upsert = trpc.subscriptions.upsert.useMutation({ onSuccess: () => { list.refetch(); reset(); } });
  const remove = trpc.subscriptions.remove.useMutation({ onSuccess: () => list.refetch() });

  const [showAdd, setShowAdd] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const [label, setLabel] = useState(""); const [provider, setProvider] = useState("QuickBooks");
  const [cost, setCost] = useState(""); const [billed, setBilled] = useState("");
  const reset = () => { setShowAdd(false); setClientId(null); setLabel(""); setProvider("QuickBooks"); setCost(""); setBilled(""); };

  const t = list.data?.totals;
  const rows = list.data?.rows || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-6 w-6 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Firm Subscriptions</h1>
          <p className="text-sm text-slate-500">What you bill each client vs what it costs you — and your margin.</p>
        </div>
        <Button className="ml-auto" size="sm" onClick={() => setShowAdd((v) => !v)}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      {t && (
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-3"><div className="text-xs text-slate-500">Monthly cost</div><div className="text-xl font-bold text-slate-800">{money(t.monthlyCost)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-slate-500">Monthly billed</div><div className="text-xl font-bold text-slate-800">{money(t.monthlyBilled)}</div></CardContent></Card>
          <Card className={t.monthlyMargin >= 0 ? "border-lime-300" : "border-red-300"}><CardContent className="p-3"><div className="text-xs text-slate-500">Monthly margin · annual</div><div className={`text-xl font-bold ${t.monthlyMargin >= 0 ? "text-lime-700" : "text-red-600"}`}>{money(t.monthlyMargin)} <span className="text-sm font-normal text-slate-400">/ {money(t.annualMargin)} yr</span></div></CardContent></Card>
        </div>
      )}

      {showAdd && (
        <Card><CardContent className="p-3 grid gap-2 sm:grid-cols-3">
          <select className="border rounded px-2 py-2 text-sm bg-white" value={clientId ?? ""} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : null; setClientId(id); const c = (clients.data || []).find((x: any) => x.id === id); if (c) setLabel(c.company || c.name); }}>
            <option value="">Client (optional)…</option>
            {(clients.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
          </select>
          <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input placeholder="Provider (QuickBooks)" value={provider} onChange={(e) => setProvider(e.target.value)} />
          <Input inputMode="decimal" placeholder="Your cost / mo" value={cost} onChange={(e) => setCost(e.target.value)} />
          <Input inputMode="decimal" placeholder="You bill / mo" value={billed} onChange={(e) => setBilled(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={upsert.isPending || !label.trim()} onClick={() => upsert.mutate({ clientId, label: label.trim(), provider, monthlyCost: +cost || 0, monthlyBilled: +billed || 0 })}>Save</Button>
            <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500 border-b">
            <th className="p-2">Client / item</th><th className="p-2">Provider</th>
            <th className="p-2 text-right">Cost/mo</th><th className="p-2 text-right">Billed/mo</th><th className="p-2 text-right">Margin/mo</th><th className="p-2"></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-3 text-xs text-slate-400">No subscriptions yet — Add one above, or I can pre-load them from your ProAdvisor list.</td></tr>}
            {rows.map((r: any) => {
              const m = (Number(r.monthlyBilled) || 0) - (Number(r.monthlyCost) || 0);
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-2 text-slate-800">{r.clientCompany || r.clientName || r.label}</td>
                  <td className="p-2 text-slate-500">{r.provider}{r.tier ? ` · ${r.tier}` : ""}</td>
                  <td className="p-2 text-right">{money(r.monthlyCost)}</td>
                  <td className="p-2 text-right">{money(r.monthlyBilled)}</td>
                  <td className={`p-2 text-right font-medium ${m >= 0 ? "text-lime-700" : "text-red-600"}`}>{money(m)}</td>
                  <td className="p-2 text-right"><button className="p-1 rounded hover:bg-slate-100" onClick={() => { if (confirm("Remove this row?")) remove.mutate({ id: r.id }); }}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
