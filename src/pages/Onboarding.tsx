import { useState } from "react";
import { FileText, Send, CheckCircle, Clock, Link2, UserCheck, Building2, Receipt, Users, Plus, Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { toast } from "sonner";

export default function Onboarding() {
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [assignTo, setAssignTo] = useState<string>("");
  const [showIntake, setShowIntake] = useState(false);

  const { data: clients, refetch: refetchClients } = trpc.crmClient.list.useQuery();
  const { data: submissions } = trpc.onboarding.list.useQuery();
  const { data: staffList } = trpc.user.list.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();

  const createOnboarding = trpc.onboarding.create.useMutation({
    onSuccess: (data) => {
      setGeneratedLink(data.url);
      utils.onboarding.list.invalidate();
    },
  });
  const review = trpc.onboarding.review.useMutation({
    onSuccess: () => {
      utils.onboarding.list.invalidate();
      setReviewingId(null);
      setAssignTo("");
    },
  });
  const createClient = trpc.crmClient.create.useMutation({
    onSuccess: () => {
      refetchClients();
      toast.success("Client created");
    },
  });
  const submitIntake = trpc.onboarding.staffSubmit.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Client intake complete — tasks generated");
      setShowIntake(false);
      resetIntakeForm();
      refetchClients();
      utils.onboarding.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const reviewingSubmission = submissions?.find(s => s.id === reviewingId);
  const reviewingClient = clients?.find(c => c.id === reviewingSubmission?.clientId);

  // ─── Staff Intake Form State ───
  const [intake, setIntake] = useState({
    name: "", email: "", phone: "", company: "", address: "",
    industry: "other", province: "ON", qboAccountType: "ca_clients" as "ca_clients" | "us_clients",
    contactName: "", notes: "",
    businessLegalName: "", businessOperatingName: "", businessStructure: "corporation",
    incorporationDate: "", businessNumber: "", hstGstNumber: "",
    payrollAccountNumber: "", wsibAccountNumber: "",
    primaryContactName: "", primaryContactEmail: "", primaryContactPhone: "",
    bankName: "", bankAccountNumber: "", bankRoutingNumber: "",
    fiscalYearEnd: "December 31", lastFiledYear: "", outstandingFilings: "",
    hstGstFrequency: "none" as "monthly" | "quarterly" | "annually" | "none",
    payrollFrequency: "none" as "weekly" | "biweekly" | "semi_monthly" | "monthly" | "none",
    hasEmployees: false, hasSubcontractors: false, hasInvestments: false,
    wsibRequired: false, paysDividends: false, bankAccountCount: 1, creditCardCount: 0,
    needsYearEnd: true, usesStripe: false, usesSquare: false, usesJobber: false, usesTouchBistro: false,
    usesHubdoc: false, hasJobCosting: false, avgMonthlyTransactions: 0,
    hasEHT: false, employeeCount: 0, monthsBehind: 0,
    payrollRemitterFreq: "regular" as "regular" | "quarterly" | "accelerated",
    bookkeepingFrequency: "monthly" as "monthly" | "quarterly" | "annual" | "none",
    invoicingResponsibility: "none" as "we_invoice" | "client_invoices" | "none",
    billPayResponsibility: "none" as "we_pay" | "client_pays" | "none",
    salesEntryFrequency: "none" as "daily" | "weekly" | "monthly" | "none",
    currentAccountingSoftware: "", currentPayrollProvider: "",
    servicesNeeded: "", painPoints: "", expectations: "",
  });

  const resetIntakeForm = () => setIntake({
    name: "", email: "", phone: "", company: "", address: "",
    industry: "other", province: "ON", qboAccountType: "ca_clients",
    contactName: "", notes: "",
    businessLegalName: "", businessOperatingName: "", businessStructure: "corporation",
    incorporationDate: "", businessNumber: "", hstGstNumber: "",
    payrollAccountNumber: "", wsibAccountNumber: "",
    primaryContactName: "", primaryContactEmail: "", primaryContactPhone: "",
    bankName: "", bankAccountNumber: "", bankRoutingNumber: "",
    fiscalYearEnd: "December 31", lastFiledYear: "", outstandingFilings: "",
    hstGstFrequency: "none", payrollFrequency: "none",
    hasEmployees: false, hasSubcontractors: false, hasInvestments: false,
    wsibRequired: false, paysDividends: false, bankAccountCount: 1, creditCardCount: 0,
    needsYearEnd: true, usesStripe: false, usesSquare: false, usesJobber: false, usesTouchBistro: false,
    usesHubdoc: false, hasJobCosting: false, avgMonthlyTransactions: 0,
    hasEHT: false, employeeCount: 0, monthsBehind: 0,
    payrollRemitterFreq: "regular" as "regular" | "quarterly" | "accelerated",
    bookkeepingFrequency: "monthly" as "monthly" | "quarterly" | "annual" | "none",
    invoicingResponsibility: "none" as "we_invoice" | "client_invoices" | "none",
    billPayResponsibility: "none" as "we_pay" | "client_pays" | "none",
    salesEntryFrequency: "none",
    currentAccountingSoftware: "", currentPayrollProvider: "",
    servicesNeeded: "", painPoints: "", expectations: "",
  });

  const handleIntakeSubmit = () => {
    if (!intake.name || !intake.email) {
      toast.error("Client name and email are required");
      return;
    }
    submitIntake.mutate(intake);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="h-6 w-6 text-lime-500" />
          Client Onboarding
        </h1>
        <p className="text-slate-500">Fill out intake forms after discovery calls and review client submissions</p>
      </div>

      {/* NEW: Staff Intake Form */}
      <Card className="border-l-4 border-l-lime-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-lime-500" />
            New Client Intake
          </CardTitle>
          <CardDescription>
            Fill this out after a discovery call. It creates the client record and auto-generates all recurring tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showIntake ? (
            <Button onClick={() => setShowIntake(true)} className="bg-lime-500">
              <Plus className="h-4 w-4 mr-2" /> Start Intake
            </Button>
          ) : (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Client Name *</Label>
                  <Input value={intake.name} onChange={e => setIntake({...intake, name: e.target.value})} placeholder="Acme Inc." />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input value={intake.email} onChange={e => setIntake({...intake, email: e.target.value})} placeholder="contact@acme.com" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={intake.phone} onChange={e => setIntake({...intake, phone: e.target.value})} placeholder="(416) 555-1234" />
                </div>
                <div className="space-y-2">
                  <Label>Company / Operating Name</Label>
                  <Input value={intake.company} onChange={e => setIntake({...intake, company: e.target.value})} placeholder="Acme Corporation" />
                </div>
                <div className="space-y-2">
                  <Label>Contact Person</Label>
                  <Input value={intake.contactName} onChange={e => setIntake({...intake, contactName: e.target.value})} placeholder="John Smith" />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={intake.address} onChange={e => setIntake({...intake, address: e.target.value})} placeholder="123 Main St, Toronto, ON" />
                </div>
              </div>

              {/* Business Structure */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Business Structure</Label>
                  <Select value={intake.businessStructure} onValueChange={v => setIntake({...intake, businessStructure: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sole_proprietorship">Sole Proprietorship</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="corporation">Corporation</SelectItem>
                      <SelectItem value="llc">LLC (US)</SelectItem>
                      <SelectItem value="nonprofit">Non-Profit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Incorporation Date</Label>
                  <Input type="date" value={intake.incorporationDate} onChange={e => setIntake({...intake, incorporationDate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Business Number / EIN</Label>
                  <Input value={intake.businessNumber} onChange={e => setIntake({...intake, businessNumber: e.target.value})} placeholder="123456789RC0001" />
                </div>
                <div className="space-y-2">
                  <Label>Fiscal Year End</Label>
                  <Input value={intake.fiscalYearEnd} onChange={e => setIntake({...intake, fiscalYearEnd: e.target.value})} placeholder="December 31" />
                </div>
              </div>

              {/* Tax & Compliance */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-slate-700 flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> Tax & Compliance
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>HST/GST Number</Label>
                    <Input value={intake.hstGstNumber} onChange={e => setIntake({...intake, hstGstNumber: e.target.value})} placeholder="123456789RT0001" />
                  </div>
                  <div className="space-y-2">
                    <Label>Payroll Account Number</Label>
                    <Input value={intake.payrollAccountNumber} onChange={e => setIntake({...intake, payrollAccountNumber: e.target.value})} placeholder="123456789RP0001" />
                  </div>
                  <div className="space-y-2">
                    <Label>WSIB Account Number</Label>
                    <Input value={intake.wsibAccountNumber} onChange={e => setIntake({...intake, wsibAccountNumber: e.target.value})} placeholder="1234567" />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Filed Year</Label>
                    <Input value={intake.lastFiledYear} onChange={e => setIntake({...intake, lastFiledYear: e.target.value})} placeholder="2024" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.hasEmployees} onCheckedChange={v => setIntake({...intake, hasEmployees: !!v})} />
                    <span className="text-sm">Has Employees</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.hasSubcontractors} onCheckedChange={v => setIntake({...intake, hasSubcontractors: !!v})} />
                    <span className="text-sm">Has Subcontractors</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.hasInvestments} onCheckedChange={v => setIntake({...intake, hasInvestments: !!v})} />
                    <span className="text-sm">Has Investments (T5)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.paysDividends} onCheckedChange={v => setIntake({...intake, paysDividends: !!v})} />
                    <span className="text-sm">Pays Dividends (T5)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.wsibRequired} onCheckedChange={v => setIntake({...intake, wsibRequired: !!v})} />
                    <span className="text-sm">WSIB Required</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.hasEHT} onCheckedChange={v => setIntake({...intake, hasEHT: !!v})} />
                    <span className="text-sm">EHT (Ontario)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.needsYearEnd} onCheckedChange={v => setIntake({...intake, needsYearEnd: !!v})} />
                    <span className="text-sm">Needs Year-End</span>
                  </label>
                </div>
              </div>

              {/* Accounts (how many to reconcile — not the account numbers) */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-slate-700">Accounts to Reconcile</h3>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <div className="space-y-2">
                    <Label># of Bank Accounts</Label>
                    <Input type="number" min="0" value={intake.bankAccountCount} onChange={e => setIntake({...intake, bankAccountCount: parseInt(e.target.value) || 0})} />
                  </div>
                  <div className="space-y-2">
                    <Label># of Credit Cards</Label>
                    <Input type="number" min="0" value={intake.creditCardCount} onChange={e => setIntake({...intake, creditCardCount: parseInt(e.target.value) || 0})} />
                  </div>
                </div>
              </div>

              {/* Sales Platforms */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-slate-700">Sales Entry Platforms</h3>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.usesStripe} onCheckedChange={v => setIntake({...intake, usesStripe: !!v})} />
                    <span className="text-sm">Stripe</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.usesSquare} onCheckedChange={v => setIntake({...intake, usesSquare: !!v})} />
                    <span className="text-sm">Square</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.usesJobber} onCheckedChange={v => setIntake({...intake, usesJobber: !!v})} />
                    <span className="text-sm">Jobber</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.usesTouchBistro} onCheckedChange={v => setIntake({...intake, usesTouchBistro: !!v})} />
                    <span className="text-sm">TouchBistro</span>
                  </label>
                </div>
                {((intake.usesStripe || intake.usesSquare || intake.usesJobber || intake.usesTouchBistro)) && (
                  <div className="space-y-2 w-48">
                    <Label>Sales Entry Frequency</Label>
                    <Select value={intake.salesEntryFrequency} onValueChange={(v: any) => setIntake({...intake, salesEntryFrequency: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Scope & Responsibilities — drives the quote */}
              <div className="bg-lime-50 rounded-lg p-4 space-y-4 border border-lime-200">
                <h3 className="font-medium text-slate-700">Scope &amp; Responsibilities <span className="text-xs font-normal text-slate-500">(drives the quote)</span></h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Bookkeeping Frequency</Label>
                    <Select value={intake.bookkeepingFrequency} onValueChange={(v: any) => setIntake({...intake, bookkeepingFrequency: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>HST Filing Frequency</Label>
                    <Select value={intake.hstGstFrequency} onValueChange={(v: any) => setIntake({...intake, hstGstFrequency: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None / Not Registered</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="annually">Annually</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Payroll Frequency</Label>
                    <Select value={intake.payrollFrequency} onValueChange={(v: any) => setIntake({...intake, payrollFrequency: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None / No Payroll</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                        <SelectItem value="semi_monthly">Semi-Monthly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>CRA Remitter Frequency</Label>
                    <Select value={intake.payrollRemitterFreq} onValueChange={(v: any) => setIntake({...intake, payrollRemitterFreq: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular (15th of next month)</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="accelerated">Accelerated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Avg. monthly transactions</Label>
                    <Input type="number" min="0" value={intake.avgMonthlyTransactions}
                      onChange={e => setIntake({...intake, avgMonthlyTransactions: parseInt(e.target.value) || 0})} placeholder="e.g. 150" />
                  </div>
                  <div className="space-y-2">
                    <Label># of Employees</Label>
                    <Input type="number" min="0" value={intake.employeeCount}
                      onChange={e => setIntake({...intake, employeeCount: parseInt(e.target.value) || 0})} placeholder="e.g. 3" />
                  </div>
                  <div className="space-y-2">
                    <Label>Months behind (catch-up)</Label>
                    <Input type="number" min="0" value={intake.monthsBehind}
                      onChange={e => setIntake({...intake, monthsBehind: parseInt(e.target.value) || 0})} placeholder="0 = current" />
                  </div>
                  <div className="space-y-2">
                    <Label>Invoicing</Label>
                    <Select value={intake.invoicingResponsibility} onValueChange={(v: any) => setIntake({...intake, invoicingResponsibility: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">N/A</SelectItem>
                        <SelectItem value="we_invoice">We invoice their customers</SelectItem>
                        <SelectItem value="client_invoices">Client invoices themselves</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Bill payment</Label>
                    <Select value={intake.billPayResponsibility} onValueChange={(v: any) => setIntake({...intake, billPayResponsibility: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">N/A</SelectItem>
                        <SelectItem value="we_pay">We pay their bills</SelectItem>
                        <SelectItem value="client_pays">Client pays their own bills</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.usesHubdoc} onCheckedChange={v => setIntake({...intake, usesHubdoc: !!v})} />
                    <span className="text-sm">Uses Hubdoc</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={intake.hasJobCosting} onCheckedChange={v => setIntake({...intake, hasJobCosting: !!v})} />
                    <span className="text-sm">Job costing</span>
                  </label>
                </div>
                <div className="space-y-2">
                  <Label>Services Needed</Label>
                  <Input value={intake.servicesNeeded} onChange={e => setIntake({...intake, servicesNeeded: e.target.value})} placeholder="Bookkeeping, payroll, HST filing, year-end..." />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Pain Points</Label>
                <Input value={intake.painPoints} onChange={e => setIntake({...intake, painPoints: e.target.value})} placeholder="What problems are they facing?" />
              </div>
              <div className="space-y-2">
                <Label>Internal Notes</Label>
                <Input value={intake.notes} onChange={e => setIntake({...intake, notes: e.target.value})} placeholder="Anything else to remember..." />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button 
                  onClick={handleIntakeSubmit} 
                  disabled={submitIntake.isPending}
                  className="bg-lime-500"
                >
                  {submitIntake.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" /> Save Client & Generate Tasks</>
                  )}
                </Button>
                <Button variant="outline" onClick={() => { setShowIntake(false); resetIntakeForm(); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Link (for client-facing forms if needed) */}
      <Card>
        <CardHeader>
          <CardTitle>Send Client Onboarding Form</CardTitle>
          <CardDescription>Generate a secure link if you want the client to fill out details themselves</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Select value={selectedClient?.toString() || ""} onValueChange={(v) => setSelectedClient(Number(v))}>
              <SelectTrigger className="w-80">
                <SelectValue placeholder="Select client..." />
              </SelectTrigger>
              <SelectContent>
                {clients?.filter(c => c.workflowStatus === "new_lead" || c.workflowStatus === "discovery_call").map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => selectedClient && createOnboarding.mutate({ clientId: selectedClient })}
              disabled={!selectedClient || createOnboarding.isPending}
              variant="outline"
            >
              <Send className="h-4 w-4 mr-2" /> Generate Link
            </Button>
          </div>
          {generatedLink && (
            <div className="bg-slate-50 border rounded-lg p-4">
              <p className="text-sm text-slate-700 font-medium mb-2">Onboarding link:</p>
              <code className="bg-white px-3 py-2 rounded text-sm block break-all">{window.location.origin}{generatedLink}</code>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => navigator.clipboard.writeText(`${window.location.origin}${generatedLink}`)}>
                <Link2 className="h-3 w-3 mr-1" /> Copy
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submissions */}
      <Card>
        <CardHeader>
          <CardTitle>Onboarding Records</CardTitle>
          <CardDescription>Clients with completed intake forms and auto-generated task rules</CardDescription>
        </CardHeader>
        <CardContent>
          {!submissions || submissions.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No onboarding records yet. Use "New Client Intake" above.</p>
          ) : (
            <div className="space-y-3">
              {submissions.map((s) => {
                const client = clients?.find(c => c.id === s.clientId);
                return (
                  <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{client?.name || "Unknown Client"}</p>
                        <Badge variant="outline" className={
                          s.status === "approved" ? "bg-emerald-50 text-emerald-700" :
                          s.status === "submitted" ? "bg-amber-50 text-amber-700" :
                          "bg-slate-100 text-slate-600"
                        }>{s.status}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {s.submittedAt ? `Submitted ${format(new Date(s.submittedAt), "MMM d, yyyy")}` : "Staff-entered"}
                      </p>
                      {s.fiscalYearEnd && (
                        <p className="text-xs text-slate-400 mt-1">
                          <Building2 className="h-3 w-3 inline mr-1" />
                          FYE: {s.fiscalYearEnd} |
                          <Receipt className="h-3 w-3 inline mx-1" />
                          HST: {s.hstGstFrequency || "N/A"} |
                          <Users className="h-3 w-3 inline mx-1" />
                          Payroll: {s.payrollFrequency || "N/A"}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {s.status === "submitted" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => review.mutate({ id: s.id, status: "reviewed" })}>
                            <Clock className="h-3 w-3 mr-1" /> Review
                          </Button>
                          <Button size="sm" className="bg-lime-500" onClick={() => setReviewingId(s.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Approve
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={!!reviewingId} onOpenChange={(open) => { if (!open) setReviewingId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-lime-500" />
              Approve Onboarding
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <p className="font-medium">{reviewingClient?.name}</p>
              {reviewingSubmission?.fiscalYearEnd && (
                <p className="text-sm text-slate-500">Fiscal Year End: {reviewingSubmission.fiscalYearEnd}</p>
              )}
              {reviewingSubmission?.hstGstFrequency && reviewingSubmission.hstGstFrequency !== "none" && (
                <p className="text-sm text-slate-500">HST/GST: {reviewingSubmission.hstGstFrequency}</p>
              )}
              {reviewingSubmission?.payrollFrequency && reviewingSubmission.payrollFrequency !== "none" && (
                <p className="text-sm text-slate-500">Payroll: {reviewingSubmission.payrollFrequency}</p>
              )}
              {(reviewingSubmission?.hasEmployees || reviewingSubmission?.hasSubcontractors || reviewingSubmission?.wsibRequired) && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {reviewingSubmission.hasEmployees && <Badge variant="secondary">Has Employees</Badge>}
                  {reviewingSubmission.hasSubcontractors && <Badge variant="secondary">Subcontractors</Badge>}
                  {reviewingSubmission.hasInvestments && <Badge variant="secondary">Investments</Badge>}
                  {reviewingSubmission.wsibRequired && <Badge variant="secondary">WSIB</Badge>}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Assign to Staff Member</Label>
              <Select value={assignTo} onValueChange={setAssignTo}>
                <SelectTrigger><SelectValue placeholder="Select staff..." /></SelectTrigger>
                <SelectContent>
                  {staffList?.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.name || user.email} ({user.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">
                This person will be assigned all auto-generated recurring tasks for this client.
              </p>
            </div>

            <Button 
              className="w-full bg-lime-500" 
              disabled={review.isPending}
              onClick={() => {
                if (reviewingId) {
                  review.mutate({ id: reviewingId, status: "approved", assignedTo: assignTo || undefined });
                }
              }}
            >
              <UserCheck className="h-4 w-4 mr-2" />
              {review.isPending ? "Creating tasks..." : "Approve & Generate Tasks"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
