import { useState } from "react";
import {
  Receipt, Link, Trash2, RefreshCw, Users, FileText,
  DollarSign, Landmark, Clock, CheckCircle, AlertCircle,
  ArrowUpRight, ArrowDownRight,
  Wifi, WifiOff, BarChart3, KeyRound, Copy, Check
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function getIntuitAuthUrl(environment: "sandbox" | "production") {
  const clientId = environment === "sandbox"
    ? (import.meta.env.VITE_SANDBOX_QBO_CLIENT_ID || "")
    : (import.meta.env.VITE_QBO_CLIENT_ID || "");
  const redirectUri = `${window.location.origin}/api/qbo/callback`;
  const scopes = "com.intuit.quickbooks.accounting com.intuit.quickbooks.payment";
  const state = btoa(JSON.stringify({ env: environment, ts: Date.now() }));

  return `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
}

export default function QBO() {
  const utils = trpc.useUtils();
  const { data: stats } = trpc.qbo.getStats.useQuery();
  const { data: connections } = trpc.qbo.listConnections.useQuery();
  const { data: customers } = trpc.qbo.getCustomers.useQuery();
  const { data: invoices } = trpc.qbo.getInvoices.useQuery();
  const { data: payments } = trpc.qbo.getPayments.useQuery();
  const { data: accounts } = trpc.qbo.getAccounts.useQuery();
  const { data: syncLogs } = trpc.qbo.getSyncLogs.useQuery();

  const syncCustomers = trpc.qbo.syncCustomers.useMutation({ onSuccess: () => { utils.qbo.getCustomers.invalidate(); utils.qbo.getStats.invalidate(); } });
  const syncInvoices = trpc.qbo.syncInvoices.useMutation({ onSuccess: () => { utils.qbo.getInvoices.invalidate(); utils.qbo.getStats.invalidate(); } });
  const syncPayments = trpc.qbo.syncPayments.useMutation({ onSuccess: () => { utils.qbo.getPayments.invalidate(); utils.qbo.getStats.invalidate(); } });
  const syncAccounts = trpc.qbo.syncAccounts.useMutation({ onSuccess: () => { utils.qbo.getAccounts.invalidate(); utils.qbo.getStats.invalidate(); } });
  const deleteConnection = trpc.qbo.deleteConnection.useMutation({ onSuccess: () => utils.qbo.listConnections.invalidate() });
  const toggleConnection = trpc.qbo.toggleConnection.useMutation({ onSuccess: () => utils.qbo.listConnections.invalidate() });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [syncing, setSyncing] = useState<string | null>(null);

  const handleSync = async (type: string, fn: () => Promise<unknown>) => {
    setSyncing(type);
    try { await fn(); } catch (e) { console.error(e); }
    setSyncing(null);
  };

  const statCards = [
    { title: "QBO Customers", value: stats?.customers ?? 0, icon: Users, color: "bg-blue-500", trend: "up" },
    { title: "Invoices", value: stats?.invoices ?? 0, icon: FileText, color: "bg-amber-500", trend: "neutral" },
    { title: "Total Revenue", value: `$${(stats?.totalRevenue ?? 0).toLocaleString()}`, icon: DollarSign, color: "bg-lime-500", trend: "up" },
    { title: "Outstanding", value: `$${(stats?.outstanding ?? 0).toLocaleString()}`, icon: Receipt, color: "bg-red-500", trend: "down" },
    { title: "Payments", value: stats?.payments ?? 0, icon: CheckCircle, color: "bg-purple-500", trend: "up" },
    { title: "Chart of Accounts", value: stats?.accounts ?? 0, icon: Landmark, color: "bg-cyan-500", trend: "neutral" },
  ];

  const isLoading = !connections || !stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-lime-500" />
            QuickBooks Online
          </h1>
          <p className="text-slate-500">Sync customers, invoices, payments & chart of accounts from QBO</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setIsAddOpen(true)}>
            <Link className="h-4 w-4 mr-2" /> Connect QBO
          </Button>
        </div>
      </div>

      {/* Connection Dialog */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setIsAddOpen(false)}>
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="h-5 w-5 text-lime-500" />
              <h2 className="text-lg font-semibold">Connect QuickBooks Online</h2>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Connect your QBO company to sync customers, invoices, payments, and chart of accounts into your CRM.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => { window.location.href = getIntuitAuthUrl("sandbox"); }}
                  className="w-full p-4 border rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-white font-bold text-lg">
                    S
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-900">Sandbox Environment</p>
                    <p className="text-sm text-slate-500">For testing with sample data</p>
                  </div>
                </button>
                <button
                  onClick={() => { window.location.href = getIntuitAuthUrl("production"); }}
                  className="w-full p-4 border rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-lime-400 to-green-500 flex items-center justify-center text-white font-bold text-lg">
                    P
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-900">Production Environment</p>
                    <p className="text-sm text-slate-500">Live QBO company data</p>
                  </div>
                </button>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                <strong>Need QBO API keys?</strong> Create an app at{" "}
                <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="underline">
                  developer.intuit.com
                </a>{" "}
                to get your Client ID and Secret.
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-4 border-lime-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Loading QBO data...</p>
        </div>
      ) : connections.length === 0 ? (
        /* No connections yet */
        <Card className="bg-gradient-to-br from-slate-50 to-blue-50 border-blue-200">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-6">
              <Receipt className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Connect QuickBooks Online</h2>
            <p className="text-slate-500 max-w-lg mx-auto mb-6">
              Link your QBO company to automatically sync customers, invoices, payments, and chart of accounts. Your CRM stays in sync with your books.
            </p>
            <div className="flex items-center justify-center gap-4 mb-8">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Users className="h-4 w-4 text-blue-500" /> Customers
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <FileText className="h-4 w-4 text-amber-500" /> Invoices
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <DollarSign className="h-4 w-4 text-lime-500" /> Payments
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Landmark className="h-4 w-4 text-purple-500" /> Chart of Accounts
              </div>
            </div>
            <Button size="lg" onClick={() => setIsAddOpen(true)}>
              <Link className="h-5 w-5 mr-2" /> Connect QBO Company
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              const TrendIcon = stat.trend === "up" ? ArrowUpRight : stat.trend === "down" ? ArrowDownRight : null;
              return (
                <Card key={stat.title} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className={cn("p-2 rounded-lg", stat.color)}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      {TrendIcon && <TrendIcon className={cn("h-4 w-4", stat.trend === "up" ? "text-lime-500" : "text-red-500")} />}
                    </div>
                    <p className="text-xs text-slate-500">{stat.title}</p>
                    <p className="text-lg font-bold text-slate-900">{stat.value}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Connections + Sync Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-5 w-5 text-lime-500" />
                Connected Companies
              </CardTitle>
              <CardDescription>Manage your QBO connections and sync settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {connections.map((conn) => (
                  <div key={conn.id} className={cn(
                    "flex items-center justify-between p-4 border rounded-lg",
                    conn.isActive ? "bg-white" : "bg-slate-50 opacity-60"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold",
                        conn.environment === "production" ? "bg-gradient-to-br from-lime-400 to-green-500" : "bg-gradient-to-br from-blue-400 to-cyan-500"
                      )}>
                        {conn.environment === "production" ? "P" : "S"}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{conn.companyName || "Unknown Company"}</p>
                        <p className="text-xs text-slate-500">
                          {conn.environment} &bull; Realm: {conn.realmId} &bull;
                          Last synced: {conn.lastSyncedAt ? format(new Date(conn.lastSyncedAt), "MMM d, HH:mm") : "Never"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={conn.isActive ? "default" : "secondary"} className={cn(conn.isActive && "bg-lime-500")}>
                        {conn.isActive ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                        {conn.isActive ? "Active" : "Paused"}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => toggleConnection.mutate({ id: conn.id, active: !conn.isActive })}>
                        {conn.isActive ? "Pause" : "Resume"}
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteConnection.mutate({ id: conn.id })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Sync Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-blue-500" />
                Sync Controls
              </CardTitle>
              <CardDescription>Pull the latest data from QBO into your CRM</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { key: "customers", label: "Customers", icon: Users, count: stats?.customers ?? 0, fn: () => handleSync("customers", () => syncCustomers.mutateAsync({ connectionId: connections[0].id })) },
                  { key: "invoices", label: "Invoices", icon: FileText, count: stats?.invoices ?? 0, fn: () => handleSync("invoices", () => syncInvoices.mutateAsync({ connectionId: connections[0].id })) },
                  { key: "payments", label: "Payments", icon: DollarSign, count: stats?.payments ?? 0, fn: () => handleSync("payments", () => syncPayments.mutateAsync({ connectionId: connections[0].id })) },
                  { key: "accounts", label: "Chart of Accounts", icon: Landmark, count: stats?.accounts ?? 0, fn: () => handleSync("accounts", () => syncAccounts.mutateAsync({ connectionId: connections[0].id })) },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={item.fn}
                    disabled={!!syncing}
                    className="p-4 border rounded-lg hover:bg-slate-50 transition-all flex flex-col items-center gap-2 disabled:opacity-50"
                  >
                    <item.icon className={cn("h-6 w-6", syncing === item.key ? "animate-spin text-blue-500" : "text-slate-600")} />
                    <span className="font-medium text-sm">{item.label}</span>
                    <span className="text-xs text-slate-500">{item.count} records</span>
                    {syncing === item.key && <span className="text-xs text-blue-600">Syncing...</span>}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Client ↔ QBO Realm ID master — rebuilds the realm column that went
              missing; pulled live from each client's connection. */}
          <RealmIdCard />

          {/* Data Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="accounts">Accounts</TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="mt-6 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Recent Sync Activity */}
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" /> Recent Sync Activity</CardTitle></CardHeader>
                  <CardContent>
                    {!syncLogs || syncLogs.length === 0 ? (
                      <p className="text-center text-slate-400 py-8">No sync activity yet. Click a sync button above to get started.</p>
                    ) : (
                      <div className="space-y-2">
                        {syncLogs.slice(0, 8).map((log) => (
                          <div key={log.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              {log.status === "success" ? <CheckCircle className="h-4 w-4 text-lime-500" /> : <AlertCircle className="h-4 w-4 text-red-500" />}
                              <div>
                                <p className="text-sm font-medium capitalize">{log.entityType}</p>
                                <p className="text-xs text-slate-500">{log.startedAt ? format(new Date(log.startedAt), "MMM d, HH:mm") : ""}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge variant="outline" className={log.status === "success" ? "bg-lime-50 text-lime-700" : "bg-red-50 text-red-700"}>
                                {log.recordsSynced} synced
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Revenue Overview */}
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-lime-500" /> Revenue Overview</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-lime-50 rounded-lg">
                        <div><p className="text-sm text-slate-500">Total Revenue</p><p className="text-2xl font-bold text-lime-700">${(stats?.totalRevenue ?? 0).toLocaleString()}</p></div>
                        <DollarSign className="h-8 w-8 text-lime-500" />
                      </div>
                      <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                        <div><p className="text-sm text-slate-500">Outstanding</p><p className="text-2xl font-bold text-red-700">${(stats?.outstanding ?? 0).toLocaleString()}</p></div>
                        <Receipt className="h-8 w-8 text-red-500" />
                      </div>
                      <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                        <div><p className="text-sm text-slate-500">Paid Invoices</p><p className="text-2xl font-bold text-blue-700">{stats?.paidInvoices ?? 0}</p></div>
                        <CheckCircle className="h-8 w-8 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Customers */}
            <TabsContent value="customers" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-blue-500" /> QBO Customers</CardTitle>
                  <Badge>{customers?.length ?? 0} records</Badge>
                </CardHeader>
                <CardContent>
                  {!customers || customers.length === 0 ? (
                    <p className="text-center text-slate-400 py-8">No customers synced yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-auto">
                      {customers.map((c) => (
                        <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-white font-semibold">
                              {(c.displayName || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{c.displayName || "Unnamed"}</p>
                              <p className="text-xs text-slate-500">{c.companyName || c.email || "No details"}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">${(c.balance || 0).toLocaleString()}</p>
                            <p className="text-xs text-slate-500">Balance</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Invoices */}
            <TabsContent value="invoices" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-amber-500" /> QBO Invoices</CardTitle>
                  <Badge>{invoices?.length ?? 0} records</Badge>
                </CardHeader>
                <CardContent>
                  {!invoices || invoices.length === 0 ? (
                    <p className="text-center text-slate-400 py-8">No invoices synced yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-auto">
                      {invoices.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{inv.invoiceNumber || inv.docNumber || "Unnamed"}</p>
                              <Badge variant="outline" className={cn(
                                (inv.balance || 0) <= 0 ? "bg-lime-50 text-lime-700" : "bg-amber-50 text-amber-700"
                              )}>
                                {(inv.balance || 0) <= 0 ? "Paid" : "Open"}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500">
                              {inv.transactionDate ? format(new Date(inv.transactionDate), "MMM d, yyyy") : ""} &bull; Due: {inv.dueDate ? format(new Date(inv.dueDate), "MMM d, yyyy") : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">${(inv.totalAmount || 0).toLocaleString()}</p>
                            <p className="text-xs text-slate-500">Balance: ${(inv.balance || 0).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payments */}
            <TabsContent value="payments" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-lime-500" /> QBO Payments</CardTitle>
                  <Badge>{payments?.length ?? 0} records</Badge>
                </CardHeader>
                <CardContent>
                  {!payments || payments.length === 0 ? (
                    <p className="text-center text-slate-400 py-8">No payments synced yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-auto">
                      {payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">${(p.totalAmount || 0).toLocaleString()}</p>
                            <p className="text-xs text-slate-500">
                              {p.transactionDate ? format(new Date(p.transactionDate), "MMM d, yyyy") : ""} &bull; {p.paymentMethod || "Unknown method"}
                            </p>
                          </div>
                          <Badge variant="outline" className="bg-lime-50 text-lime-700">Received</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Accounts */}
            <TabsContent value="accounts" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5 text-purple-500" /> Chart of Accounts</CardTitle>
                  <Badge>{accounts?.length ?? 0} records</Badge>
                </CardHeader>
                <CardContent>
                  {!accounts || accounts.length === 0 ? (
                    <p className="text-center text-slate-400 py-8">No accounts synced yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-auto">
                      {accounts.map((a) => (
                        <div key={a.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">{a.name || "Unnamed"}</p>
                            <p className="text-xs text-slate-500">{a.accountType || ""} {a.accountSubType ? `/ ${a.accountSubType}` : ""}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">${(a.currentBalance || 0).toLocaleString()}</p>
                            <p className="text-xs text-slate-500">{a.classification || ""}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

/** Client ↔ QuickBooks realm-ID master. Re-derived from each client's live
 *  connection so the realm column can never silently go missing again. Copy a
 *  single realm or the whole list (paste straight into Markie's master sheet). */
function RealmIdCard() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.crmClient.realmMap.useQuery();
  const resync = trpc.crmClient.resyncRealms.useMutation({
    onSuccess: () => { utils.crmClient.realmMap.invalidate(); },
  });
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  // Never silently vanish: show the card even while loading / on error / empty.
  if (isLoading || error || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-lime-600" /> Client ↔ QuickBooks Realm IDs
          </CardTitle>
          <CardDescription>
            {isLoading ? "Loading realm IDs…" : error ? `Couldn't load realm IDs: ${error.message}` : "No data yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" onClick={() => resync.mutate()} disabled={resync.isPending}>
            <RefreshCw className={cn("h-4 w-4 mr-1", resync.isPending && "animate-spin")} /> Re-sync from QBO
          </Button>
        </CardContent>
      </Card>
    );
  }
  const rows = data.rows;
  const s = data.summary;

  const stateBadge = (state: string) => {
    switch (state) {
      case "ok": return <Badge className="bg-lime-100 text-lime-700">Synced</Badge>;
      case "needs_sync": return <Badge className="bg-amber-100 text-amber-700">Needs sync</Badge>;
      case "disconnected": return <Badge className="bg-orange-100 text-orange-700">Disconnected</Badge>;
      case "ambiguous": return <Badge className="bg-red-100 text-red-700">Ambiguous</Badge>;
      default: return <Badge className="bg-slate-100 text-slate-600">No realm</Badge>;
    }
  };

  const tsv = rows
    .map((r) => `${r.name}\t${r.storedRealmId || r.liveRealmId || ""}`)
    .join("\n");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-lime-600" /> Client ↔ QuickBooks Realm IDs
            </CardTitle>
            <CardDescription>
              {s.mapped}/{s.total} mapped
              {s.needsSync ? ` · ${s.needsSync} need sync` : ""}
              {s.unmapped ? ` · ${s.unmapped} missing` : ""}
              {s.ambiguous ? ` · ${s.ambiguous} ambiguous` : ""}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => copy(tsv, "__all__")}>
              {copied === "__all__" ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              Copy all
            </Button>
            <Button size="sm" onClick={() => resync.mutate()} disabled={resync.isPending}>
              <RefreshCw className={cn("h-4 w-4 mr-1", resync.isPending && "animate-spin")} /> Re-sync + update master sheet
            </Button>
          </div>
        </div>
        {resync.data && (
          <p className="text-xs text-lime-700 mt-1">
            Synced {resync.data.linked} client file(s){resync.data.sheet ? ` · wrote ${resync.data.sheet.pushed}/${resync.data.sheet.total} rows to the Client Master sheet` : ""}.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {rows.map((r) => {
            const realm = r.storedRealmId || r.liveRealmId;
            return (
              <div key={r.clientId} className="flex items-center justify-between py-2 gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-slate-900 truncate">{r.name}</p>
                  <p className="text-xs text-slate-500">{r.clientType || ""}{r.status !== "active" ? ` · ${r.status}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {realm ? (
                    <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">{realm}</code>
                  ) : (
                    <span className="text-xs text-slate-400 italic">—</span>
                  )}
                  {stateBadge(r.state)}
                  {realm && (
                    <button onClick={() => copy(realm, String(r.clientId))} className="p-1 rounded hover:bg-slate-100" title="Copy realm ID">
                      {copied === String(r.clientId) ? <Check className="h-3.5 w-3.5 text-lime-600" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-sm text-slate-500 py-4">No clients to map yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
