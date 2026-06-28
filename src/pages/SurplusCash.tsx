/**
 * SURPLUS CASH — what to do with cash sitting in the bank.
 * =============================================================================
 * INFORMATION-GATHERING, not investment advice. Two halves:
 *  1) The tax angle Figgy CAN speak to — idle corp cash earning passive income
 *     grinds the small-business deduction over $50k/yr; this shows the projection.
 *  2) A "Scan rates" button that pulls current GIC / HISA rates on demand, with a
 *     clear "discuss with a licensed advisor" disclaimer.
 * =============================================================================
 */
import { useState } from "react";
import { PiggyBank, Loader2, RefreshCw, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";

const money = (n: number) => (n || 0).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

export default function SurplusCash() {
  const [idleCash, setIdleCash] = useState("");
  const [ratePct, setRatePct] = useState("4");
  const [existingPassive, setExistingPassive] = useState("");
  const cash = parseFloat(idleCash) || 0, rate = parseFloat(ratePct) || 0, exist = parseFloat(existingPassive) || 0;

  const { data: a } = trpc.surplusCash.analyze.useQuery({ idleCash: cash, ratePct: rate, existingPassive: exist }, { enabled: cash > 0 });
  const [rates, setRates] = useState<any[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState("");
  const scan = trpc.surplusCash.scanRates.useMutation({
    onSuccess: (r: any) => {
      if (!r.ok) { setScanMsg(r.error || "Couldn't scan rates"); return; }
      setRates(r.rates || []); setAsOf(r.asOf);
      setScanMsg(r.rates?.length ? "" : "No rates parsed — try again.");
    },
    onError: (e) => setScanMsg(e.message),
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <PiggyBank className="h-7 w-7 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold">Surplus Cash</h1>
          <p className="text-sm text-slate-500">For the "what do I do with the cash sitting in the bank?" conversation.</p>
        </div>
      </div>

      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="py-3 flex items-start gap-2 text-xs text-slate-600">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Go Fig Bookz is not a licensed investment advisor. This gathers information and shows the <b>tax impact</b> — the actual investing decision should go to a licensed advisor.</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">The tax angle (corporation)</CardTitle>
          <CardDescription>Idle corporate cash that earns investment income generates <b>passive income</b>. Over $50k/yr it grinds the $500k small-business deduction ($5 lost per $1 over $50k, gone at $150k).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Idle cash</Label><Input type="number" value={idleCash} onChange={(e) => setIdleCash(e.target.value)} placeholder="500000" /></div>
            <div><Label>Assumed rate %</Label><Input type="number" value={ratePct} onChange={(e) => setRatePct(e.target.value)} /></div>
            <div><Label>Existing passive $/yr</Label><Input type="number" value={existingPassive} onChange={(e) => setExistingPassive(e.target.value)} placeholder="0" /></div>
          </div>
          {a && cash > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat label="Projected income/yr" value={money(a.projectedIncome)} />
              <Stat label="Total passive income" value={money(a.totalPassive)} />
              <Stat label="SBD limit ground" value={a.grind.reduction > 0 ? money(a.grind.reduction) : "—"} tone={a.grind.reduction > 0 ? "bad" : "good"} />
            </div>
          )}
          {a && a.grind.reduction > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">
              ⚠ At {money(a.totalPassive)} of passive income, the small-business deduction is reduced by <b>{money(a.grind.reduction)}</b>{a.grind.eliminated ? " — fully eliminated" : ""}. Worth weighing against paying down debt, an IPP/RRSP, or distributing — talk it through, then refer to the advisor.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Current rates {asOf && <Badge variant="outline" className="ml-1 text-[10px]">as of {asOf}</Badge>}</CardTitle>
            <CardDescription>GIC + high-interest savings — info only, verify with the institution.</CardDescription>
          </div>
          <Button variant="outline" disabled={scan.isPending} onClick={() => { setScanMsg(""); scan.mutate({ kind: "both" }); }}>
            {scan.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Scanning…</> : <><RefreshCw className="h-4 w-4 mr-1" /> Scan rates</>}
          </Button>
        </CardHeader>
        <CardContent>
          {scanMsg && <p className="text-sm text-slate-500 mb-2">{scanMsg}</p>}
          {rates.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">Press <b>Scan rates</b> to pull today's posted GIC / savings rates.</p>
          ) : (
            <div className="divide-y">
              {rates.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.institution} <span className="text-slate-400 font-normal">{r.product}{r.term ? ` · ${r.term}` : ""}</span></p>
                    {r.notes ? <p className="text-xs text-slate-500 truncate">{r.notes}</p> : null}
                  </div>
                  <span className="text-base font-bold text-lime-700 shrink-0">{Number(r.ratePct).toFixed(2)}%</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-3">Rates change daily and vary by amount/term. This is a snapshot for discussion — confirm directly with the institution and a licensed advisor before acting.</p>
        </CardContent>
      </Card>
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
