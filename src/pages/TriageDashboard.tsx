import { useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle, CheckCircle, Clock, Shield, FileText, ChevronRight,
  RefreshCw, Search, AlertCircle, TrendingUp, UserCheck, XCircle,
  Mail, ArrowRightLeft, Bot, CheckSquare, CalendarDays, Ban,
  Activity, Wifi, Cpu, Landmark, ChevronDown
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface TriageItem {
  id: number;
  clientId: number;
  clientName: string;
  type: "reconciliation" | "missing_docs" | "deadline" | "anomaly" | "review";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  detectedAt: Date;
  aiAgent: string;
  status: "open" | "in_review" | "approved" | "dismissed";
  suggestedAction: string;
}

interface ActivityItem {
  id: number;
  icon: any;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  clientName: string;
  time: string;
}

/* ─── Demo Data ─── */
const demoTriageItems: TriageItem[] = [
  {
    id: 1, clientId: 1, clientName: "Acme Construction",
    type: "reconciliation", severity: "critical",
    title: "$2,400 reconciliation difference",
    description: "Bank statement ending balance ($45,200) does not match QBO ($42,800). 3 uncleared transactions identified.",
    detectedAt: new Date(Date.now() - 3600000), aiAgent: "Figgy Junior",
    status: "open", suggestedAction: "Review uncleared items in QBO",
  },
  {
    id: 2, clientId: 1, clientName: "Acme Construction",
    type: "missing_docs", severity: "warning",
    title: "12 receipts missing for March",
    description: "Expense transactions total $3,450 with no attached receipts. GST ITCs may be lost.",
    detectedAt: new Date(Date.now() - 7200000), aiAgent: "Figgy Junior",
    status: "open", suggestedAction: "Request receipts from client",
  },
  {
    id: 3, clientId: 2, clientName: "Smith Plumbing",
    type: "deadline", severity: "critical",
    title: "Q1 HST due in 3 days",
    description: "HST return for Jan-Mar period due April 30. Return not yet prepared.",
    detectedAt: new Date(Date.now() - 10800000), aiAgent: "Figgy Junior",
    status: "in_review", suggestedAction: "Prepare and file immediately",
  },
  {
    id: 4, clientId: 3, clientName: "TechStart Inc",
    type: "anomaly", severity: "warning",
    title: "Unusual payroll spike: +$8,500",
    description: "March payroll is 35% higher than average. Possible bonus or error in hours entry.",
    detectedAt: new Date(Date.now() - 14400000), aiAgent: "Figgy Junior",
    status: "open", suggestedAction: "Verify with client before remitting",
  },
  {
    id: 5, clientId: 1, clientName: "Acme Construction",
    type: "review", severity: "info",
    title: "Sales entry from Stripe: $12,400",
    description: "Figgy Junior has matched 47 Stripe transactions to deposits. Ready for your review before categorizing.",
    detectedAt: new Date(Date.now() - 18000000), aiAgent: "Figgy Junior",
    status: "open", suggestedAction: "Review and approve categorization",
  },
  {
    id: 6, clientId: 4, clientName: "Doe Consulting",
    type: "missing_docs", severity: "info",
    title: "W-9 form needed for subcontractor",
    description: "Subcontractor John Smith (T4A recipient) has no W-9 on file.",
    detectedAt: new Date(Date.now() - 21600000), aiAgent: "Figgy Junior",
    status: "dismissed", suggestedAction: "Send W-9 request",
  },
  {
    id: 7, clientId: 2, clientName: "Smith Plumbing",
    type: "reconciliation", severity: "warning",
    title: "Credit card reconciliation behind",
    description: "2 of 3 credit cards not reconciled for March. 45 uncleared transactions.",
    detectedAt: new Date(Date.now() - 25200000), aiAgent: "Figgy Junior",
    status: "approved", suggestedAction: "Complete reconciliation",
  },
];

const recentActivities: ActivityItem[] = [
  { id: 1, icon: Mail, iconColor: "text-blue-500", iconBg: "bg-blue-100", title: "Email processed", description: "3 attachments from Sarah Chen", clientName: "Chen Design", time: "2 min ago" },
  { id: 2, icon: CheckCircle, iconColor: "text-lime-600", iconBg: "bg-lime-100", title: "Transaction approved", description: "Starbucks $47.23", clientName: "Oakwood Cafe", time: "15 min ago" },
  { id: 3, icon: AlertTriangle, iconColor: "text-amber-500", iconBg: "bg-amber-100", title: "HST flag", description: "Rogers Communications tax mismatch", clientName: "Maple Tech", time: "32 min ago" },
  { id: 4, icon: ArrowRightLeft, iconColor: "text-violet-500", iconBg: "bg-violet-100", title: "QBO synced", description: "12 transactions posted", clientName: "All Clients", time: "1 hr ago" },
  { id: 5, icon: Bot, iconColor: "text-purple-500", iconBg: "bg-purple-100", title: "Vendor matched", description: "Canadian Tire (98% confidence)", clientName: "Riverside Auto", time: "1 hr ago" },
  { id: 6, icon: CheckCircle, iconColor: "text-lime-600", iconBg: "bg-lime-100", title: "Transaction approved", description: "Bell Canada $234.50", clientName: "Northside Media", time: "2 hr ago" },
  { id: 7, icon: Mail, iconColor: "text-blue-500", iconBg: "bg-blue-100", title: "Email processed", description: "Invoice from Staples", clientName: "Bright Office", time: "3 hr ago" },
  { id: 8, icon: AlertCircle, iconColor: "text-red-500", iconBg: "bg-red-100", title: "Low confidence alert", description: "Unknown vendor 'XYZ Services'", clientName: "Taylor Consulting", time: "4 hr ago" },
  { id: 9, icon: Ban, iconColor: "text-slate-500", iconBg: "bg-slate-100", title: "Transaction ignored", description: "Personal expense flagged", clientName: "Harper Law", time: "5 hr ago" },
  { id: 10, icon: CheckSquare, iconColor: "text-lime-600", iconBg: "bg-lime-100", title: "HST review complete", description: "3 items resolved", clientName: "All Clients", time: "6 hr ago" },
];

const severityConfig = {
  critical: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", badge: "destructive" as const },
  warning: { icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", badge: "default" as const },
  info: { icon: FileText, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", badge: "secondary" as const },
};

const typeConfig = {
  reconciliation: "Reconciliation",
  missing_docs: "Missing Docs",
  deadline: "Deadline",
  anomaly: "Anomaly",
  review: "AI Review",
};

/* ─── Component ─── */
export default function TriageDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("needs_attention");
  const [search, setSearch] = useState("");

  const openItems = demoTriageItems.filter((i) => i.status === "open" || i.status === "in_review");
  const approvedItems = demoTriageItems.filter((i) => i.status === "approved");
  const dismissedItems = demoTriageItems.filter((i) => i.status === "dismissed");

  const filteredItems = (activeTab === "needs_attention" ? openItems : activeTab === "approved" ? approvedItems : dismissedItems).filter(
    (i) =>
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.clientName.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase())
  );

  const criticalCount = openItems.filter((i) => i.severity === "critical").length;
  const warningCount = openItems.filter((i) => i.severity === "warning").length;
  const infoCount = openItems.filter((i) => i.severity === "info").length;

  /* Weekly data (demo) */
  const weeklyData = [
    { day: "Mon", posted: 12, pending: 4 },
    { day: "Tue", posted: 18, pending: 3 },
    { day: "Wed", posted: 8, pending: 7 },
    { day: "Thu", posted: 22, pending: 2 },
    { day: "Fri", posted: 15, pending: 5 },
    { day: "Sat", posted: 3, pending: 1 },
    { day: "Sun", posted: 2, pending: 0 },
  ];
  const maxPosted = Math.max(...weeklyData.map(d => d.posted));

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Shield className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Figgy Jr — AI Triage</h1>
            <p className="text-sm text-slate-500">Here's what's happening today.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search transactions..." className="pl-10 w-56 h-9" />
          </div>
          <Button size="sm" variant="outline" className="h-9 gap-1">
            <RefreshCw className="h-4 w-4" /> Sync
          </Button>
        </div>
      </div>

      {/* Stats Row — 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-400 cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setActiveTab("needs_attention")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-600">Items for Approval</span>
              <span className="text-xs text-slate-400">{openItems.length} total</span>
            </div>
            <p className="text-3xl font-bold text-slate-900">{openItems.length}</p>
            <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, (openItems.length / 10) * 100)}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-lime-500 cursor-pointer hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-600">Synced to QBO</span>
              <span className="text-xs text-slate-400">Today</span>
            </div>
            <p className="text-3xl font-bold text-slate-900">18</p>
            <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-lime-500 rounded-full" style={{ width: "90%" }} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-400 cursor-pointer hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-600">Tax Review Needed</span>
              <span className="text-xs text-slate-400">HST/GST</span>
            </div>
            <p className="text-3xl font-bold text-slate-900">3</p>
            <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: "30%" }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setActiveTab("needs_attention")}>
          <ChevronRight className="h-4 w-4 mr-1" /> Review Queue
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/emails")}>
          <Mail className="h-4 w-4 mr-1" /> Process Emails
        </Button>
        <Button size="sm" variant="outline">
          <ArrowRightLeft className="h-4 w-4 mr-1" /> Sync QBO
        </Button>
        <Button size="sm" variant="outline" className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100">
          <Bot className="h-4 w-4 mr-1" /> Kimi Agent
        </Button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column — Triage Queue + Activity */}
        <div className="lg:col-span-2 space-y-5">
          {/* Triage Queue */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-500" />
                Triage Queue
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input placeholder="Search..." className="pl-8 h-8 text-sm w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-3 mb-4 h-9">
                  <TabsTrigger value="needs_attention" className="text-xs">
                    Needs Attention
                    {openItems.length > 0 && <Badge variant="destructive" className="ml-1.5 text-[10px] h-4 px-1">{openItems.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="approved" className="text-xs">
                    Approved
                    {approvedItems.length > 0 && <Badge className="ml-1.5 text-[10px] h-4 px-1 bg-lime-500">{approvedItems.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="dismissed" className="text-xs">Dismissed</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab}>
                  {filteredItems.length > 0 ? (
                    <div className="space-y-2">
                      {filteredItems.map((item) => {
                        const config = severityConfig[item.severity];
                        const Icon = config.icon;
                        return (
                          <div
                            key={item.id}
                            className={cn("flex items-start gap-3 p-3 rounded-lg border", config.bg, config.border)}
                          >
                            <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", config.color)} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className="font-medium text-sm">{item.title}</span>
                                <Badge variant={config.badge} className="text-[10px] h-4 px-1">{typeConfig[item.type]}</Badge>
                                <Badge variant="outline" className="text-[10px] h-4 px-1">{item.clientName}</Badge>
                              </div>
                              <p className="text-sm text-slate-600 line-clamp-2">{item.description}</p>
                              <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                                <span>{new Date(item.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                <span>{item.aiAgent}</span>
                                <span className="font-medium text-lime-600">{item.suggestedAction}</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 flex-shrink-0">
                              {item.status === "open" || item.status === "in_review" ? (
                                <>
                                  <Button size="sm" className="bg-lime-500 hover:bg-lime-600 h-7 text-xs px-2">
                                    <CheckCircle className="h-3 w-3 mr-1" /> Approve
                                  </Button>
                                  <Button variant="outline" size="sm" className="h-7 text-xs px-2">
                                    <ChevronRight className="h-3 w-3 mr-1" /> Review
                                  </Button>
                                </>
                              ) : item.status === "approved" ? (
                                <Badge className="bg-lime-500 text-[10px]"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]"><XCircle className="h-3 w-3 mr-1" /> Dismissed</Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400">
                      <CheckCircle className="h-10 w-10 mx-auto mb-2 text-lime-500" />
                      <p className="text-sm">All caught up! Nothing in this queue.</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {recentActivities.map((activity) => {
                const Icon = activity.icon;
                return (
                  <div key={activity.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className={cn("p-2 rounded-lg flex-shrink-0", activity.iconBg)}>
                      <Icon className={cn("h-4 w-4", activity.iconColor)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm">{activity.title}</span>
                        <span className="text-sm text-slate-500">— {activity.description}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                        <span>{activity.time}</span>
                        <span>•</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1">{activity.clientName}</Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Right Column — System Health + Flagged + Weekly */}
        <div className="space-y-5">
          {/* System Health */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base">System Health</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {[
                { label: "QBO Connection", status: "Connected", icon: Landmark, color: "text-lime-600", bg: "bg-lime-100" },
                { label: "Email Processing", status: "Active", icon: Mail, color: "text-blue-600", bg: "bg-blue-100" },
                { label: "AI Model", status: "Running", icon: Cpu, color: "text-purple-600", bg: "bg-purple-100" },
                { label: "Bank Feed", status: "Synced", icon: Wifi, color: "text-lime-600", bg: "bg-lime-100" },
              ].map((sys) => {
                const Icon = sys.icon;
                return (
                  <div key={sys.label} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("p-1.5 rounded-md", sys.bg)}>
                        <Icon className={cn("h-4 w-4", sys.color)} />
                      </div>
                      <span className="text-sm font-medium text-slate-700">{sys.label}</span>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5", sys.color, "border-current bg-transparent")}>
                      {sys.status}
                    </Badge>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-400">Last check: 2 minutes ago</p>
              </div>
            </CardContent>
          </Card>

          {/* Flagged Items */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base">Flagged Items</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {[
                { label: "HST Discrepancies", count: 8, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-100" },
                { label: "Low Confidence (< 50%)", count: 1, icon: AlertCircle, color: "text-red-600", bg: "bg-red-100" },
                { label: "Missing Tax Codes", count: 3, icon: FileText, color: "text-blue-600", bg: "bg-blue-100" },
                { label: "Unmatched Vendors", count: 1, icon: Bot, color: "text-purple-600", bg: "bg-purple-100" },
              ].map((flag) => {
                const Icon = flag.icon;
                return (
                  <div key={flag.label} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("p-1.5 rounded-md", flag.bg)}>
                        <Icon className={cn("h-4 w-4", flag.color)} />
                      </div>
                      <span className="text-sm text-slate-700">{flag.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-xs">{flag.count}</Badge>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </div>
                  </div>
                );
              })}
              <Button variant="link" className="p-0 h-auto text-xs text-slate-500 hover:text-slate-700 mt-1">
                View All Flags →
              </Button>
            </CardContent>
          </Card>

          {/* Weekly Activity */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base">Weekly Activity</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-end gap-1.5 h-28 px-1">
                {weeklyData.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col gap-0.5">
                      <div
                        className="w-full bg-lime-500 rounded-t-sm min-h-[2px]"
                        style={{ height: `${(d.posted / maxPosted) * 80}px` }}
                      />
                      <div
                        className="w-full bg-amber-400 rounded-b-sm min-h-[2px]"
                        style={{ height: `${(d.pending / maxPosted) * 80}px` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">{d.day}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-3 justify-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 bg-lime-500 rounded-sm" />
                  <span className="text-xs text-slate-500">Posted</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 bg-amber-400 rounded-sm" />
                  <span className="text-xs text-slate-500">Pending</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
