import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, Plus, Trash2, Link2, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const money = (n: number | null | undefined) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const KIND_LABEL: Record<string, string> = { opening: "Opening", advance: "Advance", repayment: "Repayment", interest: "Interest", adjust: "Adjustment" };

/**
 * LOAN TRACKER tab on the client card — shareholder / inter-company / third-party
 * loan ledgers (replaces Markie's manual loan sheets). Running balance owed per
 * loan, advances/repayments/interest, read-only client share link.
 */
export function LoanTrackerTab({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const { data } = trpc.loanTracker.list.useQuery({ clientId });
  const [openLoanId, setOpenLoanId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [nl, setNl] = useState({ name: "", counterparty: "", annualRatePct: "" });

  const createLoan = trpc.loanTracker.createLoan.useMutation({
    onSuccess: () => { utils.loanTracker.list.invalidate({ clientId }); setCreating(false); setNl({ name: "", counterparty: "", annualRatePct: "" }); },
    onError: (e) => alert(e.message),
  });
  const deleteLoan = trpc.loanTracker.deleteLoan.useMutation({
    onSuccess: () => { utils.loanTracker.list.invalidate({ clientId }); setOpenLoanId(null); },
  });

  const loans = data?.loans ?? [];
  const dirBadge = (d: string) => d === "owed_to_lender" ? <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">owed</Badge>
    : d === "owed_to_borrower" ? <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">overpaid</Badge>
    : <Badge variant="outline" className="bg-lime-50 text-lime-700 border-lime-200">settled</Badge>;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><Landmark className="h-5 w-5 text-lime-600" /> Loans</h3>
          <p className="text-sm text-slate-500">Shareholder, inter-company & third-party loan ledgers — running balance owed.</p>
        </div>
        <div className="flex items-center gap-2">
          {loans.length > 0 && <span className="text-sm text-slate-500">Net owed: <b className="text-slate-800">{money(data?.netOwed)}</b></span>}
          <Button size="sm" onClick={() => setCreating((c) => !c)}><Plus className="h-4 w-4 mr-1" /> New loan</Button>
        </div>
      </div>

      {creating && (
        <Card>
          <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div><Label>Name</Label><Input value={nl.name} onChange={(e) => setNl({ ...nl, name: e.target.value })} placeholder="e.g. Conor — shareholder loan" /></div>
            <div><Label>Counterparty</Label><Input value={nl.counterparty} onChange={(e) => setNl({ ...nl, counterparty: e.target.value })} placeholder="person / entity" /></div>
            <div className="flex gap-2 items-end">
              <div className="flex-1"><Label>Rate % (optional)</Label><Input type="number" value={nl.annualRatePct} onChange={(e) => setNl({ ...nl, annualRatePct: e.target.value })} placeholder="0" /></div>
              <Button disabled={!nl.name.trim() || createLoan.isPending}
                onClick={() => createLoan.mutate({ clientId, name: nl.name.trim(), counterparty: nl.counterparty.trim() || null, annualRatePct: nl.annualRatePct ? Number(nl.annualRatePct) : null })}>
                {createLoan.isPending ? "Adding…" : "Add"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loans.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-slate-400">No loans yet. Click <b>New loan</b> to start a ledger.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {loans.map((l: any) => (
            <div key={l.id}>
              <Card className={`cursor-pointer hover:shadow-sm ${openLoanId === l.id ? "ring-1 ring-lime-300" : ""}`} onClick={() => setOpenLoanId(openLoanId === l.id ? null : l.id)}>
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${openLoanId === l.id ? "rotate-90" : ""}`} />
                      {l.name} {l.counterparty && <span className="text-xs text-slate-400">· {l.counterparty}</span>}
                    </p>
                    <p className="text-xs text-slate-500 ml-6">{l.summary.entryCount} entr{l.summary.entryCount === 1 ? "y" : "ies"}{l.annualRatePct ? ` · ${l.annualRatePct}%` : ""}{l.summary.lastActivity ? ` · last ${format(new Date(l.summary.lastActivity), "MMM d, yyyy")}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {dirBadge(l.summary.direction)}
                    <span className={`text-sm font-semibold ${l.summary.balance > 0 ? "text-amber-700" : l.summary.balance < 0 ? "text-sky-700" : "text-slate-500"}`}>{money(l.summary.balance)}</span>
                  </div>
                </CardContent>
              </Card>
              {openLoanId === l.id && <LoanLedger loanId={l.id} clientId={clientId} onDelete={() => { if (confirm(`Delete loan "${l.name}" and all its entries?`)) deleteLoan.mutate({ id: l.id }); }} />}
            </div>
          ))}
        </div>
      )}

      <LoanShareBar clientId={clientId} />
    </div>
  );
}

