/**
 * CASH BOOK — internal client tab.
 * A simple, accurate cash book for micro-clients / holding companies that don't
 * warrant a full QBO file: money in / money out, categorized, with a running
 * balance, a bank reconciliation, and a year-end category summary for the T2.
 * Per-client (scoped by clientId). Read-only math on the server; nothing posts to QBO.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import HelpButton from "@/components/HelpButton";
import { Plus, Trash2, Check, BookOpen, Scale, Download, CheckCircle2, AlertCircle } from "lucide-react";

const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
const todayIso = () => new Date().toISOString().slice(0, 10);

export function CashBookTab({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const accounts = trpc.cashBook.accounts.useQuery({ clientId });
  const [accountId, setAccountId] = useState<number | null>(null);
  const activeId = accountId ?? accounts.data?.[0]?.id ?? null;

  const cats = trpc.cashBook.defaultCategories.useQuery();
  const register = trpc.cashBook.register.useQuery({ clientId, accountId: activeId! }, { enabled: !!activeId });
  const summary = trpc.cashBook.summary.useQuery({ clientId, accountId: activeId! }, { enabled: !!activeId });

  const refresh = () => {
    utils.cashBook.register.invalidate();
    utils.cashBook.summary.invalidate();
    utils.cashBook.accounts.invalidate();
  };

  const createAccount = trpc.cashBook.createAccount.useMutation({ onSuccess: () => { utils.cashBook.accounts.invalidate(); setShowNewAccount(false); } });
  const removeAccount = trpc.cashBook.removeAccount.useMutation({ onSuccess: () => { setAccountId(null); refresh(); } });
  const updateAccount = trpc.cashBook.updateAccount.useMutation({ onSuccess: refresh });
  const addEntry = trpc.cashBook.addEntry.useMutation({ onSuccess: refresh });
  const setCleared = trpc.cashBook.setCleared.useMutation({ onSuccess: refresh });
  const removeEntry = trpc.cashBook.removeEntry.useMutation({ onSuccess: refresh });

  const [showNewAccount, setShowNewAccount] = useState(false);
  const [na, setNa] = useState({ name: "", institution: "", openingBalance: "0", openingDate: todayIso() });

  // new-entry draft
  const blankEntry = { entryDate: todayIso(), direction: "out" as "in" | "out", amount: "", category: "", description: "", reference: "", hst: "", cleared: false };
  const [draft, setDraft] = useState(blankEntry);
  const [entryErr, setEntryErr] = useState<string>("");

  // reconcile
  const [stmtBal, setStmtBal] = useState("");
  const recQuery = trpc.cashBook.reconcile.useQuery(
    { clientId, accountId: activeId!, statementBalance: parseFloat(stmtBal) || 0 },
    { enabled: !!activeId && stmtBal.trim() !== "" },
  );

  const acct = register.data?.account;
  const catOptions = useMemo(() => (cats.data || []).filter((c) => c.direction === draft.direction), [cats.data, draft.direction]);

  const submitEntry = () => {
    setEntryErr("");
    const amount = parseFloat(draft.amount);
    if (!amount || amount <= 0) { setEntryErr("Enter a positive amount."); return; }
    addEntry.mutate({
      clientId, accountId: activeId!,
      entryDate: draft.entryDate, direction: draft.direction, amount,
      category: draft.category || undefined, description: draft.description || undefined,
      reference: draft.reference || undefined, hst: draft.hst ? parseFloat(draft.hst) : undefined,
      cleared: draft.cleared,
    }, {
      onSuccess: (r: any) => { if (r?.ok) setDraft({ ...blankEntry, direction: draft.direction }); else setEntryErr(r?.problems?.[0]?.message || "Could not save."); },
    });
  };

  const exportCsv = () => {
    if (!register.data) return;
    const head = ["Date", "Direction", "Amount", "HST", "Category", "Description", "Reference", "Cleared", "Balance"];
    const rows = register.data.rows.slice().reverse().map((r: any) => [
      r.entryDate, r.direction, r.amount, r.hst ?? "", r.category ?? "", (r.description ?? "").replace(/,/g, " "), r.reference ?? "", r.cleared ? "yes" : "no", r.balance,
    ]);
    const csv = [head, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cashbook-${acct?.name || "account"}.csv`.replace(/\s+/g, "-");
    a.click();
  };

  // ── No accounts yet ──
  if (accounts.data && accounts.data.length === 0 && !showNewAccount) {
    return (
      <div className="space-y-3 mt-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-emerald-600" />
          <h3 className="font-semibold text-slate-800">Cash book</h3>
          <HelpButton id="cash-book" />
        </div>
        <Card><CardContent className="p-6 text-center space-y-3">
          <p className="text-sm text-slate-600">A simple money-in / money-out book for a client that doesn't need full QuickBooks — perfect for a holding company or a very small business. Add the bank account to start.</p>
          <Button onClick={() => setShowNewAccount(true)}><Plus className="h-4 w-4 mr-1" /> Add an account</Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2 flex-wrap">
        <BookOpen className="h-5 w-5 text-emerald-600" />
        <h3 className="font-semibold text-slate-800">Cash book</h3>
        <HelpButton id="cash-book" />
        {(accounts.data?.length || 0) > 0 && (
          <select className="ml-2 border rounded px-2 py-1 text-sm bg-white" value={activeId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts.data!.map((a: any) => <option key={a.id} value={a.id}>{a.name}{a.institution ? ` — ${a.institution}` : ""}</option>)}
          </select>
        )}
        <Button size="sm" variant="outline" onClick={() => setShowNewAccount(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Account</Button>
        {register.data && <Button size="sm" variant="ghost" onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>}
      </div>

      {showNewAccount && (
        <Card><CardContent className="p-3 space-y-2">
          <div className="text-sm font-semibold text-slate-700">New cash-book account</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <Input placeholder="Name (e.g. Operating chequing)" value={na.name} onChange={(e) => setNa({ ...na, name: e.target.value })} />
            <Input placeholder="Institution (optional)" value={na.institution} onChange={(e) => setNa({ ...na, institution: e.target.value })} />
            <div><label className="text-xs text-slate-500">Opening balance</label><Input type="number" value={na.openingBalance} onChange={(e) => setNa({ ...na, openingBalance: e.target.value })} /></div>
            <div><label className="text-xs text-slate-500">As of date</label><Input type="date" value={na.openingDate} onChange={(e) => setNa({ ...na, openingDate: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={!na.name || createAccount.isPending} onClick={() => createAccount.mutate({ clientId, name: na.name, institution: na.institution || undefined, openingBalance: parseFloat(na.openingBalance) || 0, openingDate: na.openingDate })}>Create</Button>
            <Button size="sm" variant="outline" onClick={() => setShowNewAccount(false)}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      {/* Summary cards */}
      {register.data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Current balance" value={money(register.data.currentBalance)} accent />
          <Stat label="Money in" value={money(summary.data?.totals.totalIn || 0)} pos />
          <Stat label="Money out" value={money(summary.data?.totals.totalOut || 0)} neg />
          <Stat label="Net" value={money(summary.data?.totals.net || 0)} />
        </div>
      )}

      {/* Add entry */}
      {activeId && (
        <Card><CardContent className="p-3 space-y-2">
          <div className="text-sm font-semibold text-slate-700">Add a transaction</div>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <Input type="date" value={draft.entryDate} onChange={(e) => setDraft({ ...draft, entryDate: e.target.value })} />
            <select className="border rounded px-2 text-sm bg-white" value={draft.direction} onChange={(e) => setDraft({ ...draft, direction: e.target.value as any, category: "" })}>
              <option value="out">Money out</option>
              <option value="in">Money in</option>
            </select>
            <Input type="number" placeholder="Amount" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            <Input type="number" placeholder="HST (opt)" value={draft.hst} onChange={(e) => setDraft({ ...draft, hst: e.target.value })} />
            <select className="border rounded px-2 text-sm bg-white col-span-2 sm:col-span-1" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              <option value="">— category —</option>
              {catOptions.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <Input placeholder="Reference (cheque #)" value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-600 flex items-center gap-1"><input type="checkbox" checked={draft.cleared} onChange={(e) => setDraft({ ...draft, cleared: e.target.checked })} /> Cleared bank</label>
              <Button size="sm" disabled={addEntry.isPending} onClick={submitEntry}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
              {entryErr && <span className="text-xs text-red-600">{entryErr}</span>}
            </div>
          </div>
        </CardContent></Card>
      )}

      {/* Register table */}
      {register.data && (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr><th className="text-left p-2">Date</th><th className="text-left p-2">Description</th><th className="text-left p-2">Category</th><th className="text-right p-2">In</th><th className="text-right p-2">Out</th><th className="text-right p-2">Balance</th><th className="text-center p-2">Clr</th><th></th></tr>
            </thead>
            <tbody>
              {register.data.rows.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-slate-400">No transactions yet.</td></tr>}
              {register.data.rows.map((r: any) => (
                <tr key={r.id} className="border-t border-slate-100 group">
                  <td className="p-2 whitespace-nowrap text-slate-600">{r.entryDate}</td>
                  <td className="p-2"><div className="text-slate-800">{r.description || <span className="text-slate-300">—</span>}</div>{r.reference && <div className="text-xs text-slate-400">#{r.reference}</div>}</td>
                  <td className="p-2 text-slate-500">{r.category || "—"}{r.hst ? <span className="text-xs text-slate-400"> (HST {money(r.hst)})</span> : null}</td>
                  <td className="p-2 text-right text-emerald-700">{r.direction === "in" ? money(r.amount) : ""}</td>
                  <td className="p-2 text-right text-red-600">{r.direction === "out" ? money(r.amount) : ""}</td>
                  <td className="p-2 text-right font-medium text-slate-800">{money(r.balance)}</td>
                  <td className="p-2 text-center">
                    <button title={r.cleared ? "Cleared" : "Mark cleared"} onClick={() => setCleared.mutate({ id: r.id, clientId, cleared: !r.cleared })}>
                      <Check className={`h-4 w-4 ${r.cleared ? "text-emerald-600" : "text-slate-300"}`} />
                    </button>
                  </td>
                  <td className="p-2"><button className="opacity-0 group-hover:opacity-100" onClick={() => { if (confirm("Delete this transaction?")) removeEntry.mutate({ id: r.id, clientId }); }}><Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {/* Reconciliation + year-end summary */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card><CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2"><Scale className="h-4 w-4 text-indigo-600" /><span className="text-sm font-semibold text-slate-700">Bank reconciliation</span></div>
          <p className="text-xs text-slate-500">Enter the closing balance from the bank statement. It's compared to your <b>cleared</b> book balance — uncleared items (cheques not yet cashed) are still in transit.</p>
          <Input type="number" placeholder="Statement closing balance" value={stmtBal} onChange={(e) => setStmtBal(e.target.value)} />
          {recQuery.data && (
            <div className="text-sm space-y-1">
              <Row k="Cleared book balance" v={money(recQuery.data.clearedBalance)} />
              <Row k="Statement balance" v={money(recQuery.data.statementBalance)} />
              <Row k="Uncleared in transit" v={`${money(recQuery.data.unclearedTotal)} (${recQuery.data.unclearedCount})`} />
              <div className={`flex items-center gap-1.5 font-medium mt-1 ${recQuery.data.reconciled ? "text-emerald-700" : "text-amber-700"}`}>
                {recQuery.data.reconciled ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {recQuery.data.reconciled ? "Reconciled — ties to the cent." : `Out by ${money(recQuery.data.difference)}`}
              </div>
            </div>
          )}
          {acct && <Button size="sm" variant="outline" onClick={() => updateAccount.mutate({ id: acct.id, clientId, statementBalance: parseFloat(stmtBal) || 0, statementDate: todayIso() })} disabled={!stmtBal}>Save statement balance</Button>}
        </CardContent></Card>

        <Card><CardContent className="p-3 space-y-2">
          <div className="text-sm font-semibold text-slate-700">Year-end category summary</div>
          <p className="text-xs text-slate-500">Totals by category — the backbone for the T2 / income statement. HST shown where tracked.</p>
          {summary.data && (
            <div className="text-sm">
              {summary.data.categories.length === 0 && <div className="text-slate-400">No transactions yet.</div>}
              {["in", "out"].map((dir) => {
                const rows = summary.data!.categories.filter((c: any) => c.direction === dir);
                if (!rows.length) return null;
                return (
                  <div key={dir} className="mb-2">
                    <div className={`text-xs font-semibold uppercase ${dir === "in" ? "text-emerald-700" : "text-red-600"}`}>{dir === "in" ? "Income" : "Expenses"}</div>
                    {rows.map((c: any) => (
                      <div key={c.category} className="flex justify-between border-b border-slate-50 py-0.5">
                        <span className="text-slate-600">{c.category} <span className="text-slate-300">×{c.count}</span></span>
                        <span className="text-slate-800">{money(c.total)}{c.hst ? <span className="text-xs text-slate-400"> (HST {money(c.hst)})</span> : null}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent></Card>
      </div>

      {acct && (
        <div className="text-right">
          <button className="text-xs text-slate-400 hover:text-red-500" onClick={() => { if (confirm(`Delete the "${acct.name}" account and ALL its transactions? This cannot be undone.`)) removeAccount.mutate({ id: acct.id, clientId }); }}>Delete this account</button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, pos, neg, accent }: { label: string; value: string; pos?: boolean; neg?: boolean; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${pos ? "text-emerald-700" : neg ? "text-red-600" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-slate-500">{k}</span><span className="text-slate-800">{v}</span></div>;
}
