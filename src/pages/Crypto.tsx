/**
 * CRYPTO BOOKS — turn a crypto client's report into CRA-ready numbers.
 * =============================================================================
 * Paste the report the client sends (any exchange/wallet CSV). It detects the
 * columns, values each line in CAD (using the report's value, or CoinGecko for
 * gaps), then runs the adjusted-cost-base engine to give you realized capital
 * gains/losses, current holdings value, and mining/staking income — all
 * editable + review-gated before you book anything.
 * For Adbank, Motion Invest, and any crypto client.
 * =============================================================================
 */
import { useState } from "react";
import { Bitcoin, Loader2, AlertTriangle, Calculator, Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { buildCryptoJournal } from "../../api/crypto-core";

type Row = { date: string; asset: string; direction: "acquire" | "dispose"; qty: number; cadValue: number; feeCad: number; income: boolean; rawType?: string };
const money = (n: number) => (n || 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export default function Crypto() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [report, setReport] = useState<any>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [acc, setAcc] = useState({ digitalAssets: "Digital Assets", realizedGain: "Realized Gain/Loss on Crypto", miningIncome: "Crypto Mining Income", clearing: "Crypto Clearing" });
  const [periodEnd, setPeriodEnd] = useState(today);

  const parse = trpc.crypto.parse.useMutation({
    onSuccess: (r: any) => {
      setRows(r.rows.map((x: any) => ({ ...x })));
      setWarnings([...(r.warnings || []), ...(r.unsupportedForPricing?.length ? [`No auto-pricing for: ${r.unsupportedForPricing.join(", ")} — enter the CAD value manually.`] : [])]);
      setReport(null);
    },
    onError: (e) => setWarnings([e.message]),
  });
  const analyze = trpc.crypto.analyze.useMutation({
    onSuccess: (r: any) => setReport(r),
    onError: (e) => setWarnings((w) => [...w, e.message]),
  });

  const upd = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const del = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const addRow = () => setRows((rs) => [...rs, { date: "", asset: "", direction: "acquire", qty: 0, cadValue: 0, feeCad: 0, income: false }]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Bitcoin className="h-7 w-7 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold">Crypto Books</h1>
          <p className="text-sm text-slate-500">Paste the client's report → CAD-valued capital gains, holdings, and mining income. CRA adjusted-cost-base method.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">1 · Paste the report</CardTitle>
          <CardDescription>Any exchange/wallet CSV — Newton, Bitbuy, Coinbase, Kraken, etc. Needs columns for date, type (buy/sell/mining…), asset, amount; a CAD value column is used if present.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="font-mono text-xs" placeholder={"Date,Type,Asset,Amount,CAD Value,Fee\n2026-01-10,Buy,BTC,0.5,40000,20\n2026-02-01,Mining Reward,BTC,0.02,1500\n2026-03-10,Sell,BTC,0.3,30000,25"} />
          <div className="flex gap-2">
            <Button className="bg-amber-500 hover:bg-amber-600" disabled={!text.trim() || parse.isPending} onClick={() => parse.mutate({ text })}>
              {parse.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Reading…</> : "Read report"}
            </Button>
            {rows.length > 0 && <Button variant="outline" onClick={addRow}><Plus className="h-4 w-4 mr-1" /> Add row</Button>}
          </div>
        </CardContent>
      </Card>

      {warnings.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-800">
            {warnings.map((w, i) => <div key={i} className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {w}</div>)}
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">2 · Review the transactions ({rows.length})</CardTitle>
            <Button className="bg-amber-500 hover:bg-amber-600" disabled={analyze.isPending} onClick={() => analyze.mutate({ rows })}>
              {analyze.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Valuing + calculating…</> : <><Calculator className="h-4 w-4 mr-1" /> Calculate gains</>}
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500 border-b">
                <th className="py-1 pr-2">Date</th><th className="pr-2">Asset</th><th className="pr-2">Direction</th><th className="pr-2 text-right">Qty</th><th className="pr-2 text-right">CAD value</th><th className="pr-2 text-right">Fee</th><th className="pr-2">Income?</th><th></th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1 pr-2"><Input className="h-7 w-28 text-xs" value={r.date} onChange={(e) => upd(i, { date: e.target.value })} /></td>
                    <td className="pr-2"><Input className="h-7 w-16 text-xs" value={r.asset} onChange={(e) => upd(i, { asset: e.target.value.toUpperCase() })} /></td>
                    <td className="pr-2">
                      <select className="h-7 text-xs border rounded px-1" value={r.direction} onChange={(e) => upd(i, { direction: e.target.value as any })}>
                        <option value="acquire">acquire</option><option value="dispose">dispose</option>
                      </select>
                    </td>
                    <td className="pr-2 text-right"><Input className="h-7 w-20 text-xs text-right" type="number" value={r.qty} onChange={(e) => upd(i, { qty: parseFloat(e.target.value) || 0 })} /></td>
                    <td className="pr-2 text-right"><Input className="h-7 w-24 text-xs text-right" type="number" value={r.cadValue} onChange={(e) => upd(i, { cadValue: parseFloat(e.target.value) || 0 })} placeholder="auto" /></td>
                    <td className="pr-2 text-right"><Input className="h-7 w-16 text-xs text-right" type="number" value={r.feeCad} onChange={(e) => upd(i, { feeCad: parseFloat(e.target.value) || 0 })} /></td>
                    <td className="pr-2 text-center"><input type="checkbox" checked={r.income} onChange={(e) => upd(i, { income: e.target.checked })} /></td>
                    <td><Button size="sm" variant="ghost" className="h-6 px-1 text-red-400" onClick={() => del(i)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-400 mt-2">Leave CAD value blank/0 to auto-price from CoinGecko. Tick "Income?" for mining/staking/airdrop receipts (business income).</p>
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Realized gain/loss" value={money(report.result.totals.gainLoss)} tone={report.result.totals.gainLoss >= 0 ? "good" : "bad"} />
            <Stat label="Proceeds" value={money(report.result.totals.proceeds)} />
            <Stat label="Holdings (market)" value={money(report.marketValueTotal)} />
            <Stat label="Mining/staking income" value={money(report.incomeTotal)} />
          </div>

          {(report.unpriced?.length > 0 || report.cappedPricing) && (
            <Card className="border-amber-300 bg-amber-50"><CardContent className="py-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              {report.unpriced.length} row(s) couldn't be auto-priced{report.cappedPricing ? " (pricing capped for a large report)" : ""} — enter their CAD value manually and recalculate.
            </CardContent></Card>
          )}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Realized dispositions</CardTitle><CardDescription>Capital gain/loss per disposal (CRA: 50% of net gain is taxable; confirm capital vs business treatment).</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500 border-b"><th className="py-1 pr-2">Date</th><th className="pr-2">Asset</th><th className="pr-2 text-right">Qty</th><th className="pr-2 text-right">Proceeds</th><th className="pr-2 text-right">Cost base (ACB)</th><th className="pr-2 text-right">Gain/Loss</th></tr></thead>
                <tbody>
                  {report.result.disposals.map((d: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 pr-2">{d.date}</td><td className="pr-2">{d.asset}{d.oversold ? <Badge variant="outline" className="ml-1 text-[9px] bg-red-50 text-red-600">oversold</Badge> : null}</td>
                      <td className="pr-2 text-right">{d.qty}</td><td className="pr-2 text-right">{money(d.proceeds)}</td><td className="pr-2 text-right">{money(d.costBasis)}</td>
                      <td className={`pr-2 text-right font-medium ${d.gainLoss >= 0 ? "text-lime-700" : "text-red-600"}`}>{money(d.gainLoss)}</td>
                    </tr>
                  ))}
                  {report.result.disposals.length === 0 && <tr><td colSpan={6} className="py-2 text-slate-400">No disposals in this report.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Holdings at period-end</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500 border-b"><th className="py-1 pr-2">Asset</th><th className="pr-2 text-right">Qty</th><th className="pr-2 text-right">ACB</th><th className="pr-2 text-right">Market value</th><th className="pr-2 text-right">Unrealized</th></tr></thead>
                <tbody>
                  {report.valuedHoldings.map((h: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 pr-2">{h.asset}</td><td className="pr-2 text-right">{h.qty}</td><td className="pr-2 text-right">{money(h.acb)}</td>
                      <td className="pr-2 text-right">{h.marketValue ? money(h.marketValue) : "—"}</td>
                      <td className={`pr-2 text-right ${h.unrealized >= 0 ? "text-lime-700" : "text-red-600"}`}>{h.marketValue ? money(h.unrealized) : "—"}</td>
                    </tr>
                  ))}
                  {report.valuedHoldings.length === 0 && <tr><td colSpan={5} className="py-2 text-slate-400">No remaining holdings.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* QBO JOURNAL EXPORT — balanced draft JE, review-only (never auto-posts). */}
          {(() => {
            const je = buildCryptoJournal(report.result.totals, report.incomeTotal, periodEnd, acc);
            const downloadCsv = () => {
              const header = "JournalDate,Account,Debit,Credit,Memo";
              const body = je.lines.map((l: any) => `${periodEnd},"${l.account}",${l.debit || ""},${l.credit || ""},"${l.memo}"`).join("\n");
              const blob = new Blob([header + "\n" + body], { type: "text/csv" });
              const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `crypto-journal-${periodEnd}.csv`; a.click();
            };
            return (
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">QBO journal entry {je.balanced ? <Badge variant="outline" className="ml-1 text-[10px] bg-lime-50 text-lime-700">balanced</Badge> : <Badge variant="outline" className="ml-1 text-[10px] bg-red-50 text-red-600">unbalanced</Badge>}</CardTitle>
                    <CardDescription>Draft only — review, then enter/import into QuickBooks. Figgy never auto-posts.</CardDescription>
                  </div>
                  <Button variant="outline" disabled={!je.lines.length} onClick={downloadCsv}>Download CSV</Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div><label className="text-[11px] text-slate-500">Period end</label><Input className="h-8 text-xs" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
                    <div><label className="text-[11px] text-slate-500">Crypto asset acct</label><Input className="h-8 text-xs" value={acc.digitalAssets} onChange={(e) => setAcc({ ...acc, digitalAssets: e.target.value })} /></div>
                    <div><label className="text-[11px] text-slate-500">Gain/Loss acct</label><Input className="h-8 text-xs" value={acc.realizedGain} onChange={(e) => setAcc({ ...acc, realizedGain: e.target.value })} /></div>
                    <div><label className="text-[11px] text-slate-500">Mining income acct</label><Input className="h-8 text-xs" value={acc.miningIncome} onChange={(e) => setAcc({ ...acc, miningIncome: e.target.value })} /></div>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-slate-500 border-b"><th className="py-1 pr-2">Account</th><th className="pr-2 text-right">Debit</th><th className="pr-2 text-right">Credit</th><th className="pr-2">Memo</th></tr></thead>
                    <tbody>
                      {je.lines.map((l: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1 pr-2">{l.account}</td>
                          <td className="pr-2 text-right">{l.debit ? money(l.debit) : ""}</td>
                          <td className="pr-2 text-right">{l.credit ? money(l.credit) : ""}</td>
                          <td className="pr-2 text-slate-500">{l.memo}</td>
                        </tr>
                      ))}
                      {je.lines.length === 0 && <tr><td colSpan={4} className="py-2 text-slate-400">Nothing to post for this report.</td></tr>}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <Card><CardContent className="py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${tone === "good" ? "text-lime-700" : tone === "bad" ? "text-red-600" : ""}`}>{value}</p>
    </CardContent></Card>
  );
}
