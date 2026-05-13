import { useState } from "react";
import { Shield, Lock, Eye, EyeOff, Save, ChevronDown, ChevronUp, Building2, CreditCard, Laptop, Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function ClientVault() {
  const { can } = useAuth();
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>("banking");

  const { data: clients } = trpc.crmClient.list.useQuery();
  const { data: vaultData } = trpc.vault.getByClient.useQuery(
    { clientId: selectedClient! },
    { enabled: !!selectedClient }
  );
  const { data: govRepData } = trpc.govRep.getByClient.useQuery(
    { clientId: selectedClient! },
    { enabled: !!selectedClient }
  );

  const upsertVault = trpc.vault.upsert.useMutation({
    onSuccess: () => utils.vault.getByClient.invalidate({ clientId: selectedClient! }),
  });
  const upsertGovRep = trpc.govRep.upsert.useMutation({
    onSuccess: () => utils.govRep.getByClient.invalidate({ clientId: selectedClient! }),
  });

  const utils = trpc.useUtils();

  const [form, setForm] = useState<Record<string, string>>({});

  const handleSaveVault = () => {
    if (!selectedClient) return;
    upsertVault.mutate({
      clientId: selectedClient,
      ...form,
    });
  };

  const sections = [
    {
      id: "banking",
      label: "Banking",
      icon: Building2,
      fields: [
        { key: "bankName", label: "Bank Name" },
        { key: "bankAccountNumber", label: "Account Number" },
        { key: "bankRoutingNumber", label: "Routing Number" },
        { key: "bankTransitNumber", label: "Transit Number" },
        { key: "bankBranch", label: "Branch" },
        { key: "bankLogin", label: "Online Login" },
        { key: "bankPassword", label: "Online Password", password: true },
      ],
    },
    {
      id: "cards",
      label: "Credit Cards",
      icon: CreditCard,
      fields: [
        { key: "creditCardNumber", label: "Card Number" },
        { key: "creditCardExpiry", label: "Expiry" },
        { key: "creditCardCvv", label: "CVV", password: true },
      ],
    },
    {
      id: "software",
      label: "Software Logins",
      icon: Laptop,
      fields: [
        { key: "qboLogin", label: "QuickBooks Login" },
        { key: "qboPassword", label: "QuickBooks Password", password: true },
        { key: "xeroLogin", label: "Xero Login" },
        { key: "xeroPassword", label: "Xero Password", password: true },
        { key: "waveLogin", label: "Wave Login" },
        { key: "wavePassword", label: "Wave Password", password: true },
        { key: "freshbooksLogin", label: "FreshBooks Login" },
        { key: "freshbooksPassword", label: "FreshBooks Password", password: true },
      ],
    },
    {
      id: "cra",
      label: "CRA / IRS",
      icon: Landmark,
      fields: [
        { key: "craMyAccountLogin", label: "CRA My Account Login" },
        { key: "craMyAccountPassword", label: "CRA My Account Password", password: true },
        { key: "craRepId", label: "CRA Rep ID" },
        { key: "irsLogin", label: "IRS Login" },
        { key: "irsPassword", label: "IRS Password", password: true },
        { key: "irsCafNumber", label: "IRS CAF Number" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-lime-500" />
            Client Confidential Vault
          </h1>
          <p className="text-slate-500">Secure storage for bank accounts, passwords, and government access</p>
        </div>
        <Badge variant="outline" className="bg-amber-50 text-amber-700">
          <Lock className="h-3 w-3 mr-1" />
          {can.senior ? "Full Access" : "Masked View"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Client</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedClient?.toString() || ""} onValueChange={(v) => setSelectedClient(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a client..." />
            </SelectTrigger>
            <SelectContent>
              {clients?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name} — {c.company || "No company"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedClient && (
        <>
          {sections.map((section) => {
            const Icon = section.icon;
            const isOpen = expandedSection === section.id;
            return (
              <Card key={section.id}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => setExpandedSection(isOpen ? null : section.id)}
                >
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Icon className="h-5 w-5 text-lime-500" />
                    {section.label}
                    {isOpen ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
                  </CardTitle>
                </CardHeader>
                {isOpen && (
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {section.fields.map((field) => (
                        <div key={field.key} className="space-y-2">
                          <Label>{field.label}</Label>
                          <div className="relative">
                            <Input
                              type={field.password && !showPasswords ? "password" : "text"}
                              value={form[field.key] || (vaultData?.[field.key as keyof typeof vaultData] as string) || ""}
                              onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                              placeholder={field.password ? "••••••" : "Enter value..."}
                              className={cn(field.password && "pr-10")}
                            />
                            {field.password && (
                              <button
                                type="button"
                                onClick={() => setShowPasswords(!showPasswords)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              >
                                {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}

          <Card>
            <CardHeader>
              <CardTitle>Government Representatives</CardTitle>
              <CardDescription>CRA and IRS representative authorization details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CRA Rep Name</Label>
                  <Input value={form.craRepName || govRepData?.craRepName || ""} onChange={(e) => setForm({ ...form, craRepName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>CRA Rep Number</Label>
                  <Input value={form.craRepNumber || govRepData?.craRepNumber || ""} onChange={(e) => setForm({ ...form, craRepNumber: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>CRA Rep Phone</Label>
                  <Input value={form.craRepPhone || govRepData?.craRepPhone || ""} onChange={(e) => setForm({ ...form, craRepPhone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>CRA Rep Email</Label>
                  <Input value={form.craRepEmail || govRepData?.craRepEmail || ""} onChange={(e) => setForm({ ...form, craRepEmail: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>IRS Rep Name</Label>
                  <Input value={form.irsRepName || govRepData?.irsRepName || ""} onChange={(e) => setForm({ ...form, irsRepName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>IRS PTIN</Label>
                  <Input value={form.irsRepPtin || govRepData?.irsRepPtin || ""} onChange={(e) => setForm({ ...form, irsRepPtin: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>IRS CAF Number</Label>
                  <Input value={form.irsCafNumber || vaultData?.irsCafNumber || ""} onChange={(e) => setForm({ ...form, irsCafNumber: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>IRS Rep Type</Label>
                  <Select value={form.irsRepType || govRepData?.irsRepType || ""} onValueChange={(v) => setForm({ ...form, irsRepType: v })}>
                    <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="attorney">Attorney</SelectItem>
                      <SelectItem value="cpa">CPA</SelectItem>
                      <SelectItem value="enrolled_agent">Enrolled Agent</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vault Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.vaultNotes || vaultData?.vaultNotes || ""}
                onChange={(e) => setForm({ ...form, vaultNotes: e.target.value })}
                placeholder="Any additional confidential notes..."
                rows={4}
              />
            </CardContent>
          </Card>

          {can.senior && (
            <div className="flex gap-3">
              <Button onClick={handleSaveVault} className="bg-lime-500">
                <Save className="h-4 w-4 mr-2" /> Save Vault Data
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  upsertGovRep.mutate({
                    clientId: selectedClient,
                    craRepName: form.craRepName || govRepData?.craRepName,
                    craRepNumber: form.craRepNumber || govRepData?.craRepNumber,
                    craRepPhone: form.craRepPhone || govRepData?.craRepPhone,
                    craRepEmail: form.craRepEmail || govRepData?.craRepEmail,
                    irsRepName: form.irsRepName || govRepData?.irsRepName,
                    irsRepPtin: form.irsRepPtin || govRepData?.irsRepPtin,
                    irsRepType: (form.irsRepType || govRepData?.irsRepType) as any,
                  });
                }}
              >
                <Save className="h-4 w-4 mr-2" /> Save Gov Rep
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
