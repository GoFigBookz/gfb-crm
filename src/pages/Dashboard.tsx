import { useState } from "react";
import { useNavigate, Link } from "react-router";
import {
  Users,
  CheckSquare,
  AlertCircle,
  DollarSign,
  CalendarDays,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Clock,
  Target,
  Flame,
  Sun,
  Plus,
  Shield,
  AlertTriangle,
  XCircle,
  UserCheck,
  ChevronRight,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";

/* ─── Demo triage data (mirrors TriageDashboard) ─── */
interface TriageItem {
  id: number;
  clientName: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  suggestedAction: string;
}

const demoTriageItems: TriageItem[] = [
  {
    id: 1, clientName: "Acme Construction", severity: "critical",
    title: "$2,400 reconciliation difference",
    description: "Bank statement ending balance does not match QBO. 3 uncleared transactions.",
    suggestedAction: "Review uncleared items in QBO",
  },
  {
    id: 2, clientName: "Acme Construction", severity: "warning",
    title: "12 receipts missing for March",
    description: "Expense transactions total $3,450 with no attached receipts. GST ITCs may be lost.",
    suggestedAction: "Request receipts from client",
  },
  {
    id: 3, clientName: "Smith Plumbing", severity: "critical",
    title: "Q1 HST due in 3 days",
    description: "HST return for Jan-Mar period due April 30. Return not yet prepared.",
    suggestedAction: "Prepare and file immediately",
  },
  {
    id: 4, clientName: "TechStart Inc", severity: "warning",
    title: "Unusual payroll spike: +$8,500",
    description: "March payroll is 35% higher than average. Possible bonus or error.",
    suggestedAction: "Verify with client before remitting",
  },
  {
    id: 5, clientName: "Acme Construction", severity: "info",
    title: "Sales entry from Stripe: $12,400",
    description: "47 Stripe transactions matched to deposits. Ready for review.",
    suggestedAction: "Review and approve categorization",
  },
];

const severityConfig = {
  critical: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", badge: "destructive" as const },
  warning: { icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", badge: "default" as const },
  info: { icon: FileText, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", badge: "secondary" as const },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [openTask, setOpenTask] = useState<any | null>(null);

  const { data: clientStats } = trpc.crmClient.stats.useQuery();
  const { data: pipelineStats } = trpc.crmClient.pipelineStats.useQuery();
  const { data: upcomingTasks } = trpc.task.upcoming.useQuery({ days: 7 });
  const { data: overdueTasks } = trpc.task.overdue.useQuery();
  const { data: dashClients } = trpc.crmClient.list.useQuery();
  const dashUtils = trpc.useUtils();
  const completeUrgent = trpc.task.complete.useMutation({
    onSuccess: () => { dashUtils.task.overdue.invalidate(); dashUtils.task.upcoming.invalidate(); },
  });
  const clientNameFor = (cid: number | null | undefined) =>
    (dashClients || []).find((c: any) => c.id === cid)?.name ?? null;
  // Urgent queue: overdue first (oldest first), then next-7-day upcoming, grouped
  // by client so Markie sees who's behind at a glance.
  const urgentTasks = [
    ...((overdueTasks || []).map((t: any) => ({ ...t, _bucket: "overdue" as const }))),
    ...((upcomingTasks || []).map((t: any) => ({ ...t, _bucket: "upcoming" as const }))),
  ].sort((a, b) => {
    if (a._bucket !== b._bucket) return a._bucket === "overdue" ? -1 : 1;
    return new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime();
  });
  const urgentByClient = (() => {
    const m = new Map<string, { clientId: number | null; name: string; tasks: any[] }>();
    for (const t of urgentTasks) {
      const key = String(t.clientId ?? "none");
      if (!m.has(key)) m.set(key, { clientId: t.clientId ?? null, name: clientNameFor(t.clientId) || "Internal / no client", tasks: [] });
      m.get(key)!.tasks.push(t);
    }
    // groups with an overdue task float up; otherwise by earliest due date
    return [...m.values()].sort((a, b) => {
      const ao = a.tasks.some((t) => t._bucket === "overdue") ? 0 : 1;
      const bo = b.tasks.some((t) => t._bucket === "overdue") ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return new Date(a.tasks[0]?.dueDate || 0).getTime() - new Date(b.tasks[0]?.dueDate || 0).getTime();
    });
  })();
  const { data: invoiceStats } = trpc.invoice.stats.useQuery();
  const { data: expiringDocs } = trpc.expiration.getExpiringSoon.useQuery({ days: 30 });

  const { data: dailyBrief } = trpc.dailyBrief.get.useQuery();
  // Live triage findings (Figgy Jr / agents) — falls back to demo data when empty
  const { data: rawFindings } = trpc.agentWebhook.listFindings.useQuery({ status: "new" });
  const liveTriage: TriageItem[] = (rawFindings || []).map((f: any) => ({
    id: f.id,
    clientName: f.agentName || "Figgy Jr",
    severity: f.severity,
    title: f.title,
    description: f.description || "",
    suggestedAction: f.suggestedAction || "",
  }));
  const triageItems: TriageItem[] = liveTriage.length ? liveTriage : demoTriageItems;
  const utils = trpc.useUtils();
  const setPriorities = trpc.dailyBrief.setPriorities.useMutation({
    onSuccess: () => utils.dailyBrief.get.invalidate()
  });

  const statCards = [
    {
      title: "Total Clients",
      value: clientStats?.total ?? 0,
      subtitle: `${clientStats?.active ?? 0} active · ${clientStats?.total ? clientStats.total - (clientStats.active ?? 0) : 0} other`,
      icon: Users,
      trend: "up" as const,
      color: "bg-blue-500",
      onClick: () => navigate("/clients?status=all"),
    },
    {
      title: "Active Clients",
      value: clientStats?.active ?? 0,
      subtitle: "Currently active",
      icon: Users,
      trend: "up" as const,
      color: "bg-lime-600",
      onClick: () => navigate("/clients?status=active"),
    },
    {
      title: "Pipeline Value",
      value: `$${(pipelineStats?.totalPipelineValue ?? 0).toLocaleString()}`,
      subtitle: `${pipelineStats?.totalLeads ?? 0} leads · ${pipelineStats?.engagementsSent ?? 0} waiting`,
      icon: Target,
      trend: "up" as const,
      color: "bg-violet-500",
      onClick: () => navigate("/clients?status=lead"),
    },
    {
      title: "Pending Tasks",
      value: upcomingTasks?.length ?? 0,
      subtitle: `${overdueTasks?.length ?? 0} overdue`,
      icon: CheckSquare,
      trend: overdueTasks && overdueTasks.length > 0 ? "down" : "up",
      color: "bg-amber-500",
      onClick: () => navigate("/tasks?tab=upcoming"),
    },
    {
      title: "Overdue Tasks",
      value: overdueTasks?.length ?? 0,
      subtitle: "Need attention",
      icon: AlertCircle,
      trend: "down" as const,
      color: "bg-red-500",
      onClick: () => navigate("/tasks?tab=overdue"),
    },
    {
      title: "Total Revenue",
      value: `$${(invoiceStats?.totalRevenue ?? 0).toLocaleString()}`,
      subtitle: `$${(invoiceStats?.outstanding ?? 0).toLocaleString()} outstanding`,
      icon: DollarSign,
      trend: "up" as const,
      color: "bg-lime-500",
      onClick: () => navigate("/invoices"),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Your business at a glance</p>
        </div>
        <Button onClick={() => navigate("/calendar")} variant="outline">
          <CalendarDays className="h-4 w-4 mr-2" />
          View Calendar
        </Button>
      </div>

      {/* URGENT TASKS — overdue + next 7 days, grouped by client, top of page */}
      <Card className="border-l-4 border-l-red-500">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-5 w-5 text-red-500" /> Urgent — overdue &amp; this week
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{overdueTasks?.length ?? 0} overdue</Badge>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{upcomingTasks?.length ?? 0} this week</Badge>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => navigate("/tasks?tab=overdue")}>All tasks <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {urgentByClient.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Nothing overdue or due this week 🎉</p>
          ) : (
            <div className="space-y-4 max-h-[26rem] overflow-auto">
              {urgentByClient.slice(0, 12).map((grp) => (
                <div key={String(grp.clientId)}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {grp.clientId ? (
                      <Link to={`/client/${grp.clientId}`} className="text-sm font-semibold text-slate-800 hover:text-lime-700 inline-flex items-center gap-1">

                        <Building2 className="h-3.5 w-3.5" />{grp.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-slate-500 inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{grp.name}</span>
                    )}
                    <span className="text-xs text-slate-400">({grp.tasks.length})</span>
                  </div>
                  <div className="space-y-1 pl-1">
                    {grp.tasks.map((t: any) => (
                      <div key={t.id} onClick={() => setOpenTask(t)} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:shadow-sm", t._bucket === "overdue" ? "bg-red-50" : "bg-amber-50/60")}>
                        <button title="Mark done" onClick={(e) => { e.stopPropagation(); completeUrgent.mutate({ id: t.id }); }}
                          className="w-4 h-4 shrink-0 rounded-full border-2 border-slate-300 hover:border-lime-500 hover:bg-lime-100 transition-colors" />
                        <span className="flex-1 text-sm text-slate-700 truncate">{t.title}</span>
                        {t.category && <Badge variant="secondary" className="text-[10px] hidden sm:inline-flex">{t.category}</Badge>}
                        <span className={cn("text-xs whitespace-nowrap", t._bucket === "overdue" ? "text-red-600 font-medium" : "text-amber-600")}>
                          {t.dueDate ? format(new Date(t.dueDate), "MMM d") : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Morning Brief */}
      {dailyBrief && (
        <Card className={cn(
          "border-l-4",
          dailyBrief.stats.overdueCount > 0 ? "border-l-red-500 bg-red-50/30" : "border-l-lime-500 bg-lime-50/30"
        )}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-bold text-slate-800">
                  {dailyBrief.greeting}, Markie! ☀️
                </h2>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/quick-add")}>
                <Plus className="h-4 w-4 mr-1" />
                Quick Add
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="flex items-center gap-1.5 text-red-600">
                  <Flame className="h-4 w-4" />
                  <span className="text-xs font-semibold">Overdue</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{dailyBrief.stats.overdueCount}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="flex items-center gap-1.5 text-amber-600">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs font-semibold">Today</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{dailyBrief.stats.todayCount}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="flex items-center gap-1.5 text-blue-600">
                  <CalendarDays className="h-4 w-4" />
                  <span className="text-xs font-semibold">Calendar</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{dailyBrief.stats.calendarCount}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <CheckSquare className="h-4 w-4" />
                  <span className="text-xs font-semibold">Pending</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{dailyBrief.stats.totalPending}</p>
              </div>
            </div>

            {/* Overdue tasks preview */}
            {dailyBrief.overdue.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1">
                  <Flame className="h-4 w-4" />
                  Overdue — handle these first!
                </p>
                <div className="space-y-1.5">
                  {dailyBrief.overdue.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                      onClick={() => navigate(`/tasks?tab=overdue`)}
                    >
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-sm text-red-800 truncate">{task.title}</span>
                    </div>
                  ))}
                  {dailyBrief.overdue.length > 3 && (
                    <p className="text-xs text-red-600 pl-1">
                      +{dailyBrief.overdue.length - 3} more overdue
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Today's tasks preview */}
            {dailyBrief.today.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-semibold text-amber-700 mb-2">
                  Due Today
                </p>
                <div className="space-y-1.5">
                  {dailyBrief.today.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
                      onClick={() => navigate(`/tasks?tab=today`)}
                    >
                      <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="text-sm text-amber-800 truncate">{task.title}</span>
                    </div>
                  ))}
                  {dailyBrief.today.length > 3 && (
                    <p className="text-xs text-amber-600 pl-1">
                      +{dailyBrief.today.length - 3} more due today
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Calendar preview */}
            {dailyBrief.calendar.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-blue-700 mb-2">
                  Calendar Today
                </p>
                <div className="space-y-1.5">
                  {dailyBrief.calendar.slice(0, 3).map((evt) => (
                    <div
                      key={evt.id}
                      className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2"
                      onClick={() => navigate("/calendar")}
                    >
                      <CalendarDays className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="text-sm text-blue-800 truncate">{evt.title}</span>
                      <span className="text-xs text-blue-600 ml-auto">
                        {evt.startDate ? format(new Date(evt.startDate), "h:mm a") : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dailyBrief.overdue.length === 0 && dailyBrief.today.length === 0 && dailyBrief.calendar.length === 0 && (
              <div className="text-center py-4">
                <p className="text-slate-500">Nothing urgent today! 🎉</p>
                <Button variant="outline" className="mt-2" onClick={() => navigate("/quick-add")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add a task
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Figgy Junior — compact summary (full view lives on the Triage page) */}
      <button
        onClick={() => navigate("/triage")}
        className="w-full flex items-center justify-between gap-3 rounded-lg border border-l-4 border-l-purple-500 bg-purple-50/30 px-4 py-2.5 text-left hover:bg-purple-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="h-4 w-4 text-purple-500 shrink-0" />
          <span className="font-semibold text-sm text-slate-800">Figgy Junior</span>
          <span className="text-sm text-slate-500 truncate">
            {triageItems.length} need{triageItems.length === 1 ? "s" : ""} review
            {triageItems.filter(i => i.severity === "critical").length > 0
              ? ` · ${triageItems.filter(i => i.severity === "critical").length} critical`
              : ""}
          </span>
        </div>
        <span className="flex items-center gap-1 text-sm text-purple-600 shrink-0">
          Review <ChevronRight className="h-4 w-4" />
        </span>
      </button>

      {/* Stats Grid — 6 cards: 3x2 on desktop, 2x3 on tablet, 1x6 on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          const TrendIcon = stat.trend === "up" ? ArrowUpRight : ArrowDownRight;
          return (
            <Card
              key={stat.title}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={stat.onClick}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className={cn("p-3 rounded-lg", stat.color)}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <TrendIcon
                    className={cn(
                      "h-5 w-5",
                      stat.trend === "up" ? "text-lime-500" : "text-red-500"
                    )}
                  />
                </div>
                <div className="mt-4">
                  <p className="text-sm text-slate-500">{stat.title}</p>
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-xs text-slate-400 mt-1">{stat.subtitle}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Expiring Documents Alert */}
      {expiringDocs && expiringDocs.total > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <Clock className="h-5 w-5 text-amber-600" />
              Documents Expiring Soon ({expiringDocs.total})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringDocs.items.slice(0, 3).map((doc) => (
                <div key={`${doc.type}-${doc.id}`} className="flex items-center justify-between p-2 bg-white rounded-lg border border-amber-200">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-slate-500">{doc.clientName}</p>
                    </div>
                  </div>
                  <Badge
                    variant={doc.daysRemaining <= 7 ? "destructive" : "outline"}
                    className={cn(
                      "text-xs",
                      doc.daysRemaining <= 7 && "bg-red-100 text-red-700 border-red-300",
                      doc.daysRemaining > 7 && doc.daysRemaining <= 14 && "bg-amber-100 text-amber-700 border-amber-300",
                    )}
                  >
                    {doc.daysRemaining}d
                  </Badge>
                </div>
              ))}
              {expiringDocs.total > 3 && (
                <Button variant="link" className="p-0 h-auto text-sm text-amber-700" onClick={() => navigate("/signatures")}>
                  View all {expiringDocs.total} expiring documents →
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Tasks */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-amber-500" />
              Upcoming Tasks
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/tasks?tab=upcoming")}>
              View All
            </Button>
          </CardHeader>
          <CardContent>
            {!upcomingTasks || upcomingTasks.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <CheckSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No upcoming tasks for the next 7 days</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    onClick={() => navigate("/tasks?tab=upcoming")}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full",
                          task.priority === "high"
                            ? "bg-red-500"
                            : task.priority === "medium"
                            ? "bg-amber-500"
                            : "bg-lime-500"
                        )}
                      />
                      <div>
                        <p className="font-medium text-slate-900">{task.title}</p>
                        <p className="text-sm text-slate-500">
                          Due: {task.dueDate ? format(new Date(task.dueDate), "MMM d, yyyy") : "No date"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        task.priority === "high"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : task.priority === "medium"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-lime-50 text-lime-700 border-lime-200"
                      }
                    >
                      {task.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Overdue
            </CardTitle>
            <Badge 
              variant="destructive" 
              className="bg-red-500 cursor-pointer hover:bg-red-600 transition-colors"
              onClick={() => navigate("/tasks?tab=overdue")}
            >
              {overdueTasks?.length ?? 0}
            </Badge>
          </CardHeader>
          <CardContent>
            {!overdueTasks || overdueTasks.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Great! No overdue tasks</p>
              </div>
            ) : (
              <div className="space-y-3">
                {overdueTasks.slice(0, 5).map((task) => (
                  <div 
                    key={task.id} 
                    className="p-3 bg-red-50 rounded-lg border border-red-100 cursor-pointer hover:bg-red-100 transition-colors"
                    onClick={() => navigate(`/tasks?tab=overdue`)}
                  >
                    <p className="font-medium text-slate-900">{task.title}</p>
                    <p className="text-sm text-slate-500">{task.category || "General"}</p>
                    <p className="text-xs text-red-600 mt-1">
                      {task.dueDate ? format(new Date(task.dueDate), "MMM d") : "No date"} - overdue
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {openTask && <TaskDetailDialog task={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}
