/**
 * REVENUE RECOGNITION (WIP) — internal client tab.
 * Percentage-of-completion schedule for one client: job table, period %/billings
 * entry, full-year revenue calendar, per-client config + account mapping, draft
 * journal entries (review-gated), and a branded read-only client share link.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Link2, Copy, Trash2, Settings, FileText, CheckCircle, AlertCircle, ChevronDown, ChevronUp, BookOpen } from "lucide-react";

const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
const pct = (n: number) => `${Math.round((n ?? 0) * 1000) / 10}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthShort = (key: string) => { const [y, m] = key.split("-"); return `${MONTHS[parseInt(m, 10) - 1]} ${y.slice(2)}`; };

export function RevRecTab({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const { data: schedule, isLoading } = trpc.revRec.schedule.useQuery({ clientId });
  const { data: projects } = trpc.revRec.projectsList.useQuery({ clientId, includeArchived: false });
  const { data: config } = trpc.revRec.configGet.useQuery({ clientId });
  const { data: shareLinks } = trpc.revRec.shareList.useQuery({ clientId });

  const refresh = () => {
    utils.revRec.schedule.invalidate({ clientId });
    utils.revRec.projectsList.invalidate({ clientId });
  };

  const [showNew, setShowNew] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const totals = schedule?.totals;

  return (
    <div className="space-y-4 mt-4">
      {/* Header + actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold">Revenue Recognition (WIP)</h3>
          <p className="text-sm text-muted-foreground">Percentage-of-completion — recognise revenue as the work is earned, not just when billed.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowHowTo((v) => !v)}><BookOpen className="h-4 w-4 mr-1" />How to</Button>
          <Button size="sm" variant="outline" onClick={() => setShowConfig(true)}><Settings className="h-4 w-4 mr-1" />Settings</Button>
          <Button size="sm" variant="outline" onClick={() => setShowShare(true)}><Link2 className="h-4 w-4 mr-1" />Client link</Button>
          <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" />Add job</Button>
        </div>
      </div>

      {showHowTo && <HowToPanel />}

      {/* Portfolio totals */}
      {totals && (
        <div className={`grid grid-cols-2 gap-3 ${totals.holdbackReceivable > 0 ? "md:grid-cols-6" : "md:grid-cols-5"}`}>
          <Stat label="Contract value" value={money(totals.contractValue)} />
          <Stat label="Earned to date" value={money(totals.earnedToDate)} />
          <Stat label="Billed to date" value={money(totals.invoicedToDate)} />
          <Stat label="Contract asset" value={money(totals.contractAsset)} hint="Earned, not yet billed" />
          <Stat label="Deferred revenue" value={money(totals.deferredRevenue)} hint="Billed ahead of work" />
          {totals.holdbackReceivable > 0 && <Stat label="Holdback receivable" value={money(totals.holdbackReceivable)} hint="Withheld until acceptance" />}
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading schedule…</p>}

      {/* Jobs */}
      {!isLoading && (!projects || projects.length === 0) && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No jobs tracked yet. Click <strong>Add job</strong> to start recognising revenue for a contract.
        </CardContent></Card>
      )}

      {schedule?.projects?.map((p: any) => (
        <JobCard key={p.id} clientId={clientId} job={p} expanded={expanded === p.id}
          onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
          depositsBookedToRevenue={config?.depositsBookedToRevenue ?? false}
          onChange={refresh} />
      ))}

      {/* Revenue calendar */}
      {schedule?.calendar && schedule.calendar.rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue calendar (fiscal year)</CardTitle>
            <CardDescription>Revenue recognised each month across all jobs.</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3 sticky left-0 bg-background">Job</th>
                  {schedule.calendar.months.map((m: string) => <th key={m} className="text-right px-2 py-2 whitespace-nowrap">{monthShort(m)}</th>)}
                  <th className="text-right pl-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {schedule.calendar.rows.map((r: any) => (
                  <tr key={r.projectId} className="border-b">
                    <td className="py-2 pr-3 sticky left-0 bg-background font-medium">{r.name}</td>
                    {r.byMonth.map((v: number, i: number) => <td key={i} className="text-right px-2 py-2 tabular-nums">{v ? money(v) : <span className="text-muted-foreground">—</span>}</td>)}
                    <td className="text-right pl-3 py-2 font-medium tabular-nums">{money(r.total)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3 sticky left-0 bg-background">Total</td>
                  {schedule.calendar.totalsByMonth.map((v: number, i: number) => <td key={i} className="text-right px-2 py-2 tabular-nums">{v ? money(v) : "—"}</td>)}
                  <td className="text-right pl-3 py-2 tabular-nums">{money(schedule.calendar.grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {showNew && <NewJobDialog clientId={clientId} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); refresh(); }} />}
      {showConfig && <ConfigDialog clientId={clientId} config={config} onClose={() => setShowConfig(false)} />}
      {showShare && <ShareDialog clientId={clientId} links={shareLinks ?? []} onClose={() => setShowShare(false)} />}
    </div>
  );
}

