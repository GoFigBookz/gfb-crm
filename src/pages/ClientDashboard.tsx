import { useState, useEffect, useRef } from "react";
import { computeT5Boxes } from "../../api/dividend-core";
import { useParams, Link, useNavigate } from "react-router";
import { ArrowLeft, Building2, Receipt, CreditCard, Users, Briefcase, AlertCircle, AlertTriangle, Info, CheckCircle, Clock, DollarSign, TrendingUp, TrendingDown, Shield, FileText, Calendar, Package, ChevronDown, ChevronUp, ChevronRight, ExternalLink, FolderOpen, Link2, Edit, Plus, X, Timer, BarChart3, Trash2, Wallet, Globe, Mail, FileSpreadsheet, Bot, ClipboardCheck, Loader2 } from "lucide-react";
import { fiscalHstRange, normalizeFreq } from "../../api/hst-period";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { splitClientName } from "@/lib/clientName";
import { format, isPast, isToday } from "date-fns";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { STANDARD_TASK_TITLES } from "@/lib/task-options";
import { RevRecTab } from "@/components/RevRecTab";
import { LoanTrackerTab } from "@/components/LoanTrackerTab";
import PaymentSourceCard from "@/components/PaymentSourceCard";
import IntercoRechargePanel from "@/components/IntercoRechargePanel";

