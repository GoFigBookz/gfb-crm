import { useState, useEffect } from "react";
import { Search, Loader2, AlertTriangle, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/providers/trpc";

const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

/**
 * "WHO PAID THIS?" — cross-account / cross-entity double-post finder, on the client
 * card. Scans this client's GROUP (all the related companies) for the same vendor +
 * amount appearing under more than one source account (the two credit cards + the
 * bank) or in more than one company — i.e. an unreconciled bank expense that was
 * really paid on a card or by another entity (a duplicated cost). Read-only.
 */
export default function PaymentSourceCard({ clientId, groupName }: { clientId: number; groupName?: string | null }) {
  const { data: groupClients } = trpc.cleanup.groupClients.useQuery(
    groupName ? { groupName } : {},
    { staleTime: 60000 }
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [start, setStart] = useState("2026-03-01");
  const [end, setEnd] = useState("2026-05-31");
  const scan = trpc.cleanup.paymentSourceScan.useMutation();
  const r = scan.data;

  // Pre-select the whole group (or just this client) once loaded.
  useEffect(() => {
    if (groupClients?.length && selected.length === 0) {
      setSelected(groupClients.map((c: any) => c.id));
    }
  }, [groupClients, selected.length]);

  const toggle = (id: number) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-amber-600" /> Who paid this? — double-post finder</CardTitle>
        <CardDescription>
          Finds an expense that hit more than one account (the two credit cards + the bank) or more than one company — i.e. an unreconciled bank item really paid on a card or by another entity (a duplicated cost). Read-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(groupClients || []).map((c: any) => (
            <label key={c.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name}
            </label>
          ))}
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div><Label className="text-[11px] text-slate-500">From</Label><Input type="date" className="h-8" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label className="text-[11px] text-slate-500">To</Label><Input type="date" className="h-8" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <Button size="sm" className="h-8" disabled={scan.isPending || selected.length === 0} onClick={() => scan.mutate({ clientIds: selected, startDate: start, endDate: end })}>
            {scan.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />} Scan for duplicates
          </Button>
        </div>

        {r && r.ok && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500">
              Pulled {r.perEntity.reduce((s: number, e: any) => s + e.pulled, 0)} payments ·{" "}
              {r.perEntity.map((e: any) => `${e.name}: ${e.error ? `⚠ ${e.error}` : e.pulled}`).join(" · ")}
            </div>
            {r.result.duplicates.length === 0 ? (
              <div className="text-sm text-emerald-600">No cross-account/entity duplicates found for this period. The unreconciled items weren't paid elsewhere (in what was scanned).</div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-sm font-medium text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {r.result.duplicates.length} likely double-post(s) — {money(r.result.summary.flaggedAmount)}:</div>
                {r.result.duplicates.map((d: any, i: number) => (
                  <div key={i} className="rounded-lg border p-2 text-xs">
                    <div className="font-semibold text-slate-800">{d.vendor} · {money(d.amount)}</div>
                    <div className="text-slate-500">Appears in: {d.entities.join(", ")} · accounts: {d.accounts.join(", ")}</div>
                    <div className="mt-1 divide-y">
                      {d.items.map((it: any, j: number) => (
                        <div key={j} className="flex items-center gap-2 py-0.5">
                          <span className="text-slate-400 w-20 shrink-0">{it.date}</span>
                          <span className="flex-1 truncate text-slate-600">{it.entity} → <b>{it.account}</b>{it.paymentType ? ` (${it.paymentType})` : ""}</span>
                          <span className="text-slate-400">{it.ref}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-slate-400">A match = same vendor + amount in two places — a strong hint, not proof. Confirm each, then delete the duplicate (usually the unreconciled bank line that never cleared).</p>
              </div>
            )}
          </div>
        )}
        {r && !r.ok && <div className="text-xs text-amber-600">Couldn't scan ({(r as any).error}).</div>}
        {scan.isError && <div className="text-xs text-red-600">{(scan.error as any)?.message}</div>}
      </CardContent>
    </Card>
  );
}