/** Explicit step-by-step SOP for running POC + holdback WIP — Markie wanted it baked in. */
function HowToPanel() {
  return (
    <Card className="border-lime-200 bg-lime-50/40">
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4 text-lime-700" />How to run WIP / revenue recognition</CardTitle>
        <CardDescription>Percentage-of-completion (ASPE 3400), with contractor holdback. Draft entries only — nothing posts to QBO without review.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm space-y-3 text-slate-700">
        <div>
          <p className="font-semibold mb-1">One-time setup per client</p>
          <ol className="list-decimal ml-5 space-y-1">
            <li><b>Settings</b> → set the fiscal year-end, whether deposits are booked to revenue, the holdback % (e.g. 10%), and whether the client tags job costing by project in QBO.</li>
            <li><b>Settings → Account mapping</b> — pick the exact QBO accounts for Contract Asset, Revenue, and Deferred Revenue (never guessed; required before any draft JE).</li>
            <li><b>Add job</b> for each contract: name, optional QBO Customer:Job, contract value, holdback %, and any carry-in % / billings if it started before tracking.</li>
          </ol>
        </div>
        <div>
          <p className="font-semibold mb-1">Each month</p>
          <ol className="list-decimal ml-5 space-y-1">
            <li>For every job, enter the <b>% complete</b> at month-end and the <b>billings to date</b>. (% complete = costs incurred ÷ total estimated costs — cost-to-cost — or the PM's estimate.)</li>
            <li>Figgy computes <b>earned = contract × %</b>, the revenue for the month, and whether the job is a <b>contract asset</b> (earned but not yet billed) or <b>deferred revenue</b> (billed ahead of work).</li>
            <li>If there's holdback, the billed amount splits: the withheld portion shows as <b>Holdback receivable</b>, the rest as regular A/R. Revenue is unaffected by holdback.</li>
            <li>Click <b>Generate draft JE</b> on the job → review the accrual + next-month reversal → only then post to QBO.</li>
          </ol>
        </div>
        <p className="text-xs text-muted-foreground">Holdback receivable stays on the balance sheet until the contract is accepted/substantially complete, then it becomes a normal receivable due. Keep the support (progress draws, holdback ledger) in the client's file.</p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card><CardContent className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </CardContent></Card>
  );
}

function JobCard({ clientId, job, expanded, onToggle, depositsBookedToRevenue, onChange }: any) {
  const r = job.rollup;
  const utils = trpc.useUtils();
  const [period, setPeriod] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [pctVal, setPctVal] = useState("");
  const [invoiced, setInvoiced] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [jeResult, setJeResult] = useState<any>(null);

  const upsert = trpc.revRec.progressUpsert.useMutation({
    onSuccess: () => { utils.revRec.schedule.invalidate({ clientId }); setPctVal(""); setInvoiced(""); setCost(""); setNote(""); onChange?.(); },
  });
  const archive = trpc.revRec.projectArchive.useMutation({ onSuccess: () => onChange?.() });
  const genJe = trpc.revRec.jeGenerate.useMutation({ onSuccess: (d) => setJeResult(d) });

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              {r.name}
              {job.customerJob && <Badge variant="outline" className="text-xs">{job.customerJob}</Badge>}
              {r.overBudget && <Badge variant="destructive" className="text-xs"><AlertCircle className="h-3 w-3 mr-1" />Over budget {money(r.costOverrun)}</Badge>}
              {r.holdbackReadyToRelease && <Badge className="text-xs bg-sky-600"><CheckCircle className="h-3 w-3 mr-1" />Release holdback {money(r.holdbackReceivable)}</Badge>}
            </CardTitle>
            <CardDescription>{money(r.contractValue)} contract · {pct(r.pctComplete)} complete · {money(r.earnedToDate)} earned{r.estimatedCost ? ` · ${money(r.actualCostToDate)}/${money(r.estimatedCost)} cost` : ""}</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              {r.contractAsset > 0 && <p className="text-sm font-medium text-emerald-600">{money(r.contractAsset)} asset</p>}
              {r.deferredRevenue > 0 && <p className="text-sm font-medium text-amber-600">{money(r.deferredRevenue)} deferred</p>}
              {r.holdbackReceivable > 0 && <p className="text-sm font-medium text-sky-600">{money(r.holdbackReceivable)} holdback</p>}
            </div>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {/* Schedule table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-1.5 pr-2">Period</th>
                <th className="text-right px-2">% complete</th>
                <th className="text-right px-2">Rev this period</th>
                <th className="text-right px-2">Earned to date</th>
                <th className="text-right px-2">Billed to date</th>
                <th className="text-right px-2">Asset</th>
                <th className="text-right pl-2">Deferred</th>
              </tr></thead>
              <tbody>
                {job.schedule.length === 0 && <tr><td colSpan={7} className="py-3 text-center text-muted-foreground">No periods yet — enter the first below.</td></tr>}
                {job.schedule.map((s: any) => (
                  <tr key={s.periodKey} className="border-b">
                    <td className="py-1.5 pr-2 font-medium">{monthShort(s.periodKey)}</td>
                    <td className="text-right px-2 tabular-nums">{pct(s.pctComplete)}</td>
                    <td className="text-right px-2 tabular-nums">{money(s.revenueThisPeriod)}</td>
                    <td className="text-right px-2 tabular-nums">{money(s.earnedToDate)}</td>
                    <td className="text-right px-2 tabular-nums">{money(s.invoicedToDate)}</td>
                    <td className="text-right px-2 tabular-nums text-emerald-600">{s.contractAsset ? money(s.contractAsset) : "—"}</td>
                    <td className="text-right pl-2 tabular-nums text-amber-600">{s.deferredRevenue ? money(s.deferredRevenue) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Entry row */}
          <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Update progress</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div><Label className="text-xs">Period</Label><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
              <div><Label className="text-xs">% complete</Label><Input type="number" min={0} max={100} step={1} placeholder="e.g. 45" value={pctVal} onChange={(e) => setPctVal(e.target.value)} /></div>
              <div><Label className="text-xs">Billed to date</Label><Input type="number" min={0} step={0.01} placeholder="cumulative $" value={invoiced} onChange={(e) => setInvoiced(e.target.value)} /></div>
              <div><Label className="text-xs">Cost to date</Label><Input type="number" min={0} step={0.01} placeholder="cumulative $" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
              <div className="flex items-end"><Button className="w-full" disabled={!pctVal || upsert.isPending}
                onClick={() => upsert.mutate({ projectId: job.id, clientId, periodKey: period, pctComplete: Math.max(0, Math.min(1, Number(pctVal) / 100)), invoicedToDate: invoiced === "" ? null : Number(invoiced), actualCostToDate: cost === "" ? null : Number(cost), note: note || null })}>
                {upsert.isPending ? "Saving…" : "Save period"}</Button></div>
            </div>
            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Enter cumulative % complete, billed-to-date, and (for job costing) actual cost-to-date. Revenue is recognised on the change since the prior period. Leave cost blank if the client doesn't job-cost by project.</p>
          </div>

          {/* JE generation (review-gated) */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{job.schedule.map((s: any) => <SelectItem key={s.periodKey} value={s.periodKey}>{monthShort(s.periodKey)}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={genJe.isPending || job.schedule.length === 0}
              onClick={() => genJe.mutate({ clientId, projectId: job.id, periodKey: period })}>
              <FileText className="h-4 w-4 mr-1" />Generate draft journal entry
            </Button>
            <span className="text-[11px] text-muted-foreground">Drafts only — nothing posts to QBO without your review.</span>
            <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => { if (confirm(`Archive "${r.name}"?`)) archive.mutate({ id: job.id }); }}>
              <Trash2 className="h-4 w-4" /></Button>
          </div>

          {jeResult && <JePreview result={jeResult} depositsBookedToRevenue={depositsBookedToRevenue} />}
        </CardContent>
      )}
    </Card>
  );
}

