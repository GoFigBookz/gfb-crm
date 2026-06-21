import { useState, useEffect, useRef } from "react";
import { computeT5Boxes } from "../../api/dividend-core";
import { useParams, Link, useNavigate } from "react-router";
import { ArrowLeft, Building2, Receipt, CreditCard, Users, Briefcase, AlertCircle, CheckCircle, Clock, DollarSign, TrendingUp, TrendingDown, Shield, FileText, Calendar, Package, ChevronDown, ChevronUp, ChevronRight, ExternalLink, FolderOpen, Link2, Edit, Plus, X, Timer, BarChart3, Trash2, Wallet } from "lucide-react";
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
  const deleteClient = trpc.crmClient.delete.useMutation({
    onSuccess: () => { utils.crmClient.list.invalidate(); navigate("/clients"); },
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
        <div className="flex gap-2">
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
          ) : qboConn?.connection && qboConn.connection.isActive && !qboConn.connection.reconnectReason ? (
            <Badge variant="outline" className="flex items-center gap-1 border-emerald-300 text-emerald-700">
              <CheckCircle className="h-3 w-3" /> QuickBooks{qboConn.connection.transport === "make_bridge" ? " (bridge)" : ""}
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
              <p className="text-sm text-red-600">{missing.join(" · ")} — add via the client's record so filings and Figgy coding work.</p>
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

      {/* Header extras — firm CRA RepID (same for every client) + quick links,
          out of the card body and sitting right under the header actions. */}
      <div className="flex flex-wrap items-center gap-2 -mt-1">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm">
          CRA RepID:&nbsp;<span className="font-semibold text-slate-800">{client.craRepId || "YY7F3GN"}</span>
        </span>
        <QuickLinksCard client={client} onboarding={onboarding} variant="header" />
      </div>

      {/* CLIENT DETAILS — real client data, dense, on top. */}
      {(() => {
        const c: any = client;
        const o: any = onboarding || {};
        const dash = (v: any) => (v === null || v === undefined || v === "" ? "—" : v);
        const hstFreq = c.hasHST ? (c.hstPeriod ? String(c.hstPeriod) : "registered") : "Not registered";
        // Only show fields that apply to THIS client (no "No payroll" clutter).
        const items: Array<[string, any]> = [
          ["CRA BN", dash(o.craBusinessNumber || c.taxId)],
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

      {/* TASKS — progress + overdue + open, one combined card near the top. */}
      {(() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const byDue = (a: any, b: any) => (+new Date(a.dueDate || "2999-01-01")) - (+new Date(b.dueDate || "2999-01-01"));
        const overdue = openTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < today).sort(byDue);
        const upcoming = openTasks.filter((t: any) => !(t.dueDate && new Date(t.dueDate) < today)).sort(byDue);
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
                  {ordered.length > 8 && <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => setActiveTab("tasks")}>View all {openTasks.length} tasks</Button>}
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

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={cn("grid w-full", client.hasPayroll ? "grid-cols-7" : "grid-cols-6")}>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({openTasks.length})</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          {client.hasPayroll && <TabsTrigger value="payroll">Payroll</TabsTrigger>}
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="time">Time</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-4">
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-lime-500" />
                Payroll Timesheets
              </CardTitle>
              <CardDescription>Hours by pay period</CardDescription>
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
                                <span>{emp ? `${emp.firstName} ${emp.lastName}` : `Emp #${entry.employeeId}`}</span>
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
        </TabsContent>

        {/* COMPLIANCE TAB */}
        <TabsContent value="compliance" className="space-y-4 mt-4">
          <ComplianceTab clientId={id} client={client} closeStatus={closeStatus} tasks={dashboardData?.tasks || []} onOpenTask={setEditingTask} />
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
function ComplianceTab({ clientId, client, closeStatus, tasks, onOpenTask }: {
  clientId: number; client: any; closeStatus: any; tasks: any[]; onOpenTask?: (t: any) => void;
}) {
  const utils = trpc.useUtils();
  const dividendsOn = !!client.payrollDividends;
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

      {/* Compliance numbers */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Registration numbers</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[["CRA BN", client.taxId], ["HST #", client.hstNumber], ["Payroll RP #", (client as any).payrollRpNumber], ["WSIB #", client.wsibAccountNumber]].map(([k, v]) => (
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

      {/* T4A / T5018 slips — manual log */}
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
    hasHST: !!client.hasHST, hstPeriod: client.hstPeriod || "quarterly",
    hasWSIB: !!client.hasWSIB, hasPayroll: !!client.hasPayroll,
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
    usesStripe: !!o.usesStripe, usesSquare: !!o.usesSquare, usesJobber: !!o.usesJobber, usesTouchBistro: !!o.usesTouchBistro, usesPayPal: !!o.usesPayPal,
    qboSoftwareTier: o.qboSoftwareTier || "none", qboSoftwareWholesale: !!o.qboSoftwareWholesale, qboPayrollWholesale: !!o.qboPayrollWholesale,
    servicesNeeded: o.servicesNeeded || "", painPoints: o.painPoints || "", expectations: o.expectations || "",
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const truthy = (v: any) => v === true || v === "true";
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
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit className="h-4 w-4" /> Edit intake — {client.name}</DialogTitle></DialogHeader>

        <p className="text-xs uppercase font-semibold text-slate-500">Contact</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {field("name", "Client name")}{field("company", "Company")}{field("contactName", "Contact name")}
          {field("email", "Email")}{field("phone", "Phone")}{field("website", "Website (for logo)")}
          {field("address", "Address")}
        </div>

        <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Service type</p>
        <div className="grid grid-cols-2 gap-2">
          {sel("clientType", "Client type", [["monthly","Monthly bookkeeping"],["quarterly","Quarterly"],["annual","Annual / year-end only"],["payroll","Payroll"],["wholesale","Wholesale (flow-through — QBO resale only)"]])}
        </div>
        {f.clientType === "wholesale" && (
          <p className="text-xs text-slate-500 -mt-1">Flow-through client: no month-end close, no quote, and no recurring compliance tasks. Switching to wholesale pauses any existing tasks.</p>
        )}

        <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Compliance numbers</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {field("taxId", "CRA BN", "text", !f.taxId)}
          {field("hstNumber", "HST #", "text", truthy(f.hasHST) && !f.hstNumber)}
          {field("payrollRpNumber", "Payroll RP #", "text", truthy(f.hasPayroll) && !f.payrollRpNumber)}
          {field("wsibAccountNumber", "WSIB #", "text", !!f.hasWSIB && !f.wsibAccountNumber)}
          {field("companyKey", "Company Key (Service Canada)")}
          {field("craRepId", "CRA RepID")}
        </div>
        {check("craRacDone", "CRA Represent-a-Client (RAC) access is set up")}

        <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Government registry</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {field("industry", "Industry")}
          {field("registryNumber", "Registry #")}
          {field("incorporationDate", "Incorporation date")}
          {field("corpType", "Corp type")}
          {field("governmentStatus", "Govt status")}
        </div>
        {field("bio", "Bio / description")}

        <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Bookkeeping scope</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {field("avgMonthlyTransactions", "Avg monthly txns", "number")}
          {sel("bookkeepingFrequency", "Bookkeeping", [["monthly","Monthly"],["quarterly","Quarterly"],["annual","Annual"],["none","None"]])}
          {field("bankAccountCount", "# Bank accts", "number")}{field("creditCardCount", "# Credit cards", "number")}
          {sel("hasHST", "Charges HST?", [["true","Yes"],["false","No"]])}
          {sel("hstPeriod", "HST filing", [["monthly","Monthly"],["quarterly","Quarterly"],["annual","Annual"]])}
          {sel("yearEndMonth", "Year-end", ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m=>[m,m] as [string,string]))}
          {field("monthsBehind", "Months behind", "number")}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4">
          {check("hasInvestments", "Investment income (T5)")}{check("paysDividends", "Pays dividends (T5)")}
          {check("hasSubcontractors", "Subcontractors (T5018)")}{check("usesHubdoc", "Uses Hubdoc")}
          {check("hasJobCosting", "Job costing")}{check("needsYearEnd", "We do year-end")}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {sel("invoicingResponsibility", "Invoicing (A/R)", [["none","N/A"],["we_invoice","We invoice"],["client_invoices","Client invoices"]])}
          {sel("billPayResponsibility", "Bill pay (A/P)", [["none","N/A"],["we_pay","We pay"],["client_pays","Client pays"]])}
        </div>

        <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Payroll</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {sel("hasPayroll", "Runs payroll?", [["true","Yes"],["false","No"]])}
          {field("employeeCount", "# Employees", "number")}
          {sel("payrollFrequency", "Pay frequency", [["weekly","Weekly"],["bi-weekly","Bi-weekly"],["semi-monthly","Semi-monthly"],["monthly","Monthly"],["self","Self"]])}
          {sel("payrollRemitterFreq", "CRA remitter", [["regular","Regular"],["quarterly","Quarterly"],["accelerated","Accelerated"]])}
        </div>
        <div className="flex flex-wrap gap-x-4">
          {check("hasWSIB", "Has WSIB")}{check("hasEHT", "Has EHT (ON)")}{check("hasEmployees", "Has employees")}
          {check("payrollExternal", "We don't run payroll (autopay / client self-manages)")}
        </div>

        <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Sales platforms</p>
        <div className="flex flex-wrap gap-x-4">
          {check("usesStripe", "Stripe")}{check("usesSquare", "Square")}{check("usesJobber", "Jobber")}{check("usesTouchBistro", "TouchBistro")}{check("usesPayPal", "PayPal")}
        </div>

        <p className="text-xs uppercase font-semibold text-slate-500 mt-2">QuickBooks (wholesale billing through us)</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {sel("qboSoftwareTier", "QBO software", [["none","None / N/A"],["easystart","EasyStart ($24)"],["essentials","Essentials ($54)"],["plus","Plus ($60)"]])}
        </div>
        <div className="flex flex-wrap gap-x-4">
          {check("qboSoftwareWholesale", "Bill QBO software through us (wholesale)")}
          {check("qboPayrollWholesale", "Bill QBO Payroll through us ($40 + $7/emp)")}
        </div>

        <p className="text-xs uppercase font-semibold text-slate-500 mt-2">Pricing & notes</p>
        <div className="grid grid-cols-2 gap-2">
          {field("monthlyFee", "Flat monthly fee ($)", "number")}
        </div>
        <div className="space-y-1"><Label className="text-xs">Services / notes</Label>
          <Textarea value={f.servicesNeeded} onChange={(e) => set("servicesNeeded", e.target.value)} rows={2} /></div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={isPending} onClick={() => onSave({
            ...f,
            hasHST: truthy(f.hasHST),
            hasWSIB: !!f.hasWSIB, hasPayroll: truthy(f.hasPayroll),
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
function QuickLinksCard({ client, onboarding, variant = "card" }: { client: any; onboarding: any; variant?: "card" | "header" }) {
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
        <Badge variant="outline" className="text-slate-400 bg-slate-50">
          <FolderOpen className="h-3.5 w-3.5 mr-1" /> No Drive folder set
        </Badge>
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
function ClientRequestsCard({ clientId, clientName }: { clientId: number; clientName: string }) {
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
