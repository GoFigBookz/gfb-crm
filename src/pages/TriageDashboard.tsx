import { useState } from "react";
import { AlertTriangle, CheckCircle, Clock, Shield, FileText, ChevronRight, RefreshCw, Filter, Search, AlertCircle, TrendingUp, UserCheck, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";

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

const severityConfig = {
  critical: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", badge: "destructive" },
  warning: { icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", badge: "default" },
  info: { icon: FileText, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", badge: "secondary" },
};

const typeConfig = {
  reconciliation: "Reconciliation",
  missing_docs: "Missing Docs",
  deadline: "Deadline",
  anomaly: "Anomaly",
  review: "AI Review",
};

export default function TriageDashboard() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="h-6 w-6 text-lime-500" />
          AI Triage Dashboard
        </h1>
        <p className="text-slate-500">Figgy Junior's daily findings — items that need your attention or approval</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Needs Attention</p>
                <p className="text-2xl font-bold">{openItems.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
            <Progress value={criticalCount > 0 ? 100 : (openItems.length / 10) * 100} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Critical</p>
                <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Approved Today</p>
                <p className="text-2xl font-bold text-lime-600">{approvedItems.length}</p>
              </div>
              <UserCheck className="h-8 w-8 text-lime-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">AI Accuracy</p>
                <p className="text-2xl font-bold text-blue-600">94%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
            <p className="text-xs text-slate-400 mt-1">Figgy Junior's approval rate this week</p>
          </CardContent>
        </Card>
      </div>

      {/* Triage List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Triage Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search by client, issue, or type..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="needs_attention">
                Needs Attention
                {openItems.length > 0 && <Badge variant="destructive" className="ml-2 text-xs">{openItems.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved
                {approvedItems.length > 0 && <Badge variant="default" className="ml-2 text-xs bg-lime-500">{approvedItems.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
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
                        className={cn("flex items-start gap-3 p-4 rounded-lg border", config.bg, config.border)}
                      >
                        <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", config.color)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{item.title}</span>
                            <Badge variant={config.badge as any} className="text-xs">{typeConfig[item.type]}</Badge>
                            <Badge variant="outline" className="text-xs">{item.clientName}</Badge>
                          </div>
                          <p className="text-sm text-slate-600">{item.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                            <span>Detected {new Date(item.detectedAt).toLocaleTimeString()}</span>
                            <span>By {item.aiAgent}</span>
                            <span className="font-medium text-lime-600">Suggested: {item.suggestedAction}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          {item.status === "open" || item.status === "in_review" ? (
                            <>
                              <Button size="sm" className="bg-lime-500 h-8">
                                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                              </Button>
                              <Button variant="outline" size="sm" className="h-8">
                                <ChevronRight className="h-3.5 w-3.5 mr-1" /> Review
                              </Button>
                            </>
                          ) : item.status === "approved" ? (
                            <Badge className="bg-lime-500"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>
                          ) : (
                            <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" /> Dismissed</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-lime-500" />
                  <p>All caught up! Nothing in this queue.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
