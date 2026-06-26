import { useState } from "react";
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * HST AUDIT — annual GST/HST reconciliation (CRA-filed vs QBO books).
 * Reconciles on the ANNUAL TOTAL (period swings are expected; the year must tie).
 * Enter the year's filed return totals + the book totals → verdict + the exact
 * line variances + plain-English notes to hand an accountant. No QBO changes.
 */
const LINES = [
  { key: "line101", label: "101 — Sales & revenue" },
  { key: "line103", label: "103 — HST collected" },
  { key: "line106", label: "106 — Input tax credits" },
  { key: "line109", label: "109 — Net tax" },
] as const;

type LineVals = { line101: string; line103: string; line106: string; line109: string };
const empty: LineVals = { line101: "", line103: "", line106: "", line109: "" };
const num = (v: LineVals) => ({ line101: +v.line101 || 0, line103: +v.line103 || 0, line106: +v.line106 || 0, line109: +v.line109 || 0 });

export default function HstAudit() {
  const clients = trpc.clients.list.useQuery(undefined, { staleTime: 60000 });
  const [clientLabel, setClientLabel] = useState("");
  const [fiscalYear, setFiscalYear] = useState("");
  const [filed, setFiled] = useState<LineVals>({ ...empty });
  const [books, setBooks] = useState<LineVals>({ ...empty });
  const run = trpc.hstAudit.run.useMutation();

  const onRun = () => run.mutate({
    clientLabel: clientLabel || "Client",
    fiscalYear,
    filed: [{ ...num(filed), periodLabel: `${fiscalYear} Annual`, startDate: "", endDate: "" }],
    books: [{ ...num(books), periodLabel: `${fiscalYear} Annual`, startDate: "", endDate: "" }],
  });
  const r = run.data;
  const vIcon = r?.verdict === "clean" ? <CheckCircle2 className="h-5 w-5 text-lime-600" /> : r?.verdict === "review" ? <AlertTriangle className="h-5 w-5 text-amber-500" /> : <XCircle className="h-5 w-5 text-red-600" />;
  const vColor = r?.verdict === "clean" ? "border-lime-300 bg-lime-50" : r?.verdict === "review" ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">HST / GST Audit</h1>
          <p className="text-sm text-slate-500">Reconcile a full fiscal year: what was filed to CRA vs the books. Period swings are fine — the <b>annual total</b> must tie.</p>
        </div>
      </div>

      <Card><CardContent className="p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <select className="border rounded px-2 py-2 text-sm bg-white min-w-[200px]" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)}>
            <option value="">Client (optional)…</option>
            {(clients.data || []).map((c: any) => <option key={c.id} value={c.company || c.name}>{c.company || c.name}</option>)}
          </select>
          <Input className="max-w-[160px]" placeholder="Fiscal year (e.g. 2025)" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} />
        </div>

        <div className="grid grid-cols-[1fr,auto,auto] gap-2 items-center text-sm">
          <div className="font-medium text-slate-500"></div>
          <div className="font-semibold text-slate-700 text-right w-32">Filed (CRA)</div>
          <div className="font-semibold text-slate-700 text-right w-32">Books (QBO)</div>
          {LINES.map((l) => (
            <FragmentRow key={l.key} label={l.label}
              filed={filed[l.key]} onFiled={(v) => setFiled({ ...filed, [l.key]: v })}
              book={books[l.key]} onBook={(v) => setBooks({ ...books, [l.key]: v })} />
          ))}
        </div>
        <Button onClick={onRun} disabled={run.isPending}>Run audit</Button>
      </CardContent></Card>

      {r && (
        <Card className={vColor}><CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-slate-800">{vIcon} {r.verdict === "clean" ? "Clean — the year ties." : r.verdict === "review" ? "Review — annual ties, but glance at the notes." : "Fail — the annual total does NOT tie."}</div>
          <div className="text-xs text-slate-600">
            {r.annual.lines.map((ln: any) => (
              <div key={ln.label} className={`flex justify-between py-0.5 ${ln.withinTolerance ? "" : "text-red-700 font-medium"}`}>
                <span>{ln.label}</span>
                <span>filed ${Number(ln.filed).toLocaleString()} · books ${Number(ln.book).toLocaleString()} {ln.withinTolerance ? "✓" : `· off $${Math.abs(ln.variance).toLocaleString()}`}</span>
              </div>
            ))}
          </div>
          {r.notes.length > 0 && <ul className="text-xs text-slate-700 list-disc pl-4 space-y-0.5 border-t pt-2">{r.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>}
        </CardContent></Card>
      )}
      {run.error && <p className="text-sm text-red-600">{run.error.message}</p>}
    </div>
  );
}

function FragmentRow({ label, filed, onFiled, book, onBook }: { label: string; filed: string; onFiled: (v: string) => void; book: string; onBook: (v: string) => void }) {
  return (
    <>
      <div className="text-slate-700">{label}</div>
      <Input className="w-32 text-right" inputMode="decimal" placeholder="0.00" value={filed} onChange={(e) => onFiled(e.target.value)} />
      <Input className="w-32 text-right" inputMode="decimal" placeholder="0.00" value={book} onChange={(e) => onBook(e.target.value)} />
    </>
  );
}
