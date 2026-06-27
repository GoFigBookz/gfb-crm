import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import HelpButton from "@/components/HelpButton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

const DOT: Record<string, string> = { red: "bg-red-500", yellow: "bg-amber-400", green: "bg-emerald-500" };
const TEXT: Record<string, string> = { red: "text-red-600", yellow: "text-amber-600", green: "text-emerald-600" };

/**
 * Month-End Close — the portfolio "who's behind" board. One row per active
 * client, worst-first: transactions to review, HST status, year-end, checklist.
 * Backed by trpc.monthEnd.getPortfolio (cheap, DB-only — no live-QBO fan-out).
 */
export default function MonthEndClose() {
  const { data, isLoading } = trpc.monthEnd.getPortfolio.useQuery({});
  const utils = trpc.useUtils();
  // Default to the clients that are actually in their close window this month —
  // monthly/payroll always, quarterly/annual only in their period. Toggle to
  // see everyone (e.g. to peek at an annual client mid-year). Wholesale
  // (flow-through) clients are never on this board.
  const [showAll, setShowAll] = useState(false);
  const rows = (data?.clients ?? []).filter((c: any) => showAll || c.relevantThisPeriod);

  // Mark a filed fiscal year's monthly closes complete for everyone (up to each
  // client's year-end month). Year-ends are closed → those months are done.
  const [fyYear, setFyYear] = useState(2025);
  const markFy = trpc.monthlyClose.markFiscalYearClosed.useMutation({
    onSuccess: (r) => { utils.monthEnd.getPortfolio.invalidate(); alert(`Marked ${fyYear} closed for ${r.clients} clients (${r.periods} monthly closes).`); },
    onError: (e) => alert(e.message),
  });
  const runMarkFy = () => {
    if (!confirm(`Mark every client's ${fyYear} month-end closes complete, up to each client's year-end month? (Their year-ends are filed/closed.)`)) return;
    markFy.mutate({ year: fyYear });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">Month-End Close <HelpButton id="month-end-close" /></h1>
          <p className="text-slate-500 mt-1">Where every client stands — who needs attention first.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1.5 text-sm bg-white" value={fyYear} onChange={(e) => setFyYear(Number(e.target.value))}>
            {[2023, 2024, 2025].map((y) => <option key={y} value={y}>FY {y}</option>)}
          </select>
          <button onClick={runMarkFy} disabled={markFy.isPending}
            className="text-sm font-medium px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
            {markFy.isPending ? "Marking…" : `Mark FY ${fyYear} year-ends closed`}
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryTile label="In close this month" value={data.summary.relevant} />
          <SummaryTile label="Behind" value={data.summary.red} className="text-red-600" />
          <SummaryTile label="Needs attention" value={data.summary.yellow} className="text-amber-600" />
          <SummaryTile label="On track" value={data.summary.green} className="text-emerald-600" />
          <SummaryTile label="To review" value={data.summary.toReviewTotal} />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Clients{!showAll && data ? ` in close (${data.summary.relevant})` : ""}</CardTitle>
          {data && data.summary.offCadence > 0 && (
            <button onClick={() => setShowAll((s) => !s)}
              className="text-xs font-medium text-lime-700 hover:underline">
              {showAll ? `Show only this month's (${data.summary.relevant})` : `Show all incl. ${data.summary.offCadence} off-cadence`}
            </button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-slate-400 p-6 text-sm">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-slate-400 p-6 text-sm">No clients in their close window this month.</p>
          ) : (
            <div className="divide-y">
              {/* header row */}
              <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase font-semibold text-slate-400">
                <div className="col-span-4">Client</div>
                <div className="col-span-1 text-right">To review</div>
                <div className="col-span-2">HST</div>
                <div className="col-span-2">Year-end</div>
                <div className="col-span-2">Checklist</div>
                <div className="col-span-1" />
              </div>
              {rows.map((c: any) => (
                <Link key={c.clientId} to={`/client/${c.clientId}`}
                  className={cn("grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-slate-50 transition-colors", !c.relevantThisPeriod && "opacity-60")}>
                  <div className="col-span-12 md:col-span-4 flex items-center gap-2">
                    <span className={cn("inline-block w-2.5 h-2.5 rounded-full shrink-0", DOT[c.status])} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate flex items-center gap-1.5">
                        {c.clientName}
                        {c.clientType && c.clientType !== "monthly" && (
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 capitalize whitespace-nowrap">{c.clientType}</span>
                        )}
                        {c.missing && c.missing.length > 0 && (
                          <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                            ⚠ missing {c.missing.join(", ")}
                          </span>
                        )}
                      </p>
                      {c.reasons[0] && <p className="text-xs text-slate-400 truncate">{c.reasons.join(" · ")}</p>}
                    </div>
                  </div>
                  <div className="col-span-4 md:col-span-1 md:text-right">
                    <span className={cn("font-semibold", c.toReview > 0 ? "text-amber-600" : "text-slate-400")}>{c.toReview}</span>
                  </div>
                  <div className="col-span-4 md:col-span-2 text-xs">
                    {c.hst.applicable ? (
                      <span className={cn("font-medium", TEXT[c.hst.status])}>
                        {c.hst.filed ? "Filed" : c.hst.overdue ? "Overdue" : "Due"} · {c.hst.periodLabel}
                      </span>
                    ) : <span className="text-slate-300">n/a</span>}
                  </div>
                  <div className="col-span-4 md:col-span-2 text-xs">
                    {c.yearEnd.applicable ? (
                      <span className={cn("font-medium", TEXT[c.yearEnd.status])}>{c.yearEnd.lastFyeDate}</span>
                    ) : <span className="text-slate-300">n/a</span>}
                  </div>
                  <div className="col-span-8 md:col-span-2 text-xs text-slate-500">
                    {c.checklistPercent == null ? "—" : `${c.checklistPercent}%`}
                  </div>
                  <div className="hidden md:flex col-span-1 justify-end text-slate-300">
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase font-semibold text-slate-500">{label}</p>
        <p className={cn("text-2xl font-bold", className ?? "text-slate-800")}>{value}</p>
      </CardContent>
    </Card>
  );
}
