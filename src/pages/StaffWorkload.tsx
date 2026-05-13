import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Users,
  CheckSquare,
  Clock,
  Timer,
  AlertTriangle,
  Briefcase,
  Shield,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  senior_bookkeeper: "Senior Bookkeeper",
  junior_bookkeeper: "Junior Bookkeeper",
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  admin: <Shield className="h-4 w-4" />,
  senior_bookkeeper: <Briefcase className="h-4 w-4" />,
  junior_bookkeeper: <Users className="h-4 w-4" />,
};

export default function StaffWorkload() {
  const { can } = useAuth();
  const { data: workload, isLoading } = trpc.workload.getStaffWorkload.useQuery(undefined, {
    enabled: can.senior,
  });

  if (!can.senior) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Shield className="h-12 w-12 mx-auto mb-3 text-slate-300" />
        <p className="font-medium">Senior bookkeeper access required</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Users className="h-10 w-10 mx-auto mb-3 animate-spin" />
        <p>Loading staff workload...</p>
      </div>
    );
  }

  // Totals
  const totalOpenTasks = workload?.reduce((sum, w) => sum + w.openTasks, 0) || 0;
  const totalOverdueTasks = workload?.reduce((sum, w) => sum + w.overdueTasks, 0) || 0;
  const totalWeekHours = workload?.reduce((sum, w) => sum + w.weekHours, 0) || 0;
  const totalAssignedClients = workload?.reduce((sum, w) => sum + w.assignedClients, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="h-6 w-6 text-lime-500" />
          Staff Workload
        </h1>
        <p className="text-slate-500 mt-1">
          Monitor capacity, task distribution, and hours logged across your team.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <CheckSquare className="h-4 w-4" />
              <span className="text-xs uppercase font-semibold">Open Tasks</span>
            </div>
            <p className="text-2xl font-bold">{totalOpenTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-500 mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs uppercase font-semibold">Overdue</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{totalOverdueTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Timer className="h-4 w-4" />
              <span className="text-xs uppercase font-semibold">Hours This Week</span>
            </div>
            <p className="text-2xl font-bold">{totalWeekHours.toFixed(1)}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Briefcase className="h-4 w-4" />
              <span className="text-xs uppercase font-semibold">Clients Assigned</span>
            </div>
            <p className="text-2xl font-bold">{totalAssignedClients}</p>
          </CardContent>
        </Card>
      </div>

      {/* Staff Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {workload?.map((staff) => (
          <Card key={staff.userId} className={cn(
            staff.capacityColor === "red" && "border-red-300",
            staff.capacityColor === "yellow" && "border-amber-300",
          )}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                    {staff.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <CardTitle className="text-base">{staff.name}</CardTitle>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      {ROLE_ICONS[staff.role]}
                      {ROLE_LABELS[staff.role] || staff.role}
                    </div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    staff.capacityColor === "green" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                    staff.capacityColor === "yellow" && "bg-amber-50 text-amber-700 border-amber-200",
                    staff.capacityColor === "red" && "bg-red-50 text-red-700 border-red-200",
                  )}
                >
                  {staff.capacityColor === "green" ? "Healthy Load" :
                   staff.capacityColor === "yellow" ? "Near Capacity" : "Overloaded"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Task Load Bar */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">Open Tasks</span>
                  <span className="font-medium">{staff.openTasks}</span>
                </div>
                <Progress
                  value={Math.min((staff.openTasks / 40) * 100, 100)}
                  className={cn(
                    "h-2",
                    staff.capacityColor === "red" && "bg-red-100",
                    staff.capacityColor === "yellow" && "bg-amber-100",
                  )}
                />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                  <p className="text-lg font-bold">{staff.openTasks}</p>
                  <p className="text-xs text-slate-500">Open</p>
                </div>
                <div className="p-2.5 bg-red-50 rounded-lg text-center">
                  <p className="text-lg font-bold text-red-600">{staff.overdueTasks}</p>
                  <p className="text-xs text-slate-500">Overdue</p>
                </div>
                <div className="p-2.5 bg-blue-50 rounded-lg text-center">
                  <p className="text-lg font-bold">{staff.weekHours}h</p>
                  <p className="text-xs text-slate-500">This Week</p>
                </div>
              </div>

              {/* Clients */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  {staff.assignedClients} clients assigned
                </span>
                <span className="text-slate-400">
                  ~{staff.assignedClients > 0 ? (staff.weekHours / staff.assignedClients).toFixed(1) : "0"}h/client this week
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
