/**
 * BANKED HOURS UI — two pieces:
 *  - BankedHoursEmployee: per-employee balance + ledger + quick add (used on the
 *    employee card).
 *  - BankedHoursBoard: per-client balance board + import-from-old-sheet + the
 *    read+write client share link (used on the Payroll page under a client).
 */
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, Plus, Trash2, Upload, Link2, Copy } from "lucide-react";

const hrs = (n: number) => `${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;
const fmtDate = (d: any) => { try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return "—"; } };

export function BankedHoursEmployee({ clientId, employeeId }: { clientId: number; employeeId: number }) {
  const utils = trpc.useUtils();
  const { data } = trpc.bankedHours.ledger.useQuery({ employeeId });
  const [hours, setHours] = useState("");
  const [kind, setKind] = useState<"accrue" | "redeem" | "adjust" | "opening">("accrue");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const add = trpc.bankedHours.addEntry.useMutation({
    onSuccess: () => { utils.bankedHours.ledger.invalidate({ employeeId }); utils.bankedHours.board.invalidate({ clientId }); setHours(""); setNote(""); },
    onError: (e) => alert(e.message),
  });
  const del = trpc.bankedHours.deleteEntry.useMutation({
    onSuccess: () => { utils.bankedHours.ledger.invalidate({ employeeId }); utils.bankedHours.board.invalidate({ clientId }); },
  });

  const bal = data?.summary.balance ?? 0;
  return (
    <div className="rounded-lg border p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase font-semibold text-slate-500 flex items-center gap-1"><Clock className="h-3 w-3" /> Banked hours</Label>
        <span className={`text-sm font-semibold ${bal < 0 ? "text-red-600" : "text-slate-900"}`}>{hrs(bal)} balance</span>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-end">
        <div>
          <Label className="text-[10px]">Type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as any)}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="accrue">Banked</SelectItem>
              <SelectItem value="redeem">Taken / paid</SelectItem>
              <SelectItem value="opening">Opening</SelectItem>
              <SelectItem value="adjust">Adjust ±</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-[10px]">Hours</Label><Input className="h-8" type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 8" /></div>
        <Button size="sm" className="h-8" disabled={!hours || add.isPending} onClick={() => add.mutate({ clientId, employeeId, hours: Number(hours), kind, note: note || null, ...(date ? { entryDate: new Date(date + "T12:00:00") } : {}) })}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input className="h-7 text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optional)" />
        <Input className="h-7 text-xs" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {!!data?.ledger?.length && (
        <div className="max-h-40 overflow-y-auto text-xs">
          <table className="w-full">
            <tbody>
              {data.ledger.map((r: any) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-1 text-slate-500 whitespace-nowrap">{fmtDate(r.entryDate)}</td>
                  <td className="py-1"><Badge variant="outline" className="text-[10px]">{r.kind}</Badge>{r.note ? <span className="ml-1 text-slate-500">{r.note}</span> : null}</td>
                  <td className={`py-1 text-right tabular-nums ${r.hours < 0 ? "text-red-600" : "text-emerald-700"}`}>{r.hours > 0 ? "+" : ""}{r.hours}</td>
                  <td className="py-1 text-right tabular-nums text-slate-500">{r.runningBalance}h</td>
                  <td className="py-1 text-right"><button className="text-red-400 hover:text-red-600" onClick={() => { if (confirm("Delete this entry?")) del.mutate({ id: r.id }); }}><Trash2 className="h-3 w-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function BankedHoursBoard({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const { data: board } = trpc.bankedHours.board.useQuery({ clientId });
  const { data: links } = trpc.bankedHours.shareList.useQuery({ clientId });
  const [showImport, setShowImport] = useState(false);
  const [showShare, setShowShare] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-lime-600" /> Banked hours</CardTitle>
            <CardDescription>One shared ledger — the client updates it, you view + update, it syncs into payroll.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)}><Upload className="h-4 w-4 mr-1" />Import old sheet</Button>
            <Button size="sm" variant="outline" onClick={() => setShowShare(true)}><Link2 className="h-4 w-4 mr-1" />Client link</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {(!board || board.rows.length === 0) && <p className="text-sm text-slate-400 py-2">No banked hours tracked yet. Import the old sheet, or add hours on each employee's card.</p>}
        {board && board.rows.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="text-left py-1.5">Employee</th><th className="text-right">Banked</th><th className="text-right">Taken</th><th className="text-right">Balance</th><th className="text-right pl-2">Last</th></tr></thead>
            <tbody>
              {board.rows.map((r: any) => (
                <tr key={r.employeeId} className="border-b last:border-0">
                  <td className="py-1.5 font-medium">{r.name}</td>
                  <td className="text-right tabular-nums text-emerald-700">{hrs(r.totalBanked)}</td>
                  <td className="text-right tabular-nums text-slate-500">{hrs(r.totalTaken)}</td>
                  <td className={`text-right tabular-nums font-semibold ${r.balance < 0 ? "text-red-600" : ""}`}>{hrs(r.balance)}</td>
                  <td className="text-right pl-2 text-xs text-slate-400">{r.lastActivity ? fmtDate(r.lastActivity) : "—"}</td>
                </tr>
              ))}
              <tr className="font-semibold"><td className="py-1.5">Total</td><td /><td /><td className="text-right tabular-nums">{hrs(board.totalBalance)}</td><td /></tr>
            </tbody>
          </table>
        )}
      </CardContent>
      {showImport && <ImportDialog clientId={clientId} onClose={() => setShowImport(false)} onDone={() => { utils.bankedHours.board.invalidate({ clientId }); }} />}
      {showShare && <ShareDialog clientId={clientId} links={links ?? []} onClose={() => setShowShare(false)} />}
    </Card>
  );
}

function ImportDialog({ clientId, onClose, onDone }: { clientId: number; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<any>(null);
  const imp = trpc.bankedHours.importOpening.useMutation({ onSuccess: (r) => { setResult(r); onDone(); }, onError: (e) => alert(e.message) });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Import opening balances from the old sheet</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Paste rows from the old payroll sheet — one employee per line, name then banked-hours balance (e.g. <code>Haight, Chris 12.5</code>). Names are matched to employees automatically.</p>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Haight, Chris\t12.5\nCorey Hawton\t8\nVenditti, Lisa\t3.25"} />
          {result && (
            <div className="text-sm rounded border p-2 bg-slate-50">
              <p className="text-emerald-700">Imported {result.imported} opening balance(s).</p>
              {result.unmatched?.length > 0 && <p className="text-amber-700 mt-1">Couldn't match: {result.unmatched.map((u: any) => `${u.name} (${u.hours}h)`).join(", ")} — add those employees first, then re-import.</p>}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" id="bh-replace" /> Replace any existing opening balances</label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button disabled={!text.trim() || imp.isPending} onClick={() => imp.mutate({ clientId, text, replaceExistingOpenings: (document.getElementById("bh-replace") as HTMLInputElement)?.checked })}>{imp.isPending ? "Importing…" : "Import"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({ clientId, links, onClose }: { clientId: number; links: any[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [label, setLabel] = useState("");
  const create = trpc.bankedHours.shareCreate.useMutation({ onSuccess: () => utils.bankedHours.shareList.invalidate({ clientId }) });
  const revoke = trpc.bankedHours.shareRevoke.useMutation({ onSuccess: () => utils.bankedHours.shareList.invalidate({ clientId }) });
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Client banked-hours link</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">A shared sheet the client can update (log hours banked/taken). You see every change in the CRM. Revocable any time.</p>
          <div className="flex gap-2">
            <Input placeholder="Label (e.g. for the manager)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Button onClick={() => { create.mutate({ clientId, label: label || undefined, allowEdit: true }); setLabel(""); }}>Create</Button>
          </div>
          <div className="space-y-2">
            {(links ?? []).map((l) => {
              const url = `${base}/share/banked/${l.token}`;
              return (
                <div key={l.id} className="flex items-center gap-2 text-sm border rounded p-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{l.label || "Banked-hours link"} {!l.active && <Badge variant="outline" className="ml-1">revoked</Badge>} {l.active && !l.allowEdit && <Badge variant="outline" className="ml-1">view-only</Badge>}</p>
                    {l.active && <p className="text-xs text-slate-500 truncate">{url}</p>}
                  </div>
                  {l.active && <>
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(url)}><Copy className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => revoke.mutate({ id: l.id })}>Revoke</Button>
                  </>}
                </div>
              );
            })}
            {(!links || links.length === 0) && <p className="text-xs text-slate-400">No links yet.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
