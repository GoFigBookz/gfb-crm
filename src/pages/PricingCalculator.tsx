import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calculator, DollarSign, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const PACKAGES = [
  {
    name: "Basic",
    monthlyFee: 395,
    includes: ["Monthly bookkeeping", "Bank & credit card reconciliation", "Basic financial reports", "Email support"],
    bestFor: "Simple businesses with 1-2 accounts and minimal transactions",
  },
  {
    name: "Standard",
    monthlyFee: 695,
    includes: ["Everything in Basic", "GST/HST filing", "Payroll (up to 5 employees)", "Quarterly review call"],
    bestFor: "Growing businesses with payroll and regular tax filings",
  },
  {
    name: "Premium",
    monthlyFee: 995,
    includes: ["Everything in Standard", "Accounts payable management", "Cash flow forecasting", "Monthly advisory call", "Priority response"],
    bestFor: "Complex businesses with multiple revenue streams and high transaction volume",
  },
  {
    name: "Enterprise",
    monthlyFee: 1495,
    includes: ["Everything in Premium", "Dedicated bookkeeper", "Custom reporting", "Year-end tax package prep", "On-site visits (if local)"],
    bestFor: "Businesses with 10+ employees, multiple locations, or complex structures",
  },
];

export default function PricingCalculator() {
  const [transactions, setTransactions] = useState<string>("50");
  const [accounts, setAccounts] = useState<string>("2");
  const [payrollFreq, setPayrollFreq] = useState<string>("none");
  const [hstFreq, setHstFreq] = useState<string>("none");
  const [hasStripe, setHasStripe] = useState(false);
  const [hasSquare, setHasSquare] = useState(false);
  const [hasJobber, setHasJobber] = useState(false);

  const calculateScore = () => {
    let score = 0;
    const tx = parseInt(transactions) || 0;
    const acct = parseInt(accounts) || 0;

    score += Math.floor(tx / 25) * 2; // 0-4 points
    score += (acct - 1) * 3; // 0-9 points

    if (payrollFreq !== "none") score += 4;
    if (hstFreq !== "none") score += 3;
    if (hasStripe || hasSquare || hasJobber) score += 2;

    if (score <= 4) return 0; // Basic
    if (score <= 10) return 1; // Standard
    if (score <= 16) return 2; // Premium
    return 3; // Enterprise
  };

  const recommended = PACKAGES[calculateScore()];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Calculator className="h-6 w-6 text-lime-500" />
          Pricing Calculator
        </h1>
        <p className="text-slate-500 mt-1">
          Answer a few questions about the client's business to get a recommended package and monthly fee.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Business Profile</CardTitle>
            <CardDescription>Enter details about the prospective client</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Monthly Transactions (approximate)</Label>
              <Select value={transactions} onValueChange={setTransactions}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">Under 25</SelectItem>
                  <SelectItem value="50">25-75</SelectItem>
                  <SelectItem value="150">75-150</SelectItem>
                  <SelectItem value="250">150-300</SelectItem>
                  <SelectItem value="400">300+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bank & Credit Card Accounts</Label>
              <Select value={accounts} onValueChange={setAccounts}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 account</SelectItem>
                  <SelectItem value="2">2 accounts</SelectItem>
                  <SelectItem value="3">3 accounts</SelectItem>
                  <SelectItem value="4">4+ accounts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payroll Frequency</Label>
              <Select value={payrollFreq} onValueChange={setPayrollFreq}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No payroll</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>HST/GST Filing</Label>
              <Select value={hstFreq} onValueChange={setHstFreq}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not registered</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sales Platforms</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasStripe} onChange={(e) => setHasStripe(e.target.checked)} className="rounded" />
                  <span className="text-sm">Stripe</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasSquare} onChange={(e) => setHasSquare(e.target.checked)} className="rounded" />
                  <span className="text-sm">Square</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasJobber} onChange={(e) => setHasJobber(e.target.checked)} className="rounded" />
                  <span className="text-sm">Jobber</span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-lime-300 bg-lime-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-lime-500" />
              Recommended Package
            </CardTitle>
            <CardDescription>Based on the profile you entered</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center p-4 bg-white rounded-lg border border-lime-200">
              <Badge className="bg-lime-500 text-white mb-2">{recommended.name}</Badge>
              <p className="text-3xl font-bold text-slate-800">${recommended.monthlyFee}<span className="text-base font-normal text-slate-500">/month</span></p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Includes:</p>
              {recommended.includes.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle className="h-4 w-4 text-lime-500 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>

            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">
                <span className="font-medium">Best for:</span> {recommended.bestFor}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All Packages Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>All Packages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.name}
                className={cn(
                  "p-4 rounded-lg border",
                  pkg.name === recommended.name
                    ? "border-lime-300 bg-lime-50 ring-1 ring-lime-300"
                    : "border-slate-200 bg-white"
                )}
              >
                <p className="font-semibold text-sm">{pkg.name}</p>
                <p className="text-xl font-bold mt-1">${pkg.monthlyFee}</p>
                <p className="text-xs text-slate-500 mt-1">{pkg.bestFor.substring(0, 60)}...</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
