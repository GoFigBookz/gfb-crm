import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { ArrowLeft, Building2, Receipt, CreditCard, Users, Briefcase, AlertCircle, CheckCircle, Clock, DollarSign, TrendingUp, TrendingDown, Shield, FileText, Calendar, Package, ChevronDown, ChevronUp, ExternalLink, FolderOpen, Link2, Edit, Plus, X, Timer, BarChart3, Trash2 } from "lucide-react";
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
import { format, isPast, isToday } from "date-fns";

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
  const activateClient = trpc.quote.activateClient.useMutation({
    onSuccess: () => { invalidateDocs(); utils.clientDashboard.getByClient.invalidate({ clientId: id }); },
  });
  const invalidateTasks = () => utils.clientDashboard.getByClient.invalidate({ clientId: id });
  const completeTask = trpc.task.complete.useMutation({ onSuccess: invalidateTasks });
  const updateTask = trpc.task.update.useMutation({ onSuccess: invalidateTasks });
  const deleteTask = trpc.task.delete.useMutation({ onSuccess: invalidateTasks });
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [editingQuote, setEditingQuote] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/clients" className="text-sm text-slate-500 hover:text-lime-600 flex items-center gap-1 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to Clients
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
            <Badge variant={client.status === "active" ? "default" : "secondary"} className={client.status === "active" ? "bg-lime-500" : ""}>
              {client.status}
            </Badge>
          </div>
          <p className="text-slate-500 mt-1">{client.company || client.email}</p>
        </div>
        <div className="flex gap-2">
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
          <Button size="sm" variant="outline" className="border-lime-300 text-lime-700" onClick={() => setShowLogTime(true)}>
            <Timer className="h-3.5 w-3.5 mr-1" /> Log Time
          </Button>
          <Button size="sm" variant="outline" className="border-slate-300 text-slate-600"
            onClick={() => { if (confirm(`Archive ${client.name}? It will be hidden from the active client list (not deleted).`)) archiveClient.mutate({ id }); }}>
            Archive
          </Button>
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

      {/* Month-End Close cockpit — where this client stands right now */}
      {closeStatus && (
        <Card className={cn(
          "border-l-4",
          closeStatus.status === "red" ? "border-l-red-500" :
          closeStatus.status === "yellow" ? "border-l-amber-400" : "border-l-emerald-500"
        )}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className={cn("inline-block w-2.5 h-2.5 rounded-full",
                  closeStatus.status === "red" ? "bg-red-500" :
                  closeStatus.status === "yellow" ? "bg-amber-400" : "bg-emerald-500"
                )} />
                Month-End Close
              </CardTitle>
              <span className="text-xs text-slate-500">
                {closeStatus.status === "green" ? "On track" : closeStatus.status === "yellow" ? "Needs attention" : "Behind"}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Transactions to review */}
              <div>
                <p className="text-xs uppercase font-semibold text-slate-500">To review</p>
                <p className={cn("text-2xl font-bold", closeStatus.toReview > 0 ? "text-amber-600" : "text-emerald-600")}>
                  {closeStatus.toReview}
                </p>
                <p className="text-xs text-slate-400">transactions</p>
              </div>
              {/* HST */}
              <div>
                <p className="text-xs uppercase font-semibold text-slate-500">HST</p>
                {closeStatus.hst.applicable ? (
                  <>
                    <p className={cn("text-sm font-semibold",
                      closeStatus.hst.status === "red" ? "text-red-600" :
                      closeStatus.hst.status === "yellow" ? "text-amber-600" : "text-emerald-600"
                    )}>
                      {closeStatus.hst.filed ? "Filed" : closeStatus.hst.overdue ? "Overdue" : "Due"}
                    </p>
                    <p className="text-xs text-slate-400">{closeStatus.hst.periodLabel}{closeStatus.hst.dueDate ? ` · due ${closeStatus.hst.dueDate}` : ""}</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">n/a</p>
                )}
              </div>
              {/* Year-end */}
              <div>
                <p className="text-xs uppercase font-semibold text-slate-500">Year-end</p>
                {closeStatus.yearEnd.applicable ? (
                  <>
                    <p className={cn("text-sm font-semibold",
                      closeStatus.yearEnd.status === "red" ? "text-red-600" :
                      closeStatus.yearEnd.status === "yellow" ? "text-amber-600" : "text-emerald-600"
                    )}>
                      {closeStatus.yearEnd.lastFyeDate}
                    </p>
                    <p className="text-xs text-slate-400">{closeStatus.yearEnd.daysSinceFye}d ago</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">n/a</p>
                )}
              </div>
              {/* Checklist / reconciled */}
              <div>
                <p className="text-xs uppercase font-semibold text-slate-500">Close checklist</p>
                <p className="text-2xl font-bold text-slate-700">
                  {closeStatus.checklistPercent == null ? "—" : `${closeStatus.checklistPercent}%`}
                </p>
                <p className="text-xs text-slate-400">{closeStatus.lastReconciled ? `rec'd ${closeStatus.lastReconciled}` : "not reconciled"}</p>
              </div>
            </div>
            {closeStatus.reasons.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {closeStatus.reasons.map((r, i) => (
                  <Badge key={i} variant="outline" className="text-xs font-normal text-slate-600">{r}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scope-based quote vs flat fee — am I undercharging? */}
      {quote && (
        <Card className={cn(
          "border-l-4",
          quote.comparison.verdict === "undercharging" ? "border-l-red-500" :
          quote.comparison.verdict === "above_market" ? "border-l-blue-400" :
          quote.comparison.verdict === "aligned" ? "border-l-emerald-500" : "border-l-slate-300"
        )}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Scope-based quote vs flat fee</CardTitle>
              <span className="text-xs text-slate-500">{quote.hasOnboarding ? "from intake scope" : "from client record (no intake yet)"}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs uppercase font-semibold text-slate-500">Flat fee</p>
                <p className="text-2xl font-bold text-slate-700">{quote.flatFee ? `$${quote.flatFee}` : "—"}</p>
                <p className="text-xs text-slate-400">/mo current</p>
              </div>
              <div>
                <p className="text-xs uppercase font-semibold text-slate-500">Scope quote</p>
                <p className="text-2xl font-bold text-slate-900">${quote.quote.recurringMonthly}</p>
                <p className="text-xs text-slate-400">${quote.quote.recurringRange.low}–${quote.quote.recurringRange.high}/mo</p>
              </div>
              <div>
                <p className="text-xs uppercase font-semibold text-slate-500">Closest package</p>
                <p className="text-2xl font-bold text-slate-900">${quote.quote.nearestPackage.price}</p>
                <p className="text-xs text-slate-400">{quote.quote.nearestPackage.name} package</p>
              </div>
              <div>
                <p className="text-xs uppercase font-semibold text-slate-500">Gap</p>
                <p className={cn("text-2xl font-bold",
                  quote.comparison.verdict === "undercharging" ? "text-red-600" :
                  quote.comparison.verdict === "above_market" ? "text-blue-600" : "text-emerald-600"
                )}>
                  {quote.comparison.deltaMonthly > 0 ? "+" : ""}{quote.comparison.flatFee != null ? `$${quote.comparison.deltaMonthly}` : "—"}
                </p>
                <p className="text-xs text-slate-400">{quote.comparison.verdict.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-xs uppercase font-semibold text-slate-500">One-time</p>
                <p className="text-2xl font-bold text-slate-700">${quote.quote.oneTimeTotal}</p>
                <p className="text-xs text-slate-400">setup{quote.scope.monthsBehind > 0 ? " + catch-up" : ""}</p>
              </div>
            </div>
            {quote.quote.transactions === 0 && (
              <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ Transaction volume not set — this is only a floor estimate. Enter the monthly transaction count in "Edit &amp; send quote" (or pull it from QBO once connected) for an accurate quote.
              </p>
            )}
            <p className="mt-3 text-sm text-slate-600">{quote.comparison.message}</p>
            <details className="mt-3">
              <summary className="text-xs font-semibold text-slate-500 cursor-pointer">Scope breakdown ({quote.quote.monthlyLineItems.length} items · {quote.quote.tier})</summary>
              <div className="mt-2 space-y-1">
                {quote.quote.monthlyLineItems.map((li, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <span className="text-slate-700">{li.label}</span>
                      <span className="block text-xs text-slate-400">{li.rationale}</span>
                    </div>
                    <span className="font-medium text-slate-700 whitespace-nowrap">${li.amount.toFixed(2)}/mo</span>
                  </div>
                ))}
                {quote.quote.oneTimeLineItems.map((li, i) => (
                  <div key={`ot-${i}`} className="flex items-start justify-between gap-3 text-sm border-t pt-1 mt-1">
                    <div>
                      <span className="text-slate-700">{li.label}</span>
                      <span className="block text-xs text-slate-400">{li.rationale}</span>
                    </div>
                    <span className="font-medium text-slate-700 whitespace-nowrap">${li.amount} one-time</span>
                  </div>
                ))}
              </div>
            </details>

            {/* Document lifecycle: quote → engagement → active */}
            <div className="mt-4 pt-3 border-t flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setEditingQuote(true)} disabled={genQuote.isPending}>
                <FileText className="h-3.5 w-3.5 mr-1" />{genQuote.isPending ? "Generating…" : "Edit & send quote"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => genEngagement.mutate({ clientId: id })} disabled={genEngagement.isPending}>
                <FileText className="h-3.5 w-3.5 mr-1" />{genEngagement.isPending ? "Generating…" : "Generate engagement letter"}
              </Button>
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
                    {d.portalUrl && (
                      <a href={d.portalUrl} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 text-xs text-lime-700 hover:underline">
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Key Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CRA Number */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Receipt className="h-4 w-4" />
              <span className="text-xs uppercase font-semibold">CRA BN</span>
            </div>
            <p className="font-medium">{onboarding?.craBusinessNumber || client.taxId || "—"}</p>
          </CardContent>
        </Card>

        {/* HST Number */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <CreditCard className="h-4 w-4" />
              <span className="text-xs uppercase font-semibold">HST/GST #</span>
            </div>
            <p className="font-medium">{onboarding?.hstGstNumber || "—"}</p>
          </CardContent>
        </Card>

        {/* WSIB */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Shield className="h-4 w-4" />
              <span className="text-xs uppercase font-semibold">WSIB #</span>
            </div>
            <p className="font-medium">{onboarding?.wsibAccountNumber || "—"}</p>
          </CardContent>
        </Card>

        {/* Fiscal Year End */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-xs uppercase font-semibold">Fiscal Year End</span>
            </div>
            <p className="font-medium">{onboarding?.fiscalYearEnd || "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links Card */}
      <QuickLinksCard
        client={client}
        onboarding={onboarding}
      />

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({openTasks.length})</TabsTrigger>
          <TabsTrigger value="financials">P&L / Balance</TabsTrigger>
          <TabsTrigger value="billing">QBO Billing</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="time">Time & Hours</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Task Progress */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-lime-500" />
                  Task Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>{completedTasks.length} of {dashboardData?.tasks?.length || 0} completed</span>
                    <span className="font-medium">{taskProgress}%</span>
                  </div>
                  <Progress value={taskProgress} className="h-2" />
                </div>
                {openTasks.length > 0 ? (
                  <div className="space-y-2">
                    {openTasks.slice(0, 5).map(task => (
                      <div key={task.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{task.title}</p>
                          <p className="text-xs text-slate-500">{task.category} • {task.dueDate ? format(new Date(task.dueDate), "MMM d") : "No due date"}</p>
                        </div>
                        <Badge variant={task.priority === "high" ? "destructive" : "outline"} className="text-xs">{task.priority}</Badge>
                      </div>
                    ))}
                    {openTasks.length > 5 && (
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => setActiveTab("tasks")}>
                        View all {openTasks.length} tasks
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-lime-500" />
                    <p>All tasks completed!</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-600">Employees</span>
                  <span className="font-medium">{employees?.length || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-600">Open Tasks</span>
                  <span className="font-medium">{openTasks.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-600">HST Frequency</span>
                  <span className="font-medium capitalize">{onboarding?.hstGstFrequency || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-600">Payroll</span>
                  <span className="font-medium capitalize">{onboarding?.payrollFrequency || "N/A"}</span>
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
              <CardTitle>Open Tasks ({openTasks.length})</CardTitle>
              <CardDescription>Click the circle to mark done. Recurring tasks auto-create the next one.</CardDescription>
            </CardHeader>
            <CardContent>
              {openTasks.length > 0 ? (
                <div className="space-y-2">
                  {openTasks.map(task => {
                    const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate));
                    return (
                      <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg ${isOverdue ? "bg-red-50" : "bg-white border"}`}>
                        <button
                          title="Mark done"
                          onClick={() => completeTask.mutate({ id: task.id })}
                          className="w-6 h-6 shrink-0 rounded-full border-2 border-slate-300 hover:border-lime-500 hover:bg-lime-50 transition-colors"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{task.title}</p>
                          <p className="text-xs text-slate-500">
                            {task.category} {task.dueDate ? `• Due ${format(new Date(task.dueDate), "MMM d, yyyy")}` : ""}
                            {isOverdue ? " • Overdue" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={`text-xs ${task.isRecurring ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-500"}`}>
                            {task.isRecurring ? "Recurring" : "One-off"}
                          </Badge>
                          <Badge variant={task.priority === "high" ? "destructive" : task.priority === "medium" ? "default" : "outline"} className="text-xs">{task.priority}</Badge>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingTask(task)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-600" onClick={() => { if (confirm(`Delete task "${task.title}"?`)) deleteTask.mutate({ id: task.id }); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
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
                    <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50">
                      <CheckCircle className="h-5 w-5 text-lime-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-through text-slate-500">{task.title}</p>
                        <p className="text-xs text-slate-400">
                          {task.category}
                          {(task as any).completedAt ? ` • Done ${format(new Date((task as any).completedAt), "MMM d, yyyy")}` : ""}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs shrink-0" onClick={() => updateTask.mutate({ id: task.id, completed: false, status: "pending" })}>
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

          {editingTask && (
            <EditTaskDialog
              task={editingTask}
              onClose={() => setEditingTask(null)}
              onSave={(data: any) => { updateTask.mutate({ id: editingTask.id, ...data }); setEditingTask(null); }}
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

      <TimeLogDialog open={showLogTime} onClose={() => setShowLogTime(false)} clientId={id}
        tasks={dashboardData?.tasks || []} onSubmit={(data: any) => createTime.mutate(data)} isPending={createTime.isPending} />

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
  const utils = trpc.useUtils();
  const [recalcing, setRecalcing] = useState(false);
  const recalc = async () => {
    setRecalcing(true);
    try {
      const res = await utils.quote.preview.fetch({ clientId, avgMonthlyTransactions: Number(txns) || 0 });
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

  const Row = ({ li, i, set }: { li: any; i: number; set: (i: number, p: any) => void }) => (
    <div className={cn("flex items-center gap-2 py-1.5", !li.include && "opacity-40")}>
      <input type="checkbox" checked={li.include} onChange={(e) => set(i, { include: e.target.checked })} className="w-4 h-4 accent-lime-500 shrink-0" />
      <Input value={li.label} onChange={(e) => set(i, { label: e.target.value })} className="h-8 text-sm flex-1" />
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-slate-400 text-sm">$</span>
        <Input type="number" value={li.amount} onChange={(e) => set(i, { amount: Number(e.target.value) })} className="h-8 text-sm w-24 text-right" />
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

        <div className="flex items-end gap-2 mt-3 p-3 bg-slate-50 rounded-lg">
          <div className="flex-1">
            <Label className="text-xs">Avg monthly transactions</Label>
            <Input type="number" placeholder="e.g. 120" value={txns} onChange={(e) => setTxns(e.target.value)} className="h-8" />
          </div>
          <Button size="sm" variant="outline" onClick={recalc} disabled={recalcing}>
            {recalcing ? "Recalculating…" : "Recalculate base"}
          </Button>
        </div>
        {(!txns || Number(txns) === 0) && (
          <p className="text-xs text-amber-700">Set the transaction volume so the base tier is real — otherwise it's just the floor price.</p>
        )}

        <div className="mt-2">
          <p className="text-xs uppercase font-semibold text-slate-500 mb-1">Monthly services</p>
          {lines.map((li, i) => <Row key={i} li={li} i={i} set={setLine} />)}
        </div>
        <div className="flex justify-between font-semibold text-sm border-t pt-2 mt-1">
          <span>Recurring monthly total</span><span className="text-lime-700">${monthlyTotal}/mo</span>
        </div>

        {oneTime.length > 0 && (
          <div className="mt-3">
            <p className="text-xs uppercase font-semibold text-slate-500 mb-1">One-time</p>
            {oneTime.map((li, i) => <Row key={i} li={li} i={i} set={setOne} />)}
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
function EditTaskDialog({ task, onClose, onSave }: {
  task: any; onClose: () => void; onSave: (data: any) => void;
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
          <DialogTitle className="flex items-center gap-2"><Edit className="h-4 w-4" /> Edit Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
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
            })}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Time Log Dialog Component
function TimeLogDialog({ open, onClose, clientId, tasks, onSubmit, isPending }: {
  open: boolean; onClose: () => void; clientId: number; tasks: any[];
  onSubmit: (data: any) => void; isPending: boolean;
}) {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [category, setCategory] = useState("bookkeeping");
  const [taskId, setTaskId] = useState<string>("");
  const [isBillable, setIsBillable] = useState(true);

  const handleSubmit = () => {
    if (!description || !hours || parseFloat(hours) <= 0) return;
    onSubmit({
      clientId,
      date,
      description,
      hours: parseFloat(hours),
      category,
      taskId: taskId ? parseInt(taskId) : undefined,
      isBillable,
    });
    setDescription(""); setHours(""); setTaskId(""); setCategory("bookkeeping"); setIsBillable(true);
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
                  <SelectItem value="">None</SelectItem>
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

// Quick Links Card Component
function QuickLinksCard({ client, onboarding }: { client: any; onboarding: any }) {
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
  const defaultLinks = [
    { label: "CRA My Business", url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/business-account.html" },
    { label: "WSIB Online", url: "https://www.wsib.ca/en/online-services" },
    { label: "HST Netfile", url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/gst-hst-netfile.html" },
    { label: "Payroll Calculator", url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/payroll-deductions-online-calculator.html" },
  ];

  const displayLinks = quickLinks.length > 0 ? quickLinks : defaultLinks;

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-lime-500" />
              Quick Links
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Google Drive */}
            {client.driveFolderUrl ? (
              <a
                href={client.driveFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition-colors"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Google Drive
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ) : (
              <Badge variant="outline" className="text-slate-400 bg-slate-50">
                <FolderOpen className="h-3.5 w-3.5 mr-1" />
                No Drive folder set
              </Badge>
            )}

            {/* Quick Links */}
            {displayLinks.map((link: any, idx: number) => (
              <a
                key={idx}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-sm hover:bg-lime-50 hover:text-lime-700 transition-colors"
              >
                {link.label}
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ))}

            {/* Portal links from onboarding */}
            {onboarding?.craBusinessNumber && (
              <a
                href="https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/business-account.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-sm hover:bg-lime-50 hover:text-lime-700 transition-colors"
              >
                <Receipt className="h-3.5 w-3.5" />
                CRA Portal
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            )}
            {onboarding?.wsibAccountNumber && (
              <a
                href="https://www.wsib.ca/en/online-services"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-sm hover:bg-lime-50 hover:text-lime-700 transition-colors"
              >
                <Shield className="h-3.5 w-3.5" />
                WSIB Portal
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            )}
          </div>
        </CardContent>
      </Card>

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
