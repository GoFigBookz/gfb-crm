import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate, useSearchParams } from "react-router";
import { Phone, Save, ArrowRight, CheckCircle, FileText, Calculator, Sparkles, TrendingUp, TrendingDown, AlertTriangle, Wallet, Eye, Edit3, Send } from "lucide-react";

const INDUSTRIES = [
  "Retail / E-commerce",
  "Restaurant / Food Service",
  "Construction / Trades",
  "Professional Services",
  "Healthcare / Wellness",
  "Technology / SaaS",
  "Real Estate",
  "Manufacturing",
  "Transportation / Logistics",
  "Non-Profit",
  "Education",
  "Entertainment / Media",
  "Automotive",
  "Agriculture",
  "Other"
];

const ACCOUNTING_SOFTWARE = [
  "None (Spreadsheets only)",
  "Excel / Google Sheets",
  "QuickBooks Online (QBO)",
  "QuickBooks Desktop",
  "Sage",
  "Xero",
  "Wave",
  "FreshBooks",
  "Zoho Books",
  "NetSuite",
  "Other"
];

export default function DiscoveryCall() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlClientId = searchParams.get("clientId");
  const { data: clients } = trpc.crmClient.list.useQuery({ limit: 100 });
  const utils = trpc.useUtils();

  const [selectedClient, setSelectedClient] = useState(urlClientId || "");
  const [step, setStep] = useState(urlClientId ? 2 : 1);
  const [discoverySaved, setDiscoverySaved] = useState(false);
  const [showQuotePreview, setShowQuotePreview] = useState(false);
  const [editableQuote, setEditableQuote] = useState({
    monthlyFee: 0,
    services: [] as string[],
    notes: ""
  });

  // Form state
  const [form, setForm] = useState({
    industry: "",
    monthlyTransactions: "",
    bankAccounts: "1",
    creditCards: "0",
    currentAccountingSoftware: "",
    needsBookkeeping: true,
    needsPayroll: false,
    needsHst: false,
    needsYearEnd: false,
    needsCleanup: false,
    needsAdvisory: false,
    payrollFrequency: "none",
    employeeCount: "0",
    subcontractorCount: "0",
    employeeDOB: "",
    hstFrequency: "none",
    hasWsib: false,
    usesStripe: false,
    usesSquare: false,
    usesJobber: false,
    usesPayPal: false,
    usesShopify: false,
    usesEtsy: false,
    usesFreshBooks: false,
    usesWave: false,
    usesPlaid: false,
    usesQuickBooksPayments: false,
    clientDifficulty: "standard",
    discountPercent: "0",
    discountReason: "",
    surchargePercent: "0",
    surchargeReason: "",
    notes: "",
  });

  // Calculate base fee
  const calculateBaseFee = () => {
    let fee = 0;
    const tx = parseInt(form.monthlyTransactions) || 0;
    if (tx < 25) fee = 395;
    else if (tx < 75) fee = 495;
    else if (tx < 150) fee = 695;
    else if (tx < 300) fee = 895;
    else fee = 995 + Math.floor((tx - 300) / 100) * 100;

    // Extra bank accounts
    const banks = parseInt(form.bankAccounts) || 0;
    if (banks > 1) fee += (banks - 1) * 25;

    // Credit cards
    const cards = parseInt(form.creditCards) || 0;
    fee += cards * 25;

    // Services
    if (form.needsHst) fee += 50;
    if (form.needsPayroll) {
      const emp = parseInt(form.employeeCount) || 0;
      fee += 75 + emp * 25;
    }
    if (form.needsYearEnd) fee += 150;
    if (form.needsCleanup) fee += 100;
    if (form.needsAdvisory) fee += 200;
    if (form.hasWsib) fee += 25;

    // Extra payment processors (>2)
    const processors = [
      form.usesStripe, form.usesSquare, form.usesJobber, form.usesPayPal,
      form.usesShopify, form.usesEtsy, form.usesFreshBooks, form.usesWave,
      form.usesPlaid, form.usesQuickBooksPayments
    ].filter(Boolean).length;
    if (processors > 2) fee += (processors - 2) * 25;

    return fee;
  };

  const baseFee = calculateBaseFee();
  const discount = parseFloat(form.discountPercent) || 0;
  const surcharge = parseFloat(form.surchargePercent) || 0;
  const finalFee = Math.round(baseFee * (1 - discount / 100) * (1 + surcharge / 100));

  const updateClient = trpc.crmClient.update.useMutation({
    onSuccess: () => utils.crmClient.list.invalidate(),
  });
  const sendQuote = trpc.crmClient.sendQuote.useMutation({
    onSuccess: () => {
      utils.crmClient.list.invalidate();
      setShowQuotePreview(false);
      navigate("/clients?status=lead");
    },
  });

  const selectedClientData = clients?.find((c) => c.id === parseInt(selectedClient));

  const handleSaveDiscovery = () => {
    if (!selectedClient) return;
    updateClient.mutate({
      id: parseInt(selectedClient),
      data: {
        notes: JSON.stringify({ discovery: form, discoveryDate: new Date().toISOString() }),
        workflowStatus: "discovery_call",
        monthlyFee: finalFee,
      }
    });
    setDiscoverySaved(true);
  };

  const handlePreviewQuote = () => {
    const services = [];
    if (form.needsBookkeeping) services.push("Monthly Bookkeeping");
    if (form.needsPayroll) services.push(`Payroll (${form.employeeCount} employees, ${form.payrollFrequency})`);
    if (form.needsHst) services.push("HST/GST Filing");
    if (form.needsYearEnd) services.push("Year-End Close");
    if (form.needsCleanup) services.push("Cleanup / Backlog");
    if (form.needsAdvisory) services.push("Advisory Services");
    if (form.hasWsib) services.push("WSIB");

    setEditableQuote({
      monthlyFee: finalFee,
      services,
      notes: form.notes
    });
    setShowQuotePreview(true);
  };

  const handleSendQuote = () => {
    sendQuote.mutate({ id: parseInt(selectedClient), amount: editableQuote.monthlyFee });
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
        <Badge variant={discoverySaved ? "default" : "outline"} className={discoverySaved ? "bg-amber-500" : ""}>3. Send Quote</Badge>
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
              {clients?.filter((c) => c.status === "lead").map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name} <Badge variant="outline" className="ml-2 text-xs">{c.status}</Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {step >= 2 && selectedClientData && (
        <div className="space-y-6">
          {/* Business Profile */}
          <Card>
            <CardHeader><CardTitle className="text-base">Business Profile</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Select value={form.industry} onValueChange={(v) => setForm({ ...form, industry: v })}>
                  <SelectTrigger><SelectValue placeholder="Select industry..." /></SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monthly Transactions (approx)</Label>
                <Select value={form.monthlyTransactions} onValueChange={(v) => setForm({ ...form, monthlyTransactions: v })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">Under 25</SelectItem>
                    <SelectItem value="75">25-75</SelectItem>
                    <SelectItem value="150">75-150</SelectItem>
                    <SelectItem value="300">150-300</SelectItem>
                    <SelectItem value="500">300-500</SelectItem>
                    <SelectItem value="750">500+</SelectItem>
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
              <div className="space-y-2 md:col-span-2">
                <Label>Current Accounting Software</Label>
                <Select value={form.currentAccountingSoftware} onValueChange={(v) => setForm({ ...form, currentAccountingSoftware: v })}>
                  <SelectTrigger><SelectValue placeholder="Select software..." /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNTING_SOFTWARE.map((soft) => (
                      <SelectItem key={soft} value={soft}>{soft}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Services */}
          <Card>
            <CardHeader><CardTitle className="text-base">Services Needed</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { key: "needsBookkeeping", label: "Monthly Bookkeeping" },
                  { key: "needsPayroll", label: "Payroll" },
                  { key: "needsHst", label: "HST/GST" },
                  { key: "needsYearEnd", label: "Year-End" },
                  { key: "needsCleanup", label: "Cleanup" },
                  { key: "needsAdvisory", label: "Advisory" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                    <Checkbox checked={form[item.key as keyof typeof form] as boolean} onCheckedChange={(v) => setForm({ ...form, [item.key]: v as boolean })} />
                    <span className="text-sm">{item.label}</span>
                  </label>
                ))}
              </div>

              {form.needsPayroll && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-3">
                  <p className="font-medium text-sm text-blue-800">Payroll Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs"># of Employees</Label>
                      <Input type="number" min="0" value={form.employeeCount} onChange={(e) => setForm({ ...form, employeeCount: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Frequency</Label>
                      <Select value={form.payrollFrequency} onValueChange={(v) => setForm({ ...form, payrollFrequency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select...</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="biweekly">Biweekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs"># of Subcontractors</Label>
                      <Input type="number" min="0" value={form.subcontractorCount} onChange={(e) => setForm({ ...form, subcontractorCount: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Employee DOB (if known)</Label>
                      <Input 
                        type="date" 
                        value={form.employeeDOB} 
                        onChange={(e) => setForm({ ...form, employeeDOB: e.target.value })}
                        placeholder="YYYY-MM-DD"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Processors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Payment Processors & Apps
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { key: "usesStripe", label: "Stripe" },
                  { key: "usesSquare", label: "Square" },
                  { key: "usesPayPal", label: "PayPal" },
                  { key: "usesShopify", label: "Shopify" },
                  { key: "usesEtsy", label: "Etsy" },
                  { key: "usesJobber", label: "Jobber" },
                  { key: "usesFreshBooks", label: "FreshBooks" },
                  { key: "usesWave", label: "Wave" },
                  { key: "usesPlaid", label: "Plaid / Open Banking" },
                  { key: "usesQuickBooksPayments", label: "QuickBooks Payments" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-2">
                    <Checkbox checked={form[item.key as keyof typeof form] as boolean} onCheckedChange={(v) => setForm({ ...form, [item.key]: v as boolean })} />
                    <span className="text-sm">{item.label}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Client Difficulty */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Client Difficulty / Hand-Holding Level
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { value: "easy", label: "Easy 😊", color: "bg-green-50 border-green-200 text-green-700", desc: "Self-sufficient" },
                  { value: "standard", label: "Standard 😐", color: "bg-blue-50 border-blue-200 text-blue-700", desc: "Normal support" },
                  { value: "difficult", label: "Difficult 😤", color: "bg-orange-50 border-orange-200 text-orange-700", desc: "Frequent calls" },
                  { value: "nightmare", label: "Nightmare 😱", color: "bg-red-50 border-red-200 text-red-700", desc: "Constant hand-holding" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setForm({ ...form, clientDifficulty: opt.value });
                      // Auto-set surcharge
                      if (opt.value === "difficult") setForm({ ...form, clientDifficulty: opt.value, surchargePercent: "15", surchargeReason: "High maintenance - frequent calls" });
                      else if (opt.value === "nightmare") setForm({ ...form, clientDifficulty: opt.value, surchargePercent: "25", surchargeReason: "Extensive hand-holding required" });
                      else if (opt.value === "easy") setForm({ ...form, clientDifficulty: opt.value, discountPercent: "10", discountReason: "Easy client - low maintenance" });
                      else setForm({ ...form, clientDifficulty: opt.value, surchargePercent: "0", discountPercent: "0" });
                    }}
                    className={`p-3 border rounded-lg text-left transition-all ${opt.color} ${form.clientDifficulty === opt.value ? "ring-2 ring-offset-2 ring-slate-400" : "opacity-70 hover:opacity-100"}`}
                  >
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs mt-1 opacity-80">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Smart Quote Calculator */}
          <Card className="border-lime-300 border-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-5 w-5 text-lime-500" />
                Smart Quote Calculator
                <Sparkles className="h-4 w-4 text-amber-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Breakdown */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Base Fee (transaction volume)</span>
                  <span className="font-mono">${baseFee < 500 ? 395 : baseFee < 700 ? 495 : baseFee < 900 ? 695 : 895}</span>
                </div>
                {parseInt(form.bankAccounts) > 1 && (
                  <div className="flex justify-between text-slate-600">
                    <span>+ Extra bank accounts ({parseInt(form.bankAccounts) - 1} x $25)</span>
                    <span className="font-mono">+${(parseInt(form.bankAccounts) - 1) * 25}</span>
                  </div>
                )}
                {parseInt(form.creditCards) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>+ Credit cards ({form.creditCards} x $25)</span>
                    <span className="font-mono">+${parseInt(form.creditCards) * 25}</span>
                  </div>
                )}
                {form.needsHst && (
                  <div className="flex justify-between text-slate-600">
                    <span>+ HST/GST filing</span>
                    <span className="font-mono">+$50</span>
                  </div>
                )}
                {form.needsPayroll && (
                  <div className="flex justify-between text-slate-600">
                    <span>+ Payroll ({form.employeeCount} employees)</span>
                    <span className="font-mono">+${75 + (parseInt(form.employeeCount) || 0) * 25}</span>
                  </div>
                )}
                {form.needsYearEnd && (
                  <div className="flex justify-between text-slate-600">
                    <span>+ Year-end close</span>
                    <span className="font-mono">+$150</span>
                  </div>
                )}
                {form.needsCleanup && (
                  <div className="flex justify-between text-slate-600">
                    <span>+ Cleanup</span>
                    <span className="font-mono">+$100</span>
                  </div>
                )}
                {form.needsAdvisory && (
                  <div className="flex justify-between text-slate-600">
                    <span>+ Advisory</span>
                    <span className="font-mono">+$200</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>Subtotal</span>
                  <span className="font-mono">${baseFee}</span>
                </div>
              </div>

              {/* Discount & Surcharge */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-green-700">
                    <TrendingDown className="h-4 w-4" />
                    Discount %
                  </Label>
                  <Input type="number" min="0" max="50" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
                  <Input value={form.discountReason} onChange={(e) => setForm({ ...form, discountReason: e.target.value })} placeholder="Reason for discount..." />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-red-700">
                    <TrendingUp className="h-4 w-4" />
                    Surcharge %
                  </Label>
                  <Input type="number" min="0" max="50" value={form.surchargePercent} onChange={(e) => setForm({ ...form, surchargePercent: e.target.value })} />
                  <Input value={form.surchargeReason} onChange={(e) => setForm({ ...form, surchargeReason: e.target.value })} placeholder="Reason for surcharge..." />
                </div>
              </div>

              {/* Final Price */}
              <div className="bg-lime-50 rounded-lg p-6 border-2 border-lime-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-lime-700 font-medium">Recommended Monthly Fee</p>
                    <p className="text-xs text-lime-600">
                      {finalFee < 500 ? "Basic Package" : finalFee < 800 ? "Standard Package" : "Premium Package"}
                      {discount > 0 && ` • ${discount}% discount`}
                      {surcharge > 0 && ` • ${surcharge}% surcharge`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-lime-700">${finalFee}</p>
                    <p className="text-xs text-lime-600">/month + HST</p>
                  </div>
                </div>
                {(discount > 0 || surcharge > 0) && (
                  <div className="mt-3 pt-3 border-t border-lime-200 text-xs text-lime-600">
                    {discount > 0 && <p>Discount: {form.discountReason || "Custom"} (-{discount}% = -${Math.round(baseFee * discount / 100)})</p>}
                    {surcharge > 0 && <p>Surcharge: {form.surchargeReason || "Custom"} (+{surcharge}% = +${Math.round(baseFee * surcharge / 100)})</p>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea
                className="w-full p-3 border rounded-lg min-h-[100px]"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Additional observations from the call..."
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            {!discoverySaved ? (
              <Button className="bg-lime-500 flex-1" onClick={handleSaveDiscovery}>
                <Save className="h-4 w-4 mr-2" /> Save Discovery Data
              </Button>
            ) : (
              <Button className="bg-amber-500 flex-1" onClick={handlePreviewQuote}>
                <Eye className="h-4 w-4 mr-2" /> Preview Quote → ${finalFee}/mo
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Quote Preview Dialog */}
      <Dialog open={showQuotePreview} onOpenChange={setShowQuotePreview}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileText className="h-5 w-5 text-amber-500" />
              Quote Preview
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Client Info */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="font-medium text-slate-800 mb-2">{selectedClientData?.name}</h3>
              <div className="text-sm text-slate-600 space-y-1">
                {form.industry && <p><span className="font-medium">Industry:</span> {form.industry}</p>}
                {form.currentAccountingSoftware && <p><span className="font-medium">Current Software:</span> {form.currentAccountingSoftware}</p>}
                <p><span className="font-medium">Transactions:</span> {form.monthlyTransactions}/month</p>
                <p><span className="font-medium">Bank Accounts:</span> {form.bankAccounts} | <span className="font-medium">Credit Cards:</span> {form.creditCards}</p>
              </div>
            </div>

            {/* Services */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">Services Included</h4>
              <div className="space-y-2">
                {editableQuote.services.map((service, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-white border rounded">
                    <CheckCircle className="h-4 w-4 text-lime-500" />
                    <span className="text-sm">{service}</span>
                  </div>
                ))}
                {editableQuote.services.length === 0 && (
                  <p className="text-sm text-slate-400 italic">No services selected</p>
                )}
              </div>
            </div>

            {/* Payment Processors */}
            {[
              form.usesStripe && "Stripe",
              form.usesSquare && "Square",
              form.usesPayPal && "PayPal",
              form.usesShopify && "Shopify",
              form.usesEtsy && "Etsy",
              form.usesJobber && "Jobber",
              form.usesFreshBooks && "FreshBooks",
              form.usesWave && "Wave",
              form.usesPlaid && "Plaid",
              form.usesQuickBooksPayments && "QuickBooks Payments",
            ].filter(Boolean).length > 0 && (
              <div>
                <h4 className="font-medium text-slate-700 mb-2">Payment Processors</h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    form.usesStripe && "Stripe",
                    form.usesSquare && "Square",
                    form.usesPayPal && "PayPal",
                    form.usesShopify && "Shopify",
                    form.usesEtsy && "Etsy",
                    form.usesJobber && "Jobber",
                    form.usesFreshBooks && "FreshBooks",
                    form.usesWave && "Wave",
                    form.usesPlaid && "Plaid",
                    form.usesQuickBooksPayments && "QuickBooks Payments",
                  ].filter(Boolean).map((proc, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{proc}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing */}
            <div className="bg-lime-50 rounded-lg p-4 border-2 border-lime-300">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-lime-800">Monthly Fee</h4>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-lime-600">Edit:</span>
                  <Input
                    type="number"
                    className="w-24 text-right font-bold"
                    value={editableQuote.monthlyFee}
                    onChange={(e) => setEditableQuote({ ...editableQuote, monthlyFee: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Base Fee</span>
                  <span className="font-mono">${baseFee}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount ({discount}%)</span>
                    <span className="font-mono">-${Math.round(baseFee * discount / 100)}</span>
                  </div>
                )}
                {surcharge > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Surcharge ({surcharge}%)</span>
                    <span className="font-mono">+${Math.round(baseFee * surcharge / 100)}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span className="text-lime-800">Total Monthly Fee</span>
                  <span className="text-lime-800 font-mono">${editableQuote.monthlyFee}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {editableQuote.notes && (
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <h4 className="font-medium text-amber-800 mb-1">Notes</h4>
                <p className="text-sm text-amber-700">{editableQuote.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button variant="outline" className="flex-1" onClick={() => setShowQuotePreview(false)}>
                <Edit3 className="h-4 w-4 mr-2" /> Edit Quote
              </Button>
              <Button className="flex-1 bg-amber-500" onClick={handleSendQuote}>
                <Send className="h-4 w-4 mr-2" /> Send Quote
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