export default function ClientDashboard() {
  const { clientId } = useParams<{ clientId: string }>();
  const id = Number(clientId);
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const [showLogTime, setShowLogTime] = useState(false);

  const { data: client } = trpc.crmClient.get.useQuery(
    { id },
    { enabled: !!id }
  );

  const { data: dashboardData } = trpc.clientDashboard.getByClient.useQuery(
    { clientId: id },
    { enabled: !!id }
  );

  const { data: qboBilling } = trpc.clientDashboard.getQboBilling.useQuery(
    { clientId: id },
    { enabled: !!id }
  );

  const { data: timesheetPeriods } = trpc.clientDashboard.getTimesheetsByPeriod.useQuery(
    { clientId: id },
    { enabled: !!id }
  );

  // Actual pay runs (the Payroll-page data: backfilled + live runs).
  const { data: payRunsList } = trpc.payroll.listRuns.useQuery(
    { clientId: id },
    { enabled: !!id }
  );

  const { data: employees } = trpc.employee.list.useQuery(
    { clientId: id },
    { enabled: !!id }
  );

  const { data: timeSummary } = trpc.time.getClientMonthlySummary.useQuery(
    { clientId: id },
    { enabled: !!id }
  );

  const { data: qboConn } = trpc.qbo.connectionForClient.useQuery(
    { clientId: id },
    { enabled: !!id }
  );

  const { data: closeStatus } = trpc.monthEnd.getClientStatus.useQuery(
    { clientId: id },
    { enabled: !!id }
  );

  const { data: clientTrend } = trpc.dashboard.clientTrend.useQuery(
    { clientId: id, days: 30 },
    { enabled: !!id }
  );

  const { data: quote } = trpc.quote.forClient.useQuery(
    { clientId: id },
    { enabled: !!id }
  );
  const { data: clientDocs } = trpc.quote.documents.useQuery(
    { clientId: id },
    { enabled: !!id }
  );

  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const archiveClient = trpc.crmClient.archive.useMutation({
    onSuccess: () => { utils.crmClient.list.invalidate(); navigate("/clients"); },
  });
  const updateClient = trpc.crmClient.update.useMutation({
    onSuccess: () => utils.crmClient.get.invalidate({ id }),
  });
  const bankAccounts = trpc.qbo.accountsForClient.useQuery({ clientId: id });
  const deleteClient = trpc.crmClient.delete.useMutation({
    onSuccess: () => { utils.crmClient.list.invalidate(); navigate("/clients"); },
  });
  // Merge a duplicate INTO this client (this record is the keeper).
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeDupeId, setMergeDupeId] = useState<number | null>(null);
  const { data: allClientsForMerge } = trpc.crmClient.list.useQuery(undefined, { enabled: mergeOpen });
  const mergeClient = trpc.crmClient.merge.useMutation({
    onSuccess: (r: any) => {
      const movedTotal = Object.values(r?.moved || {}).reduce((s: number, n: any) => s + (Number(n) || 0), 0);
      alert(`Merged. Moved ${movedTotal} record(s) onto this client and removed the duplicate.`);
      setMergeOpen(false); setMergeDupeId(null); setMergeSearch("");
      utils.crmClient.get.invalidate({ id }); utils.crmClient.list.invalidate();
    },
    onError: (e) => alert("Merge failed: " + e.message),
  });
  const saveSnapshot = trpc.clientDashboard.saveSnapshot.useMutation({
    onSuccess: () => utils.clientDashboard.getByClient.invalidate({ clientId: id }),
  });
  const createTime = trpc.time.create.useMutation({
    onSuccess: () => {
      utils.time.getClientMonthlySummary.invalidate({ clientId: id });
      setShowLogTime(false);
    },
  });
  const deleteTime = trpc.time.delete.useMutation({
    onSuccess: () => utils.time.getClientMonthlySummary.invalidate({ clientId: id }),
  });
  const invalidateDocs = () => { utils.quote.documents.invalidate({ clientId: id }); utils.crmClient.get.invalidate({ id }); };
  const genQuote = trpc.quote.createSignableQuote.useMutation({ onSuccess: invalidateDocs });
  const genEngagement = trpc.quote.createEngagementLetter.useMutation({ onSuccess: invalidateDocs });
  const genCra = trpc.quote.createCraAuthRequest.useMutation({ onSuccess: invalidateDocs });
  const deleteDoc = trpc.signature.delete.useMutation({ onSuccess: invalidateDocs });
  const activateClient = trpc.quote.activateClient.useMutation({
    onSuccess: () => { invalidateDocs(); utils.clientDashboard.getByClient.invalidate({ clientId: id }); },
  });
  const [editingIntake, setEditingIntake] = useState(false);
  const updateIntake = trpc.onboarding.updateRecord.useMutation({
    onSuccess: () => {
      utils.clientDashboard.getByClient.invalidate({ clientId: id });
      utils.crmClient.get.invalidate({ id });
      utils.crmClient.list.invalidate();
      utils.quote.forClient.invalidate({ clientId: id });
      utils.monthEnd.getClientStatus.invalidate({ clientId: id });
      utils.onboarding.getRecord.invalidate({ clientId: id });
      setEditingIntake(false);
    },
    onError: (e) => alert(`Could not save intake: ${e.message}`),
  });
  const invalidateTasks = () => utils.clientDashboard.getByClient.invalidate({ clientId: id });
  const completeTask = trpc.task.complete.useMutation({ onSuccess: invalidateTasks });
  const updateTask = trpc.task.update.useMutation({ onSuccess: invalidateTasks });
  const deleteTask = trpc.task.delete.useMutation({ onSuccess: invalidateTasks });
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [editingQuote, setEditingQuote] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const { data: workflows } = trpc.task.listWorkflows.useQuery();
  const createTask = trpc.task.create.useMutation({ onSuccess: () => { invalidateTasks(); setCreatingTask(false); } });
  const applyWorkflow = trpc.task.applyWorkflow.useMutation({
    onSuccess: (r) => { invalidateTasks(); alert(`Added ${r.created} tasks from "${r.templateName}".`); },
    onError: (e) => alert(`Could not apply workflow: ${e.message}`),
  });

  if (!client) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-400">Loading client...</p>
      </div>
    );
  }

  const openTasks = dashboardData?.tasks?.filter(t => !t.completed) || [];
  const completedTasks = dashboardData?.tasks?.filter(t => t.completed) || [];
  const onboarding = dashboardData?.onboarding;
  const snapshot = dashboardData?.snapshot;

  const taskProgress = dashboardData?.tasks?.length
    ? Math.round((completedTasks.length / dashboardData.tasks.length) * 100)
    : 0;

  // Wholesale (flow-through) clients have no close, no quote, no tasks — we just
  // resell their QBO subscription. Hide the bookkeeping cockpit for them.
  const isWholesale = (client as any)?.clientType === "wholesale";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/clients" className="text-sm text-slate-500 hover:text-lime-600 flex items-center gap-1 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to Clients
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{splitClientName(client.name, client.company).primary}</h1>
            <Badge variant={client.status === "active" ? "default" : "secondary"} className={client.status === "active" ? "bg-lime-500" : ""}>
              {client.status}
            </Badge>
            {(client as any).clientType && (client as any).clientType !== "monthly" && (
              <Badge variant="outline" className="capitalize">{(client as any).clientType === "wholesale" ? "Wholesale" : (client as any).clientType}</Badge>
            )}
          </div>
          <p className="text-slate-500 mt-1">{client.company || client.email}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 flex-wrap justify-end">
          {client.hasPayroll && (
            <Link to={`/payroll?clientId=${id}`}>
              <Button size="sm" variant="outline" className="border-lime-300 text-lime-700">
                <Wallet className="h-3.5 w-3.5 mr-1" /> Run payroll
              </Button>
            </Link>
          )}
          {client.assignedTo && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              Assigned: {client.assignedTo}
            </Badge>
          )}
          {/* QuickBooks per-client connection: Connect / Reconnect / Connected */}
          {qboConn?.ambiguous ? (
            <Badge variant="outline" className="flex items-center gap-1 border-amber-300 text-amber-700">
              <AlertCircle className="h-3 w-3" /> Multiple QBO connections
            </Badge>
          ) : qboConn?.connection && qboConn.connection.isActive && !qboConn.connection.reconnectReason && qboConn.connection.transport === "make_bridge" ? (
            // On the read-only Make bridge — which acks instead of returning data for
            // some realms. Offer a one-click upgrade to native (direct) OAuth.
            <span className="inline-flex items-center gap-1.5">
              <Badge variant="outline" className="flex items-center gap-1 border-amber-300 text-amber-700">
                <AlertCircle className="h-3 w-3" /> QuickBooks (bridge)
              </Badge>
              <Button size="sm" variant="outline" className="border-green-300 text-green-700"
                title="Connect this company directly (native OAuth) — bypasses the read-only bridge so live reads work"
                onClick={() => { window.location.href = `/api/qbo/connect?clientId=${id}`; }}>
                <Link2 className="h-3.5 w-3.5 mr-1" /> Connect direct
              </Button>
            </span>
          ) : qboConn?.connection && qboConn.connection.isActive && !qboConn.connection.reconnectReason ? (
            <Badge variant="outline" className="flex items-center gap-1 border-emerald-300 text-emerald-700">
              <CheckCircle className="h-3 w-3" /> QuickBooks
            </Badge>
          ) : qboConn?.connection && (qboConn.connection.reconnectReason || !qboConn.connection.isActive) && qboConn.connection.transport !== "make_bridge" ? (
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700"
              title={qboConn.connection.reconnectReason ? `Reconnect needed: ${qboConn.connection.reconnectReason}` : "Connection inactive"}
              onClick={() => { window.location.href = `/api/qbo/connect?clientId=${id}`; }}>
              <AlertCircle className="h-3.5 w-3.5 mr-1" /> Reconnect QuickBooks
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="border-green-300 text-green-700"
              onClick={() => { window.location.href = `/api/qbo/connect?clientId=${id}`; }}>
              <Link2 className="h-3.5 w-3.5 mr-1" /> Connect QuickBooks
            </Button>
          )}
          <ClientWorkTimer clientId={id} clientName={client.name} onManual={() => setShowLogTime(true)} />
          <Button size="sm" variant="outline" className="border-blue-300 text-blue-700" onClick={() => setEditingIntake(true)}>
            <Edit className="h-3.5 w-3.5 mr-1" /> Edit Intake
          </Button>
          {client.status === "active" ? (
            <Button size="sm" variant="outline" className="border-slate-300 text-slate-600"
              onClick={() => { if (confirm(`Archive ${client.name}? It will be hidden from the active client list (not deleted) and its tasks paused.`)) archiveClient.mutate({ id }); }}>
              Archive
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700"
              onClick={() => { if (confirm(`Reactivate ${client.name}? It returns to the active list and its tasks resume.`)) activateClient.mutate({ clientId: id }); }}
              disabled={activateClient.isPending}>
              {activateClient.isPending ? "Reactivating…" : "Reactivate"}
            </Button>
          )}
          <Button size="sm" variant="outline" className="border-red-300 text-red-600"
            onClick={() => { if (confirm(`PERMANENTLY DELETE ${client.name} and all its data? This cannot be undone.`)) deleteClient.mutate({ id }); }}>
            Delete
          </Button>
          </div>
          {/* Quick links + CRA RepID — directly under the action row, right side
              (firm tools / portals, not client data). */}
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs">
              CRA RepID:&nbsp;<span className="font-semibold text-slate-800">{client.craRepId || "YY7F3GN"}</span>
            </span>
            <QuickLinksCard client={client} onboarding={onboarding} variant="header" />
          </div>
        </div>
      </div>

      {/* Missing-info flag — CRA Business Number is required */}
      {(() => {
        const missing: string[] = [];
        if (!client.taxId) missing.push("CRA Business Number");
        if (client.hasHST && !client.hstNumber) missing.push("HST/GST Number");
        if (client.hasPayroll && !(client as any).payrollRpNumber) missing.push("Payroll (RP) Number");
        if (client.hasWSIB && !client.wsibAccountNumber) missing.push("WSIB Account Number");
        if (missing.length === 0) return null;
        return (
          <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Missing required info</p>
              <p className="text-sm text-red-600">{missing.join(" · ")} — add via the client's record so filings and Figs coding work.</p>
            </div>
          </div>
        );
      })()}

      {/* Wholesale (flow-through) banner */}
      {isWholesale && (
        <Card className="border-l-4 border-l-slate-400 bg-slate-50">
          <CardContent className="p-4 text-sm text-slate-600">
            🧾 <span className="font-medium text-slate-700">Wholesale / flow-through client.</span> We resell the QuickBooks subscription only — no month-end close, no quote, and no recurring compliance tasks. Change this under <span className="font-medium">Edit intake → Service type</span>.
          </CardContent>
        </Card>
      )}

      {/* CLIENT DETAILS — real client data, dense, on top. */}
      {(() => {
        const c: any = client;
        const o: any = onboarding || {};
        const dash = (v: any) => (v === null || v === undefined || v === "" ? "—" : v);
        const hstFreq = c.hasHST ? (c.hstPeriod ? String(c.hstPeriod) : "registered") : "Not registered";
        // Only show fields that apply to THIS client (no "No payroll" clutter).
        const items: Array<[string, any]> = [
          ["CRA BN", dash(o.craBusinessNumber || c.taxId)],
          ["QBO Realm ID", dash(c.qboRealmId)],
          ["Company Key", dash(c.companyKey)],
          ["Registry #", dash(c.registryNumber)],
          ["Incorporated", dash(c.incorporationDate)],
          ["Corp type", dash(c.corpType)],
          ["Registry status", dash(c.governmentStatus)],
          ["Industry", dash(c.industry)],
          ["Province", dash(c.province)],
          ["Year-end", dash(c.yearEndMonth || o.fiscalYearEnd)],
          ["Website", dash(c.website)],
          ["Triage email", dash(c.figgyEmail)],
        ];
        if (c.hasHST) items.push(
          ["HST / GST", hstFreq], ["HST #", dash(c.hstNumber || o.hstGstNumber)], ["Next HST due", dash(c.hstNextDue)],
        );
        if (c.hasPayroll) {
          items.push(["Payroll", c.payrollExternal ? "Client-run / autopay" : dash(c.payrollFrequency)]);
          if (!c.payrollExternal) items.push(["CRA remitter", dash(c.payrollRemitterFreq)], ["Payroll RP #", dash(c.payrollRpNumber)]);
        }
        if (c.hasWSIB) items.push(["WSIB #", dash(c.wsibAccountNumber || o.wsibAccountNumber)]);
        return (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-lime-600" /> Client Details</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {c.bio && <p className="text-xs text-slate-500 mb-3 leading-relaxed">{String(c.bio)}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-2">
                {items.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wide truncate">{k}</p>
                    <p className="text-[13px] font-medium text-slate-800 truncate" title={String(v)}>{String(v)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* BOOKKEEPING WORKFLOW — how Figs processes this client (Markie 2026-06-25). */}
      {(() => {
        const c: any = client;
        return (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Briefcase className="h-4 w-4 text-lime-600" /> Bookkeeping Workflow</CardTitle>
                <Button size="sm" variant="outline" className="text-lime-700 border-lime-300"
                  onClick={async () => {
                    try {
                      const r = await fetch("/api/figs-browser/brain/start-routine", { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ clientId: id }) });
                      const j = await r.json().catch(() => ({}));
                      if (j?.ok) navigate("/figs-at-work");
                      else alert(j?.error === "forbidden" ? "Admin only." : `Couldn't start Figs: ${j?.error || "the browser agent may be off (FIGGY_BROWSER_AGENT)."}`);
                    } catch { alert("Couldn't reach Figs."); }
                  }}>
                  ▶ Run morning routine
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wide mb-1">Bank / CC transactions</p>
                  <select
                    className="w-full border rounded-md px-2 py-1.5 text-sm bg-white"
                    value={c.bankSource || ""}
                    disabled={updateClient.isPending}
                    onChange={(e) => updateClient.mutate({ id, bankSource: (e.target.value || undefined) as any } as any)}>
                    <option value="">— not set —</option>
                    <option value="bank_feed">QBO bank feed (connected)</option>
                    <option value="manual">Manual statements (client sends)</option>
                  </select>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wide mb-1">Receipts via Hubdoc</p>
                  <label className="flex items-center gap-2 text-sm text-slate-700 mt-1.5">
                    <input type="checkbox" checked={!!c.usesHubdoc} disabled={updateClient.isPending}
                      onChange={(e) => updateClient.mutate({ id, usesHubdoc: e.target.checked } as any)} />
                    Uses Hubdoc
                  </label>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wide mb-1">QBO connection</p>
                  <p className="text-[13px] font-medium text-slate-800 mt-1.5">{c.qboRealmId ? "Connected ✓" : "Not connected"}</p>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wide mb-1">Workflow notes</p>
                <textarea
                  className="w-full border rounded-md px-2 py-1.5 text-sm" rows={2}
                  defaultValue={c.workflowNotes || ""}
                  placeholder="e.g. closes on the 5th; emails Visa + chequing statements monthly; HST picked up in Q2…"
                  onBlur={(e) => { if (e.target.value !== (c.workflowNotes || "")) updateClient.mutate({ id, workflowNotes: e.target.value } as any); }} />
              </div>
              {/* Bank & credit-card accounts from QBO (name · last-4 · GL #). */}
              {Array.isArray(bankAccounts.data) && bankAccounts.data.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wide mb-1">Bank & credit-card accounts (from QuickBooks)</p>
                  <div className="divide-y border rounded-md">
                    {bankAccounts.data.map((a: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1.5 text-sm">
                        <span className="text-slate-800 truncate">{a.name}</span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] uppercase text-slate-400">{a.type === "Credit Card" ? "CC" : "Bank"}</span>
                          {a.last4 && <span className="text-xs text-slate-500">••{a.last4}</span>}
                          {a.gl && <code className="text-[11px] bg-slate-100 px-1 rounded">GL {a.gl}</code>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* QUICK ACTIONS — per-client tools you can RUN from the card (no hunting). */}
      {!isWholesale && (
        <Card className="border-l-4 border-l-violet-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Receipt className="h-4 w-4 text-violet-600" /> Tools — run for {splitClientName(client.name).first || client.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {client.hasHST && <Link to={`/hst-review?clientId=${id}`} className="text-xs px-2.5 py-1.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">Pre-HST review</Link>}
            <button onClick={() => setActiveTab("compliance")} className="text-xs px-2.5 py-1.5 rounded-full border border-lime-200 bg-lime-50 text-lime-700 hover:bg-lime-100">Month-end close</button>
            <button onClick={() => setActiveTab("compliance")} className="text-xs px-2.5 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">Who paid this? (duplicates)</button>
            <Link to="/recon-match" className="text-xs px-2.5 py-1.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100">Reconcile matcher</Link>
            <Link to="/bank-converter" className="text-xs px-2.5 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100">Bank → CSV</Link>
            {(client as any).groupName && <Link to="/interco" className="text-xs px-2.5 py-1.5 rounded-full border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100">Inter-company recharge + reconcile</Link>}
            {client.hasPayroll && <Link to={`/payroll?clientId=${id}`} className="text-xs px-2.5 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Payroll</Link>}
          </CardContent>
        </Card>
      )}

      {/* TASKS — progress + overdue + open, one combined card near the top.
          Far-future tasks (>45 days) are hidden from the inline list so they don't
          bury what's actually due now — they're still under "View all". */}
      {(() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const soon = new Date(today); soon.setDate(soon.getDate() + 45);
        const byDue = (a: any, b: any) => (+new Date(a.dueDate || "2999-01-01")) - (+new Date(b.dueDate || "2999-01-01"));
        const overdue = openTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < today).sort(byDue);
        const upcoming = openTasks.filter((t: any) => {
          if (t.dueDate && new Date(t.dueDate) < today) return false;   // overdue, shown above
          if (t.dueDate && new Date(t.dueDate) > soon) return false;    // far future, hidden here
          return true;
        }).sort(byDue);
        const laterCount = openTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) > soon).length;
        const ordered = [...overdue, ...upcoming];
        const total = dashboardData?.tasks?.length || 0;
        return (
          <Card className={cn("border-l-4", overdue.length > 0 ? "border-l-red-500" : "border-l-lime-500")}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Briefcase className="h-4 w-4 text-lime-600" /> Tasks</CardTitle>
                <span className="text-xs text-slate-500">
                  {completedTasks.length}/{total} done{overdue.length > 0 ? <span className="text-red-600 font-semibold"> · {overdue.length} overdue</span> : null}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Progress value={taskProgress} className="h-1.5 mb-3" />
              {ordered.length === 0 ? (
                <p className="text-sm text-slate-400 py-1.5 flex items-center gap-2"><CheckCircle className="h-4 w-4 text-lime-500" /> All caught up</p>
              ) : (
                <div className="space-y-0.5">
                  {ordered.slice(0, 8).map((t: any) => {
                    const od = t.dueDate && new Date(t.dueDate) < today;
                    return (
                      <div key={t.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-slate-50 cursor-pointer" onClick={() => setEditingTask(t)}>
                        <span className={cn("text-xs font-semibold w-[74px] whitespace-nowrap", od ? "text-red-600" : "text-slate-400")}>{t.dueDate ? format(new Date(t.dueDate), "MMM d, yyyy") : "—"}</span>
                        <span className="text-sm text-slate-700 truncate flex-1">{t.title}</span>
                        <span className="text-xs text-slate-400 whitespace-nowrap">{t.category}</span>
                      </div>
                    );
                  })}
                  {(ordered.length > 8 || laterCount > 0) && <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => setActiveTab("tasks")}>View all {openTasks.length} tasks{laterCount > 0 ? ` (${laterCount} later)` : ""}</Button>}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Onboarding & documents — quote → engagement → activate. Hidden once the
          client is active with no pending documents, to keep the card clean.
          (Pricing intelligence — scope quote vs flat fee — moved off the client
          card into the owner-only Insights area.) */}
      {!isWholesale && (client.status !== "active" || (clientDocs && clientDocs.length > 0)) && (
        <Card className="border-l-4 border-l-slate-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Onboarding &amp; documents</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Document lifecycle: quote → engagement → active */}
            <div className="mt-4 pt-3 border-t flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setEditingQuote(true)} disabled={genQuote.isPending}>
                <FileText className="h-3.5 w-3.5 mr-1" />{genQuote.isPending ? "Generating…" : "Edit & send quote"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => genEngagement.mutate({ clientId: id })} disabled={genEngagement.isPending}>
                <FileText className="h-3.5 w-3.5 mr-1" />{genEngagement.isPending ? "Generating…" : "Generate engagement letter"}
              </Button>
              {!client.craRacDone && (
                <Button size="sm" variant="outline" onClick={() => genCra.mutate({ clientId: id })} disabled={genCra.isPending}>
                  <FileText className="h-3.5 w-3.5 mr-1" />{genCra.isPending ? "Generating…" : "CRA authorization request"}
                </Button>
              )}
              {client.status !== "active" && (
                <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  onClick={() => { if (confirm(`Make ${client.name} an ACTIVE client and generate their recurring tasks?`)) activateClient.mutate({ clientId: id }); }}
                  disabled={activateClient.isPending}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />{activateClient.isPending ? "Activating…" : "Make active"}
                </Button>
              )}
            </div>

            {clientDocs && clientDocs.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs uppercase font-semibold text-slate-500">Documents</p>
                {clientDocs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 text-sm bg-slate-50 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <span className="block truncate text-slate-700">{d.title}</span>
                      <span className="text-xs text-slate-400">
                        {d.documentType === "engagement_letter" ? "Engagement" : "Quote"} · {d.status}
                        {d.signedBy ? ` · signed by ${d.signedBy}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {d.portalUrl && (
                        <a href={d.portalUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-lime-700 hover:underline">
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <button
                        onClick={() => { if (confirm(`Delete "${d.title}"? This can't be undone.`)) deleteDoc.mutate({ id: d.id }); }}
                        className="text-red-400 hover:text-red-600" title="Delete document">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs. Wholesale (flow-through) clients are billing-only — no
          compliance/tasks/payroll/etc., matching "we only invoice them." */}
      {(() => { const wholesale = ((client as any).clientType || "monthly") === "wholesale"; return (
      <Tabs value={wholesale && !["overview","billing"].includes(activeTab) ? "overview" : activeTab} onValueChange={setActiveTab}>
        <TabsList className={cn("grid w-full", wholesale ? "grid-cols-2" : client.hasPayroll ? "grid-cols-8" : "grid-cols-7")}>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {!wholesale && <TabsTrigger value="tasks">Tasks ({openTasks.length})</TabsTrigger>}
          {!wholesale && <TabsTrigger value="financials">Financials</TabsTrigger>}
          <TabsTrigger value="billing">Billing</TabsTrigger>
          {!wholesale && client.hasPayroll && <TabsTrigger value="payroll">Payroll</TabsTrigger>}
          {!wholesale && <TabsTrigger value="compliance">Compliance</TabsTrigger>}
          {!wholesale && <TabsTrigger value="revrec">Rev Rec</TabsTrigger>}
          {!wholesale && <TabsTrigger value="loans">Loans</TabsTrigger>}
          {!wholesale && <TabsTrigger value="time">Time</TabsTrigger>}
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <GroupCard clientId={id} groupName={(client as any).groupName} />
          <ContactsCard clientId={id} />
          <ClientChatsCard clientId={id} />
          <ClientEmailsCard clientId={id} />
          <PlatformsCard onboarding={onboarding} client={client} />
          {/* Vendors only when WE pay this client's bills; customers only when WE
              invoice — both gated on the intake's responsibilities. */}
          {(onboarding?.billPayResponsibility === "we_pay" || onboarding?.billPayResponsibility === "both") && (
            <PartiesCard clientId={id} kind="vendor" />
          )}
          {(onboarding?.invoicingResponsibility === "we_invoice" || onboarding?.invoicingResponsibility === "both") && (
            <PartiesCard clientId={id} kind="customer" />
          )}
          {/* Document requests + at-a-glance, side by side. (Task progress lives in
              the combined Tasks card up top.) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ClientRequestsCard clientId={id} clientName={client.name} />

            {/* Quick Stats — status at a glance, relevant rows only. */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">At a glance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <button onClick={() => setActiveTab("tasks")} className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <span className="text-sm text-slate-600">Open tasks</span>
                  <span className="font-medium inline-flex items-center gap-1">{openTasks.length} <ChevronRight className="h-3.5 w-3.5 text-slate-400" /></span>
                </button>
                {(() => {
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const overdueCount = openTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < today).length;
                  return (
                    <div className={cn("flex items-center justify-between p-3 rounded-lg", overdueCount > 0 ? "bg-red-50" : "bg-slate-50")}>
                      <span className="text-sm text-slate-600">Overdue</span>
                      <span className={cn("font-medium", overdueCount > 0 ? "text-red-600" : "")}>{overdueCount}</span>
                    </div>
                  );
                })()}
                {client.hasPayroll && (
                  <Link to={`/payroll?clientId=${id}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                    <span className="text-sm text-slate-600">Employees</span>
                    <span className="font-medium inline-flex items-center gap-1">{employees?.length || 0} <ChevronRight className="h-3.5 w-3.5 text-slate-400" /></span>
                  </Link>
                )}
                {client.hasHST && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-600">Next HST due</span>
                    <span className="font-medium">{client.hstNextDue || "—"}</span>
                  </div>
                )}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-600">Year-end</span>
                  <span className="font-medium">{client.yearEndMonth || onboarding?.fiscalYearEnd || "—"}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Financial Snapshot */}
          {snapshot && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-lime-500" />
                  Financial Snapshot
                  <span className="text-xs font-normal text-slate-400 ml-2">
                    {snapshot.periodStart && snapshot.periodEnd
                      ? `${format(new Date(snapshot.periodStart), "MMM d")} - ${format(new Date(snapshot.periodEnd), "MMM d, yyyy")}`
                      : "Latest"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-emerald-50 rounded-lg">
                    <p className="text-xs text-emerald-600 uppercase font-semibold">Revenue</p>
                    <p className="text-xl font-bold text-emerald-700">${(snapshot.revenue || 0).toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg">
                    <p className="text-xs text-red-600 uppercase font-semibold">Expenses</p>
                    <p className="text-xl font-bold text-red-700">${(snapshot.expenses || 0).toLocaleString()}</p>
                  </div>
                  <div className={`p-4 rounded-lg ${(snapshot.netIncome || 0) >= 0 ? "bg-lime-50" : "bg-amber-50"}`}>
                    <p className={`text-xs uppercase font-semibold ${(snapshot.netIncome || 0) >= 0 ? "text-lime-600" : "text-amber-600"}`}>Net Income</p>
                    <p className={`text-xl font-bold ${(snapshot.netIncome || 0) >= 0 ? "text-lime-700" : "text-amber-700"}`}>${(snapshot.netIncome || 0).toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-600 uppercase font-semibold">Equity</p>
                    <p className="text-xl font-bold text-blue-700">${(snapshot.equity || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TASKS TAB */}
        <TabsContent value="tasks" className="space-y-4 mt-4">
          {/* OPEN tasks — actionable */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Open Tasks ({openTasks.length})</CardTitle>
                  <CardDescription>Click the circle to mark done. Recurring tasks auto-create the next one.</CardDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setCreatingTask(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add task
                  </Button>
                  <Select
                    onValueChange={(key) => {
                      const wf = workflows?.find(w => w.key === key);
                      if (wf && confirm(`Apply the "${wf.name}" workflow? This adds ${wf.stepCount} tasks to ${client.name}.`)) {
                        applyWorkflow.mutate({ clientId: id, templateKey: key });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-sm">
                      <SelectValue placeholder="＋ Apply workflow" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows?.map(w => (
                        <SelectItem key={w.key} value={w.key}>{w.name} ({w.stepCount})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {openTasks.length > 0 ? (
                <div className="space-y-4">
                  {(() => {
                    const STAGE_LABEL: Record<string, string> = { todo: "To Do", in_progress: "In Progress", review: "Review", done: "Done" };
                    const STAGE_CLASS: Record<string, string> = {
                      todo: "bg-slate-100 text-slate-600",
                      in_progress: "bg-amber-100 text-amber-700",
                      review: "bg-purple-100 text-purple-700",
                      done: "bg-lime-100 text-lime-700",
                    };
                    // Group open tasks by category so the card reads like a workflow checklist.
                    const groups = new Map<string, typeof openTasks>();
                    for (const t of openTasks) {
                      const key = t.category || "General";
                      if (!groups.has(key)) groups.set(key, []);
                      groups.get(key)!.push(t);
                    }
                    return Array.from(groups.entries()).map(([cat, items]) => {
                      const overdueCount = items.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate))).length;
                      return (
                        <div key={cat}>
                          <div className="flex items-center gap-2 mb-1.5 px-0.5">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</span>
                            <span className="text-xs text-slate-400">{items.length}</span>
                            {overdueCount > 0 && <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{overdueCount} overdue</Badge>}
                          </div>
                          <div className="space-y-2">
                            {items.map(task => {
                              const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate));
                              const stage = (task as any).stage || "todo";
                              return (
                                <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:shadow-sm ${isOverdue ? "bg-red-50" : "bg-white border"}`} onClick={() => setEditingTask(task)}>
                                  <button
                                    title="Mark done"
                                    onClick={(e) => { e.stopPropagation(); completeTask.mutate({ id: task.id }); }}
                                    className="w-6 h-6 shrink-0 rounded-full border-2 border-slate-300 hover:border-lime-500 hover:bg-lime-50 transition-colors"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{task.title}</p>
                                    <p className="text-xs text-slate-500">
                                      {task.dueDate ? `Due ${format(new Date(task.dueDate), "MMM d, yyyy")}` : "No due date"}
                                      {isOverdue ? " • Overdue" : ""}
                                      {task.assignedTo ? ` • ${task.assignedTo}` : ""}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant="outline" className={`text-xs ${STAGE_CLASS[stage] || STAGE_CLASS.todo}`}>{STAGE_LABEL[stage] || "To Do"}</Badge>
                                    {task.isRecurring && (
                                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600">Recurring</Badge>
                                    )}
                                    <Badge variant={task.priority === "high" ? "destructive" : task.priority === "medium" ? "default" : "outline"} className="text-xs">{task.priority}</Badge>
                                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); setEditingTask(task); }}>
                                      <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete task "${task.title}"?`)) deleteTask.mutate({ id: task.id }); }}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <p className="text-center text-slate-400 py-6">No open tasks 🎉</p>
              )}
            </CardContent>
          </Card>

          {/* COMPLETED history */}
          <Card>
            <CardHeader>
              <CardTitle>Completed History ({completedTasks.length})</CardTitle>
              <CardDescription>Done tasks for this client. Reopen if needed.</CardDescription>
            </CardHeader>
            <CardContent>
              {completedTasks.length > 0 ? (
                <div className="space-y-1.5">
                  {completedTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 cursor-pointer hover:bg-slate-100" onClick={() => setEditingTask(task)}>
                      <CheckCircle className="h-5 w-5 text-lime-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-through text-slate-500">{task.title}</p>
                        <p className="text-xs text-slate-400">
                          {task.category}
                          {(task as any).completedAt ? ` • Done ${format(new Date((task as any).completedAt), "MMM d, yyyy")}` : ""}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs shrink-0" onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, completed: false, status: "pending" }); }}>
                        Reopen
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-400 py-6">No completed tasks yet.</p>
              )}
            </CardContent>
          </Card>

          {creatingTask && (
            <EditTaskDialog
              task={{ title: "", category: "", priority: "medium", description: "", assignedTo: client.assignedTo || "" }}
              isNew
              onClose={() => setCreatingTask(false)}
              onSave={(data: any) => { createTask.mutate({ clientId: id, ...data }); }}
            />
          )}
        </TabsContent>

        {/* FINANCIALS TAB */}
        <TabsContent value="financials" className="space-y-4 mt-4">
          {snapshot ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* P&L */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-emerald-500" />
                      Profit & Loss
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between p-3 bg-emerald-50 rounded-lg">
                      <span className="text-sm text-emerald-700">Revenue</span>
                      <span className="font-bold text-emerald-700">${(snapshot.revenue || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-red-50 rounded-lg">
                      <span className="text-sm text-red-700">Expenses</span>
                      <span className="font-bold text-red-700">${(snapshot.expenses || 0).toLocaleString()}</span>
                    </div>
                    <Separator />
                    <div className={`flex justify-between p-3 rounded-lg ${(snapshot.netIncome || 0) >= 0 ? "bg-lime-50" : "bg-amber-50"}`}>
                      <span className={`text-sm font-medium ${(snapshot.netIncome || 0) >= 0 ? "text-lime-700" : "text-amber-700"}`}>Net Income</span>
                      <span className={`font-bold ${(snapshot.netIncome || 0) >= 0 ? "text-lime-700" : "text-amber-700"}`}>${(snapshot.netIncome || 0).toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Balance Sheet */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-blue-500" />
                      Balance Sheet
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between p-3 bg-blue-50 rounded-lg">
                      <span className="text-sm text-blue-700">Assets</span>
                      <span className="font-bold text-blue-700">${(snapshot.assets || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-red-50 rounded-lg">
                      <span className="text-sm text-red-700">Liabilities</span>
                      <span className="font-bold text-red-700">${(snapshot.liabilities || 0).toLocaleString()}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between p-3 bg-lime-50 rounded-lg">
                      <span className="text-sm font-medium text-lime-700">Equity</span>
                      <span className="font-bold text-lime-700">${(snapshot.equity || 0).toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 mb-4">No financial snapshot available yet.</p>
                <Button
                  variant="outline"
                  onClick={() => saveSnapshot.mutate({
                    clientId: id,
                    revenue: 0, expenses: 0, netIncome: 0,
                    assets: 0, liabilities: 0, equity: 0,
                    source: "manual",
                  })}
                >
                  Create Initial Snapshot
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* BILLING TAB */}
        <TabsContent value="billing" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 uppercase font-semibold">Total Invoiced</p>
                <p className="text-2xl font-bold">${(qboBilling?.summary?.totalInvoiced || 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 uppercase font-semibold">Total Paid</p>
                <p className="text-2xl font-bold text-emerald-600">${(qboBilling?.summary?.totalPaid || 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 uppercase font-semibold">Outstanding</p>
                <p className={`text-2xl font-bold ${(qboBilling?.summary?.outstanding || 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  ${(qboBilling?.summary?.outstanding || 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>QBO Invoices</CardTitle>
              <CardDescription>Synced from QuickBooks Online</CardDescription>
            </CardHeader>
            <CardContent>
              {qboBilling?.invoices && qboBilling.invoices.length > 0 ? (
                <div className="space-y-2">
                  {qboBilling.invoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{inv.invoiceNumber || inv.docNumber || "Invoice"}</p>
                        <p className="text-xs text-slate-500">
                          {inv.transactionDate ? format(new Date(inv.transactionDate), "MMM d, yyyy") : ""}
                          {inv.dueDate ? ` • Due ${format(new Date(inv.dueDate), "MMM d, yyyy")}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">${(inv.totalAmount || 0).toLocaleString()}</p>
                        <Badge variant={(inv.balance || 0) <= 0 ? "default" : "destructive"} className="text-xs mt-1">
                          {(inv.balance || 0) <= 0 ? "Paid" : `Owing: $${(inv.balance || 0).toLocaleString()}`}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <Receipt className="h-10 w-10 mx-auto mb-2" />
                  <p>No QBO invoices synced yet.</p>
                  <p className="text-sm mt-1">Connect to QuickBooks to sync billing data.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYROLL TAB */}
        <TabsContent value="payroll" className="space-y-4 mt-4">
          {/* Client-level payroll features — tick what THIS client's payroll has.
              The pay run only shows/creates the features enabled here. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-5 w-5 text-lime-500" />
                Payroll features
              </CardTitle>
              <CardDescription>Tick the pay components this client uses — the pay run only includes these.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 max-w-xs">
                <label className="text-xs text-slate-500 block mb-1">Hours source (drives the integration button)</label>
                <select className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
                  value={(client as any).payrollHoursSource || "manual"}
                  disabled={updateClient.isPending}
                  onChange={(e) => updateClient.mutate({ id, payrollHoursSource: e.target.value } as any)}>
                  <option value="manual">Manual entry</option>
                  <option value="jobber">Jobber</option>
                  <option value="touchbistro">TouchBistro</option>
                  <option value="clockify">Clockify</option>
                  <option value="qbo_autopay">QuickBooks autopay</option>
                </select>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {([
                  ["payrollBonuses", "Bonuses"],
                  ["payrollDividends", "Dividend payments"],
                  ["payrollPhoneAllowance", "Cell phone allowance"],
                  ["payrollReimbursements", "Reimbursements"],
                  ["payrollRevenueShare", "Revenue share"],
                  ["payrollCraComparison", "CRA comparison"],
                ] as [string, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border p-2 hover:bg-slate-50">
                    <input type="checkbox" className="w-4 h-4 accent-lime-500"
                      checked={!!(client as any)[key]}
                      disabled={updateClient.isPending}
                      onChange={(e) => updateClient.mutate({ id, [key]: e.target.checked } as any)} />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">Then set who gets each on their employee card, and run payroll from <Link to={`/payroll?clientId=${id}`} className="text-lime-700 hover:underline">Payroll</Link>.</p>
            </CardContent>
          </Card>

          {/* Past payroll history — the old payroll Google Sheet, one click away. */}
          {(client as any).payrollHistoryUrl && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Past payroll history</CardTitle>
                <CardDescription>The client's prior payroll records (Google Sheet) — kept for reference.</CardDescription>
              </CardHeader>
              <CardContent>
                <a href={(client as any).payrollHistoryUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm hover:bg-emerald-100">
                  <ExternalLink className="h-4 w-4" /> Open payroll history sheet
                </a>
              </CardContent>
            </Card>
          )}

          <EmployeesCard clientId={id} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2"><Wallet className="h-5 w-5 text-lime-500" /> Pay runs</span>
                {payRunsList && payRunsList.length > 0 && (
                  <span className="text-sm font-normal text-slate-500">
                    {payRunsList.length} run{payRunsList.length === 1 ? "" : "s"} · {new Date().getFullYear()} gross{" "}
                    <span className="font-semibold text-lime-700">
                      ${payRunsList.filter((r: any) => new Date(r.payDate || r.payPeriodEnd).getFullYear() === new Date().getFullYear()).reduce((s: number, r: any) => s + (r.totalGross || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </span>
                )}
              </CardTitle>
              <CardDescription>Saved pay runs for this client (from the Payroll page).</CardDescription>
            </CardHeader>
            <CardContent>
              {payRunsList && payRunsList.length > 0 ? (
                <div className="space-y-1.5">
                  {payRunsList.map((r: any) => (
                    <Link key={r.id} to={`/payroll?clientId=${id}`}
                      className="flex items-center justify-between p-2.5 rounded-lg border hover:bg-slate-50 transition-colors">
                      <div className="text-sm">
                        <span className="font-medium">{r.payPeriodStart ? format(new Date(r.payPeriodStart), "MMM d") : ""} – {r.payPeriodEnd ? format(new Date(r.payPeriodEnd), "MMM d, yyyy") : ""}</span>
                        <span className="text-xs text-slate-500 ml-2">pay {r.payDate ? format(new Date(r.payDate), "MMM d") : "—"}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-lime-700">${(r.totalGross || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <Badge variant="outline" className="text-xs">{r.status}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 py-2">No pay runs yet. <Link to={`/payroll?clientId=${id}`} className="text-lime-700 hover:underline">Open the Payroll page</Link> to run one.</p>
              )}
            </CardContent>
          </Card>

          {timesheetPeriods && timesheetPeriods.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-lime-500" />
                Payroll Timesheets
              </CardTitle>
              <CardDescription>Hours by pay period (legacy timesheet entries)</CardDescription>
            </CardHeader>
            <CardContent>
              {timesheetPeriods && timesheetPeriods.length > 0 ? (
                <div className="space-y-3">
                  {timesheetPeriods.map(period => (
                    <div key={period.periodKey} className="border rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                        onClick={() => setExpandedPeriod(expandedPeriod === period.periodKey ? null : period.periodKey)}
                      >
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5 text-slate-400" />
                          <div className="text-left">
                            <p className="font-medium">
                              {period.payPeriodStart ? format(new Date(period.payPeriodStart), "MMM d") : ""} - {period.payPeriodEnd ? format(new Date(period.payPeriodEnd), "MMM d, yyyy") : ""}
                            </p>
                            <p className="text-xs text-slate-500">
                              {period.entries.length} employees • {period.totalRegularHours.toFixed(1)} regular hrs
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{period.totalRegularHours.toFixed(1)} hrs</Badge>
                          {expandedPeriod === period.periodKey ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>

                      {expandedPeriod === period.periodKey && (
                        <div className="p-4 space-y-2">
                          <div className="grid grid-cols-6 gap-2 text-xs font-medium text-slate-500 uppercase mb-2">
                            <span>Employee</span>
                            <span className="text-right">Regular</span>
                            <span className="text-right">OT</span>
                            <span className="text-right">Vacation</span>
                            <span className="text-right">Sick</span>
                            <span className="text-right">Total</span>
                          </div>
                          {period.entries.map(entry => {
                            const emp = employees?.find(e => e.id === entry.employeeId);
                            const total = (entry.regularHours || 0) + (entry.overtimeHours || 0) + (entry.vacationHours || 0) + (entry.sickHours || 0) + (entry.statHolidayHours || 0);
                            return (
                              <div key={entry.id} className="grid grid-cols-6 gap-2 py-2 border-b last:border-0 text-sm">
                                <span>{emp ? (emp.lastName ? `${emp.lastName}, ${emp.firstName}` : emp.firstName) : `Emp #${entry.employeeId}`}</span>
                                <span className="text-right">{(entry.regularHours || 0).toFixed(1)}</span>
                                <span className="text-right">{(entry.overtimeHours || 0).toFixed(1)}</span>
                                <span className="text-right">{(entry.vacationHours || 0).toFixed(1)}</span>
                                <span className="text-right">{(entry.sickHours || 0).toFixed(1)}</span>
                                <span className="text-right font-medium">{total.toFixed(1)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <Clock className="h-10 w-10 mx-auto mb-2" />
                  <p>No timesheets recorded yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </TabsContent>

        {/* COMPLIANCE TAB */}
        <TabsContent value="compliance" className="space-y-4 mt-4">
          <ComplianceTab clientId={id} client={client} onboarding={onboarding} closeStatus={closeStatus} tasks={dashboardData?.tasks || []} onOpenTask={setEditingTask} />
        </TabsContent>

        {/* REVENUE RECOGNITION (WIP) TAB */}
        <TabsContent value="revrec">
          <RevRecTab clientId={id} />
        </TabsContent>

        <TabsContent value="loans">
          <LoanTrackerTab clientId={id} />
        </TabsContent>

        {/* TIME & HOURS TAB */}
        <TabsContent value="time" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Timer className="h-4 w-4" />
                  <span className="text-xs uppercase font-semibold">Hours This Month</span>
                </div>
                <p className="text-2xl font-bold">{(timeSummary?.totalHours || 0).toFixed(1)}</p>
                <p className="text-xs text-slate-400">{timeSummary?.entryCount || 0} entries</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-xs uppercase font-semibold">Monthly Fee</span>
                </div>
                <p className="text-2xl font-bold">${(timeSummary?.monthlyFee || 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <BarChart3 className="h-4 w-4" />
                  <span className="text-xs uppercase font-semibold">Effective Rate</span>
                </div>
                <p className={`text-2xl font-bold ${(timeSummary?.effectiveHourlyRate || 0) >= 50 ? "text-emerald-600" : (timeSummary?.effectiveHourlyRate || 0) >= 30 ? "text-amber-600" : "text-red-600"}`}>
                  ${(timeSummary?.effectiveHourlyRate || 0).toFixed(2)}/hr
                </p>
                <p className="text-xs text-slate-400">Fee ÷ hours</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs uppercase font-semibold">Billable %</span>
                </div>
                <p className="text-2xl font-bold">{timeSummary?.totalHours ? Math.round(((timeSummary?.billableHours || 0) / timeSummary.totalHours) * 100) : 0}%</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5 text-lime-500" />
                Time Entries — {format(new Date(), "MMMM yyyy")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timeSummary?.entries && timeSummary.entries.length > 0 ? (
                <div className="space-y-2">
                  {timeSummary.entries.map((entry: any) => (
                    <div key={entry.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{entry.description}</p>
                          <Badge variant={entry.isBillable ? "default" : "secondary"} className="text-xs">
                            {entry.isBillable ? "Billable" : "Non-billable"}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">{entry.category}</Badge>
                        </div>
                        <p className="text-xs text-slate-500">
                          {entry.date ? format(new Date(entry.date), "MMM d, yyyy") : ""}
                          {entry.hourlyRate ? ` • $${entry.hourlyRate}/hr` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg">{entry.hours}h</span>
                        <Button variant="ghost" size="sm" className="text-red-400 h-7 w-7 p-0"
                          onClick={() => { if (confirm("Delete this time entry?")) deleteTime.mutate({ id: entry.id }); }}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <Timer className="h-10 w-10 mx-auto mb-2" />
                  <p>No time entries this month.</p>
                  <p className="text-sm">Click "Log Time" to start tracking.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {timeSummary?.categoryBreakdown && Object.keys(timeSummary.categoryBreakdown).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Hours by Category</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(timeSummary.categoryBreakdown).map(([cat, hours]) => (
                  <div key={cat} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                    <span className="text-sm capitalize">{cat.replace("_", " ")}</span>
                    <span className="font-medium">{(hours as number).toFixed(1)}h</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      ); })()}

      {/* Task drill-down — rendered at root so it opens from ANY tab (Overview,
          Tasks, etc.), not just the tab whose TabsContent is mounted. */}
      {editingTask && (
        <TaskDetailDialog
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onChanged={invalidateTasks}
        />
      )}

      <TimeLogDialog open={showLogTime} onClose={() => setShowLogTime(false)} clientId={id}
        tasks={dashboardData?.tasks || []} onSubmit={(data: any) => createTime.mutate(data)} isPending={createTime.isPending} />

      {/* Merge a duplicate INTO this client (this record is kept). */}
      <Dialog open={mergeOpen} onOpenChange={(v) => { setMergeOpen(v); if (!v) { setMergeDupeId(null); setMergeSearch(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Merge a duplicate into {splitClientName(client.name, client.company).primary}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-500">
              Pick the <strong>duplicate</strong> record. All of its data (tasks, emails, files, payroll, etc.) moves onto
              <strong> this</strong> client, blank fields here get filled from it, then the duplicate is deleted. Keep the one with the most info open — that's this one.
            </p>
            <Input placeholder="Search clients…" value={mergeSearch} onChange={(e) => setMergeSearch(e.target.value)} />
            <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
              {(allClientsForMerge || [])
                .filter((c: any) => c.id !== id)
                .filter((c: any) => { const q = mergeSearch.toLowerCase(); return !q || (c.name || "").toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q); })
                .slice(0, 50)
                .map((c: any) => (
                  <button key={c.id} onClick={() => setMergeDupeId(c.id)}
                    className={cn("flex items-center justify-between w-full px-3 py-2 text-left text-sm hover:bg-slate-50", mergeDupeId === c.id && "bg-amber-50")}>
                    <span className="truncate">{splitClientName(c.name, c.company).primary}{c.company ? ` · ${c.company}` : ""}</span>
                    {mergeDupeId === c.id && <CheckCircle className="h-4 w-4 text-amber-600 shrink-0" />}
                  </button>
                ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
              <Button className="bg-amber-600 hover:bg-amber-700"
                disabled={!mergeDupeId || mergeClient.isPending}
                onClick={() => {
                  const dupe = (allClientsForMerge || []).find((c: any) => c.id === mergeDupeId);
                  if (dupe && confirm(`Merge "${dupe.name}" INTO "${client.name}" and delete the duplicate? This cannot be undone.`)) {
                    mergeClient.mutate({ keepId: id, dupeId: mergeDupeId! });
                  }
                }}>
                {mergeClient.isPending ? "Merging…" : "Merge & delete duplicate"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {editingIntake && (
        <EditIntakeDialog
          client={client}
          onboarding={onboarding}
          isPending={updateIntake.isPending}
          onClose={() => setEditingIntake(false)}
          onSave={(data: any) => updateIntake.mutate({ clientId: id, ...data })}
        />
      )}

      {editingQuote && quote && (
        <QuoteEditorDialog
          clientId={id}
          quote={quote.quote}
          onClose={() => setEditingQuote(false)}
          isPending={genQuote.isPending}
          onGenerate={(lines: any[], oneTime: any[], transactions: number) => {
            genQuote.mutate({ clientId: id, lines, oneTime, transactions }, { onSuccess: () => setEditingQuote(false) });
          }}
        />
      )}
    </div>
  );
}

// Compliance tab — filing status + obligations, all driven by the client's
// flags/features (HST, payroll→T4, dividends→T5, WSIB), plus the dividend log.
/** WSIB remittance (quarterly): insurable earnings of WSIB-ELIGIBLE employees
 *  for the quarter × the premium rate ($/$100). Management/exec can be excluded.
 *  You run the number here, then file it on the WSIB portal. */
// Per-client email history (only this client's emails) + inline reply. Reply sends
// from the account that received it (so John's-company mail replies from the Adbank
// Agent conversations filed to this client (from the chatbot's "Save to client").
export function ClientChatsCard({ clientId }: { clientId: number }) {
  const { data: convs, isLoading } = trpc.chat.forClient.useQuery({ clientId });
  const [collapsed, setCollapsed] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const fmt = (d: any) => { try { return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setCollapsed((c) => !c)}>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="h-4 w-4 text-slate-500" /> Agent conversations ({convs?.length ?? 0})
          <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${collapsed ? "" : "rotate-90"}`} />
        </CardTitle>
        <CardDescription>Chats you filed to this client from Ask Figs ("Save to client").</CardDescription>
      </CardHeader>
      {!collapsed && (
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : !convs || convs.length === 0 ? (
            <p className="text-sm text-slate-400">No conversations filed here yet. In <b>Ask Figs</b>, tap <b>Save to client</b> to keep a chat on this card.</p>
          ) : (
            convs.map((c: any) => (
              <div key={c.conversationId} className="rounded-lg border">
                <button className="w-full text-left p-2.5 hover:bg-slate-50 flex items-center justify-between gap-2" onClick={() => setOpenId(openId === c.conversationId ? null : c.conversationId)}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate capitalize">{c.agent || "Figs"} · {c.messages?.length ?? 0} messages</p>
                    <p className="text-xs text-slate-500 truncate">{c.messages?.[0]?.content?.slice(0, 70) || ""} · {fmt(c.at)}</p>
                  </div>
                  <ChevronRight className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${openId === c.conversationId ? "rotate-90" : ""}`} />
                </button>
                {openId === c.conversationId && (
                  <div className="border-t p-2.5 space-y-1.5 max-h-80 overflow-auto">
                    {c.messages.map((m: any, i: number) => (
                      <div key={i} className={`text-sm ${m.role === "user" ? "text-slate-900" : "text-slate-600"}`}>
                        <span className="font-medium">{m.role === "user" ? "You" : (c.agent || "Figs")}:</span> <span className="whitespace-pre-wrap">{m.content}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      )}
    </Card>
  );
}

// address automatically).
export function ClientEmailsCard({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const { data: emails, isLoading } = trpc.email.list.useQuery({ clientId, folder: "all", limit: 50 });
  const [collapsed, setCollapsed] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const reply = trpc.email.reply.useMutation({
    onSuccess: () => { setReplyBody(""); setOpenId(null); utils.email.list.invalidate({ clientId }); },
    onError: (e) => alert(e.message),
  });
  const draft = trpc.email.draftReply.useMutation({
    onSuccess: (r: any) => setReplyBody(r.draft || ""),
    onError: (e) => alert(e.message),
  });
  const suggestTask = trpc.email.suggestTask.useMutation({
    onSuccess: (r: any) => { utils.task.list.invalidate(); alert(r.task ? `✓ Task added: ${r.task}${r.due ? ` (due ${r.due})` : ""}` : "Liv: no task needed for this email."); },
    onError: (e) => alert(e.message),
  });
  const fmt = (d: any) => { try { return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; } };

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setCollapsed((c) => !c)}>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-4 w-4 text-slate-500" /> Emails ({emails?.length ?? 0})
          <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${collapsed ? "" : "rotate-90"}`} />
        </CardTitle>
        <CardDescription>This client's emails, synced from your inbox. Reply here — it sends from the account that received it.</CardDescription>
      </CardHeader>
      {!collapsed && (
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : !emails || emails.length === 0 ? (
            <p className="text-sm text-slate-400">No client emails yet. Connect your inbox in <b>Integrations</b> and hit Sync — only this client's emails land here.</p>
          ) : (
            emails.map((e: any) => (
              <div key={e.id} className="rounded-lg border">
                <button className="w-full text-left p-2.5 hover:bg-slate-50 flex items-center justify-between gap-2" onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{e.isSent ? "↪ " : ""}{e.subject || "(no subject)"}</p>
                    <p className="text-xs text-slate-500 truncate">{e.isSent ? `To ${e.toAddresses}` : `From ${e.fromName || e.fromAddress}`} · {fmt(e.receivedAt)}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{e.isSent ? "sent" : "inbound"}</Badge>
                </button>
                {openId === e.id && (
                  <div className="border-t p-2.5 space-y-2">
                    <div className="text-sm whitespace-pre-wrap max-h-60 overflow-auto text-slate-700">{e.bodyPlain || (e.body || "").replace(/<[^>]*>/g, " ") || "(no content)"}</div>
                    {!e.isSent && (
                      <div className="space-y-1.5">
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" disabled={draft.isPending} onClick={() => draft.mutate({ emailId: e.id })}>
                            {draft.isPending ? "Drafting…" : "✨ Draft with Liv"}
                          </Button>
                          <Button size="sm" variant="outline" disabled={suggestTask.isPending} onClick={() => suggestTask.mutate({ emailId: e.id, create: true })}>
                            {suggestTask.isPending ? "…" : "Flag task"}
                          </Button>
                        </div>
                        <Textarea value={replyBody} onChange={(ev) => setReplyBody(ev.target.value)} rows={3} placeholder={`Reply to ${e.fromName || e.fromAddress}… (or let Liv draft it)`} />
                        <Button size="sm" disabled={!replyBody.trim() || reply.isPending} onClick={() => reply.mutate({ emailId: e.id, body: replyBody })}>
                          {reply.isPending ? "Sending…" : "Send reply"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      )}
    </Card>
  );
}

function WsibRemittanceCard({ clientId, driveFolderUrl }: { clientId: number; driveFolderUrl?: string | null }) {
  const utils = trpc.useUtils();
  const now = new Date();
  const thisYear = now.getFullYear();
  const endedQuarter = Math.floor(now.getMonth() / 3) || 4;     // most recently ended
  const [year, setYear] = useState(thisYear);
  const [quarter, setQuarter] = useState(endedQuarter);
  const { data } = trpc.payroll.wsibRemittance.useQuery({ clientId, year, quarter });
  const [rate, setRate] = useState<string>("");
  const inv = () => utils.payroll.wsibRemittance.invalidate({ clientId, year, quarter });
  const saveRate = trpc.payroll.setWsibRate.useMutation({ onSuccess: inv });
  const setEligible = trpc.payroll.setEmployeeWsibEligible.useMutation({ onSuccess: inv });
  const money = (n: number | null | undefined) => n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-orange-500" /> WSIB remittance (quarterly)</CardTitle>
        <CardDescription>Eligible employees' insurable earnings for the quarter × premium rate. {data?.accountNumber ? `Account ${data.accountNumber}. ` : ""}Run it here, then file on the WSIB portal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs">Quarter</Label>
            <select className="w-full border rounded-lg px-2 py-2 text-sm bg-white" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              <option value={1}>Q1 (Jan–Mar)</option><option value={2}>Q2 (Apr–Jun)</option>
              <option value={3}>Q3 (Jul–Sep)</option><option value={4}>Q4 (Oct–Dec)</option>
            </select>
          </div>
          <div><Label className="text-xs">Year</Label><Input type="number" className="h-9" value={year} onChange={(e) => setYear(Number(e.target.value) || thisYear)} /></div>
          <div><Label className="text-xs">Premium rate ($/$100)</Label>
            <Input type="number" step="0.01" className="h-9" placeholder={data?.rate != null ? String(data.rate) : "e.g. 2.50"} value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          <Button size="sm" disabled={saveRate.isPending || rate === ""} onClick={() => saveRate.mutate({ clientId, rate: parseFloat(rate) || 0 })}>
            {saveRate.isPending ? "Saving…" : "Save rate"}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg"><p className="text-xs text-slate-500">Eligible insurable earnings · {data?.quarterLabel ?? ""} ({data?.payRunCount ?? 0} runs)</p><p className="font-semibold">{money(data?.insurableEarnings)}</p>{(data?.excludedEarnings ?? 0) > 0 && <p className="text-[11px] text-slate-400">excluded (mgmt): {money(data?.excludedEarnings)}</p>}</div>
          <div className="p-3 bg-slate-50 rounded-lg"><p className="text-xs text-slate-500">Rate</p><p className="font-semibold">{data?.rate != null ? `$${data.rate}/$100` : <span className="text-amber-600">set a rate</span>}</p></div>
          <div className="p-3 bg-orange-50 rounded-lg"><p className="text-xs text-orange-600">WSIB remittance</p><p className="font-bold text-orange-700">{money(data?.remittance)}</p></div>
        </div>

        {/* Eligible employee selection — uncheck management/exec who are excluded. */}
        {data?.employees && data.employees.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1">WSIB-eligible employees <span className="text-slate-400 font-normal">— uncheck management/exec who are excluded</span></p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4">
              {data.employees.map((e: any) => (
                <label key={e.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={e.wsibEligible}
                    disabled={setEligible.isPending}
                    onChange={(ev) => setEligible.mutate({ employeeId: e.id, eligible: ev.target.checked })} />
                  {e.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {driveFolderUrl && (
          <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline">
            <FolderOpen className="h-3.5 w-3.5" /> Past WSIB filings (client folder)
          </a>
        )}
        <p className="text-[11px] text-slate-400">Earnings from CRM pay runs (will pull from QuickBooks Payroll once connected). WSIB files quarterly — due by the end of the month after each quarter; aim to file mid-month.</p>
      </CardContent>
    </Card>
  );
}

/**
 * MONTH-END CLOSE CHECKLIST, embedded on the client card (Markie 2026-06-25).
 * "Click a client → its close sub-task list → tick them off → close the month."
 * Reconciliation lives HERE now, not as standalone calendar tasks. Uses the same
 * monthlyClose router as the standalone page, so progress is shared.
 */
/** QuickBooks Online deep-link to a month-end work area. Once Markie is signed
 *  into the accountant QBO with this company active, these open the exact screen
 *  (Bank rec, Banking feed, Reports, Chart of accounts). realmId is carried so the
 *  link targets the right company where QBO honours it. */
const QBO_AREAS: { key: string; label: string; path: string }[] = [
  { key: "reconcile", label: "Reconcile", path: "reconcile" },
  { key: "banking", label: "Banking feed", path: "banking" },
  { key: "reports", label: "Reports", path: "reports" },
  { key: "coa", label: "Chart of accounts", path: "chartofaccounts" },
];
function qboUrl(path: string, realmId?: string | null) {
  const base = `https://app.qbo.intuit.com/app/${path}`;
  return realmId ? `${base}?cid=${encodeURIComponent(realmId)}` : base;
}

export function ClientCloseChecklist({ clientId }: { clientId: number }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const utils = trpc.useUtils();
  const { data: items } = trpc.monthlyClose.getChecklistDefinition.useQuery({ clientId }, { enabled: clientId > 0 });
  const { data: checklist } = trpc.monthlyClose.getOrCreate.useQuery({ clientId, year, month }, { enabled: clientId > 0 });
  const { data: qbo } = trpc.qbo.connectionForClient.useQuery({ clientId }, { enabled: clientId > 0 });
  const realmId = qbo?.connection?.realmId ?? null;
  const { data: flags } = trpc.monthlyClose.clientFlags.useQuery({ clientId }, { enabled: clientId > 0 });
  const invalidateClose = () => {
    utils.monthlyClose.getOrCreate.invalidate({ clientId, year, month });
    utils.monthlyClose.getChecklistDefinition.invalidate({ clientId });
    utils.monthlyClose.clientFlags.invalidate({ clientId });
  };
  const toggle = trpc.monthlyClose.toggleItem.useMutation({ onSuccess: invalidateClose });
  const markAll = trpc.monthlyClose.markAll.useMutation({ onSuccess: invalidateClose });
  const setCC = trpc.monthlyClose.setHasCreditCard.useMutation({ onSuccess: invalidateClose });
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pct = checklist?.completionPercent ?? 0;
  const done = pct === 100;
  const prevMonth = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  return (
    <Card className={done ? "border-emerald-300 bg-emerald-50/30" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className={`h-4 w-4 ${done ? "text-emerald-500" : "text-lime-500"}`} />
            Month-end close — {MONTH_NAMES[month - 1]} {year}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={prevMonth}>‹</Button>
            <span className="text-xs text-slate-500 w-10 text-center">{MONTH_NAMES[month - 1]}</span>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={nextMonth} disabled={year === now.getFullYear() && month >= now.getMonth() + 1}>›</Button>
          </div>
        </div>
        <CardDescription>
          {done ? "Closed — all procedures complete." : `${pct}% complete — tick each item, then the month is closed at 100%.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Open the matching screen in QuickBooks (bank rec, banking feed, etc.). */}
        <div className="flex items-center gap-1.5 flex-wrap pb-1">
          <span className="text-[11px] text-slate-400 mr-0.5 inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Open in QuickBooks:</span>
          {QBO_AREAS.map((a) => (
            <a key={a.key} href={qboUrl(a.path, realmId)} target="_blank" rel="noopener noreferrer"
              className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              title={realmId ? `Opens ${a.label} for this company in QuickBooks` : "Opens QuickBooks — sign into the accountant view with this company active"}>
              {a.label}
            </a>
          ))}
          {!realmId && <span className="text-[10px] text-slate-400">(no QBO connection yet — opens your active company)</span>}
        </div>
        {/* Tailor + bulk-complete: opt this client out of credit cards (drops that
            step), and mark every relevant item done in one click. */}
        <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
          {flags && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
              <input type="checkbox" checked={flags.hasCreditCard} disabled={setCC.isPending}
                onChange={(e) => setCC.mutate({ clientId, value: e.target.checked })} />
              Has credit cards
            </label>
          )}
          {checklist && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={markAll.isPending}
              onClick={() => markAll.mutate({ id: checklist.id, done: !done })}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> {done ? "Clear all" : "Mark all done"}
            </Button>
          )}
        </div>
        <Progress value={pct} className="h-2 mb-1" />
        {(items || []).map((item: any) => {
          const checked = (checklist as any)?.[item.field] === true || (checklist as any)?.[item.field] === 1;
          return (
            <button key={item.field} type="button" disabled={!checklist || toggle.isPending}
              onClick={() => checklist && toggle.mutate({ id: checklist.id, field: item.field, checked: !checked })}
              className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-colors ${checked ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200 hover:bg-slate-50"}`}>
              <span className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded border ${checked ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"}`}>
                {checked && <CheckCircle className="h-3 w-3" />}
              </span>
              <span className={`text-sm ${checked ? "line-through text-slate-400" : "text-slate-700"}`}>{item.label}</span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * PRE-HST REVIEW, embedded on the client card (Markie 2026-06-26: "move it to the
 * client card"). Read-only accuracy sweep before filing — catches tax-code gaps,
 * sales without HST, control-account coding, duplicates, meals ITC — and gives an
 * implied-HST tie-out to compare to QBO's own Sales Tax report. Nothing posts.
 * Dates default to the client's FISCAL quarter (fiscalYearEndMonth), editable.
 */
/** Traffic-light banner for the HST reasonableness test (effective rate ≈ 13%?). */
function HstReasonablenessLight({ rz }: { rz: any }) {
  const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
  const tone: Record<string, { box: string; dot: string; label: string }> = {
    green: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", dot: "bg-emerald-500", label: "Passed the HST reasonableness test" },
    yellow: { box: "border-amber-200 bg-amber-50 text-amber-900", dot: "bg-amber-500", label: "HST looks off — worth a look" },
    red: { box: "border-red-200 bg-red-50 text-red-900", dot: "bg-red-500", label: "HST fails the reasonableness test — review before filing" },
    na: { box: "border-slate-200 bg-slate-50 text-slate-600", dot: "bg-slate-400", label: "Not enough data to test HST" },
  };
  const t = tone[rz.overall] || tone.na;
  const sideTone = (v: string) => v === "green" ? "text-emerald-700" : v === "yellow" ? "text-amber-700" : v === "red" ? "text-red-700" : "text-slate-400";
  const Row = ({ c }: { c: any }) => (
    <div className="flex items-start gap-1.5 text-[11px]">
      <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${tone[c.verdict]?.dot || "bg-slate-400"}`} />
      <span className="text-slate-600">
        <b className={sideTone(c.verdict)}>{c.label}: {c.effectiveRatePct == null ? "—" : `${c.effectiveRatePct}%`}</b>
        {c.effectiveRatePct != null && <span className="text-slate-400"> (vs {c.expectedRatePct}% · {money(c.tax)} on {money(c.base)})</span>}
        <span className="block text-slate-500">{c.message}</span>
      </span>
    </div>
  );
  return (
    <div className={`rounded-md border p-2 space-y-1.5 ${t.box}`}>
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
        {t.label}
      </div>
      <Row c={rz.output} />
      <Row c={rz.itc} />
    </div>
  );
}

export function ClientHstReviewCard({ clientId, client }: { clientId: number; client: any }) {
  const freq = normalizeFreq(client?.hstFilingFrequency || client?.hstPeriod);
  const def = fiscalHstRange(new Date(), freq, client?.fiscalYearEndMonth);
  const [start, setStart] = useState(def.start);
  const [end, setEnd] = useState(def.end);
  const run = trpc.hstReview.run.useMutation();
  const r = run.data;
  const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
  const sevIcon = (s: string) => s === "high" ? <AlertCircle className="h-3.5 w-3.5 text-red-600" /> : s === "medium" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> : <Info className="h-3.5 w-3.5 text-sky-600" />;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-indigo-600" /> Pre-HST review <span className="text-xs font-normal text-slate-400">(read-only)</span></CardTitle>
        <CardDescription>
          Reconcile in QuickBooks first, then run this to catch coding issues before you file. It checks what's in the books — it can't see transactions never entered. Period defaults to this client's fiscal quarter; adjust if needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-end gap-2 flex-wrap">
          <div><Label className="text-[11px] text-slate-500">From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9" /></div>
          <div><Label className="text-[11px] text-slate-500">To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9" /></div>
          <Button size="sm" className="h-9" disabled={run.isPending} onClick={() => run.mutate({ clientId, startDate: start, endDate: end })}>
            {run.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null} Run review
          </Button>
          <Link to={`/hst-review?clientId=${clientId}&start=${start}&end=${end}`} className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1 h-9 leading-9">
            Full page <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        {run.isError && <div className="text-xs text-red-600">{(run.error as any)?.message || "Failed to run."}</div>}
        {r && !r.ok && r.error === "bridge_not_returning_data" && <div className="text-xs text-amber-700">The live QBO connection isn't returning data yet (bridge config fix needed — not the books). File from QuickBooks' Sales Tax report for now.</div>}
        {r && !r.ok && r.error !== "bridge_not_returning_data" && <div className="text-xs text-amber-600">No usable QBO connection for this client ({r.error}).</div>}
        {r && r.ok && (
          <div className="space-y-1.5">
            {r.report.reasonableness && <HstReasonablenessLight rz={r.report.reasonableness} />}
            <div className="text-xs text-slate-600">
              Implied net HST <b>{money(r.report.tie.net)}</b> (collected {money(r.report.tie.collected)} − ITC {money(r.report.tie.itc)}) · {r.pulled.transactions} txns.
              <span className="text-slate-400"> Compare to QBO's Sales Tax report.</span>
            </div>
            {r.errors.length > 0 && <div className="text-[11px] text-amber-600">Pull warnings: {r.errors.join("; ")}</div>}
            {r.report.findings.length === 0
              ? <div className="text-xs text-emerald-600">No coding issues flagged for this period.</div>
              : <div className="space-y-1">
                  <div className="text-xs font-medium text-slate-600">{r.report.findings.length} issue(s) — {r.report.bySeverity.high} high, {r.report.bySeverity.medium} medium:</div>
                  {r.report.findings.slice(0, 15).map((f: any, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs">
                      {sevIcon(f.severity)}
                      <span className="text-slate-700"><b>{f.message}</b> {f.amount != null && <span className="text-slate-400">· {money(f.amount)}</span>} <span className="text-slate-400">— {f.ref}</span></span>
                    </div>
                  ))}
                  {r.report.findings.length > 15 && <div className="text-[11px] text-slate-400">…and {r.report.findings.length - 15} more — open the full page.</div>}
                </div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ComplianceTab({ clientId, client, onboarding, closeStatus, tasks, onOpenTask }: {
  clientId: number; client: any; onboarding?: any; closeStatus: any; tasks: any[]; onOpenTask?: (t: any) => void;
}) {
  const utils = trpc.useUtils();
  const dividendsOn = !!client.payrollDividends;
  const hasSubcontractors = !!onboarding?.hasSubcontractors;
  const { data: dividends } = trpc.dividend.list.useQuery({ clientId }, { enabled: dividendsOn });
  const addDiv = trpc.dividend.add.useMutation({ onSuccess: () => utils.dividend.list.invalidate({ clientId }) });
  const delDiv = trpc.dividend.delete.useMutation({ onSuccess: () => utils.dividend.list.invalidate({ clientId }) });
  const [d, setD] = useState({ recipient: "", recipientSin: "", amount: "", dividendType: "non_eligible", paymentDate: "" });
  // Live T5 preview for the amount/type being entered (gross-up + DTC).
  const t5Preview = d.amount ? computeT5Boxes(parseFloat(d.amount) || 0, d.dividendType as any) : null;
  // T5 slip printing.
  const [t5Year, setT5Year] = useState(new Date().getFullYear());
  const [sinCode, setSinCode] = useState("");
  const { data: t5 } = trpc.dividend.t5Slips.useQuery({ clientId, year: t5Year }, { enabled: dividendsOn });
  const revealRecipientSin = trpc.dividend.revealRecipientSin.useMutation();
  const [printing, setPrinting] = useState(false);

  const printT5Slips = async () => {
    if (!t5 || t5.slips.length === 0) { alert("No dividends logged for " + t5Year + "."); return; }
    setPrinting(true);
    try {
      // Reveal SINs if a code was entered (otherwise slips print masked).
      const sinByRecipient: Record<string, string> = {};
      if (sinCode.trim()) {
        for (const s of t5.slips) {
          if (!s.hasSin) continue;
          const r = await revealRecipientSin.mutateAsync({ clientId, recipient: s.recipient, code: sinCode.trim() });
          if (!r.ok) { alert(r.reason || "Could not reveal SIN."); break; }
          if (r.sin) sinByRecipient[s.recipient] = r.sin;
        }
      }
      printT5Html(t5, sinByRecipient);
    } finally { setPrinting(false); }
  };

  // --- T4 slips (auto from payroll) ---
  const hasPayroll = !!client.hasPayroll;
  const [t4Year, setT4Year] = useState(new Date().getFullYear());
  const { data: t4 } = trpc.payroll.t4Slips.useQuery({ clientId, year: t4Year }, { enabled: hasPayroll });
  const revealEmpSin = trpc.employee.revealSin.useMutation();
  const printT4 = async () => {
    if (!t4 || t4.slips.length === 0) { alert("No payroll for " + t4Year + "."); return; }
    setPrinting(true);
    try {
      const sinByEmp: Record<number, string> = {};
      if (sinCode.trim()) {
        for (const s of t4.slips) {
          if (!s.hasSin) continue;
          const r = await revealEmpSin.mutateAsync({ id: s.employeeId, code: sinCode.trim() });
          if (!r.ok) { alert(r.reason || "Could not reveal SIN."); break; }
          if (r.sin) sinByEmp[s.employeeId] = r.sin;
        }
      }
      printT4Html(t4, sinByEmp);
    } finally { setPrinting(false); }
  };

  // --- T4A / T5018 slips (manual log) ---
  const [slipType, setSlipType] = useState<"t4a" | "t5018">("t4a");
  const { data: otherSlipRows } = trpc.taxSlip.list.useQuery({ clientId, slipType });
  const { data: otherSlipAgg } = trpc.taxSlip.slips.useQuery({ clientId, slipType, year: t4Year });
  const addSlip = trpc.taxSlip.add.useMutation({ onSuccess: () => { utils.taxSlip.list.invalidate({ clientId, slipType }); utils.taxSlip.slips.invalidate({ clientId, slipType, year: t4Year }); } });
  const delSlip = trpc.taxSlip.delete.useMutation({ onSuccess: () => { utils.taxSlip.list.invalidate({ clientId, slipType }); utils.taxSlip.slips.invalidate({ clientId, slipType, year: t4Year }); } });
  const revealSlipId = trpc.taxSlip.revealRecipientId.useMutation();
  const [sl, setSl] = useState({ recipient: "", recipientId: "", amount: "" });
  const printOther = async () => {
    if (!otherSlipAgg || otherSlipAgg.slips.length === 0) { alert(`No ${slipType.toUpperCase()} entries for ${t4Year}.`); return; }
    setPrinting(true);
    try {
      const idByRecipient: Record<string, string> = {};
      if (sinCode.trim()) {
        for (const s of otherSlipAgg.slips) {
          if (!s.hasId) continue;
          const r = await revealSlipId.mutateAsync({ clientId, slipType, recipient: s.recipient, code: sinCode.trim() });
          if (!r.ok) { alert(r.reason || "Could not reveal."); break; }
          if (r.recipientId) idByRecipient[s.recipient] = r.recipientId;
        }
      }
      printOtherSlipHtml(otherSlipAgg, idByRecipient);
    } finally { setPrinting(false); }
  };

  // Filing obligations = compliance-category tasks (HST/WSIB/T4/T5), open first.
  const filings = (tasks || [])
    .filter((t) => ["Tax Filing", "Payroll"].includes(t.category) && /Filing|Remittance|T4|T5|HST|WSIB/i.test(t.title))
    .sort((a, b) => Number(!!a.completed) - Number(!!b.completed) || (new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime()));

  const Pill = ({ s }: { s: string }) => {
    const cls = s === "red" ? "bg-red-100 text-red-700" : s === "yellow" ? "bg-amber-100 text-amber-700" : "bg-lime-100 text-lime-700";
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls.split(" ")[0]}`} />;
  };

  return (
    <>
      {/* Month-end close checklist — the per-client sub-task list (reconciliation
          included), ticked off here instead of cluttering the calendar. */}
      <ClientCloseChecklist clientId={clientId} />

      {/* Pre-HST accuracy review — right on the client card, defaults to the
          client's fiscal quarter. Only for HST-registered clients. */}
      {client.hasHST && <ClientHstReviewCard clientId={clientId} client={client} />}

      {/* "Who paid this?" — cross-account / cross-entity double-post finder. */}
      <PaymentSourceCard clientId={clientId} groupName={(client as any).groupName} />

      {/* Inter-company recharge (invoice → bill) — per-client tool, for group clients. */}
      {(client as any).groupName && <IntercoRechargePanel defaultPayerId={clientId} />}

      {/* Filing status from the live close engine */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-lime-500" /> Filing status</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <span className="text-sm text-slate-600">HST / GST</span>
            <span className="text-sm font-medium flex items-center gap-2">
              {closeStatus?.hst?.applicable ? <><Pill s={closeStatus.hst.status} /> {closeStatus.hst.filed ? "Filed" : closeStatus.hst.overdue ? "Overdue" : "Due"} · {closeStatus.hst.periodLabel}</> : <span className="text-slate-400">N/A</span>}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <span className="text-sm text-slate-600">Year-end</span>
            <span className="text-sm font-medium flex items-center gap-2">
              {closeStatus?.yearEnd?.applicable ? <><Pill s={closeStatus.yearEnd.status} /> {closeStatus.yearEnd.lastFyeDate}</> : <span className="text-slate-400">Not set</span>}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Filing obligations (driven by the client's flags) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filing obligations</CardTitle>
          <CardDescription>Auto-created from this client's features — HST, payroll → T4, dividends → T5, WSIB.</CardDescription>
        </CardHeader>
        <CardContent>
          {filings.length === 0 ? (
            <p className="text-sm text-slate-400 py-3 text-center">No filing tasks yet — enable HST / Payroll / Dividends / WSIB on the client to generate them.</p>
          ) : (
            <div className="space-y-1.5">
              {filings.map((t) => (
                <div key={t.id} role="button" tabIndex={0}
                  onClick={() => onOpenTask?.(t)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpenTask?.(t); }}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 cursor-pointer hover:bg-slate-100">
                  {t.completed ? <CheckCircle className="h-4 w-4 text-lime-500 shrink-0" /> : <Clock className="h-4 w-4 text-amber-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${t.completed ? "line-through text-slate-400" : ""}`}>{t.title}</p>
                    <p className="text-xs text-slate-500">{t.category}{t.dueDate ? ` · due ${format(new Date(t.dueDate), "MMM d, yyyy")}` : ""}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{t.completed ? "done" : (t as any).stage || "open"}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past HST filings — link straight to the documents in the client's Drive folder */}
      {client.hasHST && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Past HST filings</CardTitle>
            <CardDescription>The filed HST/GST returns &amp; working papers live in the client's file folder.</CardDescription>
          </CardHeader>
          <CardContent>
            {client.driveFolderUrl ? (
              <a href={client.driveFolderUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100">
                <FolderOpen className="h-4 w-4" /> Open HST filings folder <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ) : (
              <p className="text-sm text-amber-600">No Drive folder set on this client — add one (Quick links → Edit) to link past filings.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Past T5 / dividend filings — link to the filed slips in the client's Drive folder */}
      {(client as any).payrollDividends && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Past T5 / dividend filings</CardTitle>
            <CardDescription>Filed T5 slips &amp; summaries live in the client's file folder.</CardDescription>
          </CardHeader>
          <CardContent>
            {client.driveFolderUrl ? (
              <a href={client.driveFolderUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100">
                <FolderOpen className="h-4 w-4" /> Open T5 filings folder <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ) : (
              <p className="text-sm text-amber-600">No Drive folder set on this client — add one (Quick links → Edit) to link past filings.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Past WSIB filings — link to the filed reports in the client's Drive folder */}
      {client.hasWSIB && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Past WSIB filings</CardTitle>
            <CardDescription>The filed WSIB premium reports &amp; working papers live in the client's file folder.</CardDescription>
          </CardHeader>
          <CardContent>
            {client.driveFolderUrl ? (
              <a href={client.driveFolderUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100">
                <FolderOpen className="h-4 w-4" /> Open WSIB filings folder <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ) : (
              <p className="text-sm text-amber-600">No Drive folder set on this client — add one (Quick links → Edit) to link past filings.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* WSIB remittance — pulls insurable earnings from payroll × the premium rate */}
      {client.hasWSIB && <WsibRemittanceCard clientId={clientId} driveFolderUrl={client.driveFolderUrl} />}

      {/* Compliance numbers */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Registration numbers</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {([
            ["CRA BN", client.taxId],
            ...(client.hasHST ? [["HST #", client.hstNumber]] : []),
            ...(client.hasPayroll ? [["Payroll RP #", (client as any).payrollRpNumber]] : []),
            ...(client.hasWSIB ? [["WSIB #", client.wsibAccountNumber]] : []),
          ] as [string, any][]).map(([k, v]) => (
            <div key={k as string} className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">{k}</p>
              <p className={`font-medium ${v ? "" : "text-amber-600"}`}>{v || "⚠ missing"}</p>
            </div>
          ))}
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500">CRA RAC access</p>
            <p className={`font-medium ${client.craRacDone ? "text-lime-700" : "text-amber-600"}`}>{client.craRacDone ? "Set up" : "Not set up"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Dividend log — only when the client pays dividends */}
      {dividendsOn && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-500" /> Dividend log</CardTitle>
            <CardDescription>Shareholder dividends for the year — feeds the T5 filing reminder.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
              <div><Label className="text-xs">Recipient</Label><Input value={d.recipient} onChange={(e) => setD({ ...d, recipient: e.target.value })} placeholder="Shareholder" /></div>
              <div><Label className="text-xs">SIN <span className="text-slate-400">(hidden)</span></Label><Input value={d.recipientSin} onChange={(e) => setD({ ...d, recipientSin: e.target.value })} placeholder="000-000-000" /></div>
              <div><Label className="text-xs">Amount</Label><Input type="number" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} placeholder="0.00" /></div>
              <div><Label className="text-xs">Type</Label>
                <Select value={d.dividendType} onValueChange={(v) => setD({ ...d, dividendType: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="non_eligible">Non-eligible</SelectItem><SelectItem value="eligible">Eligible</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Date</Label><Input type="date" value={d.paymentDate} onChange={(e) => setD({ ...d, paymentDate: e.target.value })} /></div>
              <Button size="sm" disabled={addDiv.isPending || !d.amount} onClick={() => {
                addDiv.mutate({ clientId, recipient: d.recipient.trim() || undefined, recipientSin: d.recipientSin.trim() || undefined, amount: parseFloat(d.amount) || 0, dividendType: d.dividendType as any, paymentDate: d.paymentDate ? new Date(d.paymentDate) : undefined });
                setD({ recipient: "", recipientSin: "", amount: "", dividendType: "non_eligible", paymentDate: "" });
              }}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
            </div>
            {t5Preview && (
              <p className="text-xs text-slate-500">
                T5 calc → taxable (box {t5Preview.taxableBox}) <b>${t5Preview.taxable.toLocaleString()}</b> · dividend tax credit (box {t5Preview.dtcBox}) <b>${t5Preview.dtc.toLocaleString()}</b>
              </p>
            )}
            {(dividends && dividends.length > 0) ? (
              <div className="space-y-1">
                {dividends.map((dv: any) => (
                  <div key={dv.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 text-sm">
                    <span className="flex-1 min-w-0 truncate">{dv.recipient || "—"}</span>
                    <span className="text-slate-500 text-xs">{dv.dividendType === "eligible" ? "Eligible" : "Non-elig."}</span>
                    <span className="text-slate-400 text-xs">{dv.paymentDate ? format(new Date(dv.paymentDate), "MMM d, yyyy") : ""}</span>
                    <span className="font-medium">${(dv.amount || 0).toLocaleString()}</span>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => delDiv.mutate({ id: dv.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
                <div className="flex justify-end pt-1 text-sm font-semibold">
                  Total: ${dividends.reduce((s: number, x: any) => s + (x.amount || 0), 0).toLocaleString()}
                </div>
              </div>
            ) : <p className="text-sm text-slate-400 py-2 text-center">No dividends logged yet.</p>}
          </CardContent>
        </Card>
      )}

      {/* T5 slip printing */}
      {dividendsOn && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" /> Print T5 slips</CardTitle>
            <CardDescription>Generates a printable T5 per recipient (gross-up + dividend tax credit) for the year. Enter the SIN code to print SINs; leave blank to print masked.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div><Label className="text-xs">Tax year</Label><Input type="number" className="w-28" value={t5Year} onChange={(e) => setT5Year(Number(e.target.value) || new Date().getFullYear())} /></div>
            <div><Label className="text-xs">SIN reveal code</Label><Input type="password" className="w-40" value={sinCode} onChange={(e) => setSinCode(e.target.value)} placeholder="optional" /></div>
            <Button size="sm" disabled={printing} onClick={printT5Slips}><FileText className="h-3.5 w-3.5 mr-1" /> {printing ? "Preparing…" : `Print T5 slips (${t5?.slips.length ?? 0})`}</Button>
            <span className="text-xs text-slate-400">{t5?.slips.length ? `${t5.slips.length} recipient(s) for ${t5Year}` : `No dividends for ${t5Year}`}</span>
          </CardContent>
        </Card>
      )}

      {/* T4 slips — auto from payroll */}
      {hasPayroll && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" /> Print T4 slips</CardTitle>
            <CardDescription>{t4?.source === "qbo" ? "Pulled from QuickBooks." : "From CRM pay runs for now — will pull from QuickBooks once connected."} Boxes 14/16/16A/18/22/24/26. Uses the SIN code above to print SINs.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div><Label className="text-xs">Tax year</Label><Input type="number" className="w-28" value={t4Year} onChange={(e) => setT4Year(Number(e.target.value) || new Date().getFullYear())} /></div>
            <Button size="sm" disabled={printing} onClick={printT4}><FileText className="h-3.5 w-3.5 mr-1" /> {printing ? "Preparing…" : `Print T4 slips (${t4?.slips.length ?? 0})`}</Button>
            <span className="text-xs text-slate-400">{t4?.slips.length ? `${t4.slips.length} employee(s) for ${t4Year}` : `No payroll for ${t4Year}`}</span>
          </CardContent>
        </Card>
      )}

      {/* T4A / T5018 slips — only when the client has subcontractors (intake-driven) */}
      {hasSubcontractors && (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-purple-500" /> Contractor slips — T4A / T5018</CardTitle>
          <CardDescription>Log contractor fees (T4A box 048) and construction subcontractor payments (T5018), then print.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            {(["t4a", "t5018"] as const).map((t) => (
              <Button key={t} size="sm" variant={slipType === t ? "default" : "outline"} onClick={() => setSlipType(t)}>{t.toUpperCase()}</Button>
            ))}
            <span className="text-xs text-slate-400 ml-auto">Year {t4Year}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
            <div><Label className="text-xs">Recipient</Label><Input value={sl.recipient} onChange={(e) => setSl({ ...sl, recipient: e.target.value })} placeholder={slipType === "t5018" ? "Subcontractor" : "Contractor"} /></div>
            <div><Label className="text-xs">BN / SIN <span className="text-slate-400">(hidden)</span></Label><Input value={sl.recipientId} onChange={(e) => setSl({ ...sl, recipientId: e.target.value })} placeholder="BN or SIN" /></div>
            <div><Label className="text-xs">Amount</Label><Input type="number" value={sl.amount} onChange={(e) => setSl({ ...sl, amount: e.target.value })} placeholder="0.00" /></div>
            <Button size="sm" disabled={addSlip.isPending || !sl.amount} onClick={() => {
              addSlip.mutate({ clientId, slipType, recipient: sl.recipient.trim() || undefined, recipientId: sl.recipientId.trim() || undefined, amount: parseFloat(sl.amount) || 0, taxYear: t4Year });
              setSl({ recipient: "", recipientId: "", amount: "" });
            }}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
          </div>
          {(otherSlipRows && otherSlipRows.length > 0) ? (
            <div className="space-y-1">
              {otherSlipRows.map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 text-sm">
                  <span className="flex-1 min-w-0 truncate">{r.recipient || "—"}</span>
                  <span className="text-slate-400 text-xs">{r.taxYear}</span>
                  <span className="font-medium">${(r.amount || 0).toLocaleString()}</span>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => delSlip.mutate({ id: r.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400 py-1 text-center">No {slipType.toUpperCase()} entries yet.</p>}
          <Button size="sm" variant="outline" disabled={printing} onClick={printOther}><FileText className="h-3.5 w-3.5 mr-1" /> Print {slipType.toUpperCase()} slips ({otherSlipAgg?.slips.length ?? 0})</Button>
        </CardContent>
      </Card>
      )}
    </>
  );
}

/** Print T4 slips (one per employee). */
function printT4Html(t4: any, sinByEmp: Record<number, string>) {
  const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const money = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const payer = t4.payer || { name: "", address: "", bn: "", rp: "" };
  const slips = t4.slips.map((s: any) => {
    const sin = sinByEmp[s.employeeId];
    return `
      <div class="slip">
        <div class="slip-head"><h2>T4 — Statement of Remuneration Paid</h2><span>${t4.year}</span></div>
        <div class="row"><div><b>Employer</b><br>${esc(payer.name)}<br>${esc(payer.address)}<br>BN: ${esc(payer.bn)} · RP: ${esc(payer.rp)}</div>
        <div><b>Employee</b><br>${esc(s.name)}<br>${esc(s.address)}<br>SIN: ${sin ? esc(sin) : "•••-•••-•••"}</div></div>
        <table>
          <tr><th>Box</th><th>Description</th><th>Amount</th></tr>
          <tr><td>14</td><td>Employment income</td><td>${money(s.box14)}</td></tr>
          <tr><td>16</td><td>Employee's CPP contributions</td><td>${money(s.box16)}</td></tr>
          <tr><td>16A</td><td>Employee's second CPP (CPP2)</td><td>${money(s.box16A)}</td></tr>
          <tr><td>18</td><td>Employee's EI premiums</td><td>${money(s.box18)}</td></tr>
          <tr><td>22</td><td>Income tax deducted</td><td>${money(s.box22)}</td></tr>
          <tr><td>24</td><td>EI insurable earnings</td><td>${money(s.box24)}</td></tr>
          <tr><td>26</td><td>CPP pensionable earnings</td><td>${money(s.box26)}</td></tr>
        </table>
      </div>`;
  }).join("");
  openPrint(`T4 slips ${t4.year}`, slips);
}

/** Print T4A (box 048) or T5018 slips (one per recipient). */
function printOtherSlipHtml(agg: any, idByRecipient: Record<string, string>) {
  const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const money = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const isT4A = agg.slipType === "t4a";
  const title = isT4A ? "T4A — Statement of Pension, Retirement, Annuity, and Other Income" : "T5018 — Statement of Contract Payments";
  const boxLabel = isT4A ? "048 — Fees for services" : "Construction subcontractor payments";
  const payer = agg.payer || { name: "", address: "", bn: "" };
  const slips = agg.slips.map((s: any) => {
    const id = idByRecipient[s.recipient];
    return `
      <div class="slip">
        <div class="slip-head"><h2>${esc(title)}</h2><span>${agg.year}</span></div>
        <div class="row"><div><b>Payer</b><br>${esc(payer.name)}<br>${esc(payer.address)}<br>BN: ${esc(payer.bn)}</div>
        <div><b>Recipient</b><br>${esc(s.recipient)}<br>BN/SIN: ${id ? esc(id) : "•••••••••"}</div></div>
        <table><tr><th>Description</th><th>Amount</th></tr>
          <tr><td>${esc(boxLabel)}</td><td>${money(s.amount)}</td></tr></table>
      </div>`;
  }).join("");
  openPrint(`${agg.slipType.toUpperCase()} slips ${agg.year}`, slips);
}

/** Shared print-window shell + auto-print. */
function openPrint(title: string, body: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:24px;}
      .slip{border:1px solid #cbd5e1;border-radius:8px;padding:18px;margin-bottom:18px;page-break-inside:avoid;}
      .slip-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #0f172a;padding-bottom:6px;margin-bottom:12px;}
      .slip-head h2{font-size:15px;margin:0;} .slip-head span{font-weight:700;}
      .row{display:flex;justify-content:space-between;gap:24px;margin-bottom:12px;font-size:13px;line-height:1.5;}
      table{width:100%;border-collapse:collapse;font-size:13px;} th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;}
      th:last-child,td:last-child{text-align:right;} th{background:#f1f5f9;}
      @media print{button{display:none;}}
    </style></head><body>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 14px;border:0;background:#65a30d;color:#fff;border-radius:6px;cursor:pointer;">Print</button>
    ${body}
    <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
    </body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to print slips."); return; }
  w.document.write(html); w.document.close();
}

/** Open a clean print window with one T5 slip per recipient and trigger print. */
function printT5Html(t5: any, sinByRecipient: Record<string, string>) {
  const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const money = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const payer = t5.payer || { name: "", address: "", bn: "" };
  const slips = t5.slips.map((s: any) => {
    const sin = sinByRecipient[s.recipient];
    const sinLine = sin ? esc(sin) : "•••-•••-•••";
    return `
      <div class="slip">
        <div class="slip-head"><h2>T5 — Statement of Investment Income</h2><span>${t5.year}</span></div>
        <div class="row"><div><b>Payer</b><br>${esc(payer.name)}<br>${esc(payer.address)}<br>BN: ${esc(payer.bn)}</div>
        <div><b>Recipient</b><br>${esc(s.recipient)}<br>SIN: ${sinLine}</div></div>
        <table>
          <tr><th>Box</th><th>Description</th><th>Amount</th></tr>
          <tr><td>24</td><td>Actual amount of eligible dividends</td><td>${money(s.eligible.actual)}</td></tr>
          <tr><td>25</td><td>Taxable amount of eligible dividends</td><td>${money(s.eligible.taxable)}</td></tr>
          <tr><td>26</td><td>Dividend tax credit (eligible)</td><td>${money(s.eligible.dtc)}</td></tr>
          <tr><td>10</td><td>Actual amount of non-eligible dividends</td><td>${money(s.nonEligible.actual)}</td></tr>
          <tr><td>11</td><td>Taxable amount of non-eligible dividends</td><td>${money(s.nonEligible.taxable)}</td></tr>
          <tr><td>12</td><td>Dividend tax credit (non-eligible)</td><td>${money(s.nonEligible.dtc)}</td></tr>
        </table>
        <p class="note">Total dividends paid: <b>${money(s.totalActual)}</b> · Total taxable: ${money(s.totalTaxable)} · Total DTC: ${money(s.totalDtc)}</p>
      </div>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>T5 slips ${t5.year}</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:24px;}
      .slip{border:1px solid #cbd5e1;border-radius:8px;padding:18px;margin-bottom:18px;page-break-inside:avoid;}
      .slip-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #0f172a;padding-bottom:6px;margin-bottom:12px;}
      .slip-head h2{font-size:16px;margin:0;} .slip-head span{font-weight:700;}
      .row{display:flex;justify-content:space-between;gap:24px;margin-bottom:12px;font-size:13px;line-height:1.5;}
      table{width:100%;border-collapse:collapse;font-size:13px;} th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;}
      th:last-child,td:last-child{text-align:right;} th{background:#f1f5f9;}
      .note{font-size:12px;color:#475569;margin-top:10px;}
      @media print{button{display:none;}}
    </style></head><body>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 14px;border:0;background:#65a30d;color:#fff;border-radius:6px;cursor:pointer;">Print</button>
    ${slips}
    <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
    </body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to print T5 slips."); return; }
  w.document.write(html);
  w.document.close();
}

// Edit Intake Dialog — clean up a client's record (client-level + onboarding).
function EditIntakeDialog({ client, onboarding, onClose, onSave, isPending }: {
  client: any; onboarding: any; onClose: () => void; onSave: (data: any) => void; isPending: boolean;
}) {
  const o = onboarding || {};
  const [f, setF] = useState<any>({
    name: client.name || "", email: client.email || "", phone: client.phone || "", company: client.company || "",
    website: client.website || "",
    address: client.address || "", contactName: client.contactName || o.primaryContactName || "",
    taxId: client.taxId || o.craBusinessNumber || "", hstNumber: client.hstNumber || "",
    wsibAccountNumber: client.wsibAccountNumber || o.wsibAccountNumber || "", payrollRpNumber: client.payrollRpNumber || "",
    craRacDone: !!client.craRacDone, monthlyFee: client.monthlyFee ?? 0,
    clientType: client.clientType || "monthly",
    country: client.country || (client.qboAccountType === "us_clients" ? "US" : "CA"),
    province: client.province || "",
    hasHST: !!client.hasHST, hstPeriod: client.hstPeriod || "quarterly",
    hasWSIB: !!client.hasWSIB, hasPayroll: !!client.hasPayroll,
    hasIntercoJournals: !!client.hasIntercoJournals,
    payrollHistoryUrl: client.payrollHistoryUrl || "",
    payrollExternal: !!client.payrollExternal,
    payrollFrequency: client.payrollFrequency || "bi-weekly",
    payrollRemitterFreq: client.payrollRemitterFreq || "regular",
    yearEndMonth: client.yearEndMonth || "Dec",
    companyKey: client.companyKey || "", craRepId: client.craRepId || "YY7F3GN",
    industry: client.industry || "", bio: client.bio || "",
    registryNumber: client.registryNumber || "", incorporationDate: client.incorporationDate || "",
    corpType: client.corpType || "", governmentStatus: client.governmentStatus || "",
    avgMonthlyTransactions: o.avgMonthlyTransactions ?? client.transactionsPerMonth ?? 0,
    bookkeepingFrequency: o.bookkeepingFrequency || "monthly",
    employeeCount: o.employeeCount ?? 0, monthsBehind: o.monthsBehind ?? 0,
    bankAccountCount: o.bankAccountCount ?? 1, creditCardCount: o.creditCardCount ?? 0,
    hasEmployees: !!o.hasEmployees, hasSubcontractors: !!o.hasSubcontractors, hasInvestments: !!o.hasInvestments,
    paysDividends: !!o.paysDividends, hasEHT: !!o.hasEHT, needsYearEnd: o.needsYearEnd !== false,
    usesHubdoc: !!o.usesHubdoc, hasJobCosting: !!o.hasJobCosting,
    invoicingResponsibility: o.invoicingResponsibility || "none", billPayResponsibility: o.billPayResponsibility || "none",
    usesStripe: !!o.usesStripe, usesSquare: !!o.usesSquare, usesShopify: !!o.usesShopify, usesJobber: !!o.usesJobber, usesTouchBistro: !!o.usesTouchBistro, usesPayPal: !!o.usesPayPal, usesWise: !!o.usesWise,
    qboSoftwareTier: o.qboSoftwareTier || "none", qboSoftwareWholesale: !!o.qboSoftwareWholesale, qboPayrollWholesale: !!o.qboPayrollWholesale,
    servicesNeeded: o.servicesNeeded || "", painPoints: o.painPoints || "", expectations: o.expectations || "",
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const truthy = (v: any) => v === true || v === "true";
  const isUS = f.country === "US"; // US-geared intake: EIN/state/sales-tax, no HST/WSIB/CRA
  // IMPORTANT: these are called as functions ({field(...)}) — NOT rendered as
  // <Component/> — so the inputs are NOT remounted on every keystroke (which
  // would steal focus and make typing impossible).
  const field = (k: string, label: string, type = "text", req = false) => (
    <div className="space-y-1" key={k}>
      <Label className="text-xs">{label}{req ? <span className="text-red-600 font-semibold"> · required</span> : null}</Label>
      <Input type={type} value={f[k]} onChange={(e) => set(k, type === "number" ? Number(e.target.value) : e.target.value)}
        className={cn("h-8", req && "border-red-400 bg-red-50")} />
    </div>
  );
  const check = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-sm cursor-pointer py-1" key={k}>
      <input type="checkbox" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} className="w-4 h-4 accent-lime-500" />{label}
    </label>
  );
  const sel = (k: string, label: string, opts: [string, string][]) => (
    <div className="space-y-1" key={k}>
      <Label className="text-xs">{label}</Label>
      <Select value={String(f[k])} onValueChange={(v) => set(k, v)}>
        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>{opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-auto">
        <DialogHeader className="sticky top-0 bg-white z-10 -mx-6 px-6 pb-2 border-b"><DialogTitle className="flex items-center gap-2"><Edit className="h-4 w-4" /> Edit intake — {client.name}</DialogTitle></DialogHeader>

        <p className="text-xs uppercase font-semibold text-slate-500">Contact</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {field("name", "Client name")}{field("company", "Company")}{field("contactName", "Contact name")}
          {field("email", "Email")}{field("phone", "Phone")}{field("website", "Website (for logo)")}
          {field("address", "Address")}
        </div>

        <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Service type</p>
        <div className="grid grid-cols-2 gap-2">
          {sel("clientType", "Client type", [["monthly","Monthly bookkeeping"],["quarterly","Quarterly"],["annual","Annual / year-end only"],["payroll","Payroll"],["wholesale","Wholesale (flow-through — QBO resale only)"]])}
          {sel("country", "Country", [["CA","🇨🇦 Canada"],["US","🇺🇸 United States"]])}
        </div>
        {isUS && (
          <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 -mt-1">US client — intake uses EIN, state sales tax &amp; US payroll. Canada-only items (HST/GST, WSIB, CRA Represent-a-Client) are hidden.</p>
        )}
        {f.clientType === "wholesale" && (
          <p className="text-xs text-slate-500 -mt-1">Flow-through client: no month-end close, no quote, and no recurring compliance tasks. Switching to wholesale pauses any existing tasks.</p>
        )}

        {f.clientType === "wholesale" ? (
          /* FLOW-THROUGH: only wholesale billing — no compliance, payroll, or tasks. */
          <>
            <p className="text-xs uppercase font-semibold text-slate-500 mt-2">QuickBooks wholesale billing</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {field("taxId", "CRA BN")}
              {sel("qboSoftwareTier", "QBO software", [["none","None / N/A"],["easystart","EasyStart ($24)"],["essentials","Essentials ($54)"],["plus","Plus ($60)"]])}
            </div>
            <div className="flex flex-wrap gap-x-4">
              {check("qboSoftwareWholesale", "Bill QBO software through us (wholesale)")}
              {check("qboPayrollWholesale", "Bill QBO Payroll through us ($40 + $7/emp)")}
            </div>
          </>
        ) : (
          <>
            {/* STANDARD — every operational client */}
            <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Business details</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {field("taxId", isUS ? "EIN (Federal Tax ID)" : "CRA BN", "text", !f.taxId)}
              {field("province", isUS ? "State" : "Province")}
              {sel("yearEndMonth", "Year-end", ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m=>[m,m] as [string,string]))}
              {sel("bookkeepingFrequency", "Bookkeeping", [["monthly","Monthly"],["quarterly","Quarterly"],["annual","Annual"],["none","None"]])}
              {field("avgMonthlyTransactions", "Avg monthly txns", "number")}
              {field("bankAccountCount", "# Bank accts", "number")}{field("creditCardCount", "# Credit cards", "number")}
              {field("monthsBehind", "Months behind", "number")}
              {/* Service Canada / CRA fields — Canada only */}
              {!isUS && field("companyKey", "Company Key (Service Canada)")}
              {!isUS && field("craRepId", "CRA RepID")}
            </div>
            {!isUS && check("craRacDone", "CRA Represent-a-Client (RAC) access is set up")}

            <p className="text-xs uppercase font-semibold text-slate-500 mt-2">{isUS ? "Business registry" : "Government registry"}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {field("industry", "Industry")}{field("registryNumber", isUS ? "State registration #" : "Registry #")}
              {field("incorporationDate", "Incorporation date")}{field("corpType", isUS ? "Entity type (LLC/S-Corp/…)" : "Corp type")}
              {field("governmentStatus", isUS ? "Registration status" : "Govt status")}
            </div>
            {field("bio", "Bio / description")}

            {/* Drill-downs: tick what this client has → its fields + tasks appear. */}
            <p className="text-xs uppercase font-semibold text-slate-500 mt-3">What this client has <span className="font-normal lowercase text-slate-400">— tick to enable; fields &amp; tasks appear</span></p>

            {check("hasHST", isUS ? "Collects state sales tax" : "Charges / files HST")}
            {truthy(f.hasHST) && (
              <div className="ml-6 pl-3 border-l-2 border-lime-200 grid grid-cols-2 gap-2">
                {sel("hstPeriod", isUS ? "Sales tax filing frequency" : "HST filing frequency", [["monthly","Monthly"],["quarterly","Quarterly"],["annual","Annual"]])}
                {isUS ? (
                  <div className="space-y-1"><Label className="text-xs">Sales tax permit / registration #</Label>
                    <Input className="h-8" value={f.hstNumber} onChange={(e) => set("hstNumber", e.target.value)} /></div>
                ) : (
                  <div className="space-y-1"><Label className="text-xs">HST # <span className="text-slate-400">(auto from BN)</span></Label>
                    <Input className="h-8 bg-slate-50" value={f.hstNumber || (f.taxId ? `${f.taxId}RT0001` : "")} readOnly /></div>
                )}
              </div>
            )}

            {check("hasPayroll", "Runs payroll")}
            {truthy(f.hasPayroll) && (
              <div className="ml-6 pl-3 border-l-2 border-lime-200 space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {sel("payrollFrequency", "Pay frequency", [["weekly","Weekly"],["bi-weekly","Bi-weekly"],["semi-monthly","Semi-monthly"],["monthly","Monthly"],["self","Self"]])}
                  {/* CRA remitter cadence + RP program account are Canada-only. */}
                  {!isUS && sel("payrollRemitterFreq", "CRA remitter", [["regular","Regular"],["quarterly","Quarterly"],["accelerated","Accelerated"]])}
                  {field("employeeCount", "# Employees", "number")}
                  {!isUS && (
                    <div className="space-y-1"><Label className="text-xs">Payroll RP # <span className="text-slate-400">(auto from BN)</span></Label>
                      <Input className="h-8 bg-slate-50" value={f.payrollRpNumber || (f.taxId ? `${f.taxId}RP0001` : "")} readOnly /></div>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4">
                  {!isUS && check("hasEHT", "Has EHT (Ontario)")}
                  {check("payrollExternal", "We don't run it (autopay / client self-manages)")}
                </div>
                {field("payrollHistoryUrl", "Past payroll history sheet (URL)")}
                {isUS && <p className="text-[11px] text-slate-400">US payroll: federal + state withholding, FUTA/SUTA. (CRA remitter / RP# don't apply.)</p>}
              </div>
            )}

            {/* WSIB is an Ontario program — Canada only. */}
            {!isUS && check("hasWSIB", "Has WSIB")}
            {!isUS && !!f.hasWSIB && (
              <div className="ml-6 pl-3 border-l-2 border-lime-200 grid grid-cols-2 gap-2">
                {field("wsibAccountNumber", "WSIB #", "text", !f.wsibAccountNumber)}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 mt-1">
              {check("paysDividends", isUS ? "Pays dividends (1099-DIV)" : "Pays dividends (T5)")}
              {check("hasInvestments", isUS ? "Investment income (1099)" : "Investment income (T5)")}
              {check("hasSubcontractors", isUS ? "Subcontractors (1099-NEC)" : "Subcontractors (T5018)")}
              {check("hasIntercoJournals", "Inter-company journals (monthly recon)")}
              {check("hasJobCosting", "Job costing")}
              {check("usesHubdoc", "Uses Hubdoc")}
              {check("needsYearEnd", "We do year-end")}
            </div>

            <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Invoicing &amp; bill pay</p>
            <div className="grid grid-cols-2 gap-2">
              {sel("invoicingResponsibility", "Invoicing (A/R)", [["none","N/A"],["we_invoice","We invoice"],["client_invoices","Client invoices"],["both","Both"]])}
              {sel("billPayResponsibility", "Bill pay (A/P)", [["none","N/A"],["we_pay","We pay"],["client_pays","Client pays"],["both","Both"]])}
            </div>

            <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Sales platforms</p>
            <div className="flex flex-wrap gap-x-4">
              {check("usesStripe", "Stripe")}{check("usesSquare", "Square")}{check("usesShopify", "Shopify")}{check("usesJobber", "Jobber")}{check("usesTouchBistro", "TouchBistro")}{check("usesPayPal", "PayPal")}{check("usesWise", "Wise")}
            </div>

            <p className="text-xs uppercase font-semibold text-slate-500 mt-2">QuickBooks (wholesale billing through us)</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {sel("qboSoftwareTier", "QBO software", [["none","None / N/A"],["easystart","EasyStart ($24)"],["essentials","Essentials ($54)"],["plus","Plus ($60)"]])}
            </div>
            <div className="flex flex-wrap gap-x-4">
              {check("qboSoftwareWholesale", "Bill QBO software through us (wholesale)")}
              {check("qboPayrollWholesale", "Bill QBO Payroll through us ($40 + $7/emp)")}
            </div>
          </>
        )}

        <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Pricing & notes</p>
        <div className="grid grid-cols-2 gap-2">
          {field("monthlyFee", "Flat monthly fee ($)", "number")}
        </div>
        <div className="space-y-1"><Label className="text-xs">Services / notes</Label>
          <Textarea value={f.servicesNeeded} onChange={(e) => set("servicesNeeded", e.target.value)} rows={2} /></div>

        <div className="flex justify-end gap-2 pt-3 mt-2 -mx-6 px-6 border-t bg-white sticky bottom-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={isPending} onClick={() => onSave({
            ...f,
            qboAccountType: isUS ? "us_clients" : "ca_clients",
            hasHST: truthy(f.hasHST),
            // Canada-only obligations never apply to a US client.
            hasWSIB: isUS ? false : !!f.hasWSIB,
            hasEHT: isUS ? false : !!f.hasEHT,
            craRacDone: isUS ? false : !!f.craRacDone,
            hasPayroll: truthy(f.hasPayroll),
            hasIntercoJournals: !!f.hasIntercoJournals,
            // "Has employees" is implied by "Runs payroll" — one source of truth.
            hasEmployees: truthy(f.hasPayroll),
            monthlyFee: Number(f.monthlyFee) || 0,
            avgMonthlyTransactions: Number(f.avgMonthlyTransactions) || 0,
            employeeCount: Number(f.employeeCount) || 0, monthsBehind: Number(f.monthsBehind) || 0,
            bankAccountCount: Number(f.bankAccountCount) || 0, creditCardCount: Number(f.creditCardCount) || 0,
          })}>{isPending ? "Saving…" : "Save intake"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Quote Editor Dialog — set transaction volume, toggle lines on/off, edit
// amounts before sending.
function QuoteEditorDialog({ clientId, quote, onClose, onGenerate, isPending }: {
  clientId: number; quote: any; onClose: () => void; onGenerate: (lines: any[], oneTime: any[], transactions: number) => void; isPending: boolean;
}) {
  const [lines, setLines] = useState<any[]>(
    (quote.monthlyLineItems || []).map((li: any) => ({ ...li, include: true }))
  );
  const [oneTime, setOneTime] = useState<any[]>(
    (quote.oneTimeLineItems || []).map((li: any) => ({ ...li, include: true }))
  );
  const [txns, setTxns] = useState<string>(String(quote.transactions || ""));
  const [employees, setEmployees] = useState<string>("");
  const [creditCards, setCreditCards] = useState<string>("");
  const utils = trpc.useUtils();
  const [recalcing, setRecalcing] = useState(false);
  const recalc = async () => {
    setRecalcing(true);
    try {
      const res = await utils.quote.preview.fetch({
        clientId,
        avgMonthlyTransactions: Number(txns) || 0,
        ...(employees !== "" ? { employeeCount: Number(employees) || 0 } : {}),
        ...(creditCards !== "" ? { creditCardCount: Number(creditCards) || 0 } : {}),
      });
      if (res?.quote) {
        setLines((res.quote.monthlyLineItems || []).map((li: any) => ({ ...li, include: true })));
        setOneTime((res.quote.oneTimeLineItems || []).map((li: any) => ({ ...li, include: true })));
      }
    } finally { setRecalcing(false); }
  };
  const setLine = (i: number, patch: any) => setLines((arr) => arr.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const setOne = (i: number, patch: any) => setOneTime((arr) => arr.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const monthlyTotal = lines.filter((l) => l.include).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const oneTimeTotal = oneTime.filter((l) => l.include).reduce((s, l) => s + (Number(l.amount) || 0), 0);

  // Called as a function ({row(...)}) so inputs aren't remounted per keystroke.
  const row = (li: any, i: number, setter: (i: number, p: any) => void) => (
    <div className={cn("flex items-center gap-2 py-1.5", !li.include && "opacity-40")} key={i}>
      <input type="checkbox" checked={li.include} onChange={(e) => setter(i, { include: e.target.checked })} className="w-4 h-4 accent-lime-500 shrink-0" />
      <Input value={li.label} onChange={(e) => setter(i, { label: e.target.value })} className="h-8 text-sm flex-1" />
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-slate-400 text-sm">$</span>
        <Input type="number" value={li.amount} onChange={(e) => setter(i, { amount: Number(e.target.value) })} className="h-8 text-sm w-24 text-right" />
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Edit quote before sending</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-2">Untick anything that doesn't apply (e.g. payroll/WSIB when there are no employees) and adjust amounts. The client sees only what you keep.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end mt-3 p-3 bg-slate-50 rounded-lg">
          <div>
            <Label className="text-xs">Monthly transactions</Label>
            <Input type="number" placeholder="e.g. 120" value={txns} onChange={(e) => setTxns(e.target.value)} className="h-8" />
          </div>
          <div>
            <Label className="text-xs"># Employees</Label>
            <Input type="number" placeholder="0" value={employees} onChange={(e) => setEmployees(e.target.value)} className="h-8" />
          </div>
          <div>
            <Label className="text-xs"># Credit cards</Label>
            <Select value={creditCards} onValueChange={setCreditCards}>
              <SelectTrigger className="h-8"><SelectValue placeholder="0" /></SelectTrigger>
              <SelectContent>
                {[0,1,2,3,4,5,6].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" onClick={recalc} disabled={recalcing}>
            {recalcing ? "Recalculating…" : "Recalculate"}
          </Button>
        </div>
        {(!txns || Number(txns) === 0) && (
          <p className="text-xs text-amber-700">Set the transaction volume so the base tier is real — otherwise it's just the floor price.</p>
        )}

        <div className="mt-2">
          <p className="text-xs uppercase font-semibold text-slate-500 mb-1">Monthly services</p>
          {lines.map((li, i) => row(li, i, setLine))}
        </div>
        <div className="flex justify-between font-semibold text-sm border-t pt-2 mt-1">
          <span>Recurring monthly total</span><span className="text-lime-700">${monthlyTotal}/mo</span>
        </div>

        {oneTime.length > 0 && (
          <div className="mt-3">
            <p className="text-xs uppercase font-semibold text-slate-500 mb-1">One-time</p>
            {oneTime.map((li, i) => row(li, i, setOne))}
            <div className="flex justify-between font-semibold text-sm border-t pt-2 mt-1">
              <span>One-time total</span><span>${oneTimeTotal}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={isPending}
            onClick={() => onGenerate(
              lines.filter((l) => l.include).map((l) => ({ label: l.label, amount: Number(l.amount) || 0, rationale: l.rationale || "" })),
              oneTime.filter((l) => l.include).map((l) => ({ label: l.label, amount: Number(l.amount) || 0, rationale: l.rationale || "" })),
              Number(txns) || 0,
            )}>
            {isPending ? "Generating…" : "Generate & send quote"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Edit Task Dialog Component
function EditTaskDialog({ task, onClose, onSave, isNew }: {
  task: any; onClose: () => void; onSave: (data: any) => void; isNew?: boolean;
}) {
  const [title, setTitle] = useState(task.title || "");
  const [category, setCategory] = useState(task.category || "");
  const [priority, setPriority] = useState(task.priority || "medium");
  const [dueDate, setDueDate] = useState(task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "");
  const [description, setDescription] = useState(task.description || "");

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{isNew ? <><Plus className="h-4 w-4" /> New Task</> : <><Edit className="h-4 w-4" /> Edit Task</>}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} list="client-task-titles" placeholder="Pick a standard task or type your own…" />
            <datalist id="client-task-titles">{STANDARD_TASK_TITLES.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          {task.isRecurring && (
            <p className="text-xs text-blue-600">This is a recurring task — editing changes this occurrence; the next one is generated from its rule when you mark it done.</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave({
              title,
              category,
              priority,
              description,
              ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
            })} disabled={!title.trim()}>{isNew ? "Create" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Time Log Dialog Component
/**
 * Live work timer for a client. Start/stop; auto-saves a time entry when:
 *  - you hit Stop,
 *  - you go idle (no mouse/keyboard for 5 min) — credits up to last activity,
 *  - you leave the client (component unmounts on client switch / navigation).
 * Short sessions (< 6 min) are dropped (below the 0.1h minimum).
 */
function ClientWorkTimer({ clientId, clientName, onManual }: { clientId: number; clientName: string; onManual: () => void }) {
  const utils = trpc.useUtils();
  const createTime = trpc.time.create.useMutation({ onSuccess: () => utils.time.getClientMonthlySummary.invalidate({ clientId }) });
  const [running, setRunning] = useState(false);
  const [display, setDisplay] = useState(0); // seconds, for the readout
  const startRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const runningRef = useRef(false);
  const IDLE_MS = 5 * 60 * 1000;

  const persist = (secs: number) => {
    const hours = Math.round((secs / 3600) * 100) / 100;
    if (hours >= 0.1) {
      createTime.mutate({ clientId, date: format(new Date(), "yyyy-MM-dd"), description: `Tracked work — ${clientName}`, hours, category: "bookkeeping" as any, isBillable: true });
    }
  };
  const start = () => { startRef.current = Date.now(); lastActivityRef.current = Date.now(); runningRef.current = true; setRunning(true); setDisplay(0); };
  const stopAndSave = () => {
    if (!runningRef.current) return;
    const secs = (Date.now() - startRef.current) / 1000;
    runningRef.current = false; setRunning(false); setDisplay(0);
    persist(secs);
  };

  // tick + idle auto-stop
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      setDisplay(Math.floor((Date.now() - startRef.current) / 1000));
      if (Date.now() - lastActivityRef.current > IDLE_MS) {
        const secs = (lastActivityRef.current - startRef.current) / 1000;
        runningRef.current = false; setRunning(false); setDisplay(0);
        persist(Math.max(0, secs));
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [running]);

  // track activity
  useEffect(() => {
    const onAct = () => { lastActivityRef.current = Date.now(); };
    for (const e of ["mousemove", "keydown", "click", "scroll"]) window.addEventListener(e, onAct, { passive: true });
    return () => { for (const e of ["mousemove", "keydown", "click", "scroll"]) window.removeEventListener(e, onAct); };
  }, []);

  // save on unmount (client switch / leaving the page)
  useEffect(() => () => {
    if (runningRef.current) persist((Date.now() - startRef.current) / 1000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hh = String(Math.floor(display / 3600)).padStart(2, "0");
  const mm = String(Math.floor((display % 3600) / 60)).padStart(2, "0");
  const ss = String(display % 60).padStart(2, "0");

  return (
    <div className="inline-flex items-center gap-1.5">
      {running ? (
        <Button size="sm" variant="outline" className="border-red-300 text-red-700 tabular-nums"
          onClick={stopAndSave} title="Stop & save. Auto-saves if you go idle (5 min) or switch clients.">
          <Timer className="h-3.5 w-3.5 mr-1" /> {hh}:{mm}:{ss} · Stop
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="border-lime-300 text-lime-700"
          onClick={start} title="Start a work timer for this client">
          <Timer className="h-3.5 w-3.5 mr-1" /> Start timer
        </Button>
      )}
      <button onClick={onManual} className="text-xs text-slate-400 hover:text-slate-600" title="Log time manually">+ manual</button>
    </div>
  );
}

function TimeLogDialog({ open, onClose, clientId, tasks, onSubmit, isPending }: {
  open: boolean; onClose: () => void; clientId: number; tasks: any[];
  onSubmit: (data: any) => void; isPending: boolean;
}) {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [category, setCategory] = useState("bookkeeping");
  const [taskId, setTaskId] = useState<string>("none");
  const [isBillable, setIsBillable] = useState(true);

  const handleSubmit = () => {
    if (!description || !hours || parseFloat(hours) <= 0) return;
    onSubmit({
      clientId,
      date,
      description,
      hours: parseFloat(hours),
      category,
      taskId: taskId && taskId !== "none" ? parseInt(taskId) : undefined,
      isBillable,
    });
    setDescription(""); setHours(""); setTaskId("none"); setCategory("bookkeeping"); setIsBillable(true);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-lime-500" /> Log Time
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hours *</Label>
              <Input type="number" step="0.25" min="0.25" placeholder="1.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea placeholder="What did you work on?" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bookkeeping">Bookkeeping</SelectItem>
                  <SelectItem value="payroll">Payroll</SelectItem>
                  <SelectItem value="tax_prep">Tax Prep</SelectItem>
                  <SelectItem value="cleanup">Cleanup</SelectItem>
                  <SelectItem value="advisory">Advisory</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Link to Task</Label>
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {tasks.filter((t) => !t.completed).map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="billable" checked={isBillable} onChange={(e) => setIsBillable(e.target.checked)} className="rounded border-gray-300" />
            <Label htmlFor="billable" className="text-sm font-normal">Billable time</Label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={!description || !hours || isPending} className="bg-lime-500 flex-1">
              {isPending ? "Saving..." : "Log Time"}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Quick Links Card Component (variant "card" = full card; "header" = compact row)
/** Sales & payment platforms the client uses — driven by the intake form, so the card
 *  only shows platforms that were ticked (nothing irrelevant). Renders nothing if none. */
function PlatformsCard({ onboarding, client }: { onboarding: any; client: any }) {
  const PLATFORMS: { key: string; label: string; url: string }[] = [
    { key: "usesStripe", label: "Stripe", url: "https://dashboard.stripe.com" },
    { key: "usesSquare", label: "Square", url: "https://squareup.com/login" },
    { key: "usesShopify", label: "Shopify", url: "https://www.shopify.com/login" },
    { key: "usesJobber", label: "Jobber", url: "https://secure.getjobber.com/login" },
    { key: "usesTouchBistro", label: "TouchBistro", url: "https://login.touchbistro.com" },
    { key: "usesPayPal", label: "PayPal", url: "https://www.paypal.com/signin" },
    { key: "usesWise", label: "Wise", url: "https://wise.com/login" },
  ];
  const active = PLATFORMS.filter((p) => onboarding && onboarding[p.key]);
  const monthlyReceipt = !!client?.monthlySalesReceipt;
  if (active.length === 0 && !monthlyReceipt) return null; // nothing ticked at intake → no card
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-5 w-5 text-lime-500" /> Sales &amp; payment platforms</CardTitle>
        <CardDescription>From the intake form — only what this client uses.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {active.map((p) => (
          <a key={p.key} href={p.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-sm hover:bg-lime-50 hover:text-lime-700">
            {p.label} <ExternalLink className="h-3 w-3 opacity-50" />
          </a>
        ))}
        {/* Jobber is the one platform with a live integration (timesheet-hours
            import). When the intake set Jobber as the hours source, surface a
            real Connect action that jumps to where the connector lives. */}
        {client?.payrollHoursSource === "jobber" && (
          <Link to="/payroll"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-lime-50 text-lime-700 border border-lime-300 rounded-lg text-sm hover:bg-lime-100">
            Connect Jobber (hours) <ChevronRight className="h-3 w-3 opacity-60" />
          </Link>
        )}
        {monthlyReceipt && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
            Monthly sales receipt{client?.salesReceiptSource ? ` · from ${client.salesReceiptSource}` : ""}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

/** Client grouping — one owner with multiple companies. Set a shared group/owner name;
 *  other clients with the same group show as related companies (links). */
export function GroupCard({ clientId, groupName }: { clientId: number; groupName: string | null }) {
  const utils = trpc.useUtils();
  const { data: related } = trpc.crmClient.related.useQuery({ clientId });
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(groupName || "");
  const save = trpc.crmClient.update.useMutation({
    onSuccess: () => { utils.crmClient.get.invalidate({ id: clientId }); utils.crmClient.related.invalidate({ clientId }); setEditing(false); },
    onError: (e) => alert(e.message),
  });
  const hasGroup = !!(groupName && groupName.trim());
  if (!hasGroup && !editing) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Building2 className="h-3.5 w-3.5" /> Not grouped
        <button className="text-lime-700 hover:underline" onClick={() => { setVal(""); setEditing(true); }}>group with other companies</button>
      </div>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-5 w-5 text-lime-500" /> Group{groupName ? ` · ${groupName}` : ""}</CardTitle>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setVal(groupName || ""); setEditing(true); }}><Edit className="h-3.5 w-3.5" /></Button>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="flex items-center gap-2">
            <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Owner / group name (e.g. John Smith)" className="h-8" />
            <Button size="sm" className="bg-lime-500" disabled={save.isPending} onClick={() => save.mutate({ id: clientId, groupName: val.trim() })}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        ) : (related && related.length > 0) ? (
          <div className="flex flex-wrap gap-2">
            {related.map((c: any) => (
              <Link key={c.id} to={`/client/${c.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-sm hover:bg-lime-50 hover:text-lime-700">
                <Building2 className="h-3.5 w-3.5" /> {c.name}{c.status === "inactive" ? " (inactive)" : ""}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No other companies in this group yet — set the same group name on another client to link them.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Per-client contacts (receptionist, AP, owner, etc.) — add/edit/delete, saved per client. */
export function ContactsCard({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const { data: contacts } = trpc.contacts.list.useQuery({ clientId });
  const inv = () => utils.contacts.list.invalidate({ clientId });
  const blank = { name: "", title: "", email: "", phone: "", notes: "", isPrimary: false };
  const [form, setForm] = useState<any>(blank);
  const [editId, setEditId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const create = trpc.contacts.create.useMutation({ onSuccess: () => { inv(); close(); }, onError: (e) => alert(e.message) });
  const update = trpc.contacts.update.useMutation({ onSuccess: () => { inv(); close(); }, onError: (e) => alert(e.message) });
  const remove = trpc.contacts.remove.useMutation({ onSuccess: inv });
  function close() { setOpen(false); setEditId(null); setForm(blank); }
  function startAdd() { setEditId(null); setForm(blank); setOpen(true); }
  function startEdit(c: any) { setEditId(c.id); setForm({ name: c.name || "", title: c.title || "", email: c.email || "", phone: c.phone || "", notes: c.notes || "", isPrimary: !!c.isPrimary }); setOpen(true); }
  function save() {
    if (!form.name.trim()) return;
    if (editId) update.mutate({ id: editId, ...form });
    else create.mutate({ clientId, ...form });
  }
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-lime-500" /> Contacts</CardTitle>
        <Button size="sm" variant="outline" onClick={startAdd}><Plus className="h-3.5 w-3.5 mr-1" /> Add contact</Button>
      </CardHeader>
      <CardContent>
        {(!contacts || contacts.length === 0) ? (
          <p className="text-sm text-slate-400 py-2">No contacts yet — add the people you deal with (receptionist, AP, owner…).</p>
        ) : (
          <div className="divide-y">
            {contacts.map((c: any) => (
              <div key={c.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.name}{c.isPrimary ? <Badge variant="outline" className="ml-2 text-[10px] bg-lime-50 text-lime-700">primary</Badge> : null}</p>
                  <p className="text-xs text-slate-500">{[c.title, c.email, c.phone].filter(Boolean).join(" · ") || "—"}</p>
                  {c.notes ? <p className="text-xs text-slate-400 mt-0.5">{c.notes}</p> : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEdit(c)}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => { if (confirm(`Remove ${c.name}?`)) remove.mutate({ id: c.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Edit contact" : "Add contact"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Title / role</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Receptionist" /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} /> Primary contact</label>
            <div className="flex gap-2 pt-1">
              <Button className="bg-lime-500 flex-1" disabled={!form.name.trim() || create.isPending || update.isPending} onClick={save}>{create.isPending || update.isPending ? "Saving…" : "Save"}</Button>
              <Button variant="outline" onClick={close}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Per-client vendors / customers (CRM-side; QBO sync later). One component,
 *  reused for both kinds. Vendors add a "Email all" action (mailto bcc) for
 *  statement / missing-invoice requests. */
function PartiesCard({ clientId, kind }: { clientId: number; kind: "vendor" | "customer" }) {
  const utils = trpc.useUtils();
  const { data: rows } = trpc.parties.list.useQuery({ clientId, kind });
  const inv = () => utils.parties.list.invalidate({ clientId, kind });
  const blank = { name: "", contactName: "", email: "", phone: "", accountNumber: "", notes: "" };
  const [form, setForm] = useState<any>(blank);
  const [editId, setEditId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const create = trpc.parties.create.useMutation({ onSuccess: () => { inv(); close(); }, onError: (e) => alert(e.message) });
  const update = trpc.parties.update.useMutation({ onSuccess: () => { inv(); close(); }, onError: (e) => alert(e.message) });
  const remove = trpc.parties.remove.useMutation({ onSuccess: inv });
  function close() { setOpen(false); setEditId(null); setForm(blank); }
  function startAdd() { setEditId(null); setForm(blank); setOpen(true); }
  function startEdit(c: any) { setEditId(c.id); setForm({ name: c.name || "", contactName: c.contactName || "", email: c.email || "", phone: c.phone || "", accountNumber: c.accountNumber || "", notes: c.notes || "" }); setOpen(true); }
  function save() {
    if (!form.name.trim()) return;
    if (editId) update.mutate({ id: editId, ...form });
    else create.mutate({ clientId, kind, ...form });
  }
  const isVendor = kind === "vendor";
  const label = isVendor ? "Vendors" : "Customers";
  const Icon = isVendor ? Package : Users;
  const emails = (rows || []).map((r: any) => r.email).filter(Boolean);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-5 w-5 text-lime-500" /> {label}</CardTitle>
        <div className="flex items-center gap-2">
          {isVendor && emails.length > 0 && (
            <a href={`mailto:?bcc=${encodeURIComponent(emails.join(","))}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg text-slate-600 hover:bg-slate-50">
              <Mail className="h-3.5 w-3.5" /> Email all ({emails.length})
            </a>
          )}
          <Button size="sm" variant="outline" onClick={startAdd}><Plus className="h-3.5 w-3.5 mr-1" /> Add {isVendor ? "vendor" : "customer"}</Button>
        </div>
      </CardHeader>
      <CardContent>
        {(!rows || rows.length === 0) ? (
          <p className="text-sm text-slate-400 py-2">
            No {label.toLowerCase()} yet{isVendor ? " — add the suppliers whose bills we pay." : " — add the customers we invoice."} (QBO sync coming later.)
          </p>
        ) : (
          <div className="divide-y">
            {rows.map((c: any) => (
              <div key={c.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.name}{c.qboId ? <Badge variant="outline" className="ml-2 text-[10px] bg-blue-50 text-blue-700">QBO</Badge> : null}</p>
                  <p className="text-xs text-slate-500">{[c.contactName, c.email, c.phone, c.accountNumber ? `acct ${c.accountNumber}` : null].filter(Boolean).join(" · ") || "—"}</p>
                  {c.notes ? <p className="text-xs text-slate-400 mt-0.5">{c.notes}</p> : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEdit(c)}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => { if (confirm(`Remove ${c.name}?`)) remove.mutate({ id: c.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? `Edit ${isVendor ? "vendor" : "customer"}` : `Add ${isVendor ? "vendor" : "customer"}`}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Contact</Label><Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Account #</Label><Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex gap-2 pt-1">
              <Button className="bg-lime-500 flex-1" disabled={!form.name.trim() || create.isPending || update.isPending} onClick={save}>{create.isPending || update.isPending ? "Saving…" : "Save"}</Button>
              <Button variant="outline" onClick={close}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Employees, tied into the client's Payroll tab — add/edit, WSIB eligibility,
 *  Jobber name alias, and YTD gross (pulls from QuickBooks once connected; the
 *  YTD figure also feeds the Originality CRA-comparison check). */
export function EmployeesCard({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const { data: emps } = trpc.employee.list.useQuery({ clientId });
  const blank = { firstName: "", lastName: "", position: "", payType: "salary", annualSalary: "", hourlyRate: "", wsibEligible: true, jobberName: "", ytdGrossOpening: "" };
  const [form, setForm] = useState<any>(blank);
  const [editId, setEditId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const inv = () => utils.employee.list.invalidate({ clientId });
  const create = trpc.employee.create.useMutation({ onSuccess: () => { inv(); close(); }, onError: (e) => alert(e.message) });
  const update = trpc.employee.update.useMutation({ onSuccess: () => { inv(); close(); }, onError: (e) => alert(e.message) });
  const del = trpc.employee.delete.useMutation({ onSuccess: inv });
  function close() { setOpen(false); setEditId(null); setForm(blank); }
  function startAdd() { setEditId(null); setForm(blank); setOpen(true); }
  function startEdit(e: any) { setEditId(e.id); setForm({ firstName: e.firstName || "", lastName: e.lastName || "", position: e.position || "", payType: e.payType || "salary", annualSalary: e.annualSalary ?? "", hourlyRate: e.hourlyRate ?? "", wsibEligible: e.wsibEligible !== false, jobberName: e.jobberName || "", ytdGrossOpening: e.ytdGrossOpening ?? "" }); setOpen(true); }
  function save() {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    const payload: any = {
      firstName: form.firstName.trim(), lastName: form.lastName.trim(), position: form.position || undefined,
      payType: form.payType, wsibEligible: !!form.wsibEligible, jobberName: form.jobberName || undefined,
      annualSalary: form.annualSalary !== "" ? Number(form.annualSalary) : undefined,
      hourlyRate: form.hourlyRate !== "" ? Number(form.hourlyRate) : undefined,
      ytdGrossOpening: form.ytdGrossOpening !== "" ? Number(form.ytdGrossOpening) : undefined,
    };
    if (editId) update.mutate({ id: editId, ...payload }); else create.mutate({ clientId, ...payload });
  }
  const money = (n: any) => n == null || n === "" ? "—" : `$${Number(n).toLocaleString()}`;
  const fullName = (e: any) => e.lastName ? `${e.lastName}, ${e.firstName}` : e.firstName;
  const count = emps?.length ?? 0;
  const sortedEmps = (emps ? [...emps] : []).sort((a: any, b: any) =>
    (a.lastName || a.firstName || "").localeCompare(b.lastName || b.firstName || "") ||
    (a.firstName || "").localeCompare(b.firstName || ""));
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 text-base font-semibold hover:text-lime-600 transition-colors">
          {count > 0 && (expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />)}
          <Briefcase className="h-5 w-5 text-lime-500" /> Employees
          {count > 0 && <span className="text-xs font-normal text-slate-400">({count})</span>}
        </button>
        <Button size="sm" variant="outline" onClick={startAdd}><Plus className="h-3.5 w-3.5 mr-1" /> Add employee</Button>
      </CardHeader>
      {expanded && (
      <CardContent>
        {(!emps || emps.length === 0) ? (
          <p className="text-sm text-slate-400 py-2">No employees yet — add the people on this client's payroll.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-500 border-b">
                <th className="text-left py-1.5 pr-2">Name</th><th className="text-left px-2">Position</th>
                <th className="text-right px-2">Pay</th><th className="text-right px-2">YTD gross</th>
                <th className="text-center px-2">WSIB</th><th className="text-left px-2">Jobber name</th><th></th>
              </tr></thead>
              <tbody>
                {sortedEmps.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 font-medium">{fullName(e)}</td>
                    <td className="px-2 text-slate-500">{e.position || "—"}</td>
                    <td className="px-2 text-right">{e.payType === "hourly" ? `${money(e.hourlyRate)}/hr` : money(e.annualSalary)}</td>
                    <td className="px-2 text-right">{money(e.ytdGrossOpening)}</td>
                    <td className="px-2 text-center">{e.wsibEligible !== false ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 text-slate-500">{e.jobberName || "—"}</td>
                    <td className="px-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEdit(e)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => { if (confirm(`Remove ${fullName(e)}?`)) del.mutate({ id: e.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">YTD gross will pull from QuickBooks Payroll once connected (also feeds the Originality CRA-comparison check).</p>
      </CardContent>
      )}
      <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Edit employee" : "Add employee"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First name *</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
              <div><Label>Last name *</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
              <div><Label>Position</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
              <div><Label>Pay type</Label>
                <Select value={form.payType} onValueChange={(v) => setForm({ ...form, payType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="salary">Salary</SelectItem><SelectItem value="hourly">Hourly</SelectItem><SelectItem value="commission">Commission</SelectItem><SelectItem value="contract">Contract</SelectItem></SelectContent>
                </Select>
              </div>
              {form.payType === "hourly"
                ? <div><Label>Hourly rate</Label><Input type="number" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} /></div>
                : <div><Label>Annual salary</Label><Input type="number" value={form.annualSalary} onChange={(e) => setForm({ ...form, annualSalary: e.target.value })} /></div>}
              <div><Label>YTD gross (opening)</Label><Input type="number" value={form.ytdGrossOpening} onChange={(e) => setForm({ ...form, ytdGrossOpening: e.target.value })} /></div>
              <div><Label>Jobber name</Label><Input value={form.jobberName} onChange={(e) => setForm({ ...form, jobberName: e.target.value })} placeholder="if Jobber shows a different name" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.wsibEligible} onChange={(e) => setForm({ ...form, wsibEligible: e.target.checked })} className="w-4 h-4 accent-lime-500" /> WSIB eligible (uncheck for management/exec)</label>
            <div className="flex gap-2 pt-1">
              <Button className="bg-lime-500 flex-1" disabled={!form.firstName.trim() || !form.lastName.trim() || create.isPending || update.isPending} onClick={save}>{create.isPending || update.isPending ? "Saving…" : "Save"}</Button>
              <Button variant="outline" onClick={close}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function QuickLinksCard({ client, onboarding, variant = "card" }: { client: any; onboarding: any; variant?: "card" | "header" }) {
  const [editOpen, setEditOpen] = useState(false);
  const [driveUrl, setDriveUrl] = useState(client.driveFolderUrl || "");
  const [linksJson, setLinksJson] = useState(() => {
    try { return JSON.parse(client.quickLinks || "[]"); } catch { return []; }
  });
  const utils = trpc.useUtils();
  const updateLinks = trpc.crmClient.updateLinks.useMutation({
    onSuccess: () => {
      utils.crmClient.get.invalidate();
      setEditOpen(false);
    },
  });
  const createDrive = trpc.crmClient.createDriveFolder.useMutation({
    onSuccess: (r: any) => {
      if (r?.ok) { utils.crmClient.get.invalidate(); }
      else if (r?.skipped === "not_configured") alert("Drive auto-create isn't switched on yet — set FIGGY_MAKE_API_TOKEN on the server, then try again. (Or paste the folder URL via Edit.)");
      else if (r?.error) alert(`Couldn't create the Drive folder: ${r.error}`);
    },
    onError: (e) => alert(e.message),
  });

  const quickLinks: { label: string; url: string }[] = linksJson;

  const handleSave = () => {
    updateLinks.mutate({
      id: client.id,
      driveFolderUrl: driveUrl || undefined,
      quickLinks: JSON.stringify(linksJson),
    });
  };

  const addLink = () => {
    setLinksJson([...linksJson, { label: "", url: "" }]);
  };

  const removeLink = (idx: number) => {
    setLinksJson(linksJson.filter((_: any, i: number) => i !== idx));
  };

  const updateLink = (idx: number, field: string, value: string) => {
    const updated = [...linksJson];
    updated[idx] = { ...updated[idx], [field]: value };
    setLinksJson(updated);
  };

  // Default useful links if none set
  // Default links are CONDITIONAL on the client's features — no WSIB link if they
  // don't have WSIB, no HST link if no HST. (Payroll calculator removed per Markie.)
  const defaultLinks = [
    { label: "CRA My Business", url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/business-account.html" },
    ...(client.hasHST ? [{ label: "HST Netfile", url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/gst-hst-netfile.html" }] : []),
    ...(client.hasWSIB ? [{ label: "WSIB Online", url: "https://www.wsib.ca/en/online-services" }] : []),
  ];

  const displayLinks = quickLinks.length > 0 ? quickLinks : defaultLinks;

  const chips = (
    <>
      {/* Google Drive */}
      {client.driveFolderUrl ? (
        <a href={client.driveFolderUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition-colors">
          <FolderOpen className="h-3.5 w-3.5" /> Google Drive <ExternalLink className="h-3 w-3 opacity-50" />
        </a>
      ) : (
        <button onClick={() => createDrive.mutate({ clientId: client.id })} disabled={createDrive.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-sm hover:bg-amber-100 transition-colors disabled:opacity-60"
          title="Create the standard folder tree under GFB Clients">
          <FolderOpen className="h-3.5 w-3.5" /> {createDrive.isPending ? "Creating…" : "Create Drive folder"}
        </button>
      )}
      {displayLinks.map((link: any, idx: number) => {
        const internal = link.url?.startsWith("/");
        const cls = "inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-sm hover:bg-lime-50 hover:text-lime-700 transition-colors";
        return internal ? (
          <Link key={idx} to={link.url} className={cls}>{link.label}</Link>
        ) : (
          <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className={cls}>
            {link.label} <ExternalLink className="h-3 w-3 opacity-50" />
          </a>
        );
      })}
      {onboarding?.craBusinessNumber && (
        <a href="https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/business-account.html" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-sm hover:bg-lime-50 hover:text-lime-700 transition-colors">
          <Receipt className="h-3.5 w-3.5" /> CRA Portal <ExternalLink className="h-3 w-3 opacity-50" />
        </a>
      )}
      {onboarding?.wsibAccountNumber && (
        <a href="https://www.wsib.ca/en/online-services" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-sm hover:bg-lime-50 hover:text-lime-700 transition-colors">
          <Shield className="h-3.5 w-3.5" /> WSIB Portal <ExternalLink className="h-3 w-3 opacity-50" />
        </a>
      )}
      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-slate-500" onClick={() => setEditOpen(true)}>
        <Edit className="h-3.5 w-3.5 mr-1" /> Edit links
      </Button>
    </>
  );

  return (
    <>
      {variant === "header" ? (
        <div className="flex flex-wrap items-center gap-2">{chips}</div>
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2 items-center">{chips}</div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-lime-500" />
              Edit Quick Links
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Google Drive Folder URL</Label>
              <Input
                placeholder="https://drive.google.com/drive/folders/..."
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Quick Links</Label>
                <Button variant="ghost" size="sm" onClick={addLink}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Link
                </Button>
              </div>
              {linksJson.map((link: any, idx: number) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input
                    placeholder="Label"
                    value={link.label}
                    onChange={(e) => updateLink(idx, "label", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="https://..."
                    value={link.url}
                    onChange={(e) => updateLink(idx, "url", e.target.value)}
                    className="flex-[2]"
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeLink(idx)}>
                    <X className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
              {linksJson.length === 0 && (
                <p className="text-sm text-slate-400">No custom links. Add some or the default links will show.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button className="bg-lime-500" onClick={handleSave} disabled={updateLinks.isPending}>
                {updateLinks.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Karbon-style document/info request checklists for a client (magic-link). */
export function ClientRequestsCard({ clientId, clientName }: { clientId: number; clientName: string }) {
  const utils = trpc.useUtils();
  const { data: requests } = trpc.clientRequest.listForClient.useQuery({ clientId });
  const refresh = () => utils.clientRequest.listForClient.invalidate({ clientId });
  const createReq = trpc.clientRequest.create.useMutation({ onSuccess: () => { refresh(); setCreating(false); setTitle(""); setItemsText(""); } });
  const cancelReq = trpc.clientRequest.cancel.useMutation({ onSuccess: refresh });
  const markReminded = trpc.clientRequest.markReminded.useMutation({ onSuccess: refresh });
  const setItem = trpc.clientRequest.setItemStatus.useMutation({ onSuccess: refresh });
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  const open = (requests || []).filter((r: any) => r.status !== "cancelled");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5 text-lime-500" /> Document requests</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setCreating((v) => !v)}><Plus className="h-4 w-4 mr-1" /> New request</Button>
        </div>
        <CardDescription>Send {clientName} a magic-link checklist of documents/info you need; track what's outstanding.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {creating && (
          <div className="rounded-lg border p-3 space-y-2 bg-slate-50">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Request title (e.g. May month-end documents)" />
            <Textarea value={itemsText} onChange={(e) => setItemsText(e.target.value)} rows={4} placeholder={"One item per line, e.g.\nBank statement — May\nCredit card statement — May\nReceipts for cash expenses"} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              <Button size="sm" disabled={!title.trim() || !itemsText.trim() || createReq.isPending}
                onClick={() => createReq.mutate({ clientId, title: title.trim(), items: itemsText.split("\n").map((s) => s.trim()).filter(Boolean) })}>
                Create & get link
              </Button>
            </div>
          </div>
        )}

        {open.length === 0 && !creating ? (
          <p className="text-sm text-slate-400 py-3 text-center">No requests yet. Click <b>New request</b> to send a document checklist.</p>
        ) : open.map((r: any) => {
          const url = `${window.location.origin}/request/${r.token}`;
          return (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-slate-500">
                    {r.provided}/{r.total} provided
                    {r.status === "completed" ? " · ✓ complete" : ""}
                    {r.reminderCount ? ` · ${r.reminderCount} reminder${r.reminderCount > 1 ? "s" : ""} sent` : ""}
                  </p>
                </div>
                <Badge variant="outline" className={`text-xs ${r.status === "completed" ? "bg-lime-100 text-lime-700" : "bg-amber-100 text-amber-700"}`}>{r.status}</Badge>
              </div>
              <div className="mt-2 space-y-1">
                {r.items.map((it: any) => (
                  <div key={it.id} className="flex items-center gap-2 text-xs">
                    <button onClick={() => setItem.mutate({ itemId: it.id, status: it.status === "provided" ? "pending" : "provided" })} title="Toggle">
                      {it.status === "provided" ? <CheckCircle className="h-4 w-4 text-lime-500" /> : <Clock className="h-4 w-4 text-slate-300" />}
                    </button>
                    <span className={it.status === "provided" ? "line-through text-slate-400" : ""}>{it.label}</span>
                    {it.response && <span className="text-slate-400">— {it.response}</span>}
                  </div>
                ))}
              </div>
              {r.status !== "completed" && (
                <div className="flex items-center gap-2 mt-2">
                  <Input readOnly value={url} className="h-7 text-xs" onFocus={(e) => e.target.select()} />
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { navigator.clipboard?.writeText(url); setCopied(r.id); setTimeout(() => setCopied(null), 1500); }}>{copied === r.id ? "Copied!" : "Copy"}</Button>
                  <a href={`mailto:?subject=${encodeURIComponent(r.title)}&body=${encodeURIComponent(`Hi — please provide the following when you get a chance: ${url}`)}`}
                    onClick={() => markReminded.mutate({ id: r.id })} className="text-xs text-lime-700 hover:underline whitespace-nowrap">email / remind</a>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => { if (confirm("Cancel this request?")) cancelReq.mutate({ id: r.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
