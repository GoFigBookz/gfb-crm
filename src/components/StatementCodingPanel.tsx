import HelpButton from "@/components/HelpButton";
import { useState } from "react";
import { FileUp, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";

/**
 * STATEMENT CODING panel (Markie 2026-06-27: "my biggest time-sink is posting +
 * reconciling from Hubdoc, bank feeds, credit-card statements").
 * ---------------------------------------------------------------------------
 * Drop/paste a bank or credit-card CSV → Fig codes every spend row through the
 * vendor brain → review a coded list (account + tax + traffic-light) instead of
 * coding every line by hand. Greens are vendors Fig is confident on (history or a
 * confirmed rule); yellow/red need a look. READ-ONLY — nothing posts (golden rule).
 */
const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

const dot = (t: string) =>
  t === "green" ? "bg-emerald-500" : t === "yellow" ? "bg-amber-400" : t === "inflow" ? "bg-sky-400" : "bg-red-500";

export default function StatementCodingPanel({ clientId }: { clientId: number }) {
  const [text, setText] = useState("");
  const code = trpc.statementCoding.code.useMutation();

  const onPaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value);
  const onFile = async (file?: File | null) => {
    if (!file) return;
    const t = await file.text();
    setText(t);
  };

  const run = () => { if (text.trim()) code.mutate({ clientId, csvText: text }); };

  const res = code.data && "ok" in code.data && code.data.ok ? code.data : null;
  const failed = code.data && "ok" in code.data && !code.data.ok ? code.data : null;

  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <FileUp className="h-4 w-4 text-lime-600" />
        <span className="text-sm font-semibold text-slate-700">Statement coding</span>
        <HelpButton id="statement-coding" />
        <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 rounded px-1">READ-ONLY</span>
      </div>
      <p className="text-xs text-slate-500">
        Paste (or drop) a bank / credit-card CSV. Fig codes every spend row — account, tax,
        confidence — so you review a coded list instead of coding each line. Nothing posts.
      </p>

      <textarea
        value={text} onChange={onPaste}
        placeholder={"Date,Description,Amount\n2026-06-03,TIM HORTONS #482,-12.45\n2026-06-04,BELL CANADA,-118.00\n…  (Debit/Credit columns also work)"}
        className="w-full h-28 rounded border border-slate-300 px-2 py-1.5 text-xs font-mono"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={run} disabled={!text.trim() || code.isPending}>
          {code.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span className="ml-1">Code statement</span>
        </Button>
        <label className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer">
          or upload CSV
          <input type="file" accept=".csv,text/csv,text/plain" className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>

      {failed && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{(failed as any).message || (failed as any).error}</span>
        </div>
      )}

      {res && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span><b>{res.summary.spend}</b> spend rows · {money(res.summary.spendTotal)}</span>
            <span className="text-emerald-600">🟢 {res.summary.green} ({money(res.summary.autoCodableTotal)})</span>
            <span className="text-amber-600">🟡 {res.summary.yellow}</span>
            <span className="text-red-600">🔴 {res.summary.red}</span>
            {res.summary.inflow > 0 && <span className="text-sky-600">↓ {res.summary.inflow} money-in</span>}
          </div>
          {res.summary.truncated && (
            <div className="text-[11px] text-amber-600">Showing the first 500 rows — split a larger statement to code the rest.</div>
          )}
          <div className="max-h-96 overflow-auto rounded border border-slate-100">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1 font-medium">Date</th>
                  <th className="text-left px-2 py-1 font-medium">Description</th>
                  <th className="text-right px-2 py-1 font-medium">Amount</th>
                  <th className="text-left px-2 py-1 font-medium">Fig's coding</th>
                </tr>
              </thead>
              <tbody>
                {res.rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-1 whitespace-nowrap text-slate-500">{r.date}</td>
                    <td className="px-2 py-1 text-slate-700 max-w-[200px] truncate" title={r.description}>{r.description}</td>
                    <td className={`px-2 py-1 text-right whitespace-nowrap ${r.amount < 0 ? "text-slate-700" : "text-sky-600"}`}>{money(r.amount)}</td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${dot(r.triage)}`} />
                        <span className="text-slate-700">
                          {r.triage === "inflow" ? <span className="text-slate-400">money in</span>
                            : r.accountName ? <>{r.accountName}{r.taxCode ? ` · tax ${r.taxCode}` : ""}{r.confidence != null ? ` · ${r.confidence}%` : ""}</>
                            : <span className="text-slate-400">needs review</span>}
                        </span>
                      </div>
                      {r.triage !== "inflow" && r.rationale && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[260px]" title={r.rationale}>{r.rationale}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">
            Read-only suggestions. Posting to QuickBooks lands once QBO write is on — for now this
            cuts the coding work; greens are vendors Fig is confident on (history or a locked rule).
          </p>
        </div>
      )}
    </div>
  );
}
