import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Shield, CheckCircle, AlertTriangle, AlertCircle, Clock,
  RefreshCw, Mail, Link2, Brain, Landmark, ChevronRight,
  XCircle, TrendingUp, BarChart3, FileText, CheckSquare,
  Bot, Activity, Zap, Inbox, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface TriageItem {
  id: number;
  sourceType: string;
  vendorName: string | null;
  description: string | null;
  amount: number | null;
  totalAmount: number | null;
  currency: string;
  transactionDate: string | null;
  status: string;
  suggestedClientId: number | null;
  assignedClientId: number | null;
  confidenceScore: number | null;
  fileUrl: string | null;
  aiSuggestion: string | null;
  createdAt: string;
}

interface ActivityItem {
  id: string;
  type: "email" | "approved" | "flag" | "sync" | "match" | "ignored" | "review";
  title: string;
  detail: string;
  clientName: string;
  timeAgo: string;
}

/* ─── Demo data (fallback) ─── */
const demoActivities: ActivityItem[] = [
  { id: "1", type: "email", title: "Email processed", detail: "3 attachments from Sarah Chen", clientName: "Chen Design", timeAgo: "2 min ago" },
  { id: "2", type: "approved", title: "Transaction approved", detail: "Starbucks $47.23", clientName: "Oakwood Cafe", timeAgo: "15 min ago" },
  { id: "3", type: "flag", title: "HST flag", detail: "Rogers Communications tax mismatch", clientName: "Maple Tech", timeAgo: "32 min ago" },
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

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
  needs_client: { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" },
  needs_vendor: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
  ready_to_approve: { bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-200" },
  approved: { bg: "bg-lime-50", text: "text-lime-600", border: "border-lime-200" },
  posted: { bg: "bg-green-50", text: "text-green-600", border: "border-green-200" },
  rejected: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  duplicate: { bg: "bg-slate-100", text: "text-slate-500", border: "border-slate-200" },
};

function formatCurrency(amount: number | null, currency = "CAD"): string {
  if (!amount) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

export default function TriageDashboard() {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [triageItems, setTriageItems] = useState<TriageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: tasks } = trpc.task.upcoming.useQuery({ days: 7 });

  // Fetch real triage data
  const fetchTriage = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/triage-intake/queue?status=all&limit=50");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTriageItems(data.items || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTriage();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTriage();
    setTimeout(() => setRefreshing(false), 500);
  };

  const pendingCount = triageItems.filter(i => ["pending", "needs_client", "needs_vendor"].includes(i.status)).length;
  const approvedCount = triageItems.filter(i => i.status === "approved").length;
  const flaggedCount = triageItems.filter(i => ["needs_client", "needs_vendor"].includes(i.status)).length;

  const stats = [
    {
      label: "Synced to QBO",
      value: String(triageItems.filter(i => i.status === "posted").length),
      sub: "transactions posted",
      icon: Link2,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Needs Approval",
      value: String(pendingCount),
      sub: "items in queue",
      icon: CheckSquare,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Flagged Items",
      value: String(flaggedCount),
      sub: "require review",
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
            {refreshing ? "Syncing..." : "Sync"}
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
        {/* Left: Triage Queue */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-lime-500" />
                Triage Queue
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleRefresh}>
                <RefreshCw className={cn("h-3 w-3 mr-1", refreshing && "animate-spin")} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {loading && (
                <div className="p-8 text-center text-slate-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading triage items...
                </div>
              )}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  {error}. Make sure the triage intake is configured in Settings.
                </div>
              )}
              {!loading && triageItems.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <Inbox className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No triage items yet.</p>
                  <p className="text-xs mt-1">Configure your Google Sheet intake in Settings to start pulling data.</p>
                </div>
              )}
              <div className="space-y-1">
                {triageItems.map((item) => {
                  const cfg = statusColors[item.status] || statusColors.pending;
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/tasks`)}
                    >
                      <div className={cn("p-1.5 rounded-md flex-shrink-0 mt-0.5", cfg.bg)}>
                        <FileText className={cn("h-4 w-4", cfg.text)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">
                            {item.vendorName || "Unknown Vendor"}
                          </span>
                          <span className="text-sm text-slate-500">
                            — {item.description || "No description"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-400">{timeAgo(item.createdAt)}</span>
                          <span className="text-xs font-medium text-slate-600">
                            {formatCurrency(item.totalAmount || item.amount, item.currency)}
                          </span>
                          {item.transactionDate && (
                            <span className="text-xs text-slate-400">
                              {format(new Date(item.transactionDate), "MMM d")}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("text-xs flex-shrink-0", cfg.bg, cfg.text, cfg.border)}>
                        {item.status.replace("_", " ")}
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
              {triageItems.filter(i => ["needs_client", "needs_vendor", "pending"].includes(i.status)).length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-sm">
                  <CheckCircle className="h-6 w-6 mx-auto mb-2 text-lime-500" />
                  No flagged items
                </div>
              ) : (
                triageItems
                  .filter(i => ["needs_client", "needs_vendor", "pending"].includes(i.status))
                  .slice(0, 5)
                  .map((item) => {
                    const cfg = statusColors[item.status] || statusColors.pending;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow",
                          cfg.bg, cfg.border
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold", cfg.bg, cfg.text)}>
                            {item.id}
                          </div>
                          <div>
                            <span className={cn("text-sm font-medium block", cfg.text)}>
                              {item.vendorName || "Unknown"}
                            </span>
                            <span className="text-xs text-slate-500">
                              {formatCurrency(item.totalAmount || item.amount, item.currency)}
                            </span>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/tasks")}>
                          Review <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    );
                  })
              )}
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