function LoanLedger({ loanId, clientId, onDelete }: { loanId: number; clientId: number; onDelete: () => void }) {
  const utils = trpc.useUtils();
  const { data } = trpc.loanTracker.ledger.useQuery({ loanId });
  const invalidate = () => { utils.loanTracker.ledger.invalidate({ loanId }); utils.loanTracker.list.invalidate({ clientId }); };
  const add = trpc.loanTracker.addEntry.useMutation({ onSuccess: () => { invalidate(); setEntry({ amount: "", kind: "advance", note: "", entryDate: "" }); }, onError: (e) => alert(e.message) });
  const del = trpc.loanTracker.deleteEntry.useMutation({ onSuccess: invalidate });
  const [entry, setEntry] = useState({ amount: "", kind: "advance", note: "", entryDate: "" });

  if (!data) return <div className="text-sm text-slate-400 p-3">Loading…</div>;

  return (
    <Card className="mt-1 border-lime-200">
      <CardContent className="p-3 space-y-3">
        {/* Add an entry */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={entry.kind} onValueChange={(v) => setEntry({ ...entry, kind: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="advance">Advance (+)</SelectItem>
                <SelectItem value="repayment">Repayment (−)</SelectItem>
                <SelectItem value="interest">Interest (+)</SelectItem>
                <SelectItem value="opening">Opening</SelectItem>
                <SelectItem value="adjust">Adjustment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Amount</Label><Input type="number" className="h-9" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} placeholder="0.00" /></div>
          <div><Label className="text-xs">Date</Label><Input type="date" className="h-9" value={entry.entryDate} onChange={(e) => setEntry({ ...entry, entryDate: e.target.value })} /></div>
          <div className="sm:col-span-1"><Label className="text-xs">Note</Label><Input className="h-9" value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} placeholder="optional" /></div>
          <Button className="h-9" disabled={!entry.amount || add.isPending}
            onClick={() => {
              const [y, m, d] = entry.entryDate ? entry.entryDate.split("-").map(Number) : [];
              add.mutate({ loanId, amount: Number(entry.amount), kind: entry.kind as any, note: entry.note || null, entryDate: y ? new Date(y, m - 1, d, 12, 0, 0) : undefined });
            }}>
            {add.isPending ? "Adding…" : "Add entry"}
          </Button>
        </div>

        {/* Ledger */}
        {data.ledger.length === 0 ? (
          <p className="text-sm text-slate-400 py-2 text-center">No entries yet — add the opening balance or first advance above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="text-xs text-slate-500 border-b">
                  <th className="text-left py-1.5 pr-3">Date</th>
                  <th className="text-left px-2">Type</th>
                  <th className="text-left px-2">Note</th>
                  <th className="text-right px-2">Amount</th>
                  <th className="text-right px-2">Balance</th>
                  <th className="px-1"></th>
                </tr>
              </thead>
              <tbody>
                {data.ledger.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{format(new Date(r.entryDate), "MMM d, yyyy")}</td>
                    <td className="px-2">{KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className="px-2 text-slate-500 max-w-[220px] truncate" title={r.note || ""}>{r.note || "—"}</td>
                    <td className={`text-right px-2 ${r.amount < 0 ? "text-lime-700" : "text-slate-800"}`}>{money(r.amount)}</td>
                    <td className="text-right px-2 font-medium">{money(r.runningBalance)}</td>
                    <td className="px-1 text-right"><button className="text-slate-300 hover:text-red-600" onClick={() => { if (confirm("Delete this entry?")) del.mutate({ id: r.id }); }}><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="text-slate-500">Balance owed: <b className={data.summary.balance > 0 ? "text-amber-700" : data.summary.balance < 0 ? "text-sky-700" : "text-slate-600"}>{money(data.summary.balance)}</b> · advanced {money(data.summary.totalAdvanced)} · repaid {money(data.summary.totalRepaid)}{data.summary.totalInterest ? ` · interest ${money(data.summary.totalInterest)}` : ""}</span>
          <Button size="sm" variant="ghost" className="h-7 text-red-500 hover:text-red-600" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete loan</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LoanShareBar({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const { data: links } = trpc.loanTracker.shareList.useQuery({ clientId });
  const create = trpc.loanTracker.shareCreate.useMutation({ onSuccess: () => utils.loanTracker.shareList.invalidate({ clientId }) });
  const revoke = trpc.loanTracker.shareRevoke.useMutation({ onSuccess: () => utils.loanTracker.shareList.invalidate({ clientId }) });
  const active = (links ?? []).filter((l: any) => l.active);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <Card className="bg-slate-50/60">
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Link2 className="h-4 w-4 text-slate-500" /> Read-only client link</CardTitle>
        <CardDescription>Share a view of these loan balances with the client — no login needed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {active.length === 0 ? (
          <Button size="sm" variant="outline" disabled={create.isPending} onClick={() => create.mutate({ clientId })}>{create.isPending ? "Creating…" : "Create share link"}</Button>
        ) : active.map((l: any) => (
          <div key={l.id} className="flex items-center gap-2 text-xs">
            <input readOnly className="flex-1 border rounded px-2 py-1 bg-white" value={`${origin}/share/loans/${l.token}`} onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => revoke.mutate({ id: l.id })}>Revoke</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
