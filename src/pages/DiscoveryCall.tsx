import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router";
import { Phone, Save, Send, ArrowRight, UserPlus, CheckCircle } from "lucide-react";

export default function DiscoveryCall() {
  const navigate = useNavigate();
  const { data: clients } = trpc.crmClient.list.useQuery();
  const utils = trpc.useUtils();

  const [selectedClient, setSelectedClient] = useState<string>("");
  const [step, setStep] = useState(1);

  // Discovery form data
  const [form, setForm] = useState({
    // Business basics
    monthlyTransactions: "",
    bankAccounts: "1",
    creditCards: "0",
    currentSoftware: "",
    
    // Services needed
    needsBookkeeping: false,
    needsPayroll: false,
    needsHst: false,
    needsYearEnd: false,
    needsCleanup: false,
    needsAdvisory: false,
    
    // Payroll details
    payrollFrequency: "none",
    employeeCount: "0",
    subcontractorCount: "0",
    
    // HST/GST
    hstFrequency: "none",
    hstNumber: "",
    
    // WSIB
    hasWsib: false,
    wsibFrequency: "none",
    wsibAccountNumber: "",
    
    // Year-end
    fiscalYearEnd: "December 31",
    
    // Sales platforms
    usesStripe: false,
    usesSquare: false,
    usesJobber: false,
    
    // Business info
    businessStructure: "",
    industry: "",
    monthlyRevenue: "",
    
    // Pain points & expectations
    painPoints: "",
    expectations: "",
    
    // Quote
    recommendedPackage: "",
    monthlyFee: "",
    
    // Next steps
    agreedToOnboard: false,
    notes: "",
  });

  const updateClient = trpc.crmClient.update.useMutation({
    onSuccess: () => utils.crmClient.list.invalidate(),
  });

  const selectedClientData = clients?.find((c) => c.id === parseInt(selectedClient));

  const handleSaveDiscovery = () => {
    if (!selectedClient) return;
    // Update client with discovery data
    updateClient.mutate({
      id: parseInt(selectedClient),
      notes: JSON.stringify({ discovery: form, discoveryDate: new Date().toISOString() }),
      status: form.agreedToOnboard ? "onboarding" : "prospect",
    });
    if (form.agreedToOnboard) {
      setStep(3);
    } else {
      alert("Discovery saved. Client remains as prospect.");
    }
  };

  const handleProceedToOnboarding = () => {
    navigate(`/onboarding?clientId=${selectedClient}&discovery=${encodeURIComponent(JSON.stringify(form))}`);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Phone className="h-6 w-6 text-lime-500" />
          Discovery Call
        </h1>
        <p className="text-slate-500 mt-1">
          Fill out this form during the discovery call. Data auto-flows to onboarding.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        <Badge variant={step >= 1 ? "default" : "outline"} className={step >= 1 ? "bg-lime-500" : ""}>1. Select Client</Badge>
        <ArrowRight className="h-4 w-4 text-slate-400" />
        <Badge variant={step >= 2 ? "default" : "outline"} className={step >= 2 ? "bg-lime-500" : ""}>2. Discovery Form</Badge>
        <ArrowRight className="h-4 w-4 text-slate-400" />
        <Badge variant={step >= 3 ? "default" : "outline"} className={step >= 3 ? "bg-lime-500" : ""}>3. Send Onboarding</Badge>
      </div>

      {/* Client Selector */}
      <Card>
        <CardContent className="p-6">
          <Label className="mb-2 block">Select Client (Lead/Prospect)</Label>
          <Select value={selectedClient} onValueChange={(v) => { setSelectedClient(v); setStep(2); }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a client..." />
            </SelectTrigger>
            <SelectContent>
              {clients?.filter((c) => c.status === "new_lead" || c.status === "prospect").map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name} <Badge variant="outline" className="ml-2 text-xs">{c.status}</Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {step >= 2 && selectedClientData && (
        <>
          {/* Business Profile */}
          <Card>
            <CardHeader><CardTitle className="text-base">Business Profile</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monthly Transactions (approx)</Label>
                <Select value={form.monthlyTransactions} onValueChange={(v) => setForm({ ...form, monthlyTransactions: v })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">Under 25</SelectItem>
                    <SelectItem value="75">25-75</SelectItem>
                    <SelectItem value="150">75-150</SelectItem>
                    <SelectItem value="300">150-300</SelectItem>
                    <SelectItem value="500">300+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Business Structure</Label>
                <Select value={form.businessStructure} onValueChange={(v) => setForm({ ...form, businessStructure: v })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sole_prop">Sole Proprietorship</SelectItem>
                    <SelectItem value="partnership">Partnership</SelectItem>
                    <SelectItem value="corporation">Corporation</SelectItem>
                    <SelectItem value="llc">LLC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bank Accounts</Label>
                <Input type="number" min="1" value={form.bankAccounts} onChange={(e) => setForm({ ...form, bankAccounts: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Credit Cards</Label>
                <Input type="number" min="0" value={form.creditCards} onChange={(e) => setForm({ ...form, creditCards: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Current Accounting Software</Label>
                <Input value={form.currentSoftware} onChange={(e) => setForm({ ...form, currentSoftware: e.target.value })} placeholder="QBO, Xero, spreadsheets..." />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="e.g., Construction, Retail..." />
              </div>
            </CardContent>
          </Card>

          {/* Services Needed */}
          <Card>
            <CardHeader><CardTitle className="text-base">Services Needed — Check All That Apply</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { key: "needsBookkeeping", label: "Monthly Bookkeeping" },
                  { key: "needsPayroll", label: "Payroll Processing" },
                  { key: "needsHst", label: "HST/GST Filing" },
                  { key: "needsYearEnd", label: "Year-End Close" },
                  { key: "needsCleanup", label: "Cleanup (catch-up)" },
                  { key: "needsAdvisory", label: "Advisory/Consulting" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                    <Checkbox checked={(form as any)[item.key]} onCheckedChange={(v) => setForm({ ...form, [item.key]: v as boolean })} />
                    <span className="text-sm">{item.label}</span>
                  </label>
                ))}
              </div>

              {/* Payroll Details */}
              {form.needsPayroll && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-3">
                  <p className="font-medium text-sm text-blue-800">Payroll Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Frequency</Label>
                      <Select value={form.payrollFrequency} onValueChange={(v) => setForm({ ...form, payrollFrequency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select...</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="biweekly">Biweekly</SelectItem>
                          <SelectItem value="semi_monthly">Semi-Monthly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs"># of Employees</Label>
                      <Input type="number" min="0" value={form.employeeCount} onChange={(e) => setForm({ ...form, employeeCount: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs"># of Subcontractors</Label>
                      <Input type="number" min="0" value={form.subcontractorCount} onChange={(e) => setForm({ ...form, subcontractorCount: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}

              {/* HST Details */}
              {form.needsHst && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 space-y-3">
                  <p className="font-medium text-sm text-amber-800">HST/GST Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Filing Frequency</Label>
                      <Select value={form.hstFrequency} onValueChange={(v) => setForm({ ...form, hstFrequency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select...</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">HST Number</Label>
                      <Input value={form.hstNumber} onChange={(e) => setForm({ ...form, hstNumber: e.target.value })} placeholder="123456789RT0001" />
                    </div>
                  </div>
                </div>
              )}

              {/* WSIB */}
              {form.hasWsib && (
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-3">
                  <p className="font-medium text-sm text-purple-800">WSIB Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Filing Frequency</Label>
                      <Select value={form.wsibFrequency} onValueChange={(v) => setForm({ ...form, wsibFrequency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Account Number</Label>
                      <Input value={form.wsibAccountNumber} onChange={(e) => setForm({ ...form, wsibAccountNumber: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}

              {/* Year-end */}
              {form.needsYearEnd && (
                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 space-y-3">
                  <p className="font-medium text-sm text-emerald-800">Year-End Details</p>
                  <div>
                    <Label className="text-xs">Fiscal Year End</Label>
                    <Select value={form.fiscalYearEnd} onValueChange={(v) => setForm({ ...form, fiscalYearEnd: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i} value={`${new Date(2024, i, 1).toLocaleString("en-US", { month: "long" })} 31`}>
                            {new Date(2024, i, 1).toLocaleString("en-US", { month: "long" })} 31
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Other (specify in notes)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-emerald-600 mt-1">
                      Year-end close checklist will trigger 15 days after this date. Deadline: 5 months after year-end.
                    </p>
                  </div>
                </div>
              )}

              {/* Sales Platforms */}
              <div>
                <Label className="text-xs mb-2 block">Sales Platforms (manual entry needed)</Label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2"><Checkbox checked={form.usesStripe} onCheckedChange={(v) => setForm({ ...form, usesStripe: v as boolean })} /><span className="text-sm">Stripe</span></label>
                  <label className="flex items-center gap-2"><Checkbox checked={form.usesSquare} onCheckedChange={(v) => setForm({ ...form, usesSquare: v as boolean })} /><span className="text-sm">Square</span></label>
                  <label className="flex items-center gap-2"><Checkbox checked={form.usesJobber} onCheckedChange={(v) => setForm({ ...form, usesJobber: v as boolean })} /><span className="text-sm">Jobber</span></label>
                </div>
              </div>

              {/* WSIB checkbox */}
              <div>
                <label className="flex items-center gap-2">
                  <Checkbox checked={form.hasWsib} onCheckedChange={(v) => setForm({ ...form, hasWsib: v as boolean })} />
                  <span className="text-sm">Client has WSIB requirements</span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Pain Points & Expectations */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pain Points & Expectations</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>What are their biggest bookkeeping headaches?</Label>
                <Textarea value={form.painPoints} onChange={(e) => setForm({ ...form, painPoints: e.target.value })} placeholder="e.g., Never know if numbers are accurate, tax season is stressful..." rows={3} />
              </div>
              <div>
                <Label>What do they expect from us?</Label>
                <Textarea value={form.expectations} onChange={(e) => setForm({ ...form, expectations: e.target.value })} placeholder="e.g., Clean books monthly, no surprises at year-end..." rows={3} />
              </div>
            </CardContent>
          </Card>

          {/* Quote */}
          <Card>
            <CardHeader><CardTitle className="text-base">Recommended Package & Fee</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label>Package</Label>
                <Select value={form.recommendedPackage} onValueChange={(v) => setForm({ ...form, recommendedPackage: v })}>
                  <SelectTrigger><SelectValue placeholder="Select package..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic ($395/mo)</SelectItem>
                    <SelectItem value="standard">Standard ($695/mo)</SelectItem>
                    <SelectItem value="premium">Premium ($995/mo)</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Monthly Fee</Label>
                <Input value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} placeholder="395" />
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button className="bg-lime-500 flex-1" onClick={handleSaveDiscovery}>
              <Save className="h-4 w-4 mr-2" /> Save Discovery Data
            </Button>
            <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
              <Checkbox checked={form.agreedToOnboard} onCheckedChange={(v) => setForm({ ...form, agreedToOnboard: v as boolean })} />
              <span className="text-sm font-medium">Client agreed to onboard</span>
            </label>
          </div>

          {form.agreedToOnboard && (
            <div className="p-4 bg-lime-50 border border-lime-200 rounded-lg">
              <p className="text-sm text-lime-800 font-medium mb-3">
                <CheckCircle className="h-4 w-4 inline mr-1" />
                Client is ready to onboard! Discovery data will auto-flow to the onboarding form.
              </p>
              <Button className="bg-lime-500" onClick={handleProceedToOnboarding}>
                <ArrowRight className="h-4 w-4 mr-2" /> Proceed to Onboarding
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
