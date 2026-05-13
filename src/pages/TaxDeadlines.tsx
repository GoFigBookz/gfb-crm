import { useState } from "react";
import { CalendarClock, CheckCircle2, Circle, AlertTriangle, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Deadline {
  date: string;
  label: string;
  type: "gst" | "payroll" | "t4" | "corporate" | "personal" | "wsib" | "other";
  completed: boolean;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function getDeadlineColor(type: string) {
  switch (type) {
    case "gst": return "bg-amber-50 border-amber-200 text-amber-700";
    case "payroll": return "bg-blue-50 border-blue-200 text-blue-700";
    case "t4": return "bg-purple-50 border-purple-200 text-purple-700";
    case "corporate": return "bg-red-50 border-red-200 text-red-700";
    case "personal": return "bg-emerald-50 border-emerald-200 text-emerald-700";
    case "wsib": return "bg-cyan-50 border-cyan-200 text-cyan-700";
    default: return "bg-slate-50 border-slate-200 text-slate-700";
  }
}

const DEFAULT_DEADLINES: Deadline[] = [
  // JANUARY
  { date: "2025-01-15", label: "Quarterly GST/HST Return (Q4 2024)", type: "gst", completed: false },
  { date: "2025-01-15", label: "Personal Tax Q4 Instalment", type: "personal", completed: false },
  { date: "2025-01-31", label: "T4 / T4A Summary Filing Deadline", type: "t4", completed: false },
  { date: "2025-01-31", label: "T4 / T4A Slips to Employees", type: "t4", completed: false },
  // FEBRUARY
  { date: "2025-02-15", label: "Monthly GST/HST Return (Jan)", type: "gst", completed: false },
  { date: "2025-02-28", label: "T5018 Filing (Construction Subcontractors)", type: "other", completed: false },
  // MARCH
  { date: "2025-03-15", label: "Monthly GST/HST Return (Feb)", type: "gst", completed: false },
  { date: "2025-03-15", label: "Personal Tax Q1 Instalment", type: "personal", completed: false },
  { date: "2025-03-31", label: "T3 Trust Return Filing", type: "other", completed: false },
  // APRIL
  { date: "2025-04-15", label: "Monthly GST/HST Return (Mar)", type: "gst", completed: false },
  { date: "2025-04-30", label: "Personal Income Tax Filing Deadline", type: "personal", completed: false },
  { date: "2025-04-30", label: "Self-Employed Tax Payment Due", type: "personal", completed: false },
  // MAY
  { date: "2025-05-15", label: "Monthly GST/HST Return (Apr)", type: "gst", completed: false },
  // JUNE
  { date: "2025-06-15", label: "Monthly GST/HST Return (May)", type: "gst", completed: false },
  { date: "2025-06-15", label: "Self-Employed Tax Filing Extension", type: "personal", completed: false },
  { date: "2025-06-15", label: "Personal Tax Q2 Instalment", type: "personal", completed: false },
  // JULY
  { date: "2025-07-15", label: "Monthly GST/HST Return (Jun)", type: "gst", completed: false },
  // AUGUST
  { date: "2025-08-15", label: "Monthly GST/HST Return (Jul)", type: "gst", completed: false },
  // SEPTEMBER
  { date: "2025-09-15", label: "Monthly GST/HST Return (Aug)", type: "gst", completed: false },
  { date: "2025-09-15", label: "Personal Tax Q3 Instalment", type: "personal", completed: false },
  // OCTOBER
  { date: "2025-10-15", label: "Monthly GST/HST Return (Sep)", type: "gst", completed: false },
  // NOVEMBER
  { date: "2025-11-15", label: "Monthly GST/HST Return (Oct)", type: "gst", completed: false },
  // DECEMBER
  { date: "2025-12-15", label: "Monthly GST/HST Return (Nov)", type: "gst", completed: false },
  { date: "2025-12-31", label: "Year-End Corporate Tax Instalment", type: "corporate", completed: false },
  { date: "2025-12-31", label: "T5 / NR4 Slips Filing Deadline", type: "other", completed: false },
];

export default function TaxDeadlines() {
  const [deadlines, setDeadlines] = useState<Deadline[]>(DEFAULT_DEADLINES);
  const [showCompleted, setShowCompleted] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const today = new Date();
  const currentMonth = today.getMonth();

  const toggle = (idx: number) => {
    setDeadlines((prev) => prev.map((d, i) => (i === idx ? { ...d, completed: !d.completed } : d)));
  };

  const filtered = deadlines.filter((d) => {
    if (!showCompleted && d.completed) return false;
    if (selectedMonth !== null) {
      const m = new Date(d.date + "T12:00:00").getMonth();
      return m === selectedMonth;
    }
    return true;
  });

  const upcoming = deadlines.filter((d) => !d.completed && new Date(d.date) >= today).slice(0, 5);
  const overdue = deadlines.filter((d) => !d.completed && new Date(d.date) < today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <CalendarClock className="h-6 w-6 text-lime-500" />
          Tax Deadlines
        </h1>
        <p className="text-slate-500">CRA and tax filing deadlines for the year</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-2xl font-bold text-red-700">{overdue.length}</p>
              <p className="text-xs text-red-600">Overdue</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <Bell className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-2xl font-bold text-amber-700">{upcoming.length}</p>
              <p className="text-xs text-amber-600">Upcoming</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold text-emerald-700">{deadlines.filter((d) => d.completed).length}</p>
              <p className="text-xs text-emerald-600">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Month Filter */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant={selectedMonth === null ? "default" : "outline"}
          className={cn("cursor-pointer", selectedMonth === null && "bg-lime-500")}
          onClick={() => setSelectedMonth(null)}
        >
          All
        </Badge>
        {MONTHS.map((m, i) => (
          <Badge
            key={m}
            variant={selectedMonth === i ? "default" : "outline"}
            className={cn(
              "cursor-pointer",
              selectedMonth === i && "bg-lime-500",
              i === currentMonth && selectedMonth !== i && "border-lime-300 text-lime-700"
            )}
            onClick={() => setSelectedMonth(i === selectedMonth ? null : i)}
          >
            {m.slice(0, 3)}
          </Badge>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
          <Label className="text-sm text-slate-500">Show completed</Label>
        </div>
      </div>

      {/* Deadlines List */}
      <div className="space-y-2">
        {filtered.map((d, idx) => {
          const originalIdx = deadlines.indexOf(d);
          const isOverdue = !d.completed && new Date(d.date) < today;
          return (
            <div
              key={idx}
              className={cn(
                "flex items-center gap-3 p-3 border rounded-lg transition-all",
                d.completed ? "bg-slate-50 opacity-60" : isOverdue ? "bg-red-50 border-red-200" : "bg-white"
              )}
            >
              <button onClick={() => toggle(originalIdx)} className="flex-shrink-0">
                {d.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Circle className={cn("h-5 w-5", isOverdue ? "text-red-400" : "text-slate-300")} />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", d.completed && "line-through text-slate-400")}>
                  {d.label}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(d.date + "T12:00:00").toLocaleDateString("en-CA", { weekday: "short", year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
              <Badge variant="outline" className={cn("text-xs capitalize flex-shrink-0", getDeadlineColor(d.type))}>
                {d.type}
              </Badge>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-slate-400 py-8">No deadlines in this view.</p>
        )}
      </div>
    </div>
  );
}
