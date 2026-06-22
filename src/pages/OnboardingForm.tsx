import { useState } from "react";
import { useParams } from "react-router";
import { FileText, CheckCircle, Building2, User, CreditCard, Briefcase, Landmark, Send, Calendar, Receipt, Users, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/providers/trpc";

interface FormData {
  [key: string]: string | boolean | number | undefined;
}

export default function OnboardingForm() {
  const { token } = useParams<{ token: string }>();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormData>({
    hstGstFrequency: "none",
    payrollFrequency: "none",
    hasEmployees: false,
    hasSubcontractors: false,
    hasInvestments: false,
    wsibRequired: false,
    usesStripe: false,
    usesSquare: false,
    usesJobber: false,
    usesTouchBistro: false,
    usesPayPal: false,
    usesWise: false,
    paysDividends: false,
    invoicingResponsibility: "none",
    billPayResponsibility: "none",
    monthlySalesReceipt: false,
    salesReceiptSource: "",
    salesEntryFrequency: "monthly",
    bankAccountCount: "1",
    creditCardCount: "0",
    needsYearEnd: true,
  });

  const { data: onboarding } = trpc.onboarding.getByToken.useQuery(
    { token: token! },
    { enabled: !!token }
  );

  const submit = trpc.onboarding.submit.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    // Convert form values to proper types for the API
    const payload: Record<string, unknown> = { token };

    // String fields
    const stringFields = [
      "businessLegalName", "businessOperatingName", "businessStructure", "industry",
      "businessNumber", "ein", "craBusinessNumber",
      "wsibAccountNumber",
      "primaryContactName", "primaryContactEmail", "primaryContactPhone",
      "secondaryContactName", "secondaryContactEmail",
      "currentAccountingSoftware", "currentPayrollProvider",
      "servicesNeeded", "painPoints", "expectations",
      "fiscalYearEnd", "lastFiledYear", "outstandingFilings",
      "hstGstFrequency", "payrollFrequency", "salesEntryFrequency",
      "invoicingResponsibility", "billPayResponsibility", "salesReceiptSource",
    ];
    for (const f of stringFields) {
      if (form[f] !== undefined && form[f] !== "") payload[f] = form[f];
    }

    // Boolean fields
    const boolFields = ["hasEmployees", "hasSubcontractors", "hasInvestments", "wsibRequired", "needsYearEnd", "usesStripe", "usesSquare", "usesJobber", "usesTouchBistro", "usesPayPal", "usesWise", "paysDividends", "monthlySalesReceipt"];
    for (const f of boolFields) {
      payload[f] = form[f] === true || form[f] === "true";
    }

    // Number fields
    const numFields = ["bankAccountCount", "creditCardCount"];
    for (const f of numFields) {
      const val = form[f];
      if (val !== undefined && val !== "") {
        const n = typeof val === "string" ? parseInt(val) : typeof val === "number" ? val : 0;
        if (!isNaN(n)) payload[f] = n;
      }
    }

    submit.mutate(payload as any);
  };

  const update = (key: string, value: string | boolean | number) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  if (!token) return <div className="p-8 text-center">Invalid link</div>;
  if (!onboarding) return <div className="p-8 text-center">Loading...</div>;

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-8">
          <CheckCircle className="h-16 w-16 text-lime-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
          <p className="text-slate-500">Your onboarding information has been submitted. We'll review it and get back to you shortly.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <img src="/assets/logo.jpg" alt="Go Fig Bookz" className="h-20 w-auto mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold">Client Onboarding</h1>
          <p className="text-slate-500">Help us serve you better by providing these details</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Business Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-lime-500" />
                Business Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Legal Business Name *</Label><Input required onChange={e => update("businessLegalName", e.target.value)} /></div>
                <div className="space-y-2"><Label>Operating Name (if different)</Label><Input onChange={e => update("businessOperatingName", e.target.value)} /></div>
                <div className="space-y-2"><Label>Business Structure</Label>
                  <Select onValueChange={v => update("businessStructure", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sole_proprietorship">Sole Proprietorship</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="corporation">Corporation</SelectItem>
                      <SelectItem value="llc">LLC</SelectItem>
                      <SelectItem value="nonprofit">Non-Profit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Industry</Label><Input onChange={e => update("industry", e.target.value)} /></div>
                <div className="space-y-2"><Label>Business Number (BN) / EIN</Label><Input onChange={e => update("businessNumber", e.target.value)} /><p className="text-xs text-slate-400">We derive your HST (RT) and payroll (RP) accounts from this — no need to enter them separately.</p></div>
                <div className="space-y-2"><Label>WSIB Account Number</Label><Input onChange={e => update("wsibAccountNumber", e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-lime-500" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Primary Contact Name *</Label><Input required onChange={e => update("primaryContactName", e.target.value)} /></div>
                <div className="space-y-2"><Label>Primary Contact Email *</Label><Input type="email" required onChange={e => update("primaryContactEmail", e.target.value)} /></div>
                <div className="space-y-2"><Label>Primary Contact Phone</Label><Input onChange={e => update("primaryContactPhone", e.target.value)} /></div>
                <div className="space-y-2"><Label>Secondary Contact Name</Label><Input onChange={e => update("secondaryContactName", e.target.value)} /></div>
                <div className="space-y-2"><Label>Secondary Contact Email</Label><Input type="email" onChange={e => update("secondaryContactEmail", e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>

          {/* Bank connection — handled in QuickBooks, not collected here */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-lime-500" />
                Bank &amp; Credit Card Connections
              </CardTitle>
              <CardDescription>We don't need your account numbers — your transactions flow in securely through QuickBooks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">
                Please log in to <span className="font-medium">QuickBooks Online</span> and connect each bank account and
                credit card under <span className="font-medium">Transactions → Bank transactions → Link account</span>,
                if they aren't connected already. That's all we need — the feed reconciles automatically.
              </p>
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                <Checkbox checked={!!form.bankAccountsConnected} onCheckedChange={v => update("bankAccountsConnected", v === true)} />
                <div>
                  <p className="font-medium text-sm">My bank &amp; credit card accounts are connected in QuickBooks</p>
                  <p className="text-xs text-slate-500">Tick once they're linked (or let us know if you need help connecting them).</p>
                </div>
              </label>
            </CardContent>
          </Card>

          {/* Software */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-lime-500" />
                Current Software & Providers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Current Accounting Software</Label><Input placeholder="e.g., QuickBooks, Xero, Wave" onChange={e => update("currentAccountingSoftware", e.target.value)} /></div>
                <div className="space-y-2"><Label>Current Payroll Provider</Label><Input placeholder="e.g., ADP, Payworks" onChange={e => update("currentPayrollProvider", e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>

          {/* NEW: Tax & Compliance Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-lime-500" />
                Tax & Compliance Profile
              </CardTitle>
              <CardDescription>This helps us automatically set up your recurring task schedule</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fiscal Year End</Label>
                  <Input placeholder="e.g., December 31 or 12/31" onChange={e => update("fiscalYearEnd", e.target.value)} />
                  <p className="text-xs text-slate-400">Used to schedule year-end tasks</p>
                </div>
                <div className="space-y-2">
                  <Label>HST/GST Filing Frequency</Label>
                  <Select value={String(form.hstGstFrequency || "none")} onValueChange={v => update("hstGstFrequency", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not registered / Not applicable</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Payroll Frequency</Label>
                  <Select value={String(form.payrollFrequency || "none")} onValueChange={v => update("payrollFrequency", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No payroll</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="semi_monthly">Semi-monthly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Bank Accounts to Reconcile</Label>
                  <Input type="number" min="0" value={String(form.bankAccountCount || "1")} onChange={e => update("bankAccountCount", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Credit Cards to Reconcile</Label>
                  <Input type="number" min="0" value={String(form.creditCardCount || "0")} onChange={e => update("creditCardCount", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={!!form.hasEmployees} onCheckedChange={v => update("hasEmployees", v === true)} />
                  <div>
                    <p className="font-medium text-sm">Has Employees</p>
                    <p className="text-xs text-slate-500">We'll schedule T4, payroll remittance, and WSIB tasks</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={!!form.hasSubcontractors} onCheckedChange={v => update("hasSubcontractors", v === true)} />
                  <div>
                    <p className="font-medium text-sm">Has Subcontractors</p>
                    <p className="text-xs text-slate-500">We'll schedule T5018 filing (construction)</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={!!form.hasInvestments} onCheckedChange={v => update("hasInvestments", v === true)} />
                  <div>
                    <p className="font-medium text-sm">Has Investment Income</p>
                    <p className="text-xs text-slate-500">We'll schedule T5 slip preparation</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={!!form.wsibRequired} onCheckedChange={v => update("wsibRequired", v === true)} />
                  <div>
                    <p className="font-medium text-sm">WSIB Required</p>
                    <p className="text-xs text-slate-500">We'll schedule annual WSIB reconciliation</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={!!form.paysDividends} onCheckedChange={v => update("paysDividends", v === true)} />
                  <div>
                    <p className="font-medium text-sm">Pays Dividends</p>
                    <p className="text-xs text-slate-500">We'll schedule T5 slip preparation</p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* NEW: Sales Entry Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-lime-500" />
                Sales Entry
              </CardTitle>
              <CardDescription>How do customers pay? We'll track and enter these transactions into your books.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={!!form.usesStripe} onCheckedChange={v => update("usesStripe", v === true)} />
                  <div>
                    <p className="font-medium text-sm">Uses Stripe</p>
                    <p className="text-xs text-slate-500">Online payments, subscriptions</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={!!form.usesSquare} onCheckedChange={v => update("usesSquare", v === true)} />
                  <div>
                    <p className="font-medium text-sm">Uses Square</p>
                    <p className="text-xs text-slate-500">In-person POS, invoices</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={!!form.usesJobber} onCheckedChange={v => update("usesJobber", v === true)} />
                  <div>
                    <p className="font-medium text-sm">Uses Jobber</p>
                    <p className="text-xs text-slate-500">Field service, invoicing</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={!!form.usesTouchBistro} onCheckedChange={v => update("usesTouchBistro", v === true)} />
                  <div>
                    <p className="font-medium text-sm">Uses TouchBistro</p>
                    <p className="text-xs text-slate-500">Restaurant POS</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={!!form.usesPayPal} onCheckedChange={v => update("usesPayPal", v === true)} />
                  <div>
                    <p className="font-medium text-sm">Uses PayPal</p>
                    <p className="text-xs text-slate-500">Online payments</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={!!form.usesWise} onCheckedChange={v => update("usesWise", v === true)} />
                  <div>
                    <p className="font-medium text-sm">Uses Wise</p>
                    <p className="text-xs text-slate-500">International payments / FX</p>
                  </div>
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sales Entry Frequency</Label>
                  <Select value={String(form.salesEntryFrequency || "none")} onValueChange={v => update("salesEntryFrequency", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No sales entry needed</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Who handles invoicing?</Label>
                  <Select value={String(form.invoicingResponsibility || "none")} onValueChange={v => update("invoicingResponsibility", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not applicable</SelectItem>
                      <SelectItem value="we_invoice">Go Fig Bookz invoices for you</SelectItem>
                      <SelectItem value="client_invoices">You invoice yourself</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Who pays the bills?</Label>
                  <Select value={String(form.billPayResponsibility || "none")} onValueChange={v => update("billPayResponsibility", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not applicable</SelectItem>
                      <SelectItem value="we_pay">Go Fig Bookz pays for you</SelectItem>
                      <SelectItem value="client_pays">You pay yourself</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                <Checkbox checked={!!form.monthlySalesReceipt} onCheckedChange={v => update("monthlySalesReceipt", v === true)} />
                <div>
                  <p className="font-medium text-sm">Monthly total-sales receipt</p>
                  <p className="text-xs text-slate-500">We enter one monthly sales receipt (total sales) instead of individual invoices</p>
                </div>
              </label>
              {form.monthlySalesReceipt && (
                <div className="space-y-2">
                  <Label>Where do we pull the monthly total from?</Label>
                  <Input placeholder="e.g., Jobber, Square, Stripe, TouchBistro" value={String(form.salesReceiptSource || "")} onChange={e => update("salesReceiptSource", e.target.value)} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Services & Pain Points */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-lime-500" />
                Services & Expectations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>What services do you need?</Label>
                <Textarea placeholder="e.g., Monthly bookkeeping, tax filing, payroll, year-end" onChange={e => update("servicesNeeded", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>What are your biggest pain points with your current bookkeeping?</Label>
                <Textarea placeholder="e.g., Always late, disorganized, missing receipts..." onChange={e => update("painPoints", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>What do you expect from your bookkeeper?</Label>
                <Textarea placeholder="e.g., Monthly reports by the 15th, responsive to emails..." onChange={e => update("expectations", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Last Filed Year</Label>
                <Input placeholder="e.g., 2024" onChange={e => update("lastFiledYear", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Any outstanding filings or issues?</Label>
                <Textarea placeholder="e.g., Behind on GST, unfiled T4s..." onChange={e => update("outstandingFilings", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full bg-lime-500" disabled={submit.isPending}>
            <Send className="h-4 w-4 mr-2" />
            {submit.isPending ? "Submitting..." : "Submit Onboarding Form"}
          </Button>
        </form>
      </div>
    </div>
  );
}
