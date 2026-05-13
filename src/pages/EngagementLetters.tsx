import { useState } from "react";
import { ScrollText, Plus, Send, CheckCircle, Clock, FileText, Pencil, Trash2, X, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

const TEMPLATES: Record<string, string> = {
  standard: `ENGAGEMENT LETTER — BOOKKEEPING SERVICES

Dear {{clientName}},

This letter confirms the terms of our engagement to provide bookkeeping services for {{companyName}}.

SERVICES INCLUDED:
• Monthly bank reconciliation
• Accounts payable and receivable management
• GST/HST preparation and filing
• Payroll processing and remittance
• Monthly financial statements
• Year-end preparation for accountant

FEES:
Monthly fee: \${{monthlyFee}}
{{hourlyRate}}

TERM:
This engagement begins on {{termStart}} and continues until {{termEnd}}.
{{autoRenew}}

CONFIDENTIALITY:
All client information is held in strict confidence. Data is stored in our secure CRM with role-based access control.

TERMINATION:
Either party may terminate with {{renewalNoticeDays}} days written notice.

GOVERNING LAW:
{{governingLaw}}

JURISDICTION:
{{jurisdiction}}

Please sign and return a copy of this letter to confirm acceptance.

Sincerely,
Go Fig Bookz
`,
  cleanup: `ENGAGEMENT LETTER — CLEANUP PROJECT

Dear {{clientName}},

This letter confirms our engagement to perform a one-time bookkeeping cleanup for {{companyName}}.

SCOPE:
• Reconcile all bank and credit card accounts
• Categorize and code all historical transactions
• Identify and resolve discrepancies
• File any outstanding returns
• Set up ongoing bookkeeping systems

FEES:
Fixed fee: \${{retainerAmount}} (estimated based on scope)

TIMELINE:
Estimated completion: {{termEnd}}

...`,
  payroll: `ENGAGEMENT LETTER — PAYROLL SERVICES ONLY

Dear {{clientName}},

This letter confirms our engagement to provide payroll services for {{companyName}}.

SERVICES:
• Biweekly/semimonthly payroll processing
• Direct deposit setup and management
• CRA remittances (CPP, EI, income tax)
• T4 and T4A preparation
• ROE preparation when required
• Employee onboarding and termination paperwork

FEES:
Base fee: \${{monthlyFee}}
Per employee: $25/pay run

...`,
};

export default function EngagementLetters() {
  const { can } = useAuth();
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("standard");
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: clients } = trpc.crmClient.list.useQuery();
  const { data: letters } = trpc.engagementLetter.list.useQuery(
    selectedClient ? { clientId: selectedClient } : undefined,
    { enabled: !!selectedClient || !selectedClient }
  );

  const create = trpc.engagementLetter.create.useMutation({
    onSuccess: () => { utils.engagementLetter.list.invalidate(); setShowCreate(false); setForm({}); }
  });
  const sendLetter = trpc.engagementLetter.send.useMutation({ onSuccess: () => utils.engagementLetter.list.invalidate() });
  const markSigned = trpc.engagementLetter.markSigned.useMutation({ onSuccess: () => utils.engagementLetter.list.invalidate() });
  const del = trpc.engagementLetter.delete.useMutation({ onSuccess: () => utils.engagementLetter.list.invalidate() });

  const utils = trpc.useUtils();

  const generateContent = () => {
    const client = clients?.find(c => c.id === selectedClient);
    let content = TEMPLATES[selectedTemplate] || TEMPLATES.standard;
    content = content
      .replace(/{clientName}/g, client?.name || "Client")
      .replace(/{companyName}/g, client?.company || client?.name || "Company")
      .replace(/{monthlyFee}/g, form.monthlyFee || "0")
      .replace(/{hourlyRate}/g, form.hourlyRate ? `Hourly rate: $${form.hourlyRate}/hr for additional services` : "")
      .replace(/{retainerAmount}/g, form.retainerAmount || "0")
      .replace(/{termStart}/g, form.termStart || "[Date]")
      .replace(/{termEnd}/g, form.termEnd || "[Date]")
      .replace(/{autoRenew}/g, form.autoRenew === "true" ? "This agreement will auto-renew annually unless notice is given." : "This agreement does not auto-renew.")
      .replace(/{renewalNoticeDays}/g, form.renewalNoticeDays || "30")
      .replace(/{governingLaw}/g, form.governingLaw || "Laws of the Province of Ontario and the federal laws of Canada")
      .replace(/{jurisdiction}/g, form.jurisdiction || "Ontario, Canada");
    return content;
  };

  const handleCreate = () => {
    if (!selectedClient) return;
    create.mutate({
      clientId: selectedClient,
      templateName: selectedTemplate,
      title: form.title || "Engagement Letter",
      content: generateContent(),
      monthlyFee: form.monthlyFee ? parseFloat(form.monthlyFee) : undefined,
      hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : undefined,
      retainerAmount: form.retainerAmount ? parseFloat(form.retainerAmount) : undefined,
      servicesIncluded: form.servicesIncluded,
      servicesExcluded: form.servicesExcluded,
      termStart: form.termStart ? new Date(form.termStart) : undefined,
      termEnd: form.termEnd ? new Date(form.termEnd) : undefined,
      autoRenew: form.autoRenew === "true",
      renewalNoticeDays: form.renewalNoticeDays ? parseInt(form.renewalNoticeDays) : undefined,
      jurisdiction: form.jurisdiction,
      governingLaw: form.governingLaw,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-lime-500" />
            Engagement Letters
          </h1>
          <p className="text-slate-500">Create, send, and track client engagement letters</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Client</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedClient?.toString() || ""} onValueChange={(v) => { setSelectedClient(Number(v)); setShowCreate(false); }}>
            <SelectTrigger><SelectValue placeholder="Choose a client..." /></SelectTrigger>
            <SelectContent className="max-h-72">
              {clients?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name} — {c.company || "No company"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedClient && can.senior && (
        <Button className="bg-lime-500" onClick={() => { setShowCreate(true); setEditingId(null); setForm({}); }}>
          <Plus className="h-4 w-4 mr-1" /> Create New Engagement Letter
        </Button>
      )}

      {showCreate && can.senior && (
        <Card className="border-lime-300">
          <CardHeader>
            <CardTitle>Create Engagement Letter</CardTitle>
            <CardDescription>Select a template and customize the terms</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard Bookkeeping</SelectItem>
                    <SelectItem value="cleanup">Clean-Up Project</SelectItem>
                    <SelectItem value="payroll">Payroll Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Letter Title</Label><Input value={form.title || ""} onChange={e => setForm({...form, title: e.target.value})} placeholder="Engagement Letter — Bookkeeping Services" /></div>
              <div className="space-y-2"><Label>Monthly Fee ($)</Label><Input type="number" value={form.monthlyFee || ""} onChange={e => setForm({...form, monthlyFee: e.target.value})} /></div>
              <div className="space-y-2"><Label>Hourly Rate ($)</Label><Input type="number" value={form.hourlyRate || ""} onChange={e => setForm({...form, hourlyRate: e.target.value})} /></div>
              <div className="space-y-2"><Label>Retainer Amount ($)</Label><Input type="number" value={form.retainerAmount || ""} onChange={e => setForm({...form, retainerAmount: e.target.value})} /></div>
              <div className="space-y-2"><Label>Term Start</Label><Input type="date" value={form.termStart || ""} onChange={e => setForm({...form, termStart: e.target.value})} /></div>
              <div className="space-y-2"><Label>Term End</Label><Input type="date" value={form.termEnd || ""} onChange={e => setForm({...form, termEnd: e.target.value})} /></div>
              <div className="space-y-2">
                <Label>Auto Renew?</Label>
                <Select value={form.autoRenew || "true"} onValueChange={v => setForm({...form, autoRenew: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Renewal Notice (days)</Label><Input type="number" value={form.renewalNoticeDays || "30"} onChange={e => setForm({...form, renewalNoticeDays: e.target.value})} /></div>
            </div>
            <div className="space-y-2"><Label>Services Included</Label><Textarea value={form.servicesIncluded || ""} onChange={e => setForm({...form, servicesIncluded: e.target.value})} placeholder="List all services included in this engagement..." rows={3} /></div>
            <div className="space-y-2"><Label>Services Excluded</Label><Textarea value={form.servicesExcluded || ""} onChange={e => setForm({...form, servicesExcluded: e.target.value})} placeholder="List services NOT included (e.g., tax preparation, legal advice)..." rows={2} /></div>
            <div className="bg-slate-50 rounded-lg p-4">
              <Label className="mb-2 block">Preview</Label>
              <pre className="text-xs text-slate-600 whitespace-pre-wrap max-h-48 overflow-auto">{generateContent()}</pre>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} className="bg-lime-500"><Save className="h-4 w-4 mr-1" /> Save Draft</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {letters && letters.length > 0 && (
        <div className="space-y-3">
          {letters.map((letter) => {
            const client = clients?.find(c => c.id === letter.clientId);
            return (
              <Card key={letter.id}>
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{letter.title}</p>
                      <Badge className={
                        letter.status === "signed" ? "bg-emerald-500" :
                        letter.status === "sent" ? "bg-blue-500" :
                        letter.status === "viewed" ? "bg-purple-500" :
                        "bg-slate-400"
                      }>
                        {letter.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">{client?.name || "Unknown Client"} • {letter.monthlyFee ? `$${letter.monthlyFee}/mo` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {letter.status === "draft" && can.senior && (
                      <Button size="sm" className="bg-lime-500" onClick={() => sendLetter.mutate({ id: letter.id })}>
                        <Send className="h-3 w-3 mr-1" /> Send
                      </Button>
                    )}
                    {letter.status === "sent" && can.senior && (
                      <Button size="sm" variant="outline" onClick={() => {
                        const name = prompt("Signed by (name):");
                        if (name) markSigned.mutate({ id: letter.id, signedBy: name });
                      }}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Mark Signed
                      </Button>
                    )}
                    {can.senior && (
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => del.mutate({ id: letter.id })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                {letter.sentAt && (
                  <CardContent className="border-t pt-3 text-xs text-slate-500">
                    Sent: {format(new Date(letter.sentAt), "MMM d, yyyy")}
                    {letter.signedAt && ` • Signed: ${format(new Date(letter.signedAt), "MMM d, yyyy")} by ${letter.signedBy}`}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
