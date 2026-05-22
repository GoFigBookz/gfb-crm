import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Shield, CheckCircle, AlertTriangle, AlertCircle, Clock,
  RefreshCw, Mail, Link2, Brain, Landmark, ChevronRight,
  XCircle, TrendingUp, BarChart3, FileText, CheckSquare,
  Bot, Activity, Zap, Inbox, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/providers/trpc";
import { format, subDays, isToday } from "date-fns";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface ActivityItem {
  id: string;
  type: "email" | "approved" | "flag" | "sync" | "match" | "ignored" | "review";
  title: string;
  detail: string;
  clientName: string;
  timeAgo: string;
}

interface FlaggedItem {
  id: string;
  category: "hst" | "confidence" | "tax_code" | "vendor";
  title: string;
  count: number;
  severity: "critical" | "warning";
}

/* ─── Demo data ─── */
const demoActivities: ActivityItem[] = [
  { id: "1", type: "email", title: "Email processed", detail: "3 attachments from Sarah Chen", clientName: "Chen Design", timeAgo: "2 min ago" },
  { id: "2", type: "approved", title: "Transaction approved", detail: "Starbucks $47.23", clientName: "Oakwood Cafe", timeAgo: "15 min ago" },
  { id: "3", type: "flag", title: "HST flag", detail: "Rogers Communications tax mismatch", clientName: "Maple Tech", timeAgo: "32 min ago" },
  { id: "4", type: "sync", title: "QBO synced", detail: "12 transactions posted", clientName: "All Clients", timeAgo: "1 hr ago" },
  { id: "5", type: "match", title: "Vendor matched", detail: "Canadian Tire (98% confidence)", clientName: "Riverside Auto", timeAgo: "1 hr ago" },
  { id: "6", type: "approved", title: "Transaction approved", detail: "Bell Canada $234.50", clientName: "Northside Media", timeAgo: "2 hr ago" },
  { id: "7", type: "email", title: "Email processed", detail: "Invoice from Staples", clientName: "Bright Office", timeAgo: "3 hr ago" },
  { id: "8", type: "flag", title: "Low confidence alert", detail: "Unknown vendor 'XYZ Services'", clientName: "Taylor Consulting", timeAgo: "4 hr ago" },
  { id: "9", type: "ignored", title: "Transaction ignored", detail: "Personal expense flagged", clientName: "Harper Law", timeAgo: "5 hr ago" },
  { id: "10", type: "review", title: "HST review complete", detail: "3 items resolved", clientName: "All Clients", timeAgo: "6 hr ago" },
];

const demoFlags: FlaggedItem[] = [
  { id: "f1", category: "hst", title: "HST Discrepancies", count: 3, severity: "critical" },
  { id: "f2", category: "confidence", title: "Low Confidence (< 50%)", count: 1, severity: "warning" },
  { id: "f3", category: "tax_code", title: "Missing Tax Codes", count: 5, severity: "warning" },
  { id: "f4", category: "vendor", title: "Unmatched Vendors", count: 8, severity: "warning" },
];

const activityIcons: Record<string, any> = {
  email: Inbox,
  approved: CheckCircle,
  flag: AlertTriangle,
  sync: Link2,
  match: Bot,
  ignored: XCircle,
  review: FileText,
};

const activityColors: Record<string, string> = {
  email: "text-blue-500 bg-blue-50",
  approved: "text-lime-500 bg-lime-50",
  flag: "text-amber-500 bg-amber-50",
  sync: "text-purple-500 bg-purple-50",
  match: "text-violet-500 bg-violet-50",
  ignored: "text-slate-500 bg-slate-100",
  review: "text-teal-500 bg-teal-50",
};

