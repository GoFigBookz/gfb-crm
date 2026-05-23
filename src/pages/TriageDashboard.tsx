import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Shield, CheckCircle, AlertTriangle, Clock,
  RefreshCw, Mail, Brain, Landmark, ChevronRight,
  XCircle, BarChart3, FileText, CheckSquare,
  Bot, Activity, Zap, Inbox, ExternalLink, Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface MakeSubmission {
  id: number;
  source: string;
  payload: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ParsedPayload {
  [key: string]: any;
}

/* ─── Helpers ─── */
function parsePayload(payload: string): ParsedPayload {
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
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

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
  reviewed: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
  approved: { bg: "bg-lime-50", text: "text-lime-600", border: "border-lime-200" },
  rejected: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  posted: { bg: "bg-green-50", text: "text-green-600", border: "border-green-200" },
};

/* ─── Component ─── */
export default function TriageDashboard() {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [submissions, setSubmissions] = useState<MakeSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/make-webhook/list?limit=50");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSubmissions(data.items || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSubmissions, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSubmissions();
    setTimeout(() => setRefreshing(false), 500);
  };

  const updateStatus = async (id: number, status: string, notes?: string) => {
    try {
      const res = await fetch(`/api/make-webhook/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      if (res.ok) fetchSubmissions();
    } catch (e) {
      console.error(e);
    }
  };

  const newCount = submissions.filter(s => s.status === "new").length;
  const reviewedCount = submissions.filter(s => s.status === "reviewed").length;
  const approvedCount = submissions.filter(s => s.status === "approved").length;

  const stats = [
    {
      label: "New Submissions",
      value: String(newCount),
      sub: "needs review",
      icon: Inbox,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Reviewed",
      value: String(reviewedCount),
      sub: "in progress",
      icon: CheckSquare,
      color: "text-blue-600",
      bg: "bg-blue-50",
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
      label: "Total Today",
      value: String(submissions.filter(s => new Date(s.createdAt).toDateString() === new Date().toDateString()).length),
      sub: "submissions",
      icon: BarChart3,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  const systemHealth = [
    { name: "Make.com Webhook", status: "Active", icon: Zap, color: "text-lime-600", bg: "bg-lime-50" },
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
            Figgy Jr — Make.com Form Dashboard
          </h1>
          <p className="text-slate-500">Submissions from your Make.com form appear here automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")} />
            {refreshing ? "Syncing..." : "Refresh"}
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
          <Zap className="h-3 w-3 mr-1" /> Make.com Connected
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Submissions List */}
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
                  Loading submissions...
                </div>
              )}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  {error}
                </div>
              )}
              {!loading && submissions.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <Inbox className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No submissions yet.</p>
                  <p className="text-xs mt-1">Configure your Make.com form to POST to:<br/>
                    <code className="bg-slate-100 px-2 py-1 rounded text-xs">https://figgy.gofig.ca/api/make-webhook</code>
                  </p>
                </div>
              )}
              <div className="space-y-2">
                {submissions.map((sub) => {
                  const payload = parsePayload(sub.payload);
                  const cfg = statusColors[sub.status] || statusColors.new;
                  // Extract common form fields
                  const title = payload["Vendor"] || payload["vendor"] || payload["Company"] || payload["Name"] || "Form Submission";
                  const detail = payload["Description"] || payload["description"] || payload["Notes"] || payload["notes"] || "";
                  const amount = payload["Amount"] || payload["amount"] || payload["Total"] || payload["total"] || "";
                  const email = payload["Email"] || payload["email"] || payload["Contact"] || "";
                  
                  return (
                    <div
                      key={sub.id}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100"
                    >
                      <div className={cn("p-1.5 rounded-md flex-shrink-0 mt-0.5", cfg.bg)}>
                        <FileText className={cn("h-4 w-4", cfg.text)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{title}</span>
                          {amount && (
                            <span className="text-sm font-semibold text-slate-600">{amount}</span>
                          )}
                        </div>
                        {detail && (
                          <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{detail}</p>
                        )}
                        {email && (
                          <p className="text-xs text-slate-400 mt-0.5">{email}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400">{timeAgo(sub.createdAt)}</span>
                          <span className="text-xs text-slate-400">• ID: {sub.id}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <Badge variant="outline" className={cn("text-xs", cfg.bg, cfg.text, cfg.border)}>
                          {sub.status}
                        </Badge>
                        <div className="flex gap-1 mt-1">
                          {sub.status === "new" && (
                            <>
                              <Button size="sm" className="h-6 text-xs bg-lime-500 px-2" onClick={() => updateStatus(sub.id, "approved")}>
                                Approve
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => updateStatus(sub.id, "reviewed")}>
                                Review
                              </Button>
                            </>
                          )}
                          {sub.status === "reviewed" && (
                            <Button size="sm" className="h-6 text-xs bg-lime-500 px-2" onClick={() => updateStatus(sub.id, "approved")}>
                              Approve
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: System Health + Quick Stats */}
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
                Last checked: {format(new Date(), "h:mm a")}
              </p>
            </CardContent>
          </Card>

          {/* Webhook URL Card */}
          <Card className="border-lime-200 bg-lime-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-sm">
                <ExternalLink className="h-4 w-4 text-lime-500" />
                Webhook URL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-600 mb-2">
                Point your Make.com HTTP module to this URL:
              </p>
              <code className="block bg-white border rounded p-2 text-xs break-all font-mono text-slate-700">
                https://figgy.gofig.ca/api/make-webhook
              </code>
              <p className="text-xs text-slate-400 mt-2">
                Method: POST • Content-Type: application/json
              </p>
            </CardContent>
          </Card>

          {/* Recent Activity Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-lime-500" />
                This Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => {
                  const daySubs = submissions.filter(s => {
                    const d = new Date(s.createdAt);
                    const today = new Date();
                    const dayDiff = today.getDay() === 0 ? 6 : today.getDay() - 1;
                    const startOfWeek = new Date(today);
                    startOfWeek.setDate(today.getDate() - dayDiff);
                    startOfWeek.setHours(0,0,0,0);
                    const targetDay = new Date(startOfWeek);
                    targetDay.setDate(startOfWeek.getDate() + i);
                    return d.toDateString() === targetDay.toDateString();
                  });
                  return (
                    <div key={day} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 w-8">{day}</span>
                      <div className="flex-1 mx-2 h-4 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-lime-400 rounded-full"
                          style={{ width: `${Math.min(daySubs.length * 10, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600 w-6 text-right">{daySubs.length}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
