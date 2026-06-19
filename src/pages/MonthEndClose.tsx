import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Month-End Close</h1>
        <p className="text-slate-500 mt-1">Where every client stands — who needs attention first.</p>
      </div>

      {/* Summary tiles */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryTile label="Clients" value={data.summary.total} />
          <SummaryTile label="Behind" value={data.summary.red} className="text-red-600" />
          <SummaryTile label="Needs attention" value={data.summary.yellow} className="text-amber-600" />
          <SummaryTile label="On track" value={data.summary.green} className="text-emerald-600" />
          <SummaryTile label="To review" value={data.summary.toReviewTotal} />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Clients</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-slate-400 p-6 text-sm">Loading…</p>
          ) : !data || data.clients.length === 0 ? (
            <p className="text-slate-400 p-6 text-sm">No active clients.</p>
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
              {data.clients.map((c) => (
                <Link key={c.clientId} to={`/client/${c.clientId}`}
                  className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-slate-50 transition-colors">
                  <div className="col-span-12 md:col-span-4 flex items-center gap-2">
                    <span className={cn("inline-block w-2.5 h-2.5 rounded-full shrink-0", DOT[c.status])} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{c.clientName}</p>
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
