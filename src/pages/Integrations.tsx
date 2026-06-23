import { useState } from "react";
import { Link2, Plus, Trash2, CheckCircle, XCircle, RefreshCw, Mail, CalendarDays, FolderOpen, CheckSquare, DollarSign, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";

const providers = [
  { id: "google", name: "Google", icon: "G", color: "bg-red-500", scopes: ["Gmail", "Calendar", "Drive", "Tasks"] },
  { id: "microsoft", name: "Microsoft", icon: "M", color: "bg-blue-600", scopes: ["Outlook", "Calendar", "OneDrive", "Tasks"] },
  { id: "quickbooks", name: "QuickBooks", icon: "QB", color: "bg-green-600", scopes: ["Invoices", "Customers", "Payments", "Accounts"] },
  { id: "wise", name: "Wise", icon: "W", color: "bg-teal-500", scopes: ["Bank Statements", "Transactions", "Balances"], perClient: true },
  { id: "stripe", name: "Stripe", icon: "S", color: "bg-indigo-600", scopes: ["Payments", "Invoices", "Customers", "Payouts"], perClient: true },
  { id: "jobber", name: "Jobber", icon: "J", color: "bg-orange-500", scopes: ["Invoices", "Quotes", "Clients", "Visits"], perClient: true },
  { id: "touchbistro", name: "TouchBistro", icon: "TB", color: "bg-rose-600", scopes: ["Sales", "Menu", "Labor", "Reports"], perClient: true },
  { id: "paypal", name: "PayPal", icon: "P", color: "bg-blue-700", scopes: ["Payments", "Invoices", "Transactions", "Statements"], perClient: true },
  { id: "dropbox", name: "Dropbox", icon: "D", color: "bg-blue-400", scopes: ["Files"] },
  { id: "icloud", name: "iCloud", icon: "i", color: "bg-slate-600", scopes: ["Files"] },
];

// Per-client integrations that need client context
const PER_CLIENT_PROVIDERS = ["wise", "stripe", "jobber", "touchbistro", "paypal"];

export default function Integrations() {
  const utils = trpc.useUtils();
  const { data: accounts } = trpc.integration.list.useQuery();
  const { data: clients } = trpc.crmClient.list.useQuery();
  // When ADDING a connection, only offer ACTIVE + LEAD clients — never inactive.
  // (Inactive can still be found by searching the Clients page.)
  const connectClients = (clients || []).filter((c: any) => c.status === "active" || c.status === "lead" || c.status === "prospect");
  const deleteAccount = trpc.integration.delete.useMutation({ onSuccess: () => utils.integration.list.invalidate() });
  const toggleActive = trpc.integration.toggleActive.useMutation({ onSuccess: () => utils.integration.list.invalidate() });
  const updateSync = trpc.integration.updateSync.useMutation({ onSuccess: () => utils.integration.list.invalidate() });

  const [addProvider, setAddProvider] = useState<string | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [perClientApiKey, setPerClientApiKey] = useState("");

  // QBO
  const { data: qboConnections } = trpc.qbo.listConnections.useQuery();
  const syncQbo = trpc.qbo.syncAll.useMutation({
    onSuccess: () => {
      utils.qbo.listConnections.invalidate();
      utils.qbo.getStats.invalidate();
    }
  });
  const deleteQbo = trpc.qbo.deleteConnection.useMutation({
    onSuccess: () => utils.qbo.listConnections.invalidate()
  });
  const toggleQbo = trpc.qbo.toggleConnection.useMutation({
    onSuccess: () => utils.qbo.listConnections.invalidate()
  });
  const getQboAuthUrl = trpc.qbo.getAuthUrl.useQuery(
    { environment: "production" },
    { enabled: false }
  );

  // Jobber uses real per-client OAuth (jobberConnections table), not the generic
  // API-key connector — surface those here so each company connects/disconnects
  // individually, with the linked Jobber account name shown.
  const { data: jobberConns } = trpc.payroll.listJobberConnections.useQuery();
  const disconnectJobber = trpc.payroll.disconnectJobber.useMutation({
    onSuccess: () => utils.payroll.listJobberConnections.invalidate(),
  });

  // Google / Microsoft auth URLs
  const getGoogleAuthUrl = trpc.integration.getGoogleAuthUrl.useQuery(
    { accountLabel: accountLabel || "Google Account" },
    { enabled: false }
  );
  const getMicrosoftAuthUrl = trpc.integration.getMicrosoftAuthUrl.useQuery(
    { accountLabel: accountLabel || "Microsoft Account" },
    { enabled: false }
  );

  // Google Sync
  const syncGoogleGmail = trpc.googleSync.syncGmail.useMutation({
    onSuccess: () => { utils.email.list.invalidate(); alert("Gmail synced!"); }
  });
  const syncGoogleCalendar = trpc.googleSync.syncCalendar.useMutation({
    onSuccess: () => { utils.calendar.list.invalidate(); alert("Calendar synced!"); }
  });
  const syncGoogleTasks = trpc.googleSync.syncTasks.useMutation({
    onSuccess: () => { utils.task.list.invalidate(); alert("Tasks synced!"); }
  });

  // Microsoft Sync
  const syncMicrosoftOutlook = trpc.microsoftSync.syncOutlook.useMutation({
    onSuccess: () => { utils.email.list.invalidate(); alert("Outlook synced!"); }
  });
  const syncMicrosoftCalendar = trpc.microsoftSync.syncCalendar.useMutation({
    onSuccess: () => { utils.calendar.list.invalidate(); alert("Calendar synced!"); }
  });
  const syncMicrosoftTasks = trpc.microsoftSync.syncTasks.useMutation({
    onSuccess: () => { utils.task.list.invalidate(); alert("Tasks synced!"); }
  });

  // Per-client connectors
  const createConnector = trpc.connector.create.useMutation({
    onSuccess: () => {
      utils.connector.list.invalidate();
      utils.integration.list.invalidate();
      setAddProvider(null);
      setSelectedClient("");
      setPerClientApiKey("");
    }
  });
  const deleteConnector = trpc.connector.delete.useMutation({
    onSuccess: () => utils.connector.list.invalidate()
  });
  const pullStatements = trpc.connector.pullStatements.useMutation({
    onSuccess: () => utils.connector.list.invalidate()
  });

  const { data: connectorList } = trpc.connector.list.useQuery();
  const perClientGrouped = (connectorList || []).reduce((acc, account) => {
    const prov = account.provider;
    if (!acc[prov]) acc[prov] = [];
    acc[prov]!.push(account);
    return acc;
  }, {} as Record<string, typeof connectorList>);

  const handleConnect = async (provider: string) => {
    if (provider === "quickbooks") {
      const result = await getQboAuthUrl.refetch();
      const url = result.data?.url || "";
      if (url) window.location.href = url;
      setAddProvider(null);
      return;
    }

    // Jobber → real OAuth per client (sign into THAT company's Jobber account).
    if (provider === "jobber") {
      if (!selectedClient) return;
      window.location.href = `/api/jobber/connect?clientId=${selectedClient}`;
      return;
    }

    if (PER_CLIENT_PROVIDERS.includes(provider)) {
      // Per-client connector: call connector.create
      if (!selectedClient || !perClientApiKey.trim()) return;

      const client = clients?.find((c) => c.id.toString() === selectedClient);
      if (!client) return;

      createConnector.mutate({
        clientId: parseInt(selectedClient),
        provider: provider as typeof PER_CLIENT_PROVIDERS[number],
        accountLabel: `${client.name} — ${providers.find((p) => p.id === provider)?.name}`,
        apiKey: perClientApiKey,
      });
      return;
    }

    if (!accountLabel.trim()) return;

    let url = "";
    if (provider === "google") {
      const result = await getGoogleAuthUrl.refetch();
      url = result.data?.url || "";
    } else if (provider === "microsoft") {
      const result = await getMicrosoftAuthUrl.refetch();
      url = result.data?.url || "";
    }

    if (url) window.location.href = url;
    setAddProvider(null);
    setAccountLabel("");
  };

  const groupedAccounts = (accounts || []).reduce((acc, account) => {
    const prov = account.provider;
    if (!acc[prov]) acc[prov] = [];
    acc[prov]!.push(account);
    return acc;
  }, {} as Record<string, typeof accounts>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
          <p className="text-slate-500">Connect your email, calendar, cloud storage, accounting, and payment accounts</p>
        </div>
      </div>

      {/* Connected Accounts Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map((provider) => {
          // For QBO, use qboConnections
          const providerAccounts = provider.id === "quickbooks"
            ? (qboConnections || []).map(c => ({
                id: c.id,
                provider: "quickbooks" as const,
                accountLabel: c.companyName || `QBO Company ${c.realmId}`,
                accountEmail: c.companyEmail || null,
                isActive: c.isActive,
                syncEnabled: null,
                lastSyncedAt: c.lastSyncedAt,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
                reconnectReason: (c as any).reconnectReason ?? null,
                realmId: c.realmId,
                clientId: c.clientId,
              }))
            // Jobber: real per-client OAuth connections
            : provider.id === "jobber"
            ? (jobberConns || []).map((j) => ({
                id: j.id,
                provider: "jobber" as const,
                accountLabel: j.accountName ? `${j.clientName} — ${j.accountName}` : j.clientName,
                accountEmail: j.accountName || "(account name pending)",
                isActive: j.active,
                syncEnabled: null,
                lastSyncedAt: null,
                createdAt: null,
                updatedAt: null,
                reconnectReason: j.reconnectReason,
                clientId: j.clientId,
              }))
            // For per-client providers, use filtered connected accounts
            : PER_CLIENT_PROVIDERS.includes(provider.id)
            ? (perClientGrouped[provider.id] || [])
            : (groupedAccounts[provider.id] || []);

          const isConnected = providerAccounts.length > 0;

          return (
            <Card key={provider.id} className={cn(isConnected && "border-lime-200")}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm", provider.color)}>
                      {provider.icon}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                      <CardDescription className="text-xs">{provider.scopes.join(" · ")}</CardDescription>
                    </div>
                  </div>
                  {isConnected ? (
                    <Badge className="bg-lime-500"><CheckCircle className="h-3 w-3 mr-1" /> Connected</Badge>
                  ) : (
                    <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" /> Not Connected</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {providerAccounts.length > 0 ? (
                  <div className="space-y-3">
                    {providerAccounts.map((account) => (
                      <div key={account.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-2 h-2 rounded-full", account.isActive ? "bg-lime-500" : "bg-slate-300")} />
                          <div>
                            <p className="font-medium text-sm">{account.accountLabel}</p>
                            <p className="text-xs text-slate-500">{account.accountEmail || "No email"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {provider.id === "google" ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => syncGoogleGmail.mutate({ accountId: account.id, maxResults: 50 })} disabled={syncGoogleGmail.isPending}>
                                <Mail className="h-3 w-3 mr-1" /> {syncGoogleGmail.isPending ? "Syncing..." : "Gmail"}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => syncGoogleCalendar.mutate({ accountId: account.id })} disabled={syncGoogleCalendar.isPending}>
                                <CalendarDays className="h-3 w-3 mr-1" /> {syncGoogleCalendar.isPending ? "Syncing..." : "Calendar"}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => syncGoogleTasks.mutate({ accountId: account.id })} disabled={syncGoogleTasks.isPending}>
                                <CheckSquare className="h-3 w-3 mr-1" /> {syncGoogleTasks.isPending ? "Syncing..." : "Tasks"}
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteAccount.mutate({ id: account.id })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : provider.id === "microsoft" ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => syncMicrosoftOutlook.mutate({ accountId: account.id, maxResults: 50 })} disabled={syncMicrosoftOutlook.isPending}>
                                <Mail className="h-3 w-3 mr-1" /> {syncMicrosoftOutlook.isPending ? "Syncing..." : "Outlook"}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => syncMicrosoftCalendar.mutate({ accountId: account.id })} disabled={syncMicrosoftCalendar.isPending}>
                                <CalendarDays className="h-3 w-3 mr-1" /> {syncMicrosoftCalendar.isPending ? "Syncing..." : "Calendar"}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => syncMicrosoftTasks.mutate({ accountId: account.id })} disabled={syncMicrosoftTasks.isPending}>
                                <CheckSquare className="h-3 w-3 mr-1" /> {syncMicrosoftTasks.isPending ? "Syncing..." : "Tasks"}
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteAccount.mutate({ id: account.id })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : provider.id === "quickbooks" ? (
                            <>
                              {(account as any).reconnectReason ? (
                                <Button variant="ghost" size="sm" className="text-amber-600"
                                  title={`Reconnect needed: ${(account as any).reconnectReason}`}
                                  onClick={() => { window.location.href = `/api/qbo/connect${(account as any).clientId ? `?clientId=${(account as any).clientId}` : ""}`; }}>
                                  ⚠ Reconnect
                                </Button>
                              ) : null}
                              <Button variant="ghost" size="sm" onClick={() => syncQbo.mutate({ connectionId: account.id })} disabled={syncQbo.isPending}>
                                {syncQbo.isPending ? "Syncing..." : "Sync QBO"}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => toggleQbo.mutate({ id: account.id, active: !account.isActive })}>
                                {account.isActive ? "Pause" : "Resume"}
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteQbo.mutate({ id: account.id })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : provider.id === "jobber" ? (
                            <>
                              {(account as any).reconnectReason ? (
                                <Button variant="ghost" size="sm" className="text-amber-600"
                                  title={`Reconnect needed: ${(account as any).reconnectReason}`}
                                  onClick={() => { window.location.href = `/api/jobber/connect?clientId=${(account as any).clientId}`; }}>
                                  ⚠ Reconnect
                                </Button>
                              ) : null}
                              <Button variant="ghost" size="sm" className="text-red-500"
                                onClick={() => { if (confirm(`Disconnect ${account.accountLabel} from Jobber?`)) disconnectJobber.mutate({ clientId: (account as any).clientId }); }}>
                                Disconnect
                              </Button>
                            </>
                          ) : PER_CLIENT_PROVIDERS.includes(provider.id) ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => pullStatements.mutate({ connectionId: account.id })} disabled={pullStatements.isPending}>
                                {pullStatements.isPending ? "Pulling..." : "Pull Now"}
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteConnector.mutate({ id: account.id })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => toggleActive.mutate({ id: account.id, active: !account.isActive })}>
                                {account.isActive ? "Pause" : "Resume"}
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteAccount.mutate({ id: account.id })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <Dialog open={addProvider === provider.id} onOpenChange={(open) => { if (!open) setAddProvider(null); }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full" onClick={() => setAddProvider(provider.id)}>
                          <Plus className="h-4 w-4 mr-2" /> Add {provider.perClient ? "Client Connection" : "Account"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Connect {provider.name} {provider.perClient ? "for Client" : "Account"}</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                          {provider.perClient && (
                            <div className="space-y-2">
                              <Label>Select Client *</Label>
                              <Select value={selectedClient} onValueChange={setSelectedClient}>
                                <SelectTrigger><SelectValue placeholder="Choose client..." /></SelectTrigger>
                                <SelectContent>
                                  {connectClients.map((c) => (
                                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          {provider.id !== "quickbooks" && !provider.perClient && (
                            <div className="space-y-2">
                              <Label>Account Label *</Label>
                              <Input placeholder="e.g., Personal Gmail, Work Account" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} />
                            </div>
                          )}
                          {provider.id === "jobber" && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">If this company has its OWN separate Jobber login, sign out of Jobber (or use a private/incognito window) and sign into THAT account before connecting. If your companies SHARE one Jobber account, just connect each — hours stay separate by each company's employee list.</p>
                          )}
                          {provider.perClient && provider.id !== "jobber" && (
                            <div className="space-y-2">
                              <Label>API Key / Access Token *</Label>
                              <Input placeholder="Paste API key here..." value={perClientApiKey} onChange={(e) => setPerClientApiKey(e.target.value)} />
                              <p className="text-xs text-slate-500">This connects {provider.name} for monthly statement pulls. Key stored encrypted.</p>
                            </div>
                          )}
                          <Button
                            className="w-full"
                            onClick={() => handleConnect(provider.id)}
                            disabled={
                              provider.id === "quickbooks" ? false :
                              provider.id === "jobber" ? !selectedClient :
                              provider.perClient ? (!selectedClient || !perClientApiKey.trim()) :
                              !accountLabel.trim()
                            }
                          >
                            <Link2 className="h-4 w-4 mr-2" /> Connect {provider.name}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                ) : (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full" onClick={() => { setAddProvider(provider.id); }}>
                        <Link2 className="h-4 w-4 mr-2" /> Connect {provider.name}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Connect {provider.name} {provider.perClient ? "for Client" : "Account"}</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-4">
                        {provider.perClient && (
                          <div className="space-y-2">
                            <Label>Select Client *</Label>
                            <Select value={selectedClient} onValueChange={setSelectedClient}>
                              <SelectTrigger><SelectValue placeholder="Choose client..." /></SelectTrigger>
                              <SelectContent>
                                {connectClients.map((c) => (
                                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {provider.id !== "quickbooks" && !provider.perClient && (
                          <div className="space-y-2">
                            <Label>Account Label *</Label>
                            <Input placeholder="e.g., Personal Gmail, Work Account" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} />
                            <p className="text-xs text-slate-500">Give this account a name so you can identify it later</p>
                          </div>
                        )}
                        {provider.id === "jobber" && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">If this company has its OWN separate Jobber login, sign out of Jobber (or use a private/incognito window) and sign into THAT account before connecting. If your companies SHARE one Jobber account, just connect each — hours stay separate by each company's employee list.</p>
                        )}
                        {provider.perClient && provider.id !== "jobber" && (
                          <div className="space-y-2">
                            <Label>API Key / Access Token *</Label>
                            <Input placeholder="Paste API key here..." value={perClientApiKey} onChange={(e) => setPerClientApiKey(e.target.value)} />
                            <p className="text-xs text-slate-500">This connects {provider.name} for monthly statement pulls. Key stored encrypted.</p>
                          </div>
                        )}
                        {!provider.perClient && (
                          <div className="space-y-3">
                            <p className="text-sm font-medium">This will enable:</p>
                            <div className="flex flex-wrap gap-2">
                              {provider.scopes.map((scope) => (
                                <Badge key={scope} variant="outline" className="bg-slate-50">{scope}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <Button
                          className="w-full"
                          onClick={() => handleConnect(provider.id)}
                          disabled={
                            provider.id === "quickbooks" ? false :
                            provider.id === "jobber" ? !selectedClient :
                            provider.perClient ? (!selectedClient || !perClientApiKey.trim()) :
                            !accountLabel.trim()
                          }
                        >
                          <Link2 className="h-4 w-4 mr-2" /> Connect {provider.name}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sync Settings */}
      {accounts && accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-lime-500" /> Sync Settings</CardTitle>
            <CardDescription>Control what data syncs from each connected account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {accounts.filter(a => !PER_CLIENT_PROVIDERS.includes(a.provider)).map((account) => (
                <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded flex items-center justify-center text-white text-sm font-bold",
                      account.provider === "google" ? "bg-red-500" : account.provider === "microsoft" ? "bg-blue-600" : "bg-slate-500"
                    )}>
                      {account.provider === "google" ? "G" : account.provider === "microsoft" ? "M" : "?"}
                    </div>
                    <div>
                      <p className="font-medium">{account.accountLabel}</p>
                      <p className="text-xs text-slate-500">{account.provider}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <Switch checked={account.syncEnabled?.email ?? true} onCheckedChange={(v) => updateSync.mutate({ id: account.id, syncEnabled: { email: v, calendar: account.syncEnabled?.calendar ?? true, files: account.syncEnabled?.files ?? true, tasks: account.syncEnabled?.tasks ?? true } })} />
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-slate-400" />
                      <Switch checked={account.syncEnabled?.calendar ?? true} onCheckedChange={(v) => updateSync.mutate({ id: account.id, syncEnabled: { email: account.syncEnabled?.email ?? true, calendar: v, files: account.syncEnabled?.files ?? true, tasks: account.syncEnabled?.tasks ?? true } })} />
                    </div>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-slate-400" />
                      <Switch checked={account.syncEnabled?.files ?? true} onCheckedChange={(v) => updateSync.mutate({ id: account.id, syncEnabled: { email: account.syncEnabled?.email ?? true, calendar: account.syncEnabled?.calendar ?? true, files: v, tasks: account.syncEnabled?.tasks ?? true } })} />
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-slate-400" />
                      <Switch checked={account.syncEnabled?.tasks ?? true} onCheckedChange={(v) => updateSync.mutate({ id: account.id, syncEnabled: { email: account.syncEnabled?.email ?? true, calendar: account.syncEnabled?.calendar ?? true, files: account.syncEnabled?.files ?? true, tasks: v } })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Client Connectors Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-lime-500" /> Per-Client Connectors</CardTitle>
          <CardDescription>Payment and banking integrations connected per client for monthly statement pulls</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {PER_CLIENT_PROVIDERS.map((provId) => {
              const prov = providers.find(p => p.id === provId)!;
              const connections = perClientGrouped[provId] || [];
              return (
                <div key={provId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold", prov.color)}>
                      {prov.icon}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{prov.name}</p>
                      <p className="text-xs text-slate-500">{connections.length} client{connections.length !== 1 ? "s" : ""} connected</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {connections.map((conn) => (
                      <Badge key={conn.id} variant="outline" className="text-xs">
                        {conn.accountLabel}
                      </Badge>
                    ))}
                    {connections.length === 0 && (
                      <span className="text-xs text-slate-400">No connections</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
