import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Wallet, Plus, Trash2, Calculator, Mail, ExternalLink, Building2, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { reconcileWithholding, TAX_2026 } from "../../api/payroll-tax-core";
import { nextPayPeriod, normalizeFrequency } from "../../api/payroll-core";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  qbo_autopay: { label: "QBO autopay", cls: "bg-purple-100 text-purple-700" },
  estimator: { label: "Estimator", cls: "bg-blue-100 text-blue-700" },
  clockify: { label: "Clockify", cls: "bg-emerald-100 text-emerald-700" },
  jobber: { label: "Jobber hours", cls: "bg-amber-100 text-amber-700" },
  manual: { label: "Manual", cls: "bg-slate-100 text-slate-600" },
};
const STATUS_CLS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", review: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700", paid: "bg-lime-100 text-lime-700", posted: "bg-emerald-100 text-emerald-700",
};
const money = (n: number | null | undefined) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Payroll() {
  const utils = trpc.useUtils();
  const { data: clients } = trpc.payroll.clients.useQuery();
  const [clientId, setClientId] = useState<number | null>(null);
  const [openRunId, setOpenRunId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = clients?.find((c) => c.id === clientId) || null;
  const { data: runs } = trpc.payroll.listRuns.useQuery({ clientId: clientId! }, { enabled: !!clientId });

  const createRun = trpc.payroll.createRun.useMutation({
    onSuccess: (r) => { utils.payroll.listRuns.invalidate({ clientId: clientId! }); setCreating(false); setOpenRunId(r.id); },
    onError: (e) => alert(`Could not create pay run: ${e.message}`),
  });
  const deleteRun = trpc.payroll.deleteRun.useMutation({
    onSuccess: () => { utils.payroll.listRuns.invalidate({ clientId: clientId! }); setOpenRunId(null); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Wallet className="h-6 w-6 text-lime-600" /> Payroll</h1>
          <p className="text-slate-500">One clean sheet per client — pay runs, hours, and the CRA remittance.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Client list */}
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-base">Payroll clients</CardTitle></CardHeader>
          <CardContent className="p-2">
            {!clients ? <p className="text-sm text-slate-400 p-3">Loading…</p>
              : clients.length === 0 ? <p className="text-sm text-slate-400 p-3">No payroll clients yet. Add employees to a client first.</p>
              : (
                <div className="space-y-1">
                  {clients.map((c) => {
                    const b = KIND_BADGE[c.kind] || KIND_BADGE.manual;
                    return (
                      <button key={c.id} onClick={() => { setClientId(c.id); setOpenRunId(null); }}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${clientId === c.id ? "bg-lime-50 ring-1 ring-lime-300" : "hover:bg-slate-50"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{c.name}</span>
                          <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className={`text-[10px] ${b.cls}`}>{b.label}</Badge>
                          <span className="text-[11px] text-slate-400">{c.employeeCount} emp{c.payrollFrequency ? ` · ${c.payrollFrequency}` : ""}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
          </CardContent>
        </Card>

        {/* Selected client */}
        <div className="space-y-4">
          {!selected ? (
            <Card><CardContent className="py-16 text-center text-slate-400">Select a payroll client to see their pay runs.</CardContent></Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{selected.name}</h2>
                  <Link to={`/client/${selected.id}`} className="text-xs text-lime-700 hover:underline inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> client card</Link>
                </div>
                <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" /> New pay run</Button>
              </div>

              {/* Special-handling note */}
              {(selected as any).note && (
                <Card className={selected.kind === "qbo_autopay" ? "border-purple-200 bg-purple-50/40" : "border-blue-200 bg-blue-50/30"}>
                  <CardContent className="p-3 text-sm text-slate-700">
                    <p>{(selected as any).note}</p>
                    {selected.kind === "qbo_autopay" && (selected as any).meta && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {(selected as any).meta.recipients.join(", ")}</span>
                        <span>{(selected as any).meta.cadence}</span>
                        <a href={(selected as any).meta.driveFolderUrl} target="_blank" rel="noreferrer" className="text-lime-700 hover:underline inline-flex items-center gap-1">paystub folder <ExternalLink className="h-3 w-3" /></a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Runs list */}
              {!runs ? <p className="text-sm text-slate-400">Loading runs…</p>
                : runs.length === 0 ? (
                  <Card><CardContent className="py-10 text-center text-slate-400">No pay runs yet. Click <b>New pay run</b> to start one.</CardContent></Card>
                ) : (
                  <div className="space-y-2">
                    {runs.map((r) => (
                      <div key={r.id}>
                        <Card className={`cursor-pointer hover:shadow-sm ${openRunId === r.id ? "ring-1 ring-lime-300" : ""}`} onClick={() => setOpenRunId(openRunId === r.id ? null : r.id)}>
                          <CardContent className="p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{format(new Date(r.payPeriodStart), "MMM d")} – {format(new Date(r.payPeriodEnd), "MMM d, yyyy")}</p>
                              <p className="text-xs text-slate-500">Pay date {r.payDate ? format(new Date(r.payDate), "MMM d, yyyy") : "—"} · {r.frequency}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-sm font-semibold text-lime-700">{money(r.totalGross)}</span>
                              <Badge variant="outline" className={`text-xs ${STATUS_CLS[r.status] || ""}`}>{r.status}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                        {openRunId === r.id && <RunDetail runId={r.id} onDelete={() => { if (confirm("Delete this pay run?")) deleteRun.mutate({ runId: r.id }); }} />}
                      </div>
                    ))}
                  </div>
                )}

              <TaxReconPanel clientId={selected.id} highlight={selected.kind === "clockify" || selected.name.toLowerCase().includes("originality")} />
            </>
          )}
        </div>
      </div>

      {creating && selected && (() => {
        // Auto-advance from the latest run's period (or the current period).
        const freq = normalizeFrequency(selected.payrollFrequency);
        const last = runs && runs[0];
        const np = nextPayPeriod(freq, last ? new Date(last.payPeriodStart) : null, last ? new Date(last.payPeriodEnd) : null);
        return (
          <NewRunDialog
            defaultFreq={freq}
            defaultSource={selected.kind === "qbo_autopay" ? "qbo_autopay" : selected.kind === "clockify" ? "clockify" : selected.kind === "jobber" ? "jobber" : "manual"}
            defaultPeriod={{ start: ymd(np.start), end: ymd(np.end), payDate: ymd(np.payDate) }}
            onClose={() => setCreating(false)}
            onCreate={(v) => createRun.mutate({ clientId: selected.id, ...v })}
            pending={createRun.isPending}
          />
        );
      })()}
    </div>
  );
}

function RunDetail({ runId, onDelete }: { runId: number; onDelete: () => void }) {
  const utils = trpc.useUtils();
  const { data } = trpc.payroll.getRun.useQuery({ runId });
  const invalidate = () => { utils.payroll.getRun.invalidate({ runId }); if (data?.run.clientId) utils.payroll.listRuns.invalidate({ clientId: data.run.clientId }); };
  const updateLine = trpc.payroll.updateLine.useMutation({ onSuccess: invalidate });
  const estimateLine = trpc.payroll.estimateLine.useMutation({ onSuccess: invalidate });
  const setStatus = trpc.payroll.setRunStatus.useMutation({ onSuccess: invalidate });

  if (!data) return <div className="text-sm text-slate-400 p-3">Loading…</div>;
  const { run, lines } = data;

  return (
    <Card className="mt-1 border-lime-200">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500">Status</Label>
            <Select value={run.status} onValueChange={(s) => setStatus.mutate({ runId, status: s as any })}>
              <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["draft", "review", "approved", "paid", "posted"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="ghost" className="h-8 text-red-500 hover:text-red-600" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete run</Button>
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No employees on file for this client. Add employees first, then recreate the run.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b">
                  <th className="text-left py-1.5 pr-2">Employee</th>
                  <th className="text-right px-1">Reg hrs</th>
                  <th className="text-right px-1">OT</th>
                  <th className="text-right px-1">Gross</th>
                  <th className="text-right px-1">CPP</th>
                  <th className="text-right px-1">EI</th>
                  <th className="text-right px-1">Tax</th>
                  <th className="text-right px-1">Net</th>
                  <th className="px-1"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l: any) => (
                  <LineRow key={l.id} line={l} onSave={(patch) => updateLine.mutate({ id: l.id, ...patch })} onEstimate={() => estimateLine.mutate({ id: l.id })} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="py-1.5 pr-2">Totals</td>
                  <td></td><td></td>
                  <td className="text-right px-1 text-lime-700">{money(run.totalGross)}</td>
                  <td colSpan={3} className="text-right px-1 text-slate-500">deduct {money(run.totalEmployeeDeductions)}</td>
                  <td className="text-right px-1">{money(run.totalNet)}</td>
                  <td></td>
                </tr>
                <tr className="text-xs text-slate-500">
                  <td className="pt-1" colSpan={9}>Employer cost (CPP 1× + EI 1.4×): {money(run.totalEmployerCost)} · CRA remittance ≈ {money((run.totalEmployeeDeductions || 0) + (run.totalEmployerCost || 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400">Deductions are a flat-rate estimate (CPP 5.95% · EI 1.66% · tax 15%), editable per cell. Not a CRA-grade calc — review before remitting.</p>
      </CardContent>
    </Card>
  );
}

function LineRow({ line, onSave, onEstimate }: { line: any; onSave: (patch: any) => void; onEstimate: () => void }) {
  const [v, setV] = useState({
    regularHours: line.regularHours ?? 0, overtimeHours: line.overtimeHours ?? 0,
    grossPay: line.grossPay ?? 0, cppEmployee: line.cppEmployee ?? 0, eiEmployee: line.eiEmployee ?? 0,
    federalTax: line.federalTax ?? 0, netPay: line.netPay ?? 0,
  });
  const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
  const cell = (key: keyof typeof v) => (
    <Input type="number" value={v[key]} onChange={(e) => setV({ ...v, [key]: num(e.target.value) })}
      onBlur={() => { if (v[key] !== (line[key] ?? 0)) onSave({ [key]: v[key] }); }}
      className="h-7 w-20 text-right text-xs px-1" />
  );
  return (
    <tr className="border-b last:border-0">
      <td className="py-1 pr-2 font-medium">{line.employeeName}{line.payType ? <span className="text-[10px] text-slate-400 ml-1">{line.payType}</span> : null}</td>
      <td className="px-1">{cell("regularHours")}</td>
      <td className="px-1">{cell("overtimeHours")}</td>
      <td className="px-1">{cell("grossPay")}</td>
      <td className="px-1">{cell("cppEmployee")}</td>
      <td className="px-1">{cell("eiEmployee")}</td>
      <td className="px-1">{cell("federalTax")}</td>
      <td className="px-1">{cell("netPay")}</td>
      <td className="px-1">
        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs" title="Estimate deductions from gross" onClick={onEstimate}><Calculator className="h-3.5 w-3.5" /></Button>
      </td>
    </tr>
  );
}

/**
 * Tax-withholding check (vs CRA) — the Originality revenue-share use case.
 * Enter each employee's YTD gross + YTD income tax QBO actually deducted; the
 * panel annualizes, computes CRA-expected tax on the accumulated income, and
 * flags under-withholding (QBO has under-withheld revenue-share pay before).
 */
type ReconRow = { name: string; ytdGross: string; ytdTax: string };

function TaxReconPanel({ clientId, highlight }: { clientId: number; highlight: boolean }) {
  const [open, setOpen] = useState(highlight);
  const { data: emps } = trpc.employee.list.useQuery({ clientId });
  const [periodsElapsed, setPeriodsElapsed] = useState("12");
  const [periodsPerYear, setPeriodsPerYear] = useState("24");
  const [rows, setRows] = useState<ReconRow[]>([{ name: "", ytdGross: "", ytdTax: "" }]);

  // Seed rows from the client's employees once they load (only if untouched).
  useEffect(() => {
    if (emps && emps.length && rows.length === 1 && !rows[0].name && !rows[0].ytdGross) {
      setRows(emps.map((e: any) => ({ name: `${e.firstName} ${e.lastName}`, ytdGross: "", ytdTax: "" })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emps, clientId]);

  const frac = Math.min(1, Math.max(0.0001, (parseFloat(periodsElapsed) || 0) / (parseFloat(periodsPerYear) || 24)));
  const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

  return (
    <Card className={highlight ? "border-emerald-200" : ""}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4 text-emerald-600" /> Tax withholding check (vs CRA)
          <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
        </CardTitle>
        <CardDescription>Catch QBO under-withholding on revenue-share / commission pay before year-end.</CardDescription>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {!TAX_2026.verified && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Using {TAX_2026.year} federal + Ontario tables (brackets, BPA, ON surtax + health premium) — cross-checked vs CRA/TaxTips; confirm against the live CRA T4127 before remitting. This is a CHECK/estimate, not a filing. Income tax only (CPP/EI excluded); assumes basic TD1.
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1">
              <Label className="text-xs">Pay periods elapsed</Label>
              <Input type="number" value={periodsElapsed} onChange={(e) => setPeriodsElapsed(e.target.value)} className="h-7 w-16 text-xs" />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs">of</Label>
              <Input type="number" value={periodsPerYear} onChange={(e) => setPeriodsPerYear(e.target.value)} className="h-7 w-16 text-xs" />
              <span className="text-xs text-slate-400">/yr ({Math.round(frac * 100)}% of year)</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b">
                  <th className="text-left py-1.5 pr-2">Employee</th>
                  <th className="text-right px-1">YTD gross</th>
                  <th className="text-right px-1">YTD tax (QBO)</th>
                  <th className="text-right px-1">Annualized</th>
                  <th className="text-right px-1">Expected YTD tax</th>
                  <th className="text-right px-1">Variance</th>
                  <th className="px-1"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const rec = reconcileWithholding(num(r.ytdGross), num(r.ytdTax), frac);
                  const has = num(r.ytdGross) > 0;
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 pr-2">
                        <Input value={r.name} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="h-7 w-40 text-xs" placeholder="Employee" />
                      </td>
                      <td className="px-1"><Input type="number" value={r.ytdGross} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, ytdGross: e.target.value } : x))} className="h-7 w-24 text-right text-xs" /></td>
                      <td className="px-1"><Input type="number" value={r.ytdTax} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, ytdTax: e.target.value } : x))} className="h-7 w-24 text-right text-xs" /></td>
                      <td className="px-1 text-right text-slate-500">{has ? money(rec.annualizedIncome) : "—"}</td>
                      <td className="px-1 text-right">{has ? money(rec.expectedYtdTax) : "—"}</td>
                      <td className={`px-1 text-right font-medium ${!has ? "" : rec.underWithheld ? "text-red-600" : "text-lime-700"}`}>
                        {has ? (
                          <span className="inline-flex items-center gap-1 justify-end">
                            {rec.underWithheld ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {money(rec.variance)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-1">
                        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-red-400 hover:text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button size="sm" variant="outline" onClick={() => setRows([...rows, { name: "", ytdGross: "", ytdTax: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add employee</Button>
          <p className="text-[11px] text-slate-400">Variance = QBO tax deducted − CRA-expected on accumulated income. <span className="text-red-600">Negative (red) = under-withheld</span> — top it up before year-end. Method: annualize YTD gross → federal + Ontario tax (incl. surtax + health premium) → prorate to date.</p>
        </CardContent>
      )}
    </Card>
  );
}

function NewRunDialog({ defaultFreq, defaultSource, defaultPeriod, onClose, onCreate, pending }: {
  defaultFreq: string; defaultSource: string;
  defaultPeriod?: { start: string; end: string; payDate: string };
  onClose: () => void;
  onCreate: (v: any) => void; pending: boolean;
}) {
  const [start, setStart] = useState(defaultPeriod?.start || "");
  const [end, setEnd] = useState(defaultPeriod?.end || "");
  const [payDate, setPayDate] = useState(defaultPeriod?.payDate || "");
  const [frequency, setFrequency] = useState(["weekly", "biweekly", "semi_monthly", "monthly"].includes(defaultFreq) ? defaultFreq : "monthly");
  const [hoursSource, setHoursSource] = useState(defaultSource);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> New pay run</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Period start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>Period end</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Pay date</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
            <div><Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="semi_monthly">Semi-monthly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Hours source</Label>
            <Select value={hoursSource} onValueChange={setHoursSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual entry</SelectItem>
                <SelectItem value="clockify">Clockify</SelectItem>
                <SelectItem value="jobber">Jobber</SelectItem>
                <SelectItem value="touchbistro">TouchBistro</SelectItem>
                <SelectItem value="qbo_autopay">QBO autopay</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-slate-400">A line is auto-created for each active employee; salaried staff get gross pre-filled from their salary ÷ periods.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!start || !end || pending} onClick={() => onCreate({
              payPeriodStart: new Date(start), payPeriodEnd: new Date(end),
              payDate: payDate ? new Date(payDate) : undefined, frequency, hoursSource,
            })}>{pending ? "Creating…" : "Create run"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
