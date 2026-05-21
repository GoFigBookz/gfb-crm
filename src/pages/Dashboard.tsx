import { useNavigate } from "react-router";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: clientStats } = trpc.crmClient.stats.useQuery();
  const { data: pipelineStats } = trpc.crmClient.pipelineStats.useQuery();
  const { data: upcomingTasks } = trpc.task.upcoming.useQuery({ days: 7 });
  const { data: overdueTasks } = trpc.task.overdue.useQuery();
  const { data: invoiceStats } = trpc.invoice.stats.useQuery();
  const { data: expiringDocs } = trpc.expiration.getExpiringSoon.useQuery({ days: 30 });

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
    </div>
  );
}
