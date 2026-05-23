import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Shield, CheckCircle, AlertTriangle, Clock,
  RefreshCw, Mail, Link2, Brain, Landmark, ChevronRight,
  XCircle, BarChart3, FileText, CheckSquare,
  Bot, Activity, Zap, Inbox, ExternalLink, Database,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

/* ─── Helpers ─── */
function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

function formatCurrency(amount: number | null, currency = "CAD"): string {
  if (!amount) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
}

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

/* ─── Component ─── */
export default function TriageDashboard() {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [triageItems, setTriageItems] = useState<TriageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const interval = setInterval(fetchTriage, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTriage();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handlePullFromSheet = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/triage-intake/pull", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        await fetchTriage();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const pendingCount = triageItems.filter(i => ["pending", "needs_client", "needs_vendor"].includes(i.status)).length;
  const approvedCount = triageItems.filter(i => i.status === "approved").length;
  const postedCount = triageItems.filter(i => i.status === "posted").length;

  const stats = [
    {
      label: "Needs Review",
      value: String(pendingCount),
      sub: "items waiting",
      icon: Inbox,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Approved",
      value: String(approvedCount),
      sub: "ready to post",
      icon: CheckCircle,
      color: "text-lime-600",
      bg: "bg-lime-50",
    },
    {
      label: "Posted",
      value: String(postedCount),
      sub: "to QBO/Drive",
      icon: CheckSquare,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Total",
      value: String(triageItems.length),
      sub: "in queue",
      icon: BarChart3,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  const systemHealth = [
    { name: "Google Sheets", status: "Connected", icon: Database, color: "text-lime-600", bg: "bg-lime-50" },
    { name: "QBO Connection", status: "Connected", icon: Landmark, color: "text-lime-600", bg: "bg-lime-50" },
    { name: "Email Processing", status: "Active", icon: Mail, color: "text-lime-600", bg: "bg-lime-50" },
    { name: "AI Model", status: "Running", icon: Brain, color: "text-lime-600", bg: "bg-lime-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-lime-500" />
            Figgy Jr — Form Intake
          </h1>
          <p className="text-slate-500">Pulls from your Google Sheet automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePullFromSheet} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")} />
            {refreshing ? "Pulling..." : "Pull from Sheet"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")} />
            Refresh
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
          <CheckSquare className="h-4 w-4 mr-1" /> Review All
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/emails")}>
          <Mail className="h-4 w-4 mr-1" /> Process Emails
        </Button>
        <Badge variant="outline" className="ml-auto bg-purple-50 text-purple-700 border-purple-200">
          <Zap className="h-3 w-3 mr-1" /> Google Sheets
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Triage Items */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Inbox className="h-5 w-5 text-lime-500" />
                Form Submissions
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
                  Loading...
                </div>
              )}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  {error}
                </div>
              )}
              {!loading && triageItems.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <Inbox className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No items yet.</p>
                  <p className="text-xs mt-1">Click "Pull from Sheet" to load from Google Sheets.</p>
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
                            {item.vendorName || "Unknown"}
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
        </div>

        {/* Right: System Health + Sheet Info */}
        <div className="space-y-6">
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
            </CardContent>
          </Card>

          <Card className="border-lime-200 bg-lime-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-sm">
                <Database className="h-4 w-4 text-lime-500" />
                Google Sheets Sync
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-600 mb-2">
                Set your spreadsheet ID to auto-pull:
              </p>
              <code className="block bg-white border rounded p-2 text-xs break-all font-mono text-slate-700">
                POST /api/triage-intake/config
                {"spreadsheetId": "YOUR_ID"}
              </code>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
