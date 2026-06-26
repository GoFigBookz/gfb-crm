import { useState, useEffect } from "react";
import { Bot, Plus, Trash2, AlertTriangle, TrendingUp, TrendingDown, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * TRADING BOT — OVERSIGHT only (track equity + flag drawdown), not management.
 * Liv watches this and flags Markie if it breaches its guardrails. Private.
 */
const money = (n: number) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${(n || 0).toFixed(1)}%`;

export default function TradingBot() {
  const q = trpc.phoenix.tradingOverview.useQuery();
  const d = q.data;
  const cfgSet = trpc.phoenix.tradingConfigSet.useMutation({ onSuccess: () => { q.refetch(); setEditCfg(false); } });
  const snapAdd = trpc.phoenix.tradingSnapshotAdd.useMutation({ onSuccess: () => { q.refetch(); setEquity(""); } });
  const snapRm = trpc.phoenix.tradingSnapshotRemove.useMutation({ onSuccess: () => q.refetch() });

  const [editCfg, setEditCfg] = useState(false);
  const [cfg, setCfg] = useState({ name: "", strategy: "", startingCapital: "", maxDrawdownPct: "20", rules: "" });
  const [equity, setEquity] = useState(""); const [note, setNote] = useState("");

  useEffect(() => {
    if (d?.cfg) setCfg({ name: d.cfg.name || "", strategy: d.cfg.strategy || "", startingCapital: String(d.cfg.startingCapital ?? ""), maxDrawdownPct: String(d.cfg.maxDrawdownPct ?? "20"), rules: d.cfg.rules || "" });
  }, [d?.cfg]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-violet-600" />
        <h3 className="font-semibold text-slate-800">Trading bot</h3>
        <span className="text-xs text-slate-400">oversight — Liv watches & flags (not managed here)</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditCfg((v) => !v)}>{d?.cfg ? "Edit setup" : "Set up"}</Button>
      </div>

      {d?.breach && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Drawdown {pct(d.drawdownPct)} has breached your {pct(d.maxDD)} guardrail — Liv would flag this for review.
        </div>
      )}

      {d && (d.snaps.length > 0 || d.cfg) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card><CardContent className="p-3"><div className="text-xs text-slate-500">Current equity</div><div className="text-xl font-bold text-slate-800">{money(d.current)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-slate-500">Total return</div><div className={`text-xl font-bold ${d.totalReturn >= 0 ? "text-emerald-700" : "text-red-600"}`}>{d.totalReturn >= 0 ? <TrendingUp className="h-4 w-4 inline mb-0.5" /> : <TrendingDown className="h-4 w-4 inline mb-0.5" />} {pct(d.totalReturn)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-slate-500">Drawdown</div><div className={`text-xl font-bold ${d.breach ? "text-red-600" : "text-slate-800"}`}>{pct(d.drawdownPct)}</div></CardContent></Card>
          <Card className={d.breach ? "border-red-300" : "border-emerald-200"}><CardContent className="p-3"><div className="text-xs text-slate-500">Guardrail</div><div className="text-sm font-medium text-slate-700 flex items-center gap-1">{d.breach ? <AlertTriangle className="h-4 w-4 text-red-500" /> : <ShieldCheck className="h-4 w-4 text-emerald-500" />} max {pct(d.maxDD)}</div></CardContent></Card>
        </div>
      )}

      {editCfg && (
        <Card><CardContent className="p-3 grid sm:grid-cols-2 gap-2">
          <Input placeholder="Bot name" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} />
          <Input placeholder="Strategy (e.g. grid, DCA)" value={cfg.strategy} onChange={(e) => setCfg({ ...cfg, strategy: e.target.value })} />
          <Input inputMode="decimal" placeholder="Starting capital" value={cfg.startingCapital} onChange={(e) => setCfg({ ...cfg, startingCapital: e.target.value })} />
          <Input inputMode="decimal" placeholder="Max drawdown % (alert)" value={cfg.maxDrawdownPct} onChange={(e) => setCfg({ ...cfg, maxDrawdownPct: e.target.value })} />
          <Input className="sm:col-span-2" placeholder="Guardrails / rules it must follow" value={cfg.rules} onChange={(e) => setCfg({ ...cfg, rules: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={cfgSet.isPending} onClick={() => cfgSet.mutate({ name: cfg.name || undefined, strategy: cfg.strategy || undefined, startingCapital: +cfg.startingCapital || 0, maxDrawdownPct: +cfg.maxDrawdownPct || 20, rules: cfg.rules || undefined })}>Save setup</Button>
            <Button size="sm" variant="outline" onClick={() => setEditCfg(false)}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-3">
        <div className="text-xs text-slate-500 mb-2">Log today's account value (so oversight can track the trend & drawdown):</div>
        <div className="flex flex-wrap items-end gap-2">
          <Input className="w-32" inputMode="decimal" placeholder="Account value" value={equity} onChange={(e) => setEquity(e.target.value)} />
          <Input className="flex-1 min-w-[140px]" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" disabled={!equity || snapAdd.isPending} onClick={() => { snapAdd.mutate({ equity: +equity, note: note || undefined }); setNote(""); }}><Plus className="h-4 w-4" /></Button>
        </div>
      </CardContent></Card>

      <div className="space-y-1">
        {(d?.snaps || []).slice().reverse().slice(0, 30).map((s: any) => (
          <div key={s.id} className="group flex items-center gap-2 text-sm border-b last:border-0 py-1">
            <span className="font-medium text-slate-800">{money(s.equity)}</span>
            {s.note && <span className="text-xs text-slate-500">{s.note}</span>}
            <span className="text-xs text-slate-400 ml-auto">{new Date(s.takenAt).toLocaleDateString()}</span>
            <button className="opacity-0 group-hover:opacity-100" onClick={() => snapRm.mutate({ id: s.id })}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
          </div>
        ))}
        {(d?.snaps || []).length === 0 && <p className="text-xs text-slate-400">No snapshots yet — log your account value to start oversight.</p>}
      </div>
    </div>
  );
}