function JePreview({ result }: { result: any; depositsBookedToRevenue: boolean }) {
  if (result.generated === 0) return <p className="text-sm text-muted-foreground">{result.note}</p>;
  const v = result.validation;
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center gap-2">
        {v?.ok ? <Badge className="bg-emerald-600"><CheckCircle className="h-3 w-3 mr-1" />Ready to post (after review)</Badge>
          : <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Needs setup before posting</Badge>}
      </div>
      {!v?.ok && <ul className="text-xs text-amber-700 list-disc pl-5">{v?.errors?.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>}
      {[result.accrual, result.reversal].filter(Boolean).map((je: any, idx: number) => (
        <div key={idx}>
          <p className="text-xs font-medium mb-1">{je.kind === "accrual" ? "Accrual" : "Reversal"} · {je.date}</p>
          <table className="w-full text-xs border-collapse">
            <thead><tr className="text-muted-foreground border-b"><th className="text-left py-1">Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
            <tbody>
              {je.lines.map((l: any, i: number) => (
                <tr key={i}><td className="py-1">{l.accountKey.replace(/_/g, " ")}</td>
                  <td className="text-right tabular-nums">{l.debit ? money(l.debit) : ""}</td>
                  <td className="text-right tabular-nums">{l.credit ? money(l.credit) : ""}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function NewJobDialog({ clientId, onClose, onSaved }: { clientId: number; onClose: () => void; onSaved: () => void }) {
  const { data: config } = trpc.revRec.configGet.useQuery({ clientId });
  const [name, setName] = useState("");
  const [customerJob, setCustomerJob] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [openingPct, setOpeningPct] = useState("");
  const [openingInvoiced, setOpeningInvoiced] = useState("");
  const [holdback, setHoldback] = useState("");
  const [estCost, setEstCost] = useState("");
  // Default the holdback field to the client's configured default once config loads.
  const holdbackVal = holdback !== "" ? holdback : config?.defaultHoldbackPct ? String(Math.round(config.defaultHoldbackPct * 100)) : "";
  const create = trpc.revRec.projectCreate.useMutation({ onSuccess: onSaved });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a job / contract</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Job name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 123 Main St — pool build" /></div>
          <div><Label>QBO Customer:Job (optional)</Label><Input value={customerJob} onChange={(e) => setCustomerJob(e.target.value)} placeholder="Customer:Job name in QuickBooks" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Contract value</Label><Input type="number" min={0} step={0.01} value={contractValue} onChange={(e) => setContractValue(e.target.value)} /></div>
            <div><Label className="text-xs">Estimated cost</Label><Input type="number" min={0} step={0.01} value={estCost} onChange={(e) => setEstCost(e.target.value)} placeholder="for cost-to-cost %" /></div>
            <div><Label className="text-xs">Holdback %</Label><Input type="number" min={0} max={100} value={holdbackVal} onChange={(e) => setHoldback(e.target.value)} placeholder="e.g. 10" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Carry-in % complete</Label><Input type="number" min={0} max={100} value={openingPct} onChange={(e) => setOpeningPct(e.target.value)} placeholder="if started before tracking" /></div>
            <div><Label className="text-xs">Carry-in billed</Label><Input type="number" min={0} step={0.01} value={openingInvoiced} onChange={(e) => setOpeningInvoiced(e.target.value)} /></div>
          </div>
          <p className="text-[11px] text-muted-foreground">Holdback % = the portion the customer withholds from each billing until acceptance (shown separately as Holdback receivable). Carry-in baselines a job already underway so prior revenue isn't double-counted.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!name || create.isPending} onClick={() => create.mutate({
              clientId, name, customerJob: customerJob || null, contractValue: Number(contractValue) || 0,
              openingPct: openingPct === "" ? null : Math.max(0, Math.min(1, Number(openingPct) / 100)),
              openingInvoiced: openingInvoiced === "" ? null : Number(openingInvoiced),
              holdbackPct: holdbackVal === "" ? null : Math.max(0, Math.min(1, Number(holdbackVal) / 100)),
              estimatedCost: estCost === "" ? null : Number(estCost),
            })}>{create.isPending ? "Adding…" : "Add job"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfigDialog({ clientId, config, onClose }: { clientId: number; config: any; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: accountMap } = trpc.revRec.accountMapGet.useQuery({ clientId });
  const [fyStart, setFyStart] = useState(String(config?.fiscalYearStartMonth ?? 1));
  const [deposits, setDeposits] = useState(!!config?.depositsBookedToRevenue);
  const [pctSource, setPctSource] = useState(config?.pctSource ?? "");
  const [jobCosting, setJobCosting] = useState(!!config?.jobCostingByProject);
  const [defHoldback, setDefHoldback] = useState(config?.defaultHoldbackPct ? String(Math.round(config.defaultHoldbackPct * 100)) : "");
  const setConfig = trpc.revRec.configSet.useMutation({ onSuccess: () => { utils.revRec.configGet.invalidate({ clientId }); utils.revRec.schedule.invalidate({ clientId }); } });
  const setMap = trpc.revRec.accountMapSet.useMutation({ onSuccess: () => utils.revRec.accountMapGet.invalidate({ clientId }) });
  const [mapDraft, setMapDraft] = useState<Record<string, { id: string; name: string }>>({});

  const keyLabel: Record<string, string> = { contract_asset: "Contract Asset (underbilling)", revenue: "Revenue", deferred_revenue: "Deferred Revenue (overbilling)" };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Revenue recognition settings</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Fiscal year start month</Label>
              <Select value={fyStart} onValueChange={setFyStart}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select></div>
            <div><Label>% source</Label><Input value={pctSource} onChange={(e) => setPctSource(e.target.value)} placeholder="manual / cost-to-cost / PM" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Default holdback %</Label><Input type="number" min={0} max={100} value={defHoldback} onChange={(e) => setDefHoldback(e.target.value)} placeholder="e.g. 10" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={deposits} onChange={(e) => setDeposits(e.target.checked)} />
            Deposits / progress billings are booked to a <strong>Revenue</strong> account (not a liability)
          </label>
          <p className="text-[11px] text-muted-foreground -mt-2">If checked, overbillings get moved to Deferred Revenue. Leave off if deposits already hit a liability account.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={jobCosting} onChange={(e) => setJobCosting(e.target.checked)} />
            Client tracks <strong>job costing by project</strong> in QBO (Customer:Job / Projects / Classes)
          </label>
          <p className="text-[11px] text-muted-foreground -mt-2">An intake question. If yes, we can pull actual costs per project from QBO for cost-to-cost % complete. If no, % complete is entered manually.</p>

          <div className="border-t pt-3">
            <p className="text-sm font-medium mb-2">QBO account mapping <span className="text-xs text-muted-foreground">(required before posting — never guessed)</span></p>
            <div className="space-y-2">
              {(accountMap ?? []).map((a: any) => (
                <div key={a.accountKey} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <div className="text-xs">{keyLabel[a.accountKey]}</div>
                  <div className="flex gap-1">
                    <Input className="w-24 h-8" placeholder="QBO Acct ID" defaultValue={a.qboAccountId ?? ""} onChange={(e) => setMapDraft((d) => ({ ...d, [a.accountKey]: { id: e.target.value, name: d[a.accountKey]?.name ?? a.qboAccountName ?? "" } }))} />
                    <Input className="w-32 h-8" placeholder="name" defaultValue={a.qboAccountName ?? ""} onChange={(e) => setMapDraft((d) => ({ ...d, [a.accountKey]: { id: d[a.accountKey]?.id ?? a.qboAccountId ?? "", name: e.target.value } }))} />
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setMap.mutate({ clientId, accountKey: a.accountKey, qboAccountId: (mapDraft[a.accountKey]?.id ?? a.qboAccountId) || null, qboAccountName: (mapDraft[a.accountKey]?.name ?? a.qboAccountName) || null })}>Save</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => { setConfig.mutate({ clientId, fiscalYearStartMonth: Number(fyStart), depositsBookedToRevenue: deposits, pctSource: pctSource || null, jobCostingByProject: jobCosting, defaultHoldbackPct: defHoldback === "" ? 0 : Math.max(0, Math.min(1, Number(defHoldback) / 100)) }); onClose(); }}>Save settings</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({ clientId, links, onClose }: { clientId: number; links: any[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [label, setLabel] = useState("");
  const create = trpc.revRec.shareCreate.useMutation({ onSuccess: () => utils.revRec.shareList.invalidate({ clientId }) });
  const revoke = trpc.revRec.shareRevoke.useMutation({ onSuccess: () => utils.revRec.shareList.invalidate({ clientId }) });
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Client share links</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">A read-only, branded view of the WIP schedule. Revocable any time.</p>
          <div className="flex gap-2">
            <Input placeholder="Label (e.g. for Bob @ Clark)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Button onClick={() => { create.mutate({ clientId, label: label || undefined }); setLabel(""); }}>Create</Button>
          </div>
          <div className="space-y-2">
            {(links ?? []).map((l) => {
              const url = `${base}/share/revrec/${l.token}`;
              return (
                <div key={l.id} className="flex items-center gap-2 text-sm border rounded p-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{l.label || "Share link"} {!l.active && <Badge variant="outline" className="ml-1">revoked</Badge>}</p>
                    {l.active && <p className="text-xs text-muted-foreground truncate">{url}</p>}
                  </div>
                  {l.active && <>
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(url)}><Copy className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revoke.mutate({ id: l.id })}>Revoke</Button>
                  </>}
                </div>
              );
            })}
            {(!links || links.length === 0) && <p className="text-xs text-muted-foreground">No links yet.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
