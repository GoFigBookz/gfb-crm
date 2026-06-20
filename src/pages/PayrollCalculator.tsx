import { useState } from "react";
import { Link } from "react-router";
import { Wallet, Calculator, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computePaycheck, grossFromNet, CPP_EI_2026 } from "../../api/payroll-paycheck-core";
import { TAX_2026 } from "../../api/payroll-tax-core";

const money = (n: number) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FREQS: [string, string][] = [["weekly", "Weekly (52)"], ["biweekly", "Bi-weekly (26)"], ["semi_monthly", "Semi-monthly (24)"], ["monthly", "Monthly (12)"]];

/** Built-in PDOC-style paycheck calculator (Ontario). */
export default function PayrollCalculator() {
  const [mode, setMode] = useState<"gross" | "net">("gross");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("biweekly");

  const amt = parseFloat(amount) || 0;
  const gross = amt > 0 ? (mode === "net" ? grossFromNet(amt, frequency) : amt) : 0;
  const pc = gross > 0 ? computePaycheck(gross, frequency) : null;

  const Row = ({ label, value, strong, indent, accent }: { label: string; value: string; strong?: boolean; indent?: boolean; accent?: string }) => (
    <div className={`flex items-center justify-between py-1.5 ${strong ? "font-semibold" : ""} ${indent ? "pl-3" : ""}`}>
      <span className={`text-sm ${strong ? "text-slate-800" : "text-slate-600"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${accent || (strong ? "text-slate-900" : "text-slate-700")}`}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link to="/payroll" className="text-sm text-slate-500 hover:text-lime-600 inline-flex items-center gap-1 mb-2"><ArrowLeft className="h-4 w-4" /> Payroll</Link>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Calculator className="h-6 w-6 text-lime-600" /> Paycheck calculator</h1>
        <p className="text-slate-500">Ontario CPP, CPP2, EI, income tax, net pay + employer cost — PDOC-style.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Inputs</CardTitle>
          <CardDescription>Enter a gross pay (or a target take-home) and the pay frequency.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex rounded-lg border bg-white p-0.5 w-fit">
            <button onClick={() => setMode("gross")} className={`px-3 py-1 text-sm rounded-md ${mode === "gross" ? "bg-lime-500 text-white" : "text-slate-600"}`}>From gross</button>
            <button onClick={() => setMode("net")} className={`px-3 py-1 text-sm rounded-md ${mode === "net" ? "bg-lime-500 text-white" : "text-slate-600"}`}>From take-home</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{mode === "net" ? "Target net (per pay)" : "Gross pay (per pay)"}</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
            </div>
            <div>
              <Label>Pay frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FREQS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {pc && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Employee</CardTitle></CardHeader>
            <CardContent className="divide-y">
              <Row label="Gross pay" value={money(pc.gross)} strong />
              <Row label="CPP" value={`− ${money(pc.cpp)}`} indent />
              {pc.cpp2 > 0 && <Row label="CPP2" value={`− ${money(pc.cpp2)}`} indent />}
              <Row label="EI" value={`− ${money(pc.ei)}`} indent />
              <Row label="Federal tax" value={`− ${money(pc.federalTax)}`} indent />
              <Row label="Ontario tax" value={`− ${money(pc.provincialTax)}`} indent />
              <Row label="Total deductions" value={`− ${money(pc.totalDeductions)}`} />
              <Row label="Net pay" value={money(pc.netPay)} strong accent="text-lime-700" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Employer cost</CardTitle></CardHeader>
            <CardContent className="divide-y">
              <Row label="Gross pay" value={money(pc.gross)} />
              <Row label="Employer CPP (1×)" value={`+ ${money(pc.employerCpp)}`} indent />
              {pc.employerCpp2 > 0 && <Row label="Employer CPP2" value={`+ ${money(pc.employerCpp2)}`} indent />}
              <Row label="Employer EI (1.4×)" value={`+ ${money(pc.employerEi)}`} indent />
              <Row label="Total cost to employer" value={money(pc.employerCost)} strong accent="text-slate-900" />
              <div className="pt-2 text-xs text-slate-500">
                <p>Annualized gross: {money(pc.annualizedGross)} · {pc.periodsPerYear} pays/yr</p>
                <p className="mt-1">CRA remittance / pay (income tax + CPP×2 + EI×2.4): {money(pc.federalTax + pc.provincialTax + pc.cpp * 2 + pc.cpp2 * 2 + pc.ei + pc.employerEi)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Estimate (not a filing). Ontario, basic TD1, all earnings pensionable/insurable, no YTD maximums reached. {TAX_2026.year} income-tax tables + CPP/EI ({CPP_EI_2026.cppRate * 100}% CPP, {CPP_EI_2026.eiRate * 100}% EI) — cross-checked vs CRA; confirm on the live CRA PDOC/T4127 before remitting.
      </p>
    </div>
  );
}
