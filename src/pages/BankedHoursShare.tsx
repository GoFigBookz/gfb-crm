import { useState } from "react";
import { useParams } from "react-router";
import { Clock, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/providers/trpc";

const hrs = (n: number) => `${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;

/** Public, token-gated banked-hours sheet. The client sees each employee's
 *  balance and logs hours banked / taken; it writes into the same ledger the
 *  bookkeeper sees. Read-only if the link is view-only. */
export default function BankedHoursShare() {
  const { token } = useParams<{ token: string }>();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.bankedHours.publicView.useQuery({ token: token! }, { enabled: !!token });
  const [empId, setEmpId] = useState<string>("");
  const [hours, setHours] = useState("");
  const [kind, setKind] = useState<"accrue" | "redeem">("redeem");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const add = trpc.bankedHours.publicAdd.useMutation({
    onSuccess: () => { utils.bankedHours.publicView.invalidate({ token: token! }); setHours(""); setNote(""); },
    onError: (e) => alert(e.message),
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-500">This link isn’t valid or has been revoked.</div>;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6 text-lime-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">{data.clientName} — Banked hours</h1>
            <p className="text-sm text-slate-500">Live balances{data.label ? ` · ${data.label}` : ""}{!data.allowEdit ? " · view-only" : ""}</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Balances</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-xs text-slate-500"><th className="text-left py-1.5">Employee</th><th className="text-right">Banked</th><th className="text-right">Taken</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.employeeId} className="border-b last:border-0">
                    <td className="py-1.5 font-medium">{r.name}</td>
                    <td className="text-right tabular-nums text-emerald-700">{hrs(r.totalBanked)}</td>
                    <td className="text-right tabular-nums text-slate-500">{hrs(r.totalTaken)}</td>
                    <td className={`text-right tabular-nums font-semibold ${r.balance < 0 ? "text-red-600" : ""}`}>{hrs(r.balance)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-400">No employees yet.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {data.allowEdit && data.rows.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Log banked hours</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Employee</Label>
                  <Select value={empId} onValueChange={setEmpId}>
                    <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>{data.rows.map((r) => <SelectItem key={r.employeeId} value={String(r.employeeId)}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Type</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="redeem">Hours taken</SelectItem>
                      <SelectItem value="accrue">Hours banked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Hours</Label><Input type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 8" /></div>
                <div><Label className="text-xs">Your name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="who's logging this" /></div>
              </div>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — e.g. took Friday afternoon" />
              <Button className="w-full" disabled={!empId || !hours || add.isPending}
                onClick={() => add.mutate({ token: token!, employeeId: Number(empId), hours: Number(hours), kind, note: note || undefined, enteredByName: name || undefined })}>
                <Plus className="h-4 w-4 mr-1" />{add.isPending ? "Saving…" : "Add to sheet"}
              </Button>
              <p className="text-[11px] text-slate-400 text-center">Your bookkeeper sees every change here in real time.</p>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-slate-400">Updated {new Date(data.generatedAt).toLocaleString()} · Go Fig Bookz</p>
      </div>
    </div>
  );
}
