import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { Wallet, Plus, Trash2, Calculator, Mail, ExternalLink, Building2, ChevronRight, Download, Upload, Pencil, Users, DollarSign, SlidersHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { TAX_2026 } from "../../api/payroll-tax-core";
import { nextPayPeriod, normalizeFrequency } from "../../api/payroll-core";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";

// Pay-period dates are UTC date-only (stored at UTC midnight) — format/serialize with
// UTC getters so the calendar day doesn't shift back a day in Ontario's timezone.
const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtUTC = (d: Date | string | number, withYear = false) => {
  const x = new Date(d);
  return `${MON[x.getUTCMonth()]} ${x.getUTCDate()}${withYear ? `, ${x.getUTCFullYear()}` : ""}`;
};

/** Download a run's hours as CSV (opens directly in Google Sheets / Excel). */
function exportRunCsv(run: any, lines: any[]) {
  const head = ["Employee", "Pay type", "Rate", "Reg hrs", "OT hrs", "Stat hrs", "Vac hrs", "Sick hrs", "Share bonus", "Gross", "CPP", "EI", "Tax", "Net"];
  const rows = lines.map((l: any) => [
    l.employeeName, l.payType || "", l.hourlyRate ?? "", l.regularHours ?? 0, l.overtimeHours ?? 0,
    l.statHolidayHours ?? 0, l.vacationHours ?? 0, l.sickHours ?? 0,
    l.shareBonus ?? 0, l.grossPay ?? 0, l.cppEmployee ?? 0, l.eiEmployee ?? 0, l.federalTax ?? 0, l.netPay ?? 0,
  ]);
  const esc = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const period = `${ymd(new Date(run.payPeriodStart))}_${ymd(new Date(run.payPeriodEnd))}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `payroll_${period}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

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

/** Connect-Jobber control shown on the selected client's payroll header. Always
 *  visible; reflects connection status. If the server creds aren't set yet, the
 *  connect route redirects back with a note. */
function JobberConnect({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const { data: jobber } = trpc.payroll.jobberStatus.useQuery({ clientId });
  const [setupOpen, setSetupOpen] = useState(false);
  const [cid, setCid] = useState("");
  const [csec, setCsec] = useState("");
  const saveCreds = trpc.payroll.setJobberCredentials.useMutation({
    onSuccess: () => { setSetupOpen(false); utils.payroll.jobberStatus.invalidate(); window.location.href = `/api/jobber/connect?clientId=${clientId}`; },
    onError: (e) => alert(e.message),
  });
  const disconnect = trpc.payroll.disconnectJobber.useMutation({
    onSuccess: () => utils.payroll.jobberStatus.invalidate(),
    onError: (e) => alert(e.message),
  });
  if (jobber?.connected) {
    return (
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300" title="Linked Jobber company">
          Jobber: {jobber.accountName || "connected"} ✓
        </Badge>
        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs text-slate-400 hover:text-red-600"
          title="Disconnect — use if the wrong Jobber company is linked"
          onClick={() => { if (confirm(`Disconnect ${jobber.accountName || "Jobber"} from this client?`)) disconnect.mutate({ clientId }); }}>
          Disconnect
        </Button>
      </div>
    );
  }
  const onConnect = () => {
    if (jobber && !jobber.configured) { setSetupOpen(true); return; } // need creds first
    window.location.href = `/api/jobber/connect?clientId=${clientId}`; // hard nav → server route
  };
  return (
    <>
      <Button size="sm" variant="outline" className="border-amber-300 text-amber-700" onClick={onConnect}>
        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Connect Jobber
      </Button>
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Set up Jobber (one-time)</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-slate-500">Paste your Jobber app's <strong>Client ID</strong> and <strong>Client Secret</strong> (developer.getjobber.com → Manage Apps). Stored encrypted — you won't need to do this again.</p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">If this company has its OWN separate Jobber login, sign out of Jobber (or use a private/incognito window) and sign into THAT account before connecting. If your companies SHARE one Jobber account, just connect each — hours stay separate by each company's employee list.</p>
            <div><Label>Client ID</Label><Input value={cid} onChange={(e) => setCid(e.target.value)} placeholder="xxxxxxxx-xxxx-…" /></div>
            <div><Label>Client Secret</Label><Input value={csec} onChange={(e) => setCsec(e.target.value)} placeholder="(secret)" /></div>
            <Button className="w-full bg-lime-500" disabled={saveCreds.isPending || cid.trim().length < 10 || csec.trim().length < 10}
              onClick={() => saveCreds.mutate({ clientId: cid.trim(), clientSecret: csec.trim() })}>
              {saveCreds.isPending ? "Saving…" : "Save & connect"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Payroll() {
  const utils = trpc.useUtils();
  const { data: clients } = trpc.payroll.clients.useQuery();
  const [clientId, setClientId] = useState<number | null>(null);
  const [openRunId, setOpenRunId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  // Deep-link from the client card: /payroll?clientId=N preselects the company.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const cid = Number(searchParams.get("clientId"));
    if (cid && !clientId && clients?.some((c) => c.id === cid)) setClientId(cid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  // Surface Jobber (and other) OAuth round-trip results from the URL.
  const oauthError = searchParams.get("error");
  const oauthSuccess = searchParams.get("success");
  const [notice, setNotice] = useState<{ kind: "error" | "ok"; msg: string } | null>(null);
  useEffect(() => {
    if (oauthError) setNotice({ kind: "error", msg: decodeURIComponent(oauthError) });
    else if (oauthSuccess === "jobber_connected") setNotice({ kind: "ok", msg: "Jobber connected." });
  }, [oauthError, oauthSuccess]);

  const selected = clients?.find((c) => c.id === clientId) || null;
  const { data: runs } = trpc.payroll.listRuns.useQuery({ clientId: clientId! }, { enabled: !!clientId });
  const { data: roster } = trpc.employee.list.useQuery({ clientId: clientId! }, { enabled: !!clientId });
  const [editingEmp, setEditingEmp] = useState<any | null>(null); // null=closed; {clientId} = new; {id,...} = edit
  const [showRoster, setShowRoster] = useState(false);

  const createRun = trpc.payroll.createRun.useMutation({
    onSuccess: (r) => { utils.payroll.listRuns.invalidate({ clientId: clientId! }); setCreating(false); setOpenRunId(r.id); },
    onError: (e) => alert(`Could not create pay run: ${e.message}`),
  });
  const deleteRun = trpc.payroll.deleteRun.useMutation({
    onSuccess: () => { utils.payroll.listRuns.invalidate({ clientId: clientId! }); setOpenRunId(null); },
  });
  const refreshEmp = () => { if (clientId) { utils.employee.list.invalidate({ clientId }); utils.payroll.listRuns.invalidate({ clientId }); } };
  const createEmp = trpc.employee.create.useMutation({ onSuccess: () => { refreshEmp(); setEditingEmp(null); }, onError: (e) => alert(e.message) });
  const updateEmp = trpc.employee.update.useMutation({ onSuccess: () => { refreshEmp(); setEditingEmp(null); }, onError: (e) => alert(e.message) });
  const deleteEmp = trpc.employee.delete.useMutation({ onSuccess: refreshEmp, onError: (e) => alert(e.message) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Wallet className="h-6 w-6 text-lime-600" /> Payroll</h1>
          <p className="text-slate-500">Pick a company to run its payroll — pay runs, hours, and the CRA remittance.</p>
        </div>
        {/* Company picker (dropdown, not a whole column) */}
        <div className="flex items-center gap-2">
          <Link to="/calculators"><Button size="sm" variant="outline"><Calculator className="h-3.5 w-3.5 mr-1" /> Paycheck calculator</Button></Link>
          <Label className="text-sm text-slate-500">Company</Label>
          <Select value={clientId ? String(clientId) : ""} onValueChange={(v) => { setClientId(Number(v)); setOpenRunId(null); }}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select a payroll client…" /></SelectTrigger>
            <SelectContent className="max-h-80">
              {(clients || []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name} <span className="text-slate-400">· {c.employeeCount} emp</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {notice && (
        <div className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${notice.kind === "error" ? "bg-red-50 border-red-200 text-red-700" : "bg-lime-50 border-lime-200 text-lime-700"}`}>
          <span>{notice.msg}</span>
          <button className="text-xs opacity-60 hover:opacity-100" onClick={() => setNotice(null)}>dismiss</button>
        </div>
      )}

      <div className="space-y-4">
          {!selected ? (
            <Card><CardContent className="py-16 text-center text-slate-400">Choose a company above to see and run its payroll.</CardContent></Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{selected.name}</h2>
                  <Link to={`/client/${selected.id}`} className="text-xs text-lime-700 hover:underline inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> client card</Link>
                </div>
                <div className="flex items-center gap-2">
                  {selected.kind === "jobber" && <JobberConnect clientId={selected.id} />}
                  <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" /> New pay run</Button>
                </div>
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

              {/* Revenue-share reference (Originality) — the live P&L the % is
                  taken from, plus the formula. Kept here so it's one click away
                  when running the monthly commission. */}
              {(selected as any).payrollRevenueShare && selected.name.toLowerCase().includes("originality") && (
                <Card className="border-emerald-200 bg-emerald-50/40">
                  <CardContent className="p-3 text-sm text-slate-700 space-y-1.5">
                    <div className="flex items-center gap-2 font-medium text-emerald-800">
                      <DollarSign className="h-4 w-4" /> Revenue share (Motion Invest net profit)
                    </div>
                    <p className="text-xs">
                      Commission = <b>% × Motion Invest Net Profit</b> for the month (accrued monthly; negative months carry forward).
                      Current shares: <b>Kelley Van Boxmeer 10%</b>, <b>Ryan Gunn 1%</b>. Paid via the 2303851 entity.
                    </p>
                    <a href="https://docs.google.com/spreadsheets/d/1nF7xMXWRsF8gXu6fvArYmyi7d5iTph3cKeYOnS8fdmE/edit" target="_blank" rel="noreferrer"
                      className="text-emerald-700 hover:underline inline-flex items-center gap-1 text-xs font-medium">
                      Open “Originality.AI Scorecard and PnL” <ExternalLink className="h-3 w-3" />
                    </a>
                    <p className="text-[11px] text-slate-400">Note: the “%” column beside salaried staff on the payroll sheet is each person’s effective tax rate — not a revenue share.</p>
                  </CardContent>
                </Card>
              )}

              {/* Employee roster — fully editable (salaries, rates, etc.) */}
              <Card>
                <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowRoster((s) => !s)}>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-500" /> Employees ({roster?.length ?? 0})
                    <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${showRoster ? "rotate-90" : ""}`} />
                  </CardTitle>
                  <CardDescription>Add or edit people, salaries, and hourly rates — saved to each employee's card.</CardDescription>
                </CardHeader>
                {showRoster && (
                  <CardContent className="space-y-1.5">
                    {(roster || []).map((e: any) => (
                      <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg border hover:bg-slate-50">
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditingEmp(e)}>
                          <p className="text-sm font-medium">{e.firstName} {e.lastName} {e.isActive === false ? <span className="text-[10px] text-slate-400">(inactive)</span> : null}</p>
                          <p className="text-xs text-slate-500">
                            {e.payType || "—"}
                            {e.payType === "salary" && e.annualSalary ? ` · $${e.annualSalary.toLocaleString()}/yr` : ""}
                            {e.payType !== "salary" && e.hourlyRate ? ` · $${e.hourlyRate}/hr` : ""}
                            {e.position ? ` · ${e.position}` : ""}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingEmp(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => { if (confirm(`Delete ${e.firstName} ${e.lastName}?`)) deleteEmp.mutate({ id: e.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" className="mt-1" onClick={() => setEditingEmp({ clientId: selected.id })}><Plus className="h-3.5 w-3.5 mr-1" /> Add employee</Button>
                  </CardContent>
                )}
              </Card>

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
                              <p className="text-sm font-medium">{fmtUTC(r.payPeriodStart)} – {fmtUTC(r.payPeriodEnd, true)}</p>
                              <p className="text-xs text-slate-500">Pay date {r.payDate ? fmtUTC(r.payDate, true) : "—"} · {r.frequency}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-sm font-semibold text-lime-700">{money(r.totalGross)}</span>
                              <Badge variant="outline" className={`text-xs ${STATUS_CLS[r.status] || ""}`}>{r.status}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                        {openRunId === r.id && <RunDetail runId={r.id} features={selected} onEditEmployee={setEditingEmp} onDelete={() => { if (confirm("Delete this pay run?")) deleteRun.mutate({ runId: r.id }); }} />}
                      </div>
                    ))}
                  </div>
                )}

              {/* CRA withholding reconciliation — shown for clients that have the
                  "CRA comparison" feature enabled on their card (lumpy variable
                  pay risks under-withholding). Other payrolls don't need it. */}
              {(selected as any).payrollCraComparison && (
                <TaxReconPanel clientId={selected.id} highlight />
              )}
            </>
          )}
      </div>

      {creating && selected && (() => {
        // Auto-advance from the latest run's period (or the current period).
        const freq = normalizeFrequency(selected.payrollFrequency);
        const last = runs && runs[0];
        const np = nextPayPeriod(freq, last ? new Date(last.payPeriodStart) : null, last ? new Date(last.payPeriodEnd) : null,
          { anchorStart: (selected as any).payrollAnchorStart ? new Date((selected as any).payrollAnchorStart) : null, payOffset: (selected as any).payrollPayDayOffset ?? 0 });
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

      {editingEmp && (
        <EmployeeCardDialog
          employee={editingEmp}
          onClose={() => setEditingEmp(null)}
          onSave={(data) => {
            if (editingEmp.id) updateEmp.mutate({ id: editingEmp.id, ...data });
            else createEmp.mutate({ clientId: editingEmp.clientId, firstName: data.firstName || "", lastName: data.lastName || "", ...data });
          }}
          pending={createEmp.isPending || updateEmp.isPending}
        />
      )}
    </div>
  );
}

function RunDetail({ runId, features, onDelete, onEditEmployee }: { runId: number; features?: any; onDelete: () => void; onEditEmployee: (emp: any) => void }) {
  // Optional timesheet columns. Each has a sensible DEFAULT (off unless the
  // client's payroll features call for it), but Markie can show/hide any of them
  // per-client from the "Columns" menu — the choice is remembered (localStorage).
  // We don't pay sick hours, so Sick is OFF by default; Vacation is ON.
  const featureDefaults = {
    vac: true,
    sick: false,
    bonus: !!(features?.payrollBonuses || features?.payrollRevenueShare),
    phone: !!features?.payrollPhoneAllowance,
    reimb: !!features?.payrollReimbursements,
  };
  // CRM payroll is a TIMESHEET feeding QBO Payroll — so CPP/EI/tax/net columns only
  // appear for the Originality revenue-share tax-comparison (payrollCraComparison).
  const showTax = !!features?.payrollCraComparison;
  const prefsKey = `payroll-cols-${features?.id ?? "x"}`;
  const [colPrefs, setColPrefs] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(prefsKey) || "{}"); } catch { return {}; }
  });
  const setCol = (k: string, v: boolean) => setColPrefs((p) => {
    const n = { ...p, [k]: v };
    try { localStorage.setItem(prefsKey, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  const utils = trpc.useUtils();
  const { data } = trpc.payroll.getRun.useQuery({ runId });
  const invalidate = () => { utils.payroll.getRun.invalidate({ runId }); if (data?.run.clientId) utils.payroll.listRuns.invalidate({ clientId: data.run.clientId }); };
  const updateLine = trpc.payroll.updateLine.useMutation({ onSuccess: invalidate });
  const estimateLine = trpc.payroll.estimateLine.useMutation({ onSuccess: invalidate });
  const setStatus = trpc.payroll.setRunStatus.useMutation({ onSuccess: invalidate });
  const addLine = trpc.payroll.addLine.useMutation({ onSuccess: () => { invalidate(); if (data?.run.clientId) utils.employee.list.invalidate({ clientId: data.run.clientId }); }, onError: (e) => alert(e.message) });
  const removeLine = trpc.payroll.removeLine.useMutation({ onSuccess: invalidate });
  const createApprovalLink = trpc.payroll.createApprovalLink.useMutation({ onSuccess: invalidate, onError: (e) => alert(e.message) });
  const { data: clientEmps } = trpc.employee.list.useQuery({ clientId: data?.run.clientId ?? 0 }, { enabled: !!data?.run.clientId });
  const { data: statHols } = trpc.payroll.statHolidays.useQuery({ runId });
  // The Stat-worked column appears when a stat holiday falls in this pay period
  // (paid at time-and-a-half) — or if Markie forces it on via the Columns menu.
  const showStat = colPrefs.stat ?? ((statHols?.length ?? 0) > 0);
  const cVac = colPrefs.vac ?? featureDefaults.vac;
  const cSick = colPrefs.sick ?? featureDefaults.sick;
  const cBonus = colPrefs.bonus ?? featureDefaults.bonus;
  const cPhone = colPrefs.phone ?? featureDefaults.phone;
  const cReimb = colPrefs.reimb ?? featureDefaults.reimb;
  // Total rendered columns (for the footer spans): Employee, Rate, Reg, OT,
  // [stat],[vac],[sick],[bonus], Gross, [tax×4], [phone],[reimb], action.
  const totalCols = 4 + (showStat ? 1 : 0) + (cVac ? 1 : 0) + (cSick ? 1 : 0) + (cBonus ? 1 : 0)
    + 1 + (showTax ? 4 : 0) + (cPhone ? 1 : 0) + (cReimb ? 1 : 0) + 1;
  // Spacer between "Totals" and the Gross cell = Rate + Reg + OT + optional hour cols.
  const spacerBeforeGross = 3 + (showStat ? 1 : 0) + (cVac ? 1 : 0) + (cSick ? 1 : 0) + (cBonus ? 1 : 0);
  const { data: jobber } = trpc.payroll.jobberStatus.useQuery({ clientId: data?.run.clientId ?? 0 }, { enabled: !!data?.run.clientId });
  const importJobber = trpc.payroll.importJobberHours.useMutation({
    onSuccess: (r: any) => {
      invalidate();
      if (!r.ok) { alert("Jobber import failed:\n" + r.error); return; }
      const extra = r.unmatched?.length ? `\n\nNot matched to an employee (check names):\n${r.unmatched.map((u: any) => `• ${u.name} — ${u.hours}h`).join("\n")}` : "";
      const flags = r.flagged?.length ? `\n\n⚠ Check these — long single shift (possible missed clock-out):\n${r.flagged.map((f: any) => `• ${f.name} — ${f.maxShiftHours}h shift`).join("\n")}` : "";
      alert(`Imported hours for ${r.matched} of ${r.totalUsers} Jobber worker(s).${flags}${extra}`);
    },
    onError: (e) => alert(e.message),
  });
  const importTb = trpc.payroll.importTouchBistroHours.useMutation({
    onSuccess: (r: any) => {
      invalidate();
      if (!r.ok) { alert("TouchBistro import failed:\n" + r.error); return; }
      const extra = r.unmatched?.length ? `\n\nNot matched to an employee (check names):\n${r.unmatched.map((u: any) => `• ${u.name} — ${u.hours}h`).join("\n")}` : "";
      alert(`Imported hours for ${r.matched} of ${r.totalUsers} from the TouchBistro sheet.${extra}\n\nReview the timesheet before approving.`);
    },
    onError: (e) => alert(e.message),
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFile = trpc.payroll.importTimesheetFile.useMutation({
    onSuccess: (r: any) => {
      invalidate();
      if (!r.ok) { alert("Timesheet import failed:\n" + r.error); return; }
      const extra = r.unmatched?.length ? `\n\nNot matched to an employee (check names):\n${r.unmatched.map((u: any) => `• ${u.name} — ${u.hours}h`).join("\n")}` : "";
      const flags = r.flagged?.length ? `\n\n⚠ Check these — long single shift (possible missed clock-out):\n${r.flagged.map((f: any) => `• ${f.name} — ${f.maxShiftHours}h shift`).join("\n")}` : "";
      alert(`Imported hours for ${r.matched} of ${r.totalUsers} from the timesheet.${flags}${extra}\n\nReview the timesheet before approving.`);
    },
    onError: (e) => alert(e.message),
  });
  const importFromDrive = trpc.payroll.importTimesheetFromDrive.useMutation({
    onSuccess: (r: any) => {
      invalidate();
      if (!r.ok) { alert("Drive import failed:\n" + r.error); return; }
      const extra = r.unmatched?.length ? `\n\nNot matched to an employee (check names):\n${r.unmatched.map((u: any) => `• ${u.name} — ${u.hours}h`).join("\n")}` : "";
      const flags = r.flagged?.length ? `\n\n⚠ Check these — long single shift (possible missed clock-out):\n${r.flagged.map((f: any) => `• ${f.name} — ${f.maxShiftHours}h shift`).join("\n")}` : "";
      alert(`Imported "${r.fileName}" from Drive — ${r.matched} of ${r.totalUsers} matched.${flags}${extra}\n\nReview the timesheet before approving.`);
    },
    onError: (e) => alert(e.message),
  });
  const onTimesheetFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { alert("That file is over 12 MB — please export a smaller PDF/CSV."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const data = res.includes(",") ? res.split(",")[1] : res; // strip data: prefix
      importFile.mutate({ runId, data, mediaType: file.type || "application/octet-stream", fileName: file.name });
    };
    reader.readAsDataURL(file);
  };

  if (!data) return <div className="text-sm text-slate-400 p-3">Loading…</div>;
  const { run, lines } = data;
  // Salaried staff on top, then everyone else — each alphabetical by name.
  const sortedLines = [...lines].sort((a: any, b: any) => {
    const rank = (l: any) => (l.payType === "salary" ? 0 : 1);
    return rank(a) - rank(b) || String(a.employeeName || "").localeCompare(String(b.employeeName || ""));
  });
  const inRun = new Set(lines.map((l: any) => l.employeeId));
  const availableEmps = (clientEmps || []).filter((e: any) => !inRun.has(e.id));

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
          <div className="flex items-center gap-2">
            {features?.kind === "touchbistro" && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.csv,.txt,image/*,application/pdf"
                  className="hidden"
                  onChange={onTimesheetFile}
                />
                <Button size="sm" variant="outline" className="h-8 border-rose-300 text-rose-700" onClick={() => importFromDrive.mutate({ runId })} disabled={importFromDrive.isPending} title="Import the newest timesheet you saved in this client's Google Drive folder (needs Google connected)">
                  <Download className="h-3.5 w-3.5 mr-1" /> {importFromDrive.isPending ? "Reading from Drive…" : "Import from Drive"}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-rose-600" onClick={() => fileInputRef.current?.click()} disabled={importFile.isPending} title="Or upload the detailed timesheet file straight from this device">
                  <Upload className="h-3.5 w-3.5 mr-1" /> {importFile.isPending ? "Reading timesheet…" : "Upload file"}
                </Button>
              </>
            )}
            {features?.kind === "jobber" && jobber?.connected && (
              <Button size="sm" variant="outline" className="h-8 border-amber-300 text-amber-700" onClick={() => importJobber.mutate({ runId })} disabled={importJobber.isPending}>
                <Download className="h-3.5 w-3.5 mr-1" /> {importJobber.isPending ? "Importing…" : "Import Jobber hours"}
              </Button>
            )}
            {features?.kind === "jobber" && jobber?.configured && !jobber.connected && (
              <a href={`/api/jobber/connect?clientId=${run.clientId}`}>
                <Button size="sm" variant="outline" className="h-8 border-amber-300 text-amber-700"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Connect Jobber</Button>
              </a>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8"><SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Columns</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={showStat} onCheckedChange={(v) => setCol("stat", !!v)}>Stat 1.5×</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={cVac} onCheckedChange={(v) => setCol("vac", !!v)}>Vacation hrs</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={cSick} onCheckedChange={(v) => setCol("sick", !!v)}>Sick hrs</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={cBonus} onCheckedChange={(v) => setCol("bonus", !!v)}>Share bonus</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={cPhone} onCheckedChange={(v) => setCol("phone", !!v)}>Phone allowance</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={cReimb} onCheckedChange={(v) => setCol("reimb", !!v)}>Reimbursement</DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" className="h-8" onClick={() => exportRunCsv(run, lines)}><Download className="h-3.5 w-3.5 mr-1" /> Export hours (CSV)</Button>
            <Button size="sm" variant="ghost" className="h-8 text-red-500 hover:text-red-600" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete run</Button>
          </div>
        </div>

        <ApprovalBar run={run} onCreateLink={() => createApprovalLink.mutate({ runId })} creating={createApprovalLink.isPending} isTouchbistro={features?.kind === "touchbistro"} />

        {statHols && statHols.length > 0 && (
          <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
            <strong>Stat holiday{statHols.length > 1 ? "s" : ""} in this period —</strong>{" "}
            {statHols.map((h: any) => `${h.name} (${h.date})`).join(", ")}. Make sure stat holiday pay is captured for
            eligible employees before this goes to QuickBooks. <span className="text-amber-600">(Ontario ESA dates.)</span>
          </div>
        )}

        {lines.length === 0 ? (
          <p className="text-sm text-slate-400 py-3 text-center">No employees on this run yet — add one below to start the timesheet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b">
                  <th className="text-left py-1.5 pr-2">Employee</th>
                  <th className="text-right px-1">Rate</th>
                  <th className="text-right px-1">Reg hrs</th>
                  <th className="text-right px-1">OT</th>
                  {showStat && <th className="text-right px-1" title="Hours worked on a stat holiday — paid at 1.5×">Stat 1.5×</th>}
                  {cVac && <th className="text-right px-1">Vac hrs</th>}
                  {cSick && <th className="text-right px-1">Sick hrs</th>}
                  {cBonus && <th className="text-right px-1">Share bonus</th>}
                  <th className="text-right px-1">Gross</th>
                  {showTax && <th className="text-right px-1">CPP</th>}
                  {showTax && <th className="text-right px-1">EI</th>}
                  {showTax && <th className="text-right px-1">Tax</th>}
                  {showTax && <th className="text-right px-1">Net</th>}
                  {cPhone && <th className="text-right px-1">Phone</th>}
                  {cReimb && <th className="text-right px-1">Reimb</th>}
                  <th className="px-1"></th>
                </tr>
              </thead>
              <tbody>
                {sortedLines.map((l: any) => (
                  <LineRow key={l.id} line={l} showBonus={cBonus} showVac={cVac} showSick={cSick} showPhone={cPhone} showReimb={cReimb} showTax={showTax} showStat={showStat}
                    onSave={(patch) => updateLine.mutate({ id: l.id, ...patch })}
                    onEstimate={() => estimateLine.mutate({ id: l.id })}
                    onEditEmployee={() => { const emp = (clientEmps || []).find((e: any) => e.id === l.employeeId); if (emp) onEditEmployee(emp); }}
                    onRemove={() => { if (confirm(`Remove ${l.employeeName} from this run?`)) removeLine.mutate({ id: l.id }); }} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="py-1.5 pr-2">Totals</td>
                  <td colSpan={spacerBeforeGross}></td>
                  <td className="text-right px-1 text-lime-700">{money(run.totalGross)}</td>
                  {showTax && <td colSpan={3} className="text-right px-1 text-slate-500">deduct {money(run.totalEmployeeDeductions)}</td>}
                  {showTax && <td className="text-right px-1">{money(run.totalNet)}</td>}
                  <td colSpan={1 + (cPhone ? 1 : 0) + (cReimb ? 1 : 0)}></td>
                </tr>
                {showTax && (
                  <tr className="text-xs text-slate-500">
                    <td className="pt-1" colSpan={totalCols}>Employer cost (CPP 1× + EI 1.4×): {money(run.totalEmployerCost)} · CRA remittance ≈ {money((run.totalEmployeeDeductions || 0) + (run.totalEmployerCost || 0))} · Net total includes phone/reimbursement add-ons.</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}

        <AddLineForm
          available={availableEmps}
          onAddExisting={(employeeId) => addLine.mutate({ payRunId: runId, employeeId })}
          onAddNew={(ne) => addLine.mutate({ payRunId: runId, newEmployee: ne })}
          pending={addLine.isPending}
        />

        {showTax ? (
          <p className="text-[11px] text-slate-400">Tax-comparison view (revenue-share). Deductions use the CRA T4127 method (real CPP/CPP2 · EI · federal + Ontario tax, 2026 tables), YTD-aware via each employee's opening carryforward, to check QuickBooks is withholding enough. Click the <Calculator className="h-3 w-3 inline" /> to calculate a line. Every cell stays editable — this is a check, not the payroll run.</p>
        ) : (
          <p className="text-[11px] text-slate-400">Timesheet only — enter hours (regular · OT · stat). These feed <strong>QuickBooks Payroll</strong>, which calculates CPP/EI/tax and pays the employees. Use ∑ to total gross from hours. Review &amp; get client approval before sending to QBO.</p>
        )}
      </CardContent>
    </Card>
  );
}

function LineRow({ line, showBonus, showVac, showSick, showPhone, showReimb, showTax, showStat, onSave, onEstimate, onRemove, onEditEmployee }: { line: any; showBonus?: boolean; showVac?: boolean; showSick?: boolean; showPhone?: boolean; showReimb?: boolean; showTax?: boolean; showStat?: boolean; onSave: (patch: any) => void; onEstimate: () => void; onRemove: () => void; onEditEmployee: () => void }) {
  const [v, setV] = useState({
    regularHours: line.regularHours ?? 0, overtimeHours: line.overtimeHours ?? 0,
    statHolidayHours: line.statHolidayHours ?? 0, vacationHours: line.vacationHours ?? 0, sickHours: line.sickHours ?? 0,
    shareBonus: line.shareBonus ?? 0,
    grossPay: line.grossPay ?? 0, cppEmployee: line.cppEmployee ?? 0, eiEmployee: line.eiEmployee ?? 0,
    federalTax: line.federalTax ?? 0, netPay: line.netPay ?? 0,
    phoneAllowance: line.phoneAllowance ?? 0, reimbursement: line.reimbursement ?? 0,
  });
  const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
  const rate = line.hourlyRate ?? null;
  // Sum hour types into gross: (reg + vac + sick)×rate + (OT + stat-worked)×1.5×rate
  // + share bonus. Stat-holiday hours WORKED are premium pay (time-and-a-half).
  // (Rough total for the timesheet — QBO Payroll does the authoritative pay calc.)
  const sumGross = () => {
    const r = rate || 0;
    // Only count hour types whose column is shown (we don't pay sick by default).
    const vac = showVac ? v.vacationHours : 0;
    const sick = showSick ? v.sickHours : 0;
    const bonus = showBonus ? v.shareBonus : 0;
    const stat = showStat ? v.statHolidayHours : 0;
    const g = Math.round((((v.regularHours + vac + sick) * r) + ((v.overtimeHours + stat) * r * 1.5) + bonus) * 100) / 100;
    setV({ ...v, grossPay: g }); onSave({ grossPay: g });
  };
  const cell = (key: keyof typeof v) => (
    <Input type="number" value={v[key]} onChange={(e) => setV({ ...v, [key]: num(e.target.value) })}
      onBlur={() => { if (v[key] !== (line[key] ?? 0)) onSave({ [key]: v[key] }); }}
      className="h-7 w-20 text-right text-xs px-1" />
  );
  return (
    <tr className="border-b last:border-0">
      <td className="py-1 pr-2 font-medium">
        <button className="hover:text-lime-700 hover:underline text-left" title="Edit employee card" onClick={onEditEmployee}>{line.employeeName}</button>
        {line.payType ? <span className="text-[10px] text-slate-400 ml-1">{line.payType}</span> : null}
        {line.notes ? <span className="text-amber-600 ml-1" title={line.notes}>⚠</span> : null}
      </td>
      <td className="px-1 text-right text-xs text-slate-500">{rate != null ? `$${rate}` : "—"}</td>
      <td className="px-1">{cell("regularHours")}</td>
      <td className="px-1">{cell("overtimeHours")}</td>
      {showStat && <td className="px-1">{cell("statHolidayHours")}</td>}
      {showVac && <td className="px-1">{cell("vacationHours")}</td>}
      {showSick && <td className="px-1">{cell("sickHours")}</td>}
      {showBonus && <td className="px-1">{cell("shareBonus")}</td>}
      <td className="px-1">{cell("grossPay")}</td>
      {showTax && <td className="px-1">{cell("cppEmployee")}</td>}
      {showTax && <td className="px-1">{cell("eiEmployee")}</td>}
      {showTax && <td className="px-1">{cell("federalTax")}</td>}
      {showTax && <td className="px-1">{cell("netPay")}</td>}
      {showPhone && <td className="px-1">{cell("phoneAllowance")}</td>}
      {showReimb && <td className="px-1">{cell("reimbursement")}</td>}
      <td className="px-1 whitespace-nowrap">
        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs" title="Sum hours×rate + OT + stat + bonus into gross" onClick={sumGross}>∑</Button>
        {showTax && <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs" title="Estimate deductions from gross (comparison check)" onClick={onEstimate}><Calculator className="h-3.5 w-3.5" /></Button>}
        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-red-400 hover:text-red-600" title="Remove from run" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
      </td>
    </tr>
  );
}

/** Client hours-approval bar: generate a shareable link, show status. */
function ApprovalBar({ run, onCreateLink, creating, isTouchbistro }: { run: any; onCreateLink: () => void; creating: boolean; isTouchbistro?: boolean }) {
  const [copied, setCopied] = useState(false);
  const token = run.approvalToken;
  const url = token ? `${window.location.origin}/approve/${token}` : "";
  const status = run.approvalStatus || "none";
  const badge = status === "approved" ? "bg-lime-100 text-lime-700"
    : status === "changes_requested" ? "bg-amber-100 text-amber-700"
    : status === "sent" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 border p-2">
      <span className="text-xs font-medium text-slate-600">Client approval:</span>
      <Badge variant="outline" className={`text-[10px] ${badge}`}>
        {status === "none" ? "not sent" : status === "changes_requested" ? "changes requested" : status}
      </Badge>
      {run.approvedByName && <span className="text-[11px] text-slate-500">by {run.approvedByName}</span>}
      {!token ? (
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={creating} onClick={onCreateLink}>
          <Mail className="h-3.5 w-3.5 mr-1" /> Create approval link
        </Button>
      ) : (
        <>
          <Input readOnly value={url} className="h-7 text-xs flex-1 min-w-[200px]" onFocus={(e) => e.target.select()} />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? "Copied!" : "Copy link"}
          </Button>
          <a href={`mailto:?subject=${encodeURIComponent("Payroll hours for approval")}&body=${encodeURIComponent(`Please review and approve the payroll hours: ${url}`)}`}
            className="text-xs text-lime-700 hover:underline">email</a>
        </>
      )}
      {isTouchbistro && (
        <a href="https://login.touchbistro.com/" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center h-7 text-xs px-2 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50">
          <ExternalLink className="h-3.5 w-3.5 mr-1" /> TouchBistro login
        </a>
      )}
    </div>
  );
}

/** Add an employee to the run: pick an existing one, or create a new employee
 *  inline (so a client with no employees on file can still build a timesheet). */
function AddLineForm({ available, onAddExisting, onAddNew, pending }: {
  available: any[];
  onAddExisting: (employeeId: number) => void;
  onAddNew: (ne: { firstName: string; lastName?: string; payType?: string; hourlyRate?: number; annualSalary?: number }) => void;
  pending: boolean;
}) {
  const [mode, setMode] = useState<"existing" | "new">(available.length ? "existing" : "new");
  const [pick, setPick] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [payType, setPayType] = useState("hourly");
  const [rate, setRate] = useState("");
  const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? undefined : n; };

  return (
    <div className="border-t pt-3 flex flex-wrap items-end gap-2">
      <div className="flex rounded-lg border bg-white p-0.5">
        <button onClick={() => setMode("existing")} disabled={!available.length}
          className={`px-2 py-1 text-xs rounded-md ${mode === "existing" ? "bg-lime-500 text-white" : "text-slate-600"} ${!available.length ? "opacity-40" : ""}`}>Existing</button>
        <button onClick={() => setMode("new")}
          className={`px-2 py-1 text-xs rounded-md ${mode === "new" ? "bg-lime-500 text-white" : "text-slate-600"}`}>New employee</button>
      </div>

      {mode === "existing" ? (
        <>
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder={available.length ? "Choose employee" : "All employees already added"} /></SelectTrigger>
            <SelectContent>
              {available.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName} {e.payType ? `· ${e.payType}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!pick || pending} onClick={() => { onAddExisting(Number(pick)); setPick(""); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </>
      ) : (
        <>
          <Input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" className="h-8 w-28 text-xs" />
          <Input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" className="h-8 w-28 text-xs" />
          <Select value={payType} onValueChange={setPayType}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="salary">Salary</SelectItem>
              <SelectItem value="commission">Commission</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={payType === "salary" ? "Annual $" : "$/hr"} className="h-8 w-24 text-xs" />
          <Button size="sm" disabled={!first.trim() || pending} onClick={() => {
            onAddNew({ firstName: first.trim(), lastName: last.trim() || undefined, payType,
              hourlyRate: payType === "salary" ? undefined : num(rate),
              annualSalary: payType === "salary" ? num(rate) : undefined });
            setFirst(""); setLast(""); setRate("");
          }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Tax-withholding check (vs CRA) — AUTOMATIC. Pulls each employee's YTD gross +
 * YTD income tax from the client's actual pay runs this year, annualizes, and
 * flags under-withholding. No manual entry — mirrors the Originality sheet's
 * "Expected CRA Deduction (YTD)" vs "Actual Tax Deducted (YTD)" columns.
 */
function TaxReconPanel({ clientId, highlight }: { clientId: number; highlight: boolean }) {
  const [open, setOpen] = useState(highlight);
  const { data } = trpc.payroll.withholdingCheck.useQuery({ clientId });
  const rows = data?.rows || [];
  const underCount = rows.filter((r: any) => r.underWithheld).length;

  return (
    <Card className={highlight ? "border-emerald-200" : ""}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4 text-emerald-600" /> Tax withholding check (vs CRA)
          {underCount > 0 && <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700">{underCount} under-withheld</Badge>}
          <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
        </CardTitle>
        <CardDescription>Auto-computed from this client's pay runs this year — catches QBO under-withholding before year-end.</CardDescription>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {!TAX_2026.verified && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Using {TAX_2026.year} federal + Ontario tables (brackets, BPA, ON surtax + health premium) — cross-checked vs CRA/TaxTips; confirm against the live CRA T4127 before remitting. Income tax only (CPP/EI excluded); assumes basic TD1.
            </div>
          )}
          {!data || data.runsCount === 0 ? (
            <p className="text-sm text-slate-400 py-3 text-center">No pay runs yet this year — the check fills in automatically as you run each payroll (gross + tax per employee).</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-400 py-3 text-center">Pay runs exist but no gross entered yet — enter each employee's gross + tax on the runs above.</p>
          ) : (
            <>
              <p className="text-xs text-slate-500">As of <b>{data.runsCount}</b> of {data.periodsPerYear} pay periods this year ({Math.round(data.fraction * 100)}% of year).</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b">
                      <th className="text-left py-1.5 pr-2">Employee</th>
                      <th className="text-right px-1">YTD gross</th>
                      <th className="text-right px-1">YTD tax (deducted)</th>
                      <th className="text-right px-1">Annualized</th>
                      <th className="text-right px-1">Expected YTD tax</th>
                      <th className="text-right px-1">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any) => (
                      <tr key={r.employeeId} className="border-b last:border-0">
                        <td className="py-1 pr-2 font-medium">{r.name}</td>
                        <td className="px-1 text-right">{money(r.ytdGross)}</td>
                        <td className="px-1 text-right">{money(r.ytdTax)}</td>
                        <td className="px-1 text-right text-slate-500">{money(r.annualizedIncome)}</td>
                        <td className="px-1 text-right">{money(r.expectedYtdTax)}</td>
                        <td className={`px-1 text-right font-medium ${r.underWithheld ? "text-red-600" : "text-lime-700"}`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {r.underWithheld ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {money(r.variance)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400">Variance = tax deducted − CRA-expected on accumulated income. <span className="text-red-600">Negative (red) = under-withheld</span> — top it up before year-end. Method: annualize YTD gross → federal + Ontario tax (incl. surtax + health premium) → prorate to {Math.round(data.fraction * 100)}% of year. Most accurate later in the year for lumpy revenue-share pay.</p>
            </>
          )}
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

/** Editable employee card — add or change a person, their pay type, salary,
 *  hourly rate, contact, and a free-text notes/history field. */
function EmployeeCardDialog({ employee, onClose, onSave, pending }: {
  employee: any; onClose: () => void;
  onSave: (data: any) => void; pending: boolean;
}) {
  const isNew = !employee.id;
  // SIN is hidden by default (stored encrypted). Reveal/set is gated by a code.
  const [sin, setSin] = useState("");
  const [sinTouched, setSinTouched] = useState(false);
  const [sinCode, setSinCode] = useState("");
  const revealSin = trpc.employee.revealSin.useMutation();
  const [f, setF] = useState({
    firstName: employee.firstName || "", lastName: employee.lastName || "",
    payType: employee.payType || "hourly",
    annualSalary: employee.annualSalary != null ? String(employee.annualSalary) : "",
    hourlyRate: employee.hourlyRate != null ? String(employee.hourlyRate) : "",
    hoursPerWeek: employee.hoursPerWeek != null ? String(employee.hoursPerWeek) : "",
    position: employee.position || "", email: employee.email || "", phone: employee.phone || "",
    isActive: employee.isActive !== false,
    contractUrl: employee.contractUrl || "",
    phoneAllowance: employee.phoneAllowance != null ? String(employee.phoneAllowance) : "",
    reimbursementAmount: employee.reimbursementAmount != null ? String(employee.reimbursementAmount) : "",
    reimbursementNote: employee.reimbursementNote || "",
    // Per-employee payroll features (default phone/reimbursement on if an amount exists).
    getsRevenueShare: employee.getsRevenueShare ?? false,
    revenueSharePercent: employee.revenueSharePercent != null ? String(employee.revenueSharePercent) : "",
    getsBonus: employee.getsBonus ?? false,
    getsDividends: employee.getsDividends ?? false,
    getsPhoneAllowance: employee.getsPhoneAllowance ?? ((employee.phoneAllowance ?? 0) > 0),
    getsReimbursement: employee.getsReimbursement ?? ((employee.reimbursementAmount ?? 0) > 0),
    ytdGrossOpening: employee.ytdGrossOpening != null ? String(employee.ytdGrossOpening) : "",
    notes: employee.notes || "",
  });
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? undefined : n; };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{isNew ? <><Plus className="h-4 w-4" /> New employee</> : <><Pencil className="h-4 w-4" /> {employee.firstName} {employee.lastName}</>}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First name</Label><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus /></div>
            <div><Label>Last name</Label><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Pay type</Label>
              <Select value={f.payType} onValueChange={(v) => set("payType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="salary">Salary</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {f.payType === "salary" ? (
              <div><Label>Annual salary</Label><Input type="number" value={f.annualSalary} onChange={(e) => set("annualSalary", e.target.value)} /></div>
            ) : (
              <div><Label>Hourly rate</Label><Input type="number" value={f.hourlyRate} onChange={(e) => set("hourlyRate", e.target.value)} /></div>
            )}
            <div><Label>Hrs / week</Label><Input type="number" value={f.hoursPerWeek} onChange={(e) => set("hoursPerWeek", e.target.value)} /></div>
          </div>
          <div>
            <Label>Position</Label><Input value={f.position} onChange={(e) => set("position", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          </div>
          <div>
            <Label className="flex items-center justify-between">
              <span>Contract / agreement link</span>
              {f.contractUrl ? <a href={f.contractUrl} target="_blank" rel="noreferrer" className="text-xs text-lime-700 hover:underline inline-flex items-center gap-1">open <ExternalLink className="h-3 w-3" /></a> : null}
            </Label>
            <Input value={f.contractUrl} onChange={(e) => set("contractUrl", e.target.value)} placeholder="Google Drive link to the signed contract…" />
          </div>
          {/* SIN — hidden by default, stored encrypted. Reveal/set needs the code. */}
          <div className="rounded-lg border p-2.5 space-y-2">
            <Label className="text-xs uppercase font-semibold text-slate-500 flex items-center gap-1"><Lock className="h-3 w-3" /> SIN {employee.hasSin && !sinTouched && !sin ? <span className="text-slate-400 normal-case">· on file (hidden)</span> : null}</Label>
            <div className="flex gap-2">
              <Input value={sin} onChange={(e) => { setSin(e.target.value); setSinTouched(true); }} placeholder={employee.hasSin ? "•••-•••-••• (enter to replace)" : "000-000-000"} />
              {!isNew && employee.hasSin && (
                <>
                  <Input type="password" value={sinCode} onChange={(e) => setSinCode(e.target.value)} placeholder="code" className="w-24" />
                  <Button type="button" size="sm" variant="outline" disabled={revealSin.isPending || !sinCode} onClick={async () => {
                    const r = await revealSin.mutateAsync({ id: employee.id, code: sinCode });
                    if (!r.ok) { alert(r.reason || "Could not reveal."); return; }
                    setSin(r.sin || ""); setSinTouched(false);
                  }}>Reveal</Button>
                </>
              )}
            </div>
          </div>
          {/* Per-employee payroll features — tick which apply to this person. */}
          <div className="rounded-lg border p-2.5 space-y-2">
            <Label className="text-xs uppercase font-semibold text-slate-500">Payroll features for this employee</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                ["getsRevenueShare", "Revenue share"],
                ["getsBonus", "Bonus"],
                ["getsDividends", "Dividends"],
                ["getsPhoneAllowance", "Phone allowance"],
                ["getsReimbursement", "Reimbursement"],
              ] as [string, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-lime-500" checked={!!(f as any)[key]} onChange={(e) => set(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
            {f.getsRevenueShare && (
              <div><Label className="text-xs">Revenue share %</Label><Input type="number" value={f.revenueSharePercent} onChange={(e) => set("revenueSharePercent", e.target.value)} placeholder="e.g. 10" /></div>
            )}
            {f.getsPhoneAllowance && (
              <div><Label className="text-xs">Phone allowance ($/pay)</Label><Input type="number" value={f.phoneAllowance} onChange={(e) => set("phoneAllowance", e.target.value)} placeholder="0.00" /></div>
            )}
            {f.getsReimbursement && (
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Reimbursement ($/pay)</Label><Input type="number" value={f.reimbursementAmount} onChange={(e) => set("reimbursementAmount", e.target.value)} placeholder="0.00" /></div>
                <div><Label className="text-xs">For</Label><Input value={f.reimbursementNote} onChange={(e) => set("reimbursementNote", e.target.value)} placeholder="What it's for…" /></div>
              </div>
            )}
          </div>
          <div>
            <Label>Opening YTD gross (this year)</Label>
            <Input type="number" value={f.ytdGrossOpening} onChange={(e) => set("ytdGrossOpening", e.target.value)} placeholder="Carryforward from prior payroll — feeds CPP/EI maxing" />
          </div>
          <div>
            <Label>Notes / history</Label>
            <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Rate changes, start/end dates, anything to track on this employee's card…" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} className="w-4 h-4 accent-lime-500" />
            Active employee
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!f.firstName.trim() || pending} onClick={() => onSave({
              firstName: f.firstName.trim(), lastName: f.lastName.trim(),
              payType: f.payType,
              annualSalary: f.payType === "salary" ? num(f.annualSalary) : undefined,
              hourlyRate: f.payType !== "salary" ? num(f.hourlyRate) : undefined,
              hoursPerWeek: num(f.hoursPerWeek),
              position: f.position.trim() || undefined,
              email: f.email.trim() || undefined, phone: f.phone.trim() || undefined,
              contractUrl: f.contractUrl.trim() || undefined,
              phoneAllowance: f.phoneAllowance.trim() === "" ? null : num(f.phoneAllowance),
              reimbursementAmount: f.reimbursementAmount.trim() === "" ? null : num(f.reimbursementAmount),
              reimbursementNote: f.reimbursementNote.trim() || undefined,
              getsRevenueShare: !!f.getsRevenueShare,
              revenueSharePercent: f.revenueSharePercent.trim() === "" ? null : num(f.revenueSharePercent),
              getsBonus: !!f.getsBonus, getsDividends: !!f.getsDividends,
              getsPhoneAllowance: !!f.getsPhoneAllowance, getsReimbursement: !!f.getsReimbursement,
              ytdGrossOpening: f.ytdGrossOpening.trim() === "" ? null : num(f.ytdGrossOpening),
              ...(sinTouched ? { sin: sin.trim() } : {}),
              isActive: f.isActive, notes: f.notes.trim() || undefined,
            })}>{pending ? "Saving…" : isNew ? "Create" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
