import { useState } from "react";
import { ClipboardCheck, CheckCircle2, Circle, Building2, Users, Receipt, Landmark, FileText, Percent } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CheckItem {
  id: string;
  label: string;
  category: string;
  completed: boolean;
}

const DEFAULT_ITEMS: CheckItem[] = [
  // CLIENT INFO
  { id: "c1", label: "Confirm client's fiscal year-end date", category: "Client Info", completed: false },
  { id: "c2", label: "Verify business address and contact info", category: "Client Info", completed: false },
  { id: "c3", label: "Confirm HST/GST number is active", category: "Client Info", completed: false },
  { id: "c4", label: "Review payroll account numbers (RP)", category: "Client Info", completed: false },
  { id: "c5", label: "Verify WSIB account status", category: "Client Info", completed: false },
  // EMPLOYEES
  { id: "e1", label: "Confirm all employees on payroll", category: "Employees", completed: false },
  { id: "e2", label: "Verify SINs for all employees", category: "Employees", completed: false },
  { id: "e3", label: "Confirm hire/start dates", category: "Employees", completed: false },
  { id: "e4", label: "Check for terminated employees needing ROEs", category: "Employees", completed: false },
  { id: "e5", label: "Verify taxable benefits (company car, parking, etc.)", category: "Employees", completed: false },
  { id: "e6", label: "Confirm RRSP contributions", category: "Employees", completed: false },
  { id: "e7", label: "Record union dues", category: "Employees", completed: false },
  { id: "e8", label: "Verify government grant employee status", category: "Employees", completed: false },
  // BANKING & RECONCILIATION
  { id: "b1", label: "Reconcile all bank accounts", category: "Banking", completed: false },
  { id: "b2", label: "Reconcile all credit card accounts", category: "Banking", completed: false },
  { id: "b3", label: "Reconcile loan accounts", category: "Banking", completed: false },
  { id: "b4", label: "Record outstanding cheques", category: "Banking", completed: false },
  { id: "b5", label: "Record deposits in transit", category: "Banking", completed: false },
  { id: "b6", label: "Review uncleared transactions", category: "Banking", completed: false },
  // PAYROLL
  { id: "p1", label: "Final payroll of the year processed", category: "Payroll", completed: false },
  { id: "p2", label: "Verify total CPP, EI, and income tax remittances", category: "Payroll", completed: false },
  { id: "p3", label: "Prepare T4 slips for all employees", category: "Payroll", completed: false },
  { id: "p4", label: "Prepare T4A slips for contractors", category: "Payroll", completed: false },
  { id: "p5", label: "Verify PD7A against payroll records", category: "Payroll", completed: false },
  { id: "p6", label: "WSIB annual reconciliation filed", category: "Payroll", completed: false },
  // TAX & FILINGS
  { id: "t1", label: "Final GST/HST return for the year filed", category: "Tax", completed: false },
  { id: "t2", label: "Record GST/HST ITCs to claim", category: "Tax", completed: false },
  { id: "t3", label: "Review vehicle logbooks for business use %", category: "Tax", completed: false },
  { id: "t4", label: "Calculate CCA / depreciation", category: "Tax", completed: false },
  { id: "t5", label: "Review shareholder loan balances", category: "Tax", completed: false },
  { id: "t6", label: "Record charitable donation receipts", category: "Tax", completed: false },
  { id: "t7", label: "Prepare T5 slips for investment income", category: "Tax", completed: false },
  { id: "t8", label: "Prepare T5018 for construction subcontractors", category: "Tax", completed: false },
  // REPORTS
  { id: "r1", label: "Generate Balance Sheet", category: "Reports", completed: false },
  { id: "r2", label: "Generate Income Statement (P&L)", category: "Reports", completed: false },
  { id: "r3", label: "Generate Cash Flow Statement", category: "Reports", completed: false },
  { id: "r4", label: "Generate General Ledger detail", category: "Reports", completed: false },
  { id: "r5", label: "Generate Aged Receivables", category: "Reports", completed: false },
  { id: "r6", label: "Generate Aged Payables", category: "Reports", completed: false },
  { id: "r7", label: "Send year-end reports to client", category: "Reports", completed: false },
  { id: "r8", label: "Package for accountant (if external)", category: "Reports", completed: false },
];

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Client Info": Building2,
  "Employees": Users,
  "Banking": Receipt,
  "Payroll": Landmark,
  "Tax": Percent,
  "Reports": FileText,
};

export default function YearEndChecklist() {
  const [items, setItems] = useState<CheckItem[]>(DEFAULT_ITEMS);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const toggle = (id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)));
  };

  const categories = [...new Set(items.map((i) => i.category))];
  const total = items.length;
  const completed = items.filter((i) => i.completed).length;
  const pct = Math.round((completed / total) * 100);

  const filtered = activeCategory ? items.filter((i) => i.category === activeCategory) : items;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-lime-500" />
          Year-End Checklist
        </h1>
        <p className="text-slate-500">Complete checklist for client year-end preparation</p>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-600">{completed} of {total} items complete</p>
            <p className="text-lg font-bold text-lime-600">{pct}%</p>
          </div>
          <Progress value={pct} className="h-3" />
        </CardContent>
      </Card>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
            activeCategory === null ? "bg-lime-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          All ({total})
        </button>
        {categories.map((cat) => {
          const catItems = items.filter((i) => i.category === cat);
          const catDone = catItems.filter((i) => i.completed).length;
          const Icon = CATEGORY_ICONS[cat] || FileText;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                activeCategory === cat ? "bg-lime-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat} ({catDone}/{catItems.length})
            </button>
          );
        })}
      </div>

      {/* Items */}
      <div className="space-y-2">
        {filtered.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-3 p-3 border rounded-lg transition-all",
              item.completed ? "bg-slate-50 opacity-60" : "bg-white"
            )}
          >
            <button onClick={() => toggle(item.id)} className="flex-shrink-0">
              {item.completed ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <Circle className="h-5 w-5 text-slate-300" />
              )}
            </button>
            <span className={cn("text-sm", item.completed && "line-through text-slate-400")}>
              {item.label}
            </span>
            {!activeCategory && (
              <Badge variant="outline" className="ml-auto text-xs flex-shrink-0">
                {item.category}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
