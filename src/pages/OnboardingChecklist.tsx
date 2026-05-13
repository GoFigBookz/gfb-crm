import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckSquare, Save, Send, CheckCircle, ArrowRight, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const HST_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const QST_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function OnboardingChecklist() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") || "";
  const discoveryData = searchParams.get("discovery");
  const parsedDiscovery = discoveryData ? JSON.parse(decodeURIComponent(discoveryData)) : null;

  const { data: clients } = trpc.crmClient.list.useQuery();
  const utils = trpc.useUtils();

  const [selectedClient, setSelectedClient] = useState(clientId);
  const [activeTab, setActiveTab] = useState("business");
  const [saved, setSaved] = useState(false);

  // Form state with defaults from discovery
  const [form, setForm] = useState({
    // Business Info
    legalName: "",
    operatingName: "",
    businessStructure: parsedDiscovery?.businessStructure || "",
    industry: parsedDiscovery?.industry || "",
    craBusinessNumber: "",
    hstNumber: parsedDiscovery?.hstNumber || "",
    qstNumber: "",
    wsibAccountNumber: parsedDiscovery?.wsibAccountNumber || "",
    craPayrollAccount: "",
    eftCode: "",
    ontarioEmployerHealthTax: false,
    ontarioEmployerHealthTaxAccount: "",
    federalCorporateIncomeTaxAccount: "",
    provincialCorporateIncomeTaxAccount: "",

    // Contacts
    primaryContact: "",
    primaryEmail: "",
    primaryPhone: "",
    secondaryContact: "",
    secondaryEmail: "",
    secondaryPhone: "",

    // Banking
    bankName: "",
    bankAccountNumber: "",
    bankBranch: "",
    creditCardCount: parsedDiscovery?.creditCards || "0",

    // Accounting Software
    currentSoftware: parsedDiscovery?.currentSoftware || "",
    hasExistingQbo: false,
    qboLoginEmail: "",

    // Year-End
    fiscalYearEnd: parsedDiscovery?.fiscalYearEnd || "December 31",
    yearEndCloseDeadline: "",

    // Services
    bookkeepingFrequency: "monthly",
    payrollFrequency: parsedDiscovery?.payrollFrequency || "none",
    employeeCount: parsedDiscovery?.employeeCount || "0",
    subcontractorCount: parsedDiscovery?.subcontractorCount || "0",
    hstGstFrequency: parsedDiscovery?.hstFrequency || "none",
    hstFilingMonths: [] as string[],
    qstFilingMonths: [] as string[],
    wsibFilingFrequency: parsedDiscovery?.wsibFrequency || "none",
    hasTslips: false,
    t4RoeRl1: false,
    t4a: false,
    t5: false,
    t5018: false,
    personalTaxReturn: false,
    spouseName: "",
    spouseSIN: "",
    numberOfDependents: "0",
    hasRentalProperty: false,
    hasInvestmentIncome: false,
    hasForeignIncome: false,
    hasSoleProprietorship: false,
    hasUsCitizenship: false,
    hasUsIncome: false,
    salesPlatformStripe: parsedDiscovery?.usesStripe || false,
    salesPlatformSquare: parsedDiscovery?.usesSquare || false,
    salesPlatformJobber: parsedDiscovery?.usesJobber || false,
    hasEcommerce: false,

    // Documents Received
    receivedArticlesOfIncorporation: false,
    receivedPreviousYearNoticeOfAssessment: false,
    receivedGstHstRegistryConfirmation: false,
    receivedPayrollRegistryConfirmation: false,
    receivedPreviousTslips: false,
    receivedQstRegistration: false,
    receivedCorporateTaxReturn: false,
    receivedGstHstReturns: false,
    receivedMonthlyBankStatements: false,
    receivedWsibClearanceCertificate: false,
    receivedWsibRegistrationConfirmation: false,
    receivedPreviousPayrollJournals: false,
    receivedInvestmentStatements: false,

    // QuickBooks Setup
    qboFiscalYearEndSet: false,
    chartOfAccountsReviewed: false,
    bankAccountsConnected: false,
    creditCardsConnected: false,
    automationRulesSet: false,

    // Engagement
    engagementLetterSent: false,
    engagementLetterSigned: false,
    engagementLetterFiled: false,

    // Fee
    monthlyFee: parsedDiscovery?.monthlyFee || "",
    serviceTier: parsedDiscovery?.recommendedPackage || "",

    notes: parsedDiscovery?.notes || "",
  });

  // Auto-calculate year-end deadline (5 months after year-end)
  useEffect(() => {
    if (form.fiscalYearEnd) {
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const monthIdx = monthNames.findIndex((m) => form.fiscalYearEnd.toLowerCase().startsWith(m.toLowerCase()));
      if (monthIdx >= 0) {
        const deadline = new Date(2025, monthIdx + 5, 1);
        setForm((prev) => ({ ...prev, yearEndCloseDeadline: monthNames[deadline.getMonth()] + " 1" }));
      }
    }
  }, [form.fiscalYearEnd]);

  const saveOnboarding = trpc.onboarding.submit.useMutation({
    onSuccess: () => {
      setSaved(true);
      utils.onboarding.list.invalidate();
    },
  });

  const handleSave = () => {
    if (!selectedClient) return;
    saveOnboarding.mutate({
      clientId: parseInt(selectedClient),
      ...form,
      yearEndCloseDeadline: form.yearEndCloseDeadline || undefined,
    });
  };

  // Calculate completion
  const allCheckboxes = [
    form.ontarioEmployerHealthTax, form.hasTslips, form.t4RoeRl1, form.t4a, form.t5, form.t5018,
    form.personalTaxReturn, form.hasRentalProperty, form.hasInvestmentIncome, form.hasForeignIncome,
    form.hasSoleProprietorship, form.hasUsCitizenship, form.hasUsIncome, form.salesPlatformStripe,
    form.salesPlatformSquare, form.salesPlatformJobber, form.hasEcommerce,
    form.receivedArticlesOfIncorporation, form.receivedPreviousYearNoticeOfAssessment,
    form.receivedGstHstRegistryConfirmation, form.receivedPayrollRegistryConfirmation,
    form.receivedPreviousTslips, form.receivedQstRegistration, form.receivedCorporateTaxReturn,
    form.receivedGstHstReturns, form.receivedMonthlyBankStatements, form.receivedWsibClearanceCertificate,
    form.receivedWsibRegistrationConfirmation, form.receivedPreviousPayrollJournals, form.receivedInvestmentStatements,
    form.qboFiscalYearEndSet, form.chartOfAccountsReviewed, form.bankAccountsConnected,
    form.creditCardsConnected, form.automationRulesSet, form.engagementLetterSent,
    form.engagementLetterSigned, form.engagementLetterFiled,
  ];
  const checkedCount = allCheckboxes.filter(Boolean).length;
  const completionPercent = Math.round((checkedCount / allCheckboxes.length) * 100);

  const selectedClientData = clients?.find((c) => c.id === parseInt(selectedClient));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <CheckSquare className="h-6 w-6 text-lime-500" />
          Onboarding Checklist
        </h1>
        <p className="text-slate-500 mt-1">
          Complete this checklist during onboarding. Discovery data auto-flows here.
        </p>
      </div>

      {/* Client Selector */}
      <Card>
        <CardContent className="p-6">
          <Label className="mb-2 block">Select Client</Label>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Choose a client..." /></SelectTrigger>
            <SelectContent>
              {clients?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {parsedDiscovery && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              <CheckCircle className="h-4 w-4 inline mr-1" />
              Discovery data loaded from call. Pre-filled fields are marked below.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Checklist Completion</span>
            <Badge variant="outline">{checkedCount}/{allCheckboxes.length} items</Badge>
          </div>
          <Progress value={completionPercent} className="h-2" />
        </CardContent>
      </Card>

      {selectedClient && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="business">Business Info</TabsTrigger>
            <TabsTrigger value="taxes">Taxes & Filings</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="qbo">QBO Setup</TabsTrigger>
            <TabsTrigger value="engagement">Engagement</TabsTrigger>
          </TabsList>

          {/* BUSINESS INFO TAB */}
          <TabsContent value="business" className="space-y-4 mt-4">
            <Card><CardHeader><CardTitle className="text-base">Business Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Legal Name</Label><Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} /></div>
                <div><Label>Operating Name (if different)</Label><Input value={form.operatingName} onChange={(e) => setForm({ ...form, operatingName: e.target.value })} /></div>
                <div><Label>Business Structure</Label>
                  <Select value={form.businessStructure} onValueChange={(v) => setForm({ ...form, businessStructure: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sole_prop">Sole Proprietorship</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="corporation">Corporation</SelectItem>
                      <SelectItem value="llc">LLC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Industry</Label><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
                <div><Label>CRA Business Number</Label><Input value={form.craBusinessNumber} onChange={(e) => setForm({ ...form, craBusinessNumber: e.target.value })} placeholder="123456789RC0001" /></div>
                <div><Label>HST/GST Number</Label><Input value={form.hstNumber} onChange={(e) => setForm({ ...form, hstNumber: e.target.value })} placeholder="123456789RT0001" className={parsedDiscovery?.hstNumber ? "border-lime-300 bg-lime-50" : ""} /></div>
                <div><Label>QST Number (Quebec)</Label><Input value={form.qstNumber} onChange={(e) => setForm({ ...form, qstNumber: e.target.value })} placeholder="1234567890TQ0001" /></div>
                <div><Label>CRA Payroll Account (RP)</Label><Input value={form.craPayrollAccount} onChange={(e) => setForm({ ...form, craPayrollAccount: e.target.value })} placeholder="123456789RP0001" /></div>
                <div><Label>EFT Code</Label><Input value={form.eftCode} onChange={(e) => setForm({ ...form, eftCode: e.target.value })} /></div>
                <div><Label>WSIB Account Number</Label><Input value={form.wsibAccountNumber} onChange={(e) => setForm({ ...form, wsibAccountNumber: e.target.value })} className={parsedDiscovery?.wsibAccountNumber ? "border-lime-300 bg-lime-50" : ""} /></div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">Contacts</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Primary Contact</Label><Input value={form.primaryContact} onChange={(e) => setForm({ ...form, primaryContact: e.target.value })} /></div>
                <div><Label>Primary Email</Label><Input type="email" value={form.primaryEmail} onChange={(e) => setForm({ ...form, primaryEmail: e.target.value })} /></div>
                <div><Label>Primary Phone</Label><Input value={form.primaryPhone} onChange={(e) => setForm({ ...form, primaryPhone: e.target.value })} /></div>
                <div><Label>Secondary Contact</Label><Input value={form.secondaryContact} onChange={(e) => setForm({ ...form, secondaryContact: e.target.value })} /></div>
                <div><Label>Secondary Email</Label><Input type="email" value={form.secondaryEmail} onChange={(e) => setForm({ ...form, secondaryEmail: e.target.value })} /></div>
                <div><Label>Secondary Phone</Label><Input value={form.secondaryPhone} onChange={(e) => setForm({ ...form, secondaryPhone: e.target.value })} /></div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">Banking & Software</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Bank Name</Label><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
                <div><Label>Bank Account #</Label><Input value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} /></div>
                <div><Label>Bank Branch</Label><Input value={form.bankBranch} onChange={(e) => setForm({ ...form, bankBranch: e.target.value })} /></div>
                <div><Label># of Credit Cards</Label><Input type="number" value={form.creditCardCount} onChange={(e) => setForm({ ...form, creditCardCount: e.target.value })} className={parsedDiscovery?.creditCards ? "border-lime-300 bg-lime-50" : ""} /></div>
                <div><Label>Current Software</Label><Input value={form.currentSoftware} onChange={(e) => setForm({ ...form, currentSoftware: e.target.value })} className={parsedDiscovery?.currentSoftware ? "border-lime-300 bg-lime-50" : ""} /></div>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox checked={form.hasExistingQbo} onCheckedChange={(v) => setForm({ ...form, hasExistingQbo: v as boolean })} />
                  <Label className="font-normal">Has existing QBO account</Label>
                </div>
                {form.hasExistingQbo && <div><Label>QBO Login Email</Label><Input value={form.qboLoginEmail} onChange={(e) => setForm({ ...form, qboLoginEmail: e.target.value })} /></div>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAXES & FILINGS TAB */}
          <TabsContent value="taxes" className="space-y-4 mt-4">
            <Card><CardHeader><CardTitle className="text-base">Fiscal Year-End</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Fiscal Year End Date</Label>
                  <Select value={form.fiscalYearEnd} onValueChange={(v) => setForm({ ...form, fiscalYearEnd: v })}>
                    <SelectTrigger className={parsedDiscovery?.fiscalYearEnd ? "border-lime-300 bg-lime-50" : ""}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i} value={`${new Date(2024, i, 1).toLocaleString("en-US", { month: "long" })} 31`}>
                          {new Date(2024, i, 1).toLocaleString("en-US", { month: "long" })} 31
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.fiscalYearEnd && (
                    <p className="text-xs text-emerald-600 mt-1">
                      Year-end checklist triggers 15 days after {form.fiscalYearEnd}. Deadline: {form.yearEndCloseDeadline || "(calculating...)"}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Year-End Close Deadline (auto-calculated)</Label>
                  <Input value={form.yearEndCloseDeadline} readOnly className="bg-slate-50" />
                </div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">HST/GST Filing</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Frequency</Label>
                    <Select value={form.hstGstFrequency} onValueChange={(v) => setForm({ ...form, hstGstFrequency: v })}>
                      <SelectTrigger className={parsedDiscovery?.hstFrequency ? "border-lime-300 bg-lime-50" : ""}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not Registered</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.hstGstFrequency === "quarterly" && (
                  <div>
                    <Label className="mb-2 block">Select the months for quarterly returns (first return):</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {HST_MONTHS.map((m) => (
                        <label key={m} className="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer">
                          <Checkbox checked={form.hstFilingMonths.includes(m)} onCheckedChange={(v) => {
                            const months = v ? [...form.hstFilingMonths, m] : form.hstFilingMonths.filter((x) => x !== m);
                            setForm({ ...form, hstFilingMonths: months });
                          }} />
                          <span className="text-sm">{m}</span>
                        </label>
                      ))}
                    </div>
                    {form.hstFilingMonths.length > 0 && (
                      <p className="text-xs text-emerald-600 mt-2">
                        Auto-generated deadlines: {form.hstFilingMonths.join(", ")} (recurring quarterly)
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">QST Filing (Quebec)</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {QST_MONTHS.map((m) => (
                    <label key={m} className="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer">
                      <Checkbox checked={form.qstFilingMonths.includes(m)} onCheckedChange={(v) => {
                        const months = v ? [...form.qstFilingMonths, m] : form.qstFilingMonths.filter((x) => x !== m);
                        setForm({ ...form, qstFilingMonths: months });
                      }} />
                      <span className="text-sm">{m}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">Payroll</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Frequency</Label>
                  <Select value={form.payrollFrequency} onValueChange={(v) => setForm({ ...form, payrollFrequency: v })}>
                    <SelectTrigger className={parsedDiscovery?.payrollFrequency ? "border-lime-300 bg-lime-50" : ""}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Payroll</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Biweekly</SelectItem>
                      <SelectItem value="semi_monthly">Semi-Monthly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label># of Employees</Label><Input type="number" value={form.employeeCount} onChange={(e) => setForm({ ...form, employeeCount: e.target.value })} className={parsedDiscovery?.employeeCount ? "border-lime-300 bg-lime-50" : ""} /></div>
                <div><Label># of Subcontractors</Label><Input type="number" value={form.subcontractorCount} onChange={(e) => setForm({ ...form, subcontractorCount: e.target.value })} className={parsedDiscovery?.subcontractorCount ? "border-lime-300 bg-lime-50" : ""} /></div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">WSIB</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Filing Frequency</Label>
                    <Select value={form.wsibFilingFrequency} onValueChange={(v) => setForm({ ...form, wsibFilingFrequency: v })}>
                      <SelectTrigger className={parsedDiscovery?.wsibFrequency ? "border-lime-300 bg-lime-50" : ""}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not Required</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">T-Slips</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { key: "t4RoeRl1", label: "T4 + ROE + RL-1" },
                    { key: "t4a", label: "T4A" },
                    { key: "t5", label: "T5" },
                    { key: "t5018", label: "T5018" },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer">
                      <Checkbox checked={(form as any)[item.key]} onCheckedChange={(v) => setForm({ ...form, [item.key]: v as boolean })} />
                      <span className="text-sm">{item.label}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">Personal Tax Return</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.personalTaxReturn} onCheckedChange={(v) => setForm({ ...form, personalTaxReturn: v as boolean })} />
                  <Label className="font-normal">Client requires personal tax return (T1)</Label>
                </div>
                {form.personalTaxReturn && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div><Label>Spouse Name</Label><Input value={form.spouseName} onChange={(e) => setForm({ ...form, spouseName: e.target.value })} /></div>
                    <div><Label>Spouse SIN</Label><Input value={form.spouseSIN} onChange={(e) => setForm({ ...form, spouseSIN: e.target.value })} /></div>
                    <div><Label># of Dependents</Label><Input type="number" value={form.numberOfDependents} onChange={(e) => setForm({ ...form, numberOfDependents: e.target.value })} /></div>
                    <div className="flex items-center gap-2"><Checkbox checked={form.hasRentalProperty} onCheckedChange={(v) => setForm({ ...form, hasRentalProperty: v as boolean })} /><Label className="font-normal text-sm">Rental Property</Label></div>
                    <div className="flex items-center gap-2"><Checkbox checked={form.hasInvestmentIncome} onCheckedChange={(v) => setForm({ ...form, hasInvestmentIncome: v as boolean })} /><Label className="font-normal text-sm">Investment Income</Label></div>
                    <div className="flex items-center gap-2"><Checkbox checked={form.hasForeignIncome} onCheckedChange={(v) => setForm({ ...form, hasForeignIncome: v as boolean })} /><Label className="font-normal text-sm">Foreign Income</Label></div>
                    <div className="flex items-center gap-2"><Checkbox checked={form.hasSoleProprietorship} onCheckedChange={(v) => setForm({ ...form, hasSoleProprietorship: v as boolean })} /><Label className="font-normal text-sm">Sole Proprietorship</Label></div>
                    <div className="flex items-center gap-2"><Checkbox checked={form.hasUsCitizenship} onCheckedChange={(v) => setForm({ ...form, hasUsCitizenship: v as boolean })} /><Label className="font-normal text-sm">US Citizenship</Label></div>
                    <div className="flex items-center gap-2"><Checkbox checked={form.hasUsIncome} onCheckedChange={(v) => setForm({ ...form, hasUsIncome: v as boolean })} /><Label className="font-normal text-sm">US Income</Label></div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">Sales Platforms</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { key: "salesPlatformStripe", label: "Stripe" },
                    { key: "salesPlatformSquare", label: "Square" },
                    { key: "salesPlatformJobber", label: "Jobber" },
                    { key: "hasEcommerce", label: "Other E-commerce" },
                  ].map((item) => (
                    <label key={item.key} className={cn("flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer", (form as any)[item.key] ? "border-lime-300 bg-lime-50" : "")}>
                      <Checkbox checked={(form as any)[item.key]} onCheckedChange={(v) => setForm({ ...form, [item.key]: v as boolean })} />
                      <span className="text-sm">{item.label}</span>
                    </label>
                  ))}
                </div>
                {(form.salesPlatformStripe || form.salesPlatformSquare || form.salesPlatformJobber) && (
                  <p className="text-xs text-emerald-600 mt-2">Monthly sales entry tasks will be auto-generated.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* DOCUMENTS TAB */}
          <TabsContent value="documents" className="space-y-4 mt-4">
            <Card><CardHeader><CardTitle className="text-base">Documents Received</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { key: "receivedArticlesOfIncorporation", label: "Articles of Incorporation" },
                  { key: "receivedPreviousYearNoticeOfAssessment", label: "Previous Year Notice of Assessment" },
                  { key: "receivedGstHstRegistryConfirmation", label: "GST/HST Registry Confirmation" },
                  { key: "receivedPayrollRegistryConfirmation", label: "Payroll Registry Confirmation" },
                  { key: "receivedPreviousTslips", label: "Previous Year T-Slips" },
                  { key: "receivedQstRegistration", label: "QST Registration (Quebec)" },
                  { key: "receivedCorporateTaxReturn", label: "Previous Corporate Tax Return" },
                  { key: "receivedGstHstReturns", label: "Previous GST/HST Returns" },
                  { key: "receivedMonthlyBankStatements", label: "Monthly Bank Statements" },
                  { key: "receivedWsibClearanceCertificate", label: "WSIB Clearance Certificate" },
                  { key: "receivedWsibRegistrationConfirmation", label: "WSIB Registration Confirmation" },
                  { key: "receivedPreviousPayrollJournals", label: "Previous Payroll Journals" },
                  { key: "receivedInvestmentStatements", label: "Investment Statements" },
                ].map((item) => (
                  <label key={item.key} className={cn("flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer", (form as any)[item.key] ? "border-lime-300 bg-lime-50" : "")}>
                    <Checkbox checked={(form as any)[item.key]} onCheckedChange={(v) => setForm({ ...form, [item.key]: v as boolean })} />
                    <span className="text-sm">{item.label}</span>
                  </label>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* QBO SETUP TAB */}
          <TabsContent value="qbo" className="space-y-4 mt-4">
            <Card><CardHeader><CardTitle className="text-base">QuickBooks Online Setup</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { key: "qboFiscalYearEndSet", label: "Fiscal Year-End Set in QBO" },
                  { key: "chartOfAccountsReviewed", label: "Chart of Accounts Reviewed" },
                  { key: "bankAccountsConnected", label: "Bank Accounts Connected" },
                  { key: "creditCardsConnected", label: "Credit Cards Connected" },
                  { key: "automationRulesSet", label: "Automation Rules Set" },
                ].map((item) => (
                  <label key={item.key} className={cn("flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer", (form as any)[item.key] ? "border-lime-300 bg-lime-50" : "")}>
                    <Checkbox checked={(form as any)[item.key]} onCheckedChange={(v) => setForm({ ...form, [item.key]: v as boolean })} />
                    <span className="text-sm">{item.label}</span>
                  </label>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ENGAGEMENT TAB */}
          <TabsContent value="engagement" className="space-y-4 mt-4">
            <Card><CardHeader><CardTitle className="text-base">Engagement Letter</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className={cn("flex items-center gap-2 p-3 border rounded cursor-pointer", form.engagementLetterSent ? "border-lime-300 bg-lime-50" : "")}>
                    <Checkbox checked={form.engagementLetterSent} onCheckedChange={(v) => setForm({ ...form, engagementLetterSent: v as boolean })} />
                    <span className="text-sm">Letter Sent</span>
                  </label>
                  <label className={cn("flex items-center gap-2 p-3 border rounded cursor-pointer", form.engagementLetterSigned ? "border-lime-300 bg-lime-50" : "")}>
                    <Checkbox checked={form.engagementLetterSigned} onCheckedChange={(v) => setForm({ ...form, engagementLetterSigned: v as boolean })} />
                    <span className="text-sm">Letter Signed</span>
                  </label>
                  <label className={cn("flex items-center gap-2 p-3 border rounded cursor-pointer", form.engagementLetterFiled ? "border-lime-300 bg-lime-50" : "")}>
                    <Checkbox checked={form.engagementLetterFiled} onCheckedChange={(v) => setForm({ ...form, engagementLetterFiled: v as boolean })} />
                    <span className="text-sm">Letter Filed</span>
                  </label>
                </div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">Fee & Package</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Service Tier</Label>
                  <Select value={form.serviceTier} onValueChange={(v) => setForm({ ...form, serviceTier: v })}>
                    <SelectTrigger className={parsedDiscovery?.recommendedPackage ? "border-lime-300 bg-lime-50" : ""}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic ($395/mo)</SelectItem>
                      <SelectItem value="standard">Standard ($695/mo)</SelectItem>
                      <SelectItem value="premium">Premium ($995/mo)</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Monthly Fee ($)</Label>
                  <Input value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} className={parsedDiscovery?.monthlyFee ? "border-lime-300 bg-lime-50" : ""} />
                </div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any special notes about this client..." rows={4} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Save Button */}
      {selectedClient && (
        <div className="flex gap-3">
          <Button className="bg-lime-500 flex-1" onClick={handleSave} disabled={saveOnboarding.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveOnboarding.isPending ? "Saving..." : saved ? "Saved!" : "Save Onboarding Data"}
          </Button>
          {completionPercent >= 80 && (
            <Button variant="outline" className="border-emerald-300 text-emerald-700" onClick={() => alert("Would trigger auto-task generation for all checked services.")}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Generate Tasks
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
