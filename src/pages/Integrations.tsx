import { useState } from "react";
import { Link2, Plus, Trash2, CheckCircle, XCircle, RefreshCw, Mail, CalendarDays, FolderOpen, CheckSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";

const providers = [
  { id: "google", name: "Google", icon: "G", color: "bg-red-500", scopes: ["Gmail", "Calendar", "Drive", "Tasks"] },
  { id: "microsoft", name: "Microsoft", icon: "M", color: "bg-blue-600", scopes: ["Outlook", "Calendar", "OneDrive", "Tasks"] },
  { id: "dropbox", name: "Dropbox", icon: "D", color: "bg-blue-400", scopes: ["Files"] },
  { id: "icloud", name: "iCloud", icon: "i", color: "bg-slate-600", scopes: ["Files"] },
];

export default function Integrations() {
  const utils = trpc.useUtils();
  const { data: accounts } = trpc.integration.list.useQuery();
  const deleteAccount = trpc.integration.delete.useMutation({ onSuccess: () => utils.integration.list.invalidate() });
  const toggleActive = trpc.integration.toggleActive.useMutation({ onSuccess: () => utils.integration.list.invalidate() });
  const updateSync = trpc.integration.updateSync.useMutation({ onSuccess: () => utils.integration.list.invalidate() });
  // Label update available via API

  const [addProvider, setAddProvider] = useState<string | null>(null);
  const [accountLabel, setAccountLabel] = useState("");

  const getGoogleAuthUrl = trpc.integration.getGoogleAuthUrl.useQuery(
    { accountLabel: accountLabel || "Google Account" },
    { enabled: false }
  );
  const getMicrosoftAuthUrl = trpc.integration.getMicrosoftAuthUrl.useQuery(
    { accountLabel: accountLabel || "Microsoft Account" },
    { enabled: false }
  );

  const handleConnect = async (provider: string) => {
    if (!accountLabel.trim()) return;
    
    let url = "";
    if (provider === "google") {
      const result = await getGoogleAuthUrl.refetch();
      url = result.data?.url || "";
    } else if (provider === "microsoft") {
      const result = await getMicrosoftAuthUrl.refetch();
      url = result.data?.url || "";
    }
    
    if (url) {
      window.location.href = url;
    }
    
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
          <p className="text-slate-500">Connect your email, calendar, and cloud storage accounts</p>
        </div>
      </div>

      {/* Connected Accounts Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map((provider) => {
          const providerAccounts = groupedAccounts[provider.id] || [];
          const isConnected = providerAccounts.length > 0;
          
          return (
            <Card key={provider.id} className={cn(isConnected && "border-lime-200")}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold", provider.color)}>
                      {provider.icon}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                      <CardDescription>{provider.scopes.join(" + ")}</CardDescription>
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
                          <Button variant="ghost" size="sm" onClick={() => toggleActive.mutate({ id: account.id, active: !account.isActive })}>
                            {account.isActive ? "Pause" : "Resume"}
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteAccount.mutate({ id: account.id })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Dialog open={addProvider === provider.id} onOpenChange={(open) => { if (!open) setAddProvider(null); }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full" onClick={() => setAddProvider(provider.id)}>
                          <Plus className="h-4 w-4 mr-2" /> Add Another {provider.name} Account
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Connect {provider.name} Account</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Account Label *</Label>
                            <Input placeholder="e.g., Personal Gmail, Work Account" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} />
                          </div>
                          <Button className="w-full" onClick={() => handleConnect(provider.id)} disabled={!accountLabel.trim()}>
                            <Link2 className="h-4 w-4 mr-2" /> Connect Account
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
                      <DialogHeader><DialogTitle>Connect {provider.name} Account</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Account Label *</Label>
                          <Input placeholder="e.g., Personal Gmail, Work Account" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} />
                          <p className="text-xs text-slate-500">Give this account a name so you can identify it later</p>
                        </div>
                        <div className="space-y-3">
                          <p className="text-sm font-medium">This will enable:</p>
                          <div className="flex flex-wrap gap-2">
                            {provider.scopes.map((scope) => (
                              <Badge key={scope} variant="outline" className="bg-slate-50">{scope}</Badge>
                            ))}
                          </div>
                        </div>
                        <Button className="w-full" onClick={() => handleConnect(provider.id)} disabled={!accountLabel.trim()}>
                          <Link2 className="h-4 w-4 mr-2" /> Connect Account
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
              {accounts.map((account) => (
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
    </div>
  );
}
