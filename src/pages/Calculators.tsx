import { useState, useMemo } from "react";
import {
  Calculator,
  ArrowRightLeft,
  DollarSign,
  Receipt,
  Briefcase,
  Percent,
  TrendingUp,
  Calendar,
  Car,
  Home,
  CreditCard,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Building,
  Clock,
  Package,
  Monitor,
  Truck,
  Factory,
  Hammer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { computePaycheck, CPP_EI_2026 } from "../../api/payroll-paycheck-core";
import { trpc } from "@/providers/trpc";
import { periodsPerYear } from "../../api/payroll-core";

/* =================================================================
   DATA CONSTANTS
   ================================================================= */

const CA_PROVINCES = [
  { value: "AB", label: "Alberta", rate: 0.05, type: "GST" },
  { value: "NB", label: "New Brunswick", rate: 0.15, type: "HST" },
  { value: "NL", label: "Newfoundland & Labrador", rate: 0.15, type: "HST" },
  { value: "NS", label: "Nova Scotia", rate: 0.14, type: "HST" },
  { value: "ON", label: "Ontario", rate: 0.13, type: "HST" },
  { value: "PE", label: "Prince Edward Island", rate: 0.15, type: "HST" },
  { value: "NT", label: "Northwest Territories", rate: 0.05, type: "GST" },
  { value: "NU", label: "Nunavut", rate: 0.05, type: "GST" },
  { value: "YT", label: "Yukon", rate: 0.05, type: "GST" },
];

const US_STATES: { value: string; label: string; rate: number; flat?: boolean }[] = [
  { value: "AL", label: "Alabama", rate: 0.05 },
  { value: "AK", label: "Alaska", rate: 0 },
  { value: "AZ", label: "Arizona", rate: 0.025 },
  { value: "AR", label: "Arkansas", rate: 0.047 },
  { value: "CA", label: "California", rate: 0.093 },
  { value: "CO", label: "Colorado", rate: 0.044 },
  { value: "CT", label: "Connecticut", rate: 0.055 },
  { value: "DE", label: "Delaware", rate: 0.052 },
  { value: "FL", label: "Florida", rate: 0 },
  { value: "GA", label: "Georgia", rate: 0.0549 },
  { value: "HI", label: "Hawaii", rate: 0.068 },
  { value: "ID", label: "Idaho", rate: 0.058 },
  { value: "IL", label: "Illinois", rate: 0.0495 },
  { value: "IN", label: "Indiana", rate: 0.0305 },
  { value: "IA", label: "Iowa", rate: 0.057 },
  { value: "KS", label: "Kansas", rate: 0.0525 },
  { value: "KY", label: "Kentucky", rate: 0.04 },
  { value: "LA", label: "Louisiana", rate: 0.0425 },
  { value: "ME", label: "Maine", rate: 0.0715 },
  { value: "MD", label: "Maryland", rate: 0.0575 },
  { value: "MA", label: "Massachusetts", rate: 0.05 },
  { value: "MI", label: "Michigan", rate: 0.0405 },
  { value: "MN", label: "Minnesota", rate: 0.0785 },
  { value: "MS", label: "Mississippi", rate: 0.047 },
  { value: "MO", label: "Missouri", rate: 0.048 },
  { value: "MT", label: "Montana", rate: 0.059 },
  { value: "NE", label: "Nebraska", rate: 0.0584 },
  { value: "NV", label: "Nevada", rate: 0 },
  { value: "NH", label: "New Hampshire", rate: 0 },
  { value: "NJ", label: "New Jersey", rate: 0.0637 },
  { value: "NM", label: "New Mexico", rate: 0.047 },
  { value: "NY", label: "New York", rate: 0.065 },
  { value: "NC", label: "North Carolina", rate: 0.0475 },
  { value: "ND", label: "North Dakota", rate: 0.029 },
  { value: "OH", label: "Ohio", rate: 0.035 },
  { value: "OK", label: "Oklahoma", rate: 0.0475 },
  { value: "OR", label: "Oregon", rate: 0.0875 },
  { value: "PA", label: "Pennsylvania", rate: 0.0307 },
  { value: "RI", label: "Rhode Island", rate: 0.0475 },
  { value: "SC", label: "South Carolina", rate: 0.064 },
  { value: "SD", label: "South Dakota", rate: 0 },
  { value: "TN", label: "Tennessee", rate: 0 },
  { value: "TX", label: "Texas", rate: 0 },
  { value: "UT", label: "Utah", rate: 0.0465 },
  { value: "VT", label: "Vermont", rate: 0.0675 },
  { value: "VA", label: "Virginia", rate: 0.0575 },
  { value: "WA", label: "Washington", rate: 0 },
  { value: "WV", label: "West Virginia", rate: 0.0512 },
  { value: "WI", label: "Wisconsin", rate: 0.053 },
  { value: "WY", label: "Wyoming", rate: 0 },
];

const CURRENCIES = [
  { code: "USD", name: "US Dollar", rate: 1 },
  { code: "CAD", name: "Canadian Dollar", rate: 1.35 },
  { code: "EUR", name: "Euro", rate: 0.85 },
  { code: "GBP", name: "British Pound", rate: 0.79 },
  { code: "AUD", name: "Australian Dollar", rate: 1.52 },
  { code: "JPY", name: "Japanese Yen", rate: 110 },
  { code: "CNY", name: "Chinese Yuan", rate: 6.45 },
  { code: "MXN", name: "Mexican Peso", rate: 20.5 },
  { code: "CHF", name: "Swiss Franc", rate: 0.92 },
  { code: "SEK", name: "Swedish Krona", rate: 8.6 },
  { code: "NZD", name: "New Zealand Dollar", rate: 1.62 },
  { code: "SGD", name: "Singapore Dollar", rate: 1.35 },
  { code: "HKD", name: "Hong Kong Dollar", rate: 7.8 },
  { code: "INR", name: "Indian Rupee", rate: 74.5 },
  { code: "BRL", name: "Brazilian Real", rate: 5.25 },
];

/* =================================================================
   UTILITY: Format currency
   ================================================================= */
function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/* =================================================================
   HST/GST CALCULATOR
   ================================================================= */
function HSTCalculator() {
  const [province, setProvince] = useState("ON");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"add" | "backout">("add");

  const { data: liveRates } = trpc.calculator.taxRates.useQuery(undefined, { staleTime: 60 * 60 * 1000 });
  const prov = CA_PROVINCES.find((p) => p.value === province)!;
  // Auto-fetched rate wins; baked-in is the fallback.
  const provRate = liveRates?.[`ca.hst.${province}`] ?? prov.rate;
  const amt = parseFloat(amount) || 0;

  const result = useMemo(() => {
    if (mode === "add") {
      // Input = net (before tax), output = tax + gross
      const tax = amt * provRate;
      return { inputLabel: "Net Amount", tax, outputLabel: "Gross Amount", output: amt + tax };
    } else {
      // Input = gross (total with tax), output = backed-out tax + net
      const net = amt / (1 + provRate);
      const tax = amt - net;
      return { inputLabel: "Gross Amount", tax, outputLabel: "Net Amount", output: net };
    }
  }, [amt, mode, provRate]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-lime-500" />
          GST / HST Calculator — {prov.label}
        </CardTitle>
        <CardDescription>
          Calculate GST or HST for all Canadian provinces and territories. Rates: GST 5% (AB, NT, NU, YT), HST 13% (ON), 14% (NS, eff. Apr 1 2025), 15% (NB, NL, PE).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Province / Territory</Label>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {CA_PROVINCES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label} — {(p.rate * 100).toFixed(0)}% {p.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{mode === "add" ? "Net Amount ($)" : "Gross Amount ($)"}</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant={mode === "add" ? "default" : "outline"}
            onClick={() => setMode("add")}
            className={mode === "add" ? "bg-lime-500" : ""}
          >
            Add HST to Net
          </Button>
          <Button
            variant={mode === "backout" ? "default" : "outline"}
            onClick={() => setMode("backout")}
            className={mode === "backout" ? "bg-lime-500" : ""}
          >
            Back Out HST from Gross
          </Button>
        </div>

        {amt > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-slate-50 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-500">{result.inputLabel} (Input)</p>
              <p className="text-xl font-bold">${fmt(amt)}</p>
            </div>
            <div className="bg-lime-50 rounded-lg p-4 text-center">
              <p className="text-xs text-lime-600">HST Amount ({(provRate * 100).toFixed(0)}% {prov.type})</p>
              <p className="text-xl font-bold text-lime-700">${fmt(result.tax)}</p>
            </div>
            <div className="bg-slate-900 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-400">{result.outputLabel} (Result)</p>
              <p className="text-xl font-bold text-white">${fmt(result.output)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   PAYROLL TAX CALCULATOR (Canada + US)
   ================================================================= */
function PayrollTaxCalculator() {
  const [country, setCountry] = useState<"CA" | "US">("CA");
  const [province, setProvince] = useState("ON");
  const [state, setState] = useState("FL");
  const [salary, setSalary] = useState("");
  const [payPeriods, setPayPeriods] = useState("26");

  const sal = parseFloat(salary) || 0;
  const periods = parseFloat(payPeriods) || 26;

  const caResult = useMemo(() => {
    // Accurate 2026 Ontario CPP/CPP2/EI + federal/Ontario income tax via the
    // shared, tested PDOC engine (annual method ÷ periods). Province selector is
    // Ontario-accurate; other provinces use the same federal + ON estimate.
    const freq = periods >= 52 ? "weekly" : periods >= 26 ? "biweekly" : periods >= 24 ? "semi_monthly" : "monthly";
    const ppy = periodsPerYear(freq);
    const perPeriod = sal > 0 ? sal / ppy : 0;
    const pc = computePaycheck(perPeriod, freq);
    return {
      gross: perPeriod,
      federalTax: pc.federalTax * ppy,
      provTax: pc.provincialTax * ppy,
      cppAnnual: (pc.cpp + pc.cpp2) * ppy,
      eiAnnual: pc.ei * ppy,
      totalDeductions: pc.totalDeductions * ppy,
      net: pc.netPay * ppy,
    };
  }, [sal, periods]);

  const usResult = useMemo(() => {
    const gross = sal / periods;
    const st = US_STATES.find((s) => s.value === state)!;
    const stateTax = sal * st.rate;

    // Federal brackets (simplified 2025 single)
    let federalTax = 0;
    if (sal <= 11925) federalTax = sal * 0.10;
    else if (sal <= 48475) federalTax = 1192.50 + (sal - 11925) * 0.12;
    else if (sal <= 103350) federalTax = 1192.50 + 4386 + (sal - 48475) * 0.22;
    else if (sal <= 197300) federalTax = 1192.50 + 4386 + 12052.50 + (sal - 103350) * 0.24;
    else if (sal <= 250525) federalTax = 1192.50 + 4386 + 12052.50 + 22548 + (sal - 197300) * 0.32;
    else if (sal <= 626350) federalTax = 1192.50 + 4386 + 12052.50 + 22548 + 17032 + (sal - 250525) * 0.35;
    else federalTax = 1192.50 + 4386 + 12052.50 + 22548 + 17032 + 131543.75 + (sal - 626350) * 0.37;

    const fica = Math.min(sal, 168600) * 0.062 + sal * 0.0145; // Social Security + Medicare
    const totalDeductions = federalTax + stateTax + fica;
    const net = sal - totalDeductions;

    return { gross, federalTax, stateTax, fica, totalDeductions, net, stateRate: st.rate };
  }, [sal, periods, state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-lime-500" />
          Payroll Tax Calculator
        </CardTitle>
        <CardDescription>Estimate annual payroll deductions for Canada and US employees</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button variant={country === "CA" ? "default" : "outline"} onClick={() => setCountry("CA")} className={country === "CA" ? "bg-lime-500" : ""}>Canada</Button>
          <Button variant={country === "US" ? "default" : "outline"} onClick={() => setCountry("US")} className={country === "US" ? "bg-lime-500" : ""}>United States</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Annual Salary ($)</Label>
            <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="75000" />
          </div>
          <div className="space-y-2">
            <Label>Pay Periods / Year</Label>
            <Input type="number" value={payPeriods} onChange={(e) => setPayPeriods(e.target.value)} placeholder="26" />
          </div>
          {country === "CA" ? (
            <div className="space-y-2">
              <Label>Province</Label>
              <Select value={province} onValueChange={setProvince}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {CA_PROVINCES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>State</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {US_STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {country === "CA" && (
          <p className="text-[11px] text-slate-400">Uses 2026 CRA rates — CPP 5.95% (+CPP2), EI 1.63%, federal + Ontario income tax (brackets, BPA, surtax, health premium). Estimate; verify on CRA PDOC before remitting.</p>
        )}

        {sal > 0 && (
          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500">Gross / Pay</p>
                <p className="text-lg font-bold">${fmt(country === "CA" ? caResult.gross : usResult.gross)}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xs text-red-500">Federal Tax</p>
                <p className="text-lg font-bold text-red-700">${fmt(country === "CA" ? caResult.federalTax : usResult.federalTax)}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xs text-amber-600">{country === "CA" ? "Provincial Tax" : "State Tax"}</p>
                <p className="text-lg font-bold text-amber-700">${fmt(country === "CA" ? caResult.provTax : usResult.stateTax)}</p>
              </div>
              <div className="bg-lime-50 rounded-lg p-3 text-center">
                <p className="text-xs text-lime-600">Net Annual</p>
                <p className="text-lg font-bold text-lime-700">${fmt(country === "CA" ? caResult.net : usResult.net)}</p>
              </div>
            </div>

            {country === "CA" ? (
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span>CPP Contributions</span><span className="font-medium">${fmt(caResult.cppAnnual)}</span></div>
                <div className="flex justify-between"><span>EI Premiums</span><span className="font-medium">${fmt(caResult.eiAnnual)}</span></div>
                <div className="flex justify-between border-t pt-2"><span>Total Deductions</span><span className="font-bold">${fmt(caResult.totalDeductions)}</span></div>
                <div className="flex justify-between"><span>Net per Pay</span><span className="font-bold text-lime-600">${fmt(caResult.net / periods)}</span></div>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span>FICA (SS + Medicare)</span><span className="font-medium">${fmt(usResult.fica)}</span></div>
                <div className="flex justify-between border-t pt-2"><span>Total Deductions</span><span className="font-bold">${fmt(usResult.totalDeductions)}</span></div>
                <div className="flex justify-between"><span>Net per Pay</span><span className="font-bold text-lime-600">${fmt(usResult.net / periods)}</span></div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   PRORATED PAYROLL CALCULATOR
   ================================================================= */
function ProratedPayrollCalculator() {
  const [annualSalary, setAnnualSalary] = useState("");
  const [daysWorked, setDaysWorked] = useState("");
  const [totalDays, setTotalDays] = useState("260");
  const [hoursPerDay, setHoursPerDay] = useState("8");

  const sal = parseFloat(annualSalary) || 0;
  const worked = parseFloat(daysWorked) || 0;
  const total = parseFloat(totalDays) || 260;
  const hrs = parseFloat(hoursPerDay) || 8;

  const result = useMemo(() => {
    const daily = sal / total;
    const hourly = daily / hrs;
    return {
      prorated: daily * worked,
      daily,
      hourly,
    };
  }, [sal, worked, total, hrs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-lime-500" />
          Prorated Payroll Calculator
        </CardTitle>
        <CardDescription>Calculate partial pay for employees starting mid-period or working partial days</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2"><Label>Annual Salary ($)</Label><Input type="number" value={annualSalary} onChange={(e) => setAnnualSalary(e.target.value)} placeholder="75000" /></div>
          <div className="space-y-2"><Label>Days Worked</Label><Input type="number" value={daysWorked} onChange={(e) => setDaysWorked(e.target.value)} placeholder="10" /></div>
          <div className="space-y-2"><Label>Work Days / Year</Label><Input type="number" value={totalDays} onChange={(e) => setTotalDays(e.target.value)} placeholder="260" /></div>
          <div className="space-y-2"><Label>Hours / Day</Label><Input type="number" value={hoursPerDay} onChange={(e) => setHoursPerDay(e.target.value)} placeholder="8" /></div>
        </div>
        {sal > 0 && worked > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">Daily Rate</p><p className="text-xl font-bold">${fmt(result.daily)}</p></div>
            <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">Hourly Rate</p><p className="text-xl font-bold">${fmt(result.hourly)}</p></div>
            <div className="bg-lime-50 rounded-lg p-4 text-center"><p className="text-xs text-lime-600">Prorated Pay</p><p className="text-xl font-bold text-lime-700">${fmt(result.prorated)}</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   VACATION PAY CALCULATOR
   ================================================================= */
function VacationPayCalculator() {
  const [earnings, setEarnings] = useState("");
  const [vacationRate, setVacationRate] = useState("0.04");
  const [province, setProvince] = useState("ON");

  const earn = parseFloat(earnings) || 0;
  const rate = parseFloat(vacationRate) || 0.04;

  // Province-specific minimums
  const provRates: Record<string, { min: number; note: string }> = {
    AB: { min: 0.04, note: "4% (2 weeks) or 6% after 5 years" },
    NB: { min: 0.04, note: "4% (2 weeks) or 6% after 8 years" },
    NL: { min: 0.04, note: "4% (2 weeks) or 6% after 15 years" },
    NS: { min: 0.04, note: "4% (2 weeks) or 6% after 8 years" },
    ON: { min: 0.04, note: "4% (2 weeks) or 6% after 5 years" },
    PE: { min: 0.04, note: "4% (2 weeks) or 6% after 8 years" },
    NT: { min: 0.04, note: "4% (2 weeks) or 6% after 5 years" },
    NU: { min: 0.04, note: "4% (2 weeks) or 6% after 5 years" },
    YT: { min: 0.04, note: "4% (2 weeks) or 6% after 5 years" },
  };

  const p = provRates[province] || provRates.ON;
  const vacationPay = earn * rate;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-lime-500" />
          Vacation Pay Calculator
        </CardTitle>
        <CardDescription>Calculate vacation pay entitlements by province</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2"><Label>Eligible Earnings ($)</Label><Input type="number" value={earnings} onChange={(e) => setEarnings(e.target.value)} placeholder="50000" /></div>
          <div className="space-y-2"><Label>Vacation Rate</Label>
            <Select value={vacationRate} onValueChange={setVacationRate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0.04">4% — 2 weeks</SelectItem>
                <SelectItem value="0.06">6% — 3 weeks</SelectItem>
                <SelectItem value="0.08">8% — 4 weeks</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Province</Label>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CA_PROVINCES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Badge variant="outline" className="bg-blue-50 text-blue-700">{p.note}</Badge>
        {earn > 0 && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">Earnings</p><p className="text-xl font-bold">${fmt(earn)}</p></div>
            <div className="bg-lime-50 rounded-lg p-4 text-center"><p className="text-xs text-lime-600">Vacation Pay ({(rate * 100).toFixed(0)}%)</p><p className="text-xl font-bold text-lime-700">${fmt(vacationPay)}</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   STAT PAY CALCULATOR
   ================================================================= */
function StatPayCalculator() {
  const [regularPay, setRegularPay] = useState("");
  const [daysWorked, setDaysWorked] = useState("20");
  const [statDays, setStatDays] = useState("1");
  const [province, setProvince] = useState("ON");

  const pay = parseFloat(regularPay) || 0;
  const days = parseFloat(daysWorked) || 20;
  const stats = parseFloat(statDays) || 1;

  const result = useMemo(() => {
    const daily = pay / days;
    return { daily, total: daily * stats };
  }, [pay, days, stats]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-lime-500" />
          Statutory Holiday Pay Calculator
        </CardTitle>
        <CardDescription>Calculate stat pay for Canadian employees</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2"><Label>Total Regular Pay ($)</Label><Input type="number" value={regularPay} onChange={(e) => setRegularPay(e.target.value)} placeholder="4000" /></div>
          <div className="space-y-2"><Label>Days Worked</Label><Input type="number" value={daysWorked} onChange={(e) => setDaysWorked(e.target.value)} placeholder="20" /></div>
          <div className="space-y-2"><Label>Stat Days</Label><Input type="number" value={statDays} onChange={(e) => setStatDays(e.target.value)} placeholder="1" /></div>
          <div className="space-y-2"><Label>Province</Label>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CA_PROVINCES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {pay > 0 && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">Daily Rate</p><p className="text-xl font-bold">${fmt(result.daily)}</p></div>
            <div className="bg-lime-50 rounded-lg p-4 text-center"><p className="text-xs text-lime-600">Stat Pay Total</p><p className="text-xl font-bold text-lime-700">${fmt(result.total)}</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   TERMINATION PAY CALCULATOR
   ================================================================= */
function TerminationPayCalculator() {
  const [years, setYears] = useState("");
  const [weeklyPay, setWeeklyPay] = useState("");
  const [province, setProvince] = useState("ON");

  const y = parseFloat(years) || 0;
  const wp = parseFloat(weeklyPay) || 0;

  // Provincial notice / severance rules (simplified)
  const provRules: Record<string, { noticeWeeks: number; severanceWeeks: number; note: string }> = {
    ON: { noticeWeeks: Math.min(y * 1, 8), severanceWeeks: y >= 5 ? Math.min(y * 1, 26) : 0, note: "1 week per year, max 8. Severance: 1 week per year after 5 years" },
    AB: { noticeWeeks: Math.min(y * 1, 8), severanceWeeks: 0, note: "1 week per year, max 8" },
    NS: { noticeWeeks: Math.min(y * 1, 8), severanceWeeks: 0, note: "1 week per year, max 8" },
    NB: { noticeWeeks: Math.min(y * 1, 8), severanceWeeks: 0, note: "1 week per year, max 8" },
    NL: { noticeWeeks: Math.min(y * 1, 8), severanceWeeks: 0, note: "1 week per year, max 8" },
    PE: { noticeWeeks: Math.min(y * 1, 8), severanceWeeks: 0, note: "1 week per year, max 8" },
    NT: { noticeWeeks: Math.min(y * 1, 8), severanceWeeks: 0, note: "1 week per year, max 8" },
    NU: { noticeWeeks: Math.min(y * 1, 8), severanceWeeks: 0, note: "1 week per year, max 8" },
    YT: { noticeWeeks: Math.min(y * 1, 8), severanceWeeks: 0, note: "1 week per year, max 8" },
  };

  const rule = provRules[province] || provRules.ON;
  const noticePay = Math.min(y, 8) * wp;
  const severancePay = (province === "ON" && y >= 5) ? Math.min(y, 26) * wp : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-lime-500" />
          Termination / Severance Pay Calculator
        </CardTitle>
        <CardDescription>Estimate notice and severance pay obligations</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2"><Label>Years of Service</Label><Input type="number" value={years} onChange={(e) => setYears(e.target.value)} placeholder="5" /></div>
          <div className="space-y-2"><Label>Regular Weekly Pay ($)</Label><Input type="number" value={weeklyPay} onChange={(e) => setWeeklyPay(e.target.value)} placeholder="1200" /></div>
          <div className="space-y-2"><Label>Province</Label>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CA_PROVINCES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <Badge variant="outline" className="bg-blue-50 text-blue-700">{rule.note}</Badge>
        {y > 0 && wp > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">Notice Pay</p><p className="text-xl font-bold">${fmt(noticePay)}</p></div>
            {province === "ON" && (
              <div className="bg-amber-50 rounded-lg p-4 text-center"><p className="text-xs text-amber-600">Severance Pay</p><p className="text-xl font-bold text-amber-700">${fmt(severancePay)}</p></div>
            )}
            <div className="bg-lime-50 rounded-lg p-4 text-center"><p className="text-xs text-lime-600">Total Owed</p><p className="text-xl font-bold text-lime-700">${fmt(noticePay + severancePay)}</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   DIVIDENDS CALCULATOR (Eligible + Non-Eligible)
   ================================================================= */
function DividendsCalculator() {
  const [type, setType] = useState<"eligible" | "noneligible">("eligible");
  const [dividendAmount, setDividendAmount] = useState("");
  const [province, setProvince] = useState("ON");

  const amt = parseFloat(dividendAmount) || 0;

  const result = useMemo(() => {
    const grossUp = type === "eligible" ? amt * 1.38 : amt * 1.15;
    const dividendTaxCredit = type === "eligible" ? grossUp * 0.1546 : grossUp * 0.0903; // Federal approximate
    const taxBeforeCredit = grossUp * 0.15; // Simplified federal rate
    const netTax = Math.max(0, taxBeforeCredit - dividendTaxCredit);
    const afterTax = amt - netTax;
    return { grossUp, dividendTaxCredit, taxBeforeCredit, netTax, afterTax };
  }, [amt, type]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-lime-500" />
          Dividends Tax Calculator
        </CardTitle>
        <CardDescription>Estimate tax on eligible and non-eligible Canadian dividends</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button variant={type === "eligible" ? "default" : "outline"} onClick={() => setType("eligible")} className={type === "eligible" ? "bg-lime-500" : ""}>Eligible Dividends</Button>
          <Button variant={type === "noneligible" ? "default" : "outline"} onClick={() => setType("noneligible")} className={type === "noneligible" ? "bg-lime-500" : ""}>Non-Eligible Dividends</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Dividend Amount ($)</Label><Input type="number" value={dividendAmount} onChange={(e) => setDividendAmount(e.target.value)} placeholder="10000" /></div>
          <div className="space-y-2"><Label>Province</Label>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CA_PROVINCES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {amt > 0 && (
          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500">Actual Dividend</p><p className="text-lg font-bold">${fmt(amt)}</p></div>
              <div className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500">Grossed-Up</p><p className="text-lg font-bold">${fmt(result.grossUp)}</p></div>
              <div className="bg-red-50 rounded-lg p-3 text-center"><p className="text-xs text-red-500">Est. Tax Payable</p><p className="text-lg font-bold text-red-700">${fmt(result.netTax)}</p></div>
              <div className="bg-lime-50 rounded-lg p-3 text-center"><p className="text-xs text-lime-600">After-Tax</p><p className="text-lg font-bold text-lime-700">${fmt(result.afterTax)}</p></div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
              <strong>Note:</strong> This is an estimate using federal rates only. Provincial dividend tax credits vary and will affect the final tax payable. Consult provincial schedules for precise calculations.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   CURRENCY / FX CALCULATOR
   ================================================================= */
function FXCalculator() {
  const [amount, setAmount] = useState("");
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("CAD");
  const [customRate, setCustomRate] = useState("");

  // Live Bank of Canada daily rates (CAD per 1 unit of each currency).
  const { data: fx } = trpc.calculator.fxRates.useQuery(undefined, { staleTime: 6 * 60 * 60 * 1000, refetchOnWindowFocus: false });
  const live = fx?.rates;
  // CAD-per-unit for a currency: live if available, else the static fallback
  // (static table is USD-based, so convert it to CAD-per-unit via its CAD entry).
  const staticCadPerUnit = (code: string) => {
    const usdPer = CURRENCIES.find((c) => c.code === code)?.rate ?? 1; // units per USD
    const cadPerUsd = CURRENCIES.find((c) => c.code === "CAD")?.rate ?? 1.35;
    return code === "CAD" ? 1 : cadPerUsd / usdPer;
  };
  const cadPerUnit = (code: string) => (live && live[code] ? live[code] : staticCadPerUnit(code));

  const amt = parseFloat(amount) || 0;
  const marketRate = cadPerUnit(fromCurrency) / cadPerUnit(toCurrency); // toCurrency per 1 fromCurrency
  const rate = customRate ? parseFloat(customRate) : marketRate;
  const converted = amt * rate;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-lime-500" />
          Currency Converter
        </CardTitle>
        <CardDescription>{live ? `Live rates — ${fx?.source}, ${fx?.date}` : "Live rates unavailable — using fallback. Enter a custom rate for precision."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-2"><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" /></div>
          <div className="space-y-2"><Label>From</Label>
            <Select value={fromCurrency} onValueChange={setFromCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>To</Label>
            <Select value={toCurrency} onValueChange={setToCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Custom Rate (optional)</Label><Input type="number" step="0.0001" value={customRate} onChange={(e) => setCustomRate(e.target.value)} placeholder={`${fmt(rate, 4)}`} /></div>
        </div>
        {amt > 0 && (
          <div className="bg-lime-50 rounded-lg p-6 text-center mt-4">
            <p className="text-sm text-lime-600 mb-1">{fmt(amt)} {fromCurrency} =</p>
            <p className="text-3xl font-bold text-lime-700">{fmt(converted)} {toCurrency}</p>
            <p className="text-xs text-lime-500 mt-2">Rate: 1 {fromCurrency} = {fmt(rate, 4)} {toCurrency}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   DEPRECIATION CALCULATOR (CCA / Straight Line / Double Declining)
   ================================================================= */
function DepreciationCalculator() {
  const [cost, setCost] = useState("");
  const [salvageValue, setSalvageValue] = useState("0");
  const [usefulLife, setUsefulLife] = useState("5");
  const [method, setMethod] = useState<"straight" | "declining" | "double-declining">("declining");
  const [rate, setRate] = useState("20"); // CCA rate %
  const [halfYearRule, setHalfYearRule] = useState(true);
  const [showSchedule, setShowSchedule] = useState(false);

  const c = parseFloat(cost) || 0;
  const salvage = parseFloat(salvageValue) || 0;
  const life = parseFloat(usefulLife) || 1;
  const ccaRate = parseFloat(rate) / 100;

  const schedule = useMemo(() => {
    if (c <= 0) return [];
    const rows: { year: number; opening: number; claim: number; ending: number; note?: string }[] = [];
    let ucc = c; // Undepreciated Capital Cost

    if (method === "straight") {
      const annual = (c - salvage) / life;
      for (let year = 1; year <= life; year++) {
        const claim = year === life ? ucc - salvage : annual;
        rows.push({ year, opening: ucc, claim: Math.max(0, claim), ending: Math.max(salvage, ucc - claim) });
        ucc = Math.max(salvage, ucc - claim);
      }
    } else if (method === "declining") {
      // CCA-style declining balance with optional half-year rule
      const effectiveRate = ccaRate;
      for (let year = 1; year <= 30; year++) {
        if (ucc <= salvage) break;
        let claim = ucc * effectiveRate;
        if (halfYearRule && year === 1) claim = claim * 0.5; // Half-year rule
        if (ucc - claim < salvage) claim = ucc - salvage;
        rows.push({ year, opening: ucc, claim: Math.max(0, claim), ending: Math.max(salvage, ucc - claim) });
        ucc = Math.max(salvage, ucc - claim);
      }
    } else if (method === "double-declining") {
      const ddbRate = 2 / life;
      for (let year = 1; year <= life; year++) {
        if (ucc <= salvage) break;
        let claim = ucc * ddbRate;
        if (ucc - claim < salvage) claim = ucc - salvage;
        if (claim <= 0) break;
        rows.push({ year, opening: ucc, claim, ending: Math.max(salvage, ucc - claim) });
        ucc = Math.max(salvage, ucc - claim);
      }
    }
    return rows;
  }, [c, salvage, life, method, ccaRate, halfYearRule]);

  const totalClaimed = schedule.reduce((sum, r) => sum + r.claim, 0);
  const remaining = Math.max(0, c - totalClaimed - salvage);

  // Common CCA classes
  const ccaClasses = [
    { class: "Class 1", rate: "4", desc: "Buildings (acquired after 1987)" },
    { class: "Class 8", rate: "20", desc: "Furniture, fixtures, machinery, equipment" },
    { class: "Class 10", rate: "30", desc: "Vehicles (pre-2022), computer equipment" },
    { class: "Class 10.1", rate: "30", desc: "Passenger vehicles > $30k limit" },
    { class: "Class 12", rate: "100", desc: "Tools, medical instruments, computer software" },
    { class: "Class 43", rate: "30", desc: "Manufacturing & processing equipment" },
    { class: "Class 44", rate: "25", desc: "Patents, franchises, concessions" },
    { class: "Class 50", rate: "55", desc: "Computer equipment (after 2009)" },
    { class: "Class 53", rate: "50", desc: "M&P equipment (2016-2025, full expensing)" },
    { class: "Class 54", rate: "100", desc: "Zero-emission vehicles (before 2024)" },
    { class: "Class 55", rate: "100", desc: "Zero-emission vehicles (2024+)" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-lime-500" />
          Asset Depreciation Calculator
        </CardTitle>
        <CardDescription>
          Calculate CCA (Capital Cost Allowance), straight-line, and double-declining balance depreciation. Includes half-year rule for Canadian tax.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CCA Quick Select */}
        <div className="space-y-2">
          <Label>Quick Select — CRA CCA Class</Label>
          <p className="text-xs text-slate-400">Pick the class that matches the asset — the description tells you what each CRA class covers.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {ccaClasses.map((cls) => {
              const selected = rate === cls.rate;
              return (
                <button
                  key={cls.class}
                  type="button"
                  onClick={() => { setRate(cls.rate); setMethod("declining"); }}
                  className={`text-left rounded-lg border p-2.5 transition-colors ${
                    selected
                      ? "border-lime-500 bg-lime-50 ring-1 ring-lime-400"
                      : "border-slate-200 bg-white hover:border-lime-300 hover:bg-lime-50/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">{cls.class}</span>
                    <span className={`text-xs font-medium rounded-full px-1.5 py-0.5 ${selected ? "bg-lime-500 text-white" : "bg-slate-100 text-slate-600"}`}>{cls.rate}%</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-snug">{cls.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Asset Cost ($)</Label>
            <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="50000" />
          </div>
          <div className="space-y-2">
            <Label>Salvage / Residual Value ($)</Label>
            <Input type="number" value={salvageValue} onChange={(e) => setSalvageValue(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label>Useful Life (years)</Label>
            <Input type="number" value={usefulLife} onChange={(e) => setUsefulLife(e.target.value)} placeholder="5" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Depreciation Method</Label>
            <Select value={method} onValueChange={(v: any) => setMethod(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="straight">Straight-Line</SelectItem>
                <SelectItem value="declining">Declining Balance (CCA)</SelectItem>
                <SelectItem value="double-declining">Double Declining Balance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {method === "declining" && (
            <div className="space-y-2">
              <Label>CCA Rate (%)</Label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="20" />
            </div>
          )}
          <div className="flex items-center gap-2 pt-6">
            <Button
              variant={halfYearRule ? "default" : "outline"}
              size="sm"
              onClick={() => setHalfYearRule(!halfYearRule)}
              className={halfYearRule ? "bg-lime-500" : ""}
            >
              Half-Year Rule: {halfYearRule ? "ON" : "OFF"}
            </Button>
          </div>
        </div>

        {c > 0 && schedule.length > 0 && (
          <div className="space-y-4 mt-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-500">Asset Cost</p>
                <p className="text-xl font-bold">${fmt(c)}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <p className="text-xs text-red-500">Total Depreciated</p>
                <p className="text-xl font-bold text-red-700">${fmt(totalClaimed)}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 text-center">
                <p className="text-xs text-amber-600">Remaining UCC</p>
                <p className="text-xl font-bold text-amber-700">${fmt(remaining + salvage)}</p>
              </div>
              <div className="bg-lime-50 rounded-lg p-4 text-center">
                <p className="text-xs text-lime-600">Salvage Value</p>
                <p className="text-xl font-bold text-lime-700">${fmt(salvage)}</p>
              </div>
            </div>

            {/* Schedule Toggle */}
            <Button variant="outline" size="sm" onClick={() => setShowSchedule(!showSchedule)}>
              {showSchedule ? "Hide" : "Show"} Full Schedule ({schedule.length} years)
            </Button>

            {showSchedule && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">Year</th>
                      <th className="text-right p-3 text-xs text-slate-500 font-medium">Opening UCC</th>
                      <th className="text-right p-3 text-xs text-slate-500 font-medium">Depreciation Claim</th>
                      <th className="text-right p-3 text-xs text-slate-500 font-medium">Ending UCC</th>
                      <th className="text-right p-3 text-xs text-slate-500 font-medium">% Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((row) => (
                      <tr key={row.year} className="border-t hover:bg-slate-50">
                        <td className="p-3 font-medium">{row.year}</td>
                        <td className="p-3 text-right">${fmt(row.opening)}</td>
                        <td className="p-3 text-right font-medium text-red-600">${fmt(row.claim)}</td>
                        <td className="p-3 text-right">${fmt(row.ending)}</td>
                        <td className="p-3 text-right text-slate-400">{((row.claim / c) * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Year 1 highlight */}
            {schedule[0] && (
              <div className="bg-lime-50 rounded-lg p-4 border border-lime-200">
                <p className="text-sm font-medium text-lime-800">
                  Year 1 Claim: ${fmt(schedule[0].claim)} 
                  {halfYearRule && method === "declining" && "(includes half-year rule — 50% of normal CCA)"}
                </p>
                <p className="text-xs text-lime-600 mt-1">
                  Remaining UCC after Year 1: ${fmt(schedule[0].ending)}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   MILEAGE CALCULATOR
   ================================================================= */
function MileageCalculator() {
  const [km, setKm] = useState("");
  const [rate, setRate] = useState("0.72");
  const [province, setProvince] = useState("ON");

  const kilometers = parseFloat(km) || 0;
  const r = parseFloat(rate) || 0.72;

  // CRA 2024 rates: $0.72 first 5,000km, $0.66 after for business
  const result = useMemo(() => {
    const first = Math.min(kilometers, 5000) * r;
    const after = Math.max(0, kilometers - 5000) * 0.66;
    return { first, after, total: first + after };
  }, [kilometers, r]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Car className="h-5 w-5 text-lime-500" />
          Vehicle Mileage Calculator
        </CardTitle>
        <CardDescription>Calculate vehicle expense deductions (CRA rates)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2"><Label>Business Kilometers</Label><Input type="number" value={km} onChange={(e) => setKm(e.target.value)} placeholder="8000" /></div>
          <div className="space-y-2"><Label>Rate / km ($)</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.72" /></div>
          <div className="space-y-2"><Label>Province</Label>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CA_PROVINCES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {kilometers > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">First 5,000 km</p><p className="text-xl font-bold">${fmt(result.first)}</p></div>
            <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">After 5,000 km @ $0.66</p><p className="text-xl font-bold">${fmt(result.after)}</p></div>
            <div className="bg-lime-50 rounded-lg p-4 text-center"><p className="text-xs text-lime-600">Total Deduction</p><p className="text-xl font-bold text-lime-700">${fmt(result.total)}</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   HOME OFFICE CALCULATOR
   ================================================================= */
function HomeOfficeCalculator() {
  const [totalHome, setTotalHome] = useState("");
  const [officeArea, setOfficeArea] = useState("");
  const [expenses, setExpenses] = useState({ rent: "", utilities: "", internet: "", insurance: "", maintenance: "" });

  const total = parseFloat(totalHome) || 0;
  const office = parseFloat(officeArea) || 0;
  const pct = total > 0 ? office / total : 0;

  const rent = parseFloat(expenses.rent) || 0;
  const utilities = parseFloat(expenses.utilities) || 0;
  const internet = parseFloat(expenses.internet) || 0;
  const insurance = parseFloat(expenses.insurance) || 0;
  const maintenance = parseFloat(expenses.maintenance) || 0;
  const totalExpenses = rent + utilities + internet + insurance + maintenance;
  const deductible = totalExpenses * pct;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="h-5 w-5 text-lime-500" />
          Home Office Expense Calculator
        </CardTitle>
        <CardDescription>Calculate workspace-in-the-home deductions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2"><Label>Total Home Area (sq ft / m²)</Label><Input type="number" value={totalHome} onChange={(e) => setTotalHome(e.target.value)} placeholder="1200" /></div>
          <div className="space-y-2"><Label>Office Area</Label><Input type="number" value={officeArea} onChange={(e) => setOfficeArea(e.target.value)} placeholder="150" /></div>
          <div className="space-y-2"><Label>Rent / Mortgage ($)</Label><Input type="number" value={expenses.rent} onChange={(e) => setExpenses({ ...expenses, rent: e.target.value })} placeholder="1500" /></div>
          <div className="space-y-2"><Label>Utilities ($)</Label><Input type="number" value={expenses.utilities} onChange={(e) => setExpenses({ ...expenses, utilities: e.target.value })} placeholder="200" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2"><Label>Internet ($)</Label><Input type="number" value={expenses.internet} onChange={(e) => setExpenses({ ...expenses, internet: e.target.value })} placeholder="80" /></div>
          <div className="space-y-2"><Label>Insurance ($)</Label><Input type="number" value={expenses.insurance} onChange={(e) => setExpenses({ ...expenses, insurance: e.target.value })} placeholder="50" /></div>
          <div className="space-y-2"><Label>Maintenance ($)</Label><Input type="number" value={expenses.maintenance} onChange={(e) => setExpenses({ ...expenses, maintenance: e.target.value })} placeholder="100" /></div>
        </div>
        {total > 0 && office > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">Office %</p><p className="text-xl font-bold">{(pct * 100).toFixed(1)}%</p></div>
            <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">Total Expenses</p><p className="text-xl font-bold">${fmt(totalExpenses)}</p></div>
            <div className="bg-lime-50 rounded-lg p-4 text-center"><p className="text-xs text-lime-600">Deductible</p><p className="text-xl font-bold text-lime-700">${fmt(deductible)}</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   LOAN / MORTGAGE CALCULATOR
   ================================================================= */
function LoanCalculator() {
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("5.5");
  const [years, setYears] = useState("25");
  const [type, setType] = useState<"mortgage" | "loan">("mortgage");

  const p = parseFloat(principal) || 0;
  const r = parseFloat(rate) || 0;
  const y = parseFloat(years) || 0;

  const result = useMemo(() => {
    const monthlyRate = r / 100 / 12;
    const numPayments = y * 12;
    if (monthlyRate === 0) {
      const payment = p / numPayments;
      return { payment, total: p, interest: 0 };
    }
    const payment = (p * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
    const total = payment * numPayments;
    return { payment, total, interest: total - p };
  }, [p, r, y]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-lime-500" />
          Loan & Mortgage Calculator
        </CardTitle>
        <CardDescription>Calculate monthly payments and total interest</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button variant={type === "mortgage" ? "default" : "outline"} onClick={() => setType("mortgage")} className={type === "mortgage" ? "bg-lime-500" : ""}>Mortgage</Button>
          <Button variant={type === "loan" ? "default" : "outline"} onClick={() => setType("loan")} className={type === "loan" ? "bg-lime-500" : ""}>Personal Loan</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2"><Label>Principal ($)</Label><Input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="500000" /></div>
          <div className="space-y-2"><Label>Annual Interest Rate (%)</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="5.5" /></div>
          <div className="space-y-2"><Label>Term (Years)</Label><Input type="number" value={years} onChange={(e) => setYears(e.target.value)} placeholder={type === "mortgage" ? "25" : "5"} /></div>
        </div>
        {p > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-lime-50 rounded-lg p-4 text-center"><p className="text-xs text-lime-600">Monthly Payment</p><p className="text-xl font-bold text-lime-700">${fmt(result.payment)}</p></div>
            <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">Total Paid</p><p className="text-xl font-bold">${fmt(result.total)}</p></div>
            <div className="bg-red-50 rounded-lg p-4 text-center"><p className="text-xs text-red-500">Total Interest</p><p className="text-xl font-bold text-red-700">${fmt(result.interest)}</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   CPP / EI CALCULATOR
   ================================================================= */
function CPPEICalculator() {
  const [salary, setSalary] = useState("");
  const sal = parseFloat(salary) || 0;
  // Baked-in 2026 constants, overlaid with any auto-fetched live values.
  const { data: liveRates } = trpc.calculator.taxRates.useQuery(undefined, { staleTime: 60 * 60 * 1000 });
  const lv = (k: string, fb: number) => (typeof liveRates?.[k] === "number" && liveRates[k] > 0 ? liveRates[k] : fb);
  const K = {
    ...CPP_EI_2026,
    cppRate: lv("ca.cpp.rate", CPP_EI_2026.cppRate),
    ympe: lv("ca.cpp.ympe", CPP_EI_2026.ympe),
    cppExemption: lv("ca.cpp.exemption", CPP_EI_2026.cppExemption),
    cppMaxAnnual: lv("ca.cpp.max", CPP_EI_2026.cppMaxAnnual),
    cpp2Rate: lv("ca.cpp2.rate", CPP_EI_2026.cpp2Rate),
    yampe: lv("ca.cpp2.yampe", CPP_EI_2026.yampe),
    cpp2MaxAnnual: lv("ca.cpp2.max", CPP_EI_2026.cpp2MaxAnnual),
    eiRate: lv("ca.ei.rate", CPP_EI_2026.eiRate),
    mie: lv("ca.ei.mie", CPP_EI_2026.mie),
    eiMaxAnnual: lv("ca.ei.max", CPP_EI_2026.eiMaxAnnual),
  };

  // Exact 2026 CRA maximum-deduction math from the canonical constants:
  //   CPP   = (min(salary, YMPE) − $3,500 exemption) × 5.95%, capped at the annual max
  //   CPP2  = (min(salary, YAMPE) − YMPE) × 4%, capped at the CPP2 annual max
  //   EI    = min(salary, MIE) × 1.63%, capped at the annual max
  const cppBase = Math.min(Math.max(0, Math.min(sal, K.ympe) - K.cppExemption) * K.cppRate, K.cppMaxAnnual);
  const cpp2 = Math.min(Math.max(0, Math.min(sal, K.yampe) - K.ympe) * K.cpp2Rate, K.cpp2MaxAnnual);
  const ei = Math.min(Math.min(sal, K.mie) * K.eiRate, K.eiMaxAnnual);
  const cppPayable = cppBase + cpp2;
  const employerCpp = cppPayable;             // employer matches CPP + CPP2
  const employerEI = ei * K.eiEmployerMult;   // employer pays 1.4× EI

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-lime-500" />
          CPP / EI Premium Calculator
        </CardTitle>
        <CardDescription>
          Current CRA maximums (auto-updated) — CPP {(K.cppRate * 100).toFixed(2)}% (YMPE ${fmt(K.ympe, 0)}, ${fmt(K.cppExemption, 0)} exemption, max ${fmt(K.cppMaxAnnual)}),
          CPP2 {(K.cpp2Rate * 100).toFixed(0)}% to ${fmt(K.yampe, 0)} (max ${fmt(K.cpp2MaxAnnual)}), EI {(K.eiRate * 100).toFixed(2)}% (MIE ${fmt(K.mie, 0)}, max ${fmt(K.eiMaxAnnual)}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Annual Salary ($)</Label><Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="75000" /></div>
        </div>
        {sal > 0 && (
          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500">Employee CPP</p><p className="text-lg font-bold">${fmt(cppBase)}</p></div>
              <div className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500">Employee CPP2</p><p className="text-lg font-bold">${fmt(cpp2)}</p></div>
              <div className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500">Employee EI</p><p className="text-lg font-bold">${fmt(ei)}</p></div>
              <div className="bg-amber-50 rounded-lg p-3 text-center"><p className="text-xs text-amber-600">Employer CPP+CPP2</p><p className="text-lg font-bold text-amber-700">${fmt(employerCpp)}</p></div>
              <div className="bg-amber-50 rounded-lg p-3 text-center"><p className="text-xs text-amber-600">Employer EI (1.4×)</p><p className="text-lg font-bold text-amber-700">${fmt(employerEI)}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-lime-50 rounded-lg p-4 text-center">
                <p className="text-xs text-lime-600">Total Employee Deductions</p>
                <p className="text-2xl font-bold text-lime-700">${fmt(cppPayable + ei)}</p>
              </div>
              <div className="bg-lime-50 rounded-lg p-4 text-center">
                <p className="text-xs text-lime-600">Total Employer Cost</p>
                <p className="text-2xl font-bold text-lime-700">${fmt(employerCpp + employerEI)}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================
   MAIN CALCULATORS PAGE
   ================================================================= */
export default function Calculators() {
  // Deep-linkable: /calculators?tab=payroll opens the Payroll tab directly.
  const initialTab = (() => {
    try { return new URLSearchParams(window.location.search).get("tab") || "tax"; } catch { return "tax"; }
  })();
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="h-6 w-6 text-lime-500" />
            Bookkeeper Calculators
          </h1>
          <p className="text-slate-500">Essential tools for Canadian & US bookkeeping calculations</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 h-auto flex-wrap gap-1">
          <TabsTrigger value="tax" className="text-xs md:text-sm">Tax & HST</TabsTrigger>
          <TabsTrigger value="payroll" className="text-xs md:text-sm">Payroll</TabsTrigger>
          <TabsTrigger value="dividends" className="text-xs md:text-sm">Dividends</TabsTrigger>
          <TabsTrigger value="fx" className="text-xs md:text-sm">FX & Currency</TabsTrigger>
          <TabsTrigger value="business" className="text-xs md:text-sm">Business</TabsTrigger>
        </TabsList>

        {/* TAX TAB */}
        <TabsContent value="tax" className="space-y-4 mt-6">
          <HSTCalculator />
          <PayrollTaxCalculator />
          <CPPEICalculator />
        </TabsContent>

        {/* PAYROLL TAB */}
        <TabsContent value="payroll" className="space-y-4 mt-6">
          <ProratedPayrollCalculator />
          <VacationPayCalculator />
          <StatPayCalculator />
          <TerminationPayCalculator />
        </TabsContent>

        {/* DIVIDENDS TAB */}
        <TabsContent value="dividends" className="space-y-4 mt-6">
          <DividendsCalculator />
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 text-sm text-blue-700">
              <strong>Tax Tip:</strong> Eligible dividends receive a higher gross-up (38%) but a larger federal dividend tax credit (15.0198% of grossed-up amount), making them more tax-efficient. Non-eligible dividends have a 15% gross-up and a 9.0301% credit. Provincial credits vary — always verify with the current CRA and provincial schedules.
            </CardContent>
          </Card>
        </TabsContent>

        {/* FX TAB */}
        <TabsContent value="fx" className="space-y-4 mt-6">
          <FXCalculator />
        </TabsContent>

        {/* BUSINESS TAB (depreciation consolidated here) */}
        <TabsContent value="business" className="space-y-4 mt-6">
          <DepreciationCalculator />
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 text-sm text-blue-700">
              <strong>CCA Note:</strong> The half-year rule applies to most asset classes in the year of acquisition — only 50% of the CCA can be claimed. Some classes (like Class 14) have different rules. Always verify the current CRA CCA rates for the specific asset class.
            </CardContent>
          </Card>
          <MileageCalculator />
          <HomeOfficeCalculator />
          <LoanCalculator />
        </TabsContent>
      </Tabs>
    </div>
  );
}