const flagColors: Record<string, { bg: string; text: string; border: string }> = {
  hst: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  confidence: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
  tax_code: { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" },
  vendor: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
};

export default function TriageDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("review");
  const [refreshing, setRefreshing] = useState(false);

  const { data: tasks } = trpc.task.upcoming.useQuery({ days: 7 });
  const { data: clientStats } = trpc.crmClient.stats.useQuery();

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  };

  const stats = [
    {
      label: "Synced to QBO",
      value: "18",
      sub: "transactions today",
      icon: Link2,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Needs Approval",
      value: "5",
      sub: "items in queue",
      icon: CheckSquare,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Flagged Items",
      value: "17",
      sub: "require tax review",
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "AI Accuracy",
      value: "94%",
      sub: "this week",
      icon: Brain,
      color: "text-lime-600",
      bg: "bg-lime-50",
    },
  ];

  const systemHealth = [
    { name: "QBO Connection", status: "Connected", icon: Landmark, color: "text-lime-600", bg: "bg-lime-50" },
    { name: "Email Processing", status: "Active", icon: Mail, color: "text-lime-600", bg: "bg-lime-50" },
    { name: "AI Model", status: "Running", icon: Brain, color: "text-lime-600", bg: "bg-lime-50" },
    { name: "Bank Feed", status: "Synced", icon: Activity, color: "text-lime-600", bg: "bg-lime-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-lime-500" />
            Figgy Jr — AI Junior Bookkeeper
          </h1>
          <p className="text-slate-500">Here's what's happening today.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")} />
            {refreshing ? "Syncing..." : "Sync QBO"}
          </Button>
          <Button size="sm" className="bg-lime-500" onClick={() => navigate("/tasks")}>
            <CheckSquare className="h-4 w-4 mr-1" /> Review Queue
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn("p-1.5 rounded-md", stat.bg)}>
                    <Icon className={cn("h-4 w-4", stat.color)} />
                  </div>
                  <span className="text-xs text-slate-500 uppercase font-semibold">{stat.label}</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-400 mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/tasks")}>
          <Inbox className="h-4 w-4 mr-1" /> Review Queue
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/emails")}>
          <Mail className="h-4 w-4 mr-1" /> Process Emails
        </Button>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <Link2 className="h-4 w-4 mr-1" /> Sync QBO
        </Button>
        <Badge variant="outline" className="ml-auto bg-purple-50 text-purple-700 border-purple-200">
          <Zap className="h-3 w-3 mr-1" /> Kimi Agent Active
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Activity */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-lime-500" />
                Recent Activity
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7">
                View All <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {demoActivities.map((item) => {
                  const Icon = activityIcons[item.type];
                  const colorClass = activityColors[item.type];
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className={cn("p-1.5 rounded-md flex-shrink-0 mt-0.5", colorClass.split(" ")[1])}>
                        <Icon className={cn("h-4 w-4", colorClass.split(" ")[0])} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{item.title}</span>
                          <span className="text-sm text-slate-500">— {item.detail}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{item.timeAgo}</p>
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        {item.clientName}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Weekly Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-lime-500" />
                Weekly Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32 px-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => {
                  const posted = [12, 18, 24, 15, 32, 8, 4][i];
                  const pending = [4, 6, 3, 8, 5, 2, 1][i];
                  const max = 40;
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex gap-0.5 items-end justify-center" style={{ height: `${(posted / max) * 100}%`, minHeight: "20%" }}>
                        <div className="w-3 bg-lime-400 rounded-t" style={{ height: `${(posted / (posted + pending)) * 100}%` }} />
                        <div className="w-3 bg-amber-400 rounded-t" style={{ height: `${(pending / (posted + pending)) * 100}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 mt-1">{day}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 justify-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-lime-400 rounded" />
                  <span className="text-xs text-slate-500">Posted</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-amber-400 rounded" />
                  <span className="text-xs text-slate-500">Pending</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: System Health + Flagged */}
        <div className="space-y-6">
          {/* System Health */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-lime-500" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {systemHealth.map((sys) => {
                const Icon = sys.icon;
                return (
                  <div key={sys.name} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", sys.color)} />
                      <span className="text-sm text-slate-700">{sys.name}</span>
                    </div>
                    <Badge variant="outline" className={cn("text-xs", sys.bg, sys.color, "border-transparent")}>
                      {sys.status}
                    </Badge>
                  </div>
                );
              })}
              <p className="text-xs text-slate-400 text-center pt-1">
                Last checked: {format(new Date(), "h:mm a")} • 2 minutes ago
              </p>
            </CardContent>
          </Card>

          {/* Flagged Items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Flagged Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {demoFlags.map((flag) => {
                const cfg = flagColors[flag.category];
                return (
                  <div
                    key={flag.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow",
                      cfg.bg, cfg.border
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold", cfg.bg, cfg.text)}>
                        {flag.count}
                      </div>
                      <span className={cn("text-sm font-medium", cfg.text)}>{flag.title}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      Review <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                );
              })}
              <Button variant="link" className="w-full text-xs text-slate-500" onClick={() => navigate("/tasks")}>
                View All Flags <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
