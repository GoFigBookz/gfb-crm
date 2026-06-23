import { useMemo } from "react";
import { ShieldCheck, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";

type Status = "ok" | "warn" | "fail";

const STATUS_META: Record<Status, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  ok: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Healthy" },
  warn: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Attention" },
  fail: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Problem" },
};

export default function SystemHealth() {
  const report = trpc.jinx.runChecks.useQuery(undefined, { refetchOnWindowFocus: false });
  const scorecard = trpc.jinx.scorecard.useQuery(undefined, { refetchOnWindowFocus: false });

  const grouped = useMemo(() => {
    const checks = report.data?.checks ?? [];
    const map = new Map<string, typeof checks>();
    for (const c of checks) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    }
    return Array.from(map.entries());
  }, [report.data]);

  const overall = (report.data?.status ?? "ok") as Status;
  const OverallIcon = STATUS_META[overall].icon;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-100">
            <ShieldCheck className="w-6 h-6 text-slate-700" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Jinx — System Health</h1>
            <p className="text-sm text-muted-foreground">Your QA watchdog. Checks the app is actually working.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => report.refetch()} disabled={report.isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${report.isFetching ? "animate-spin" : ""}`} />
          Re-run
        </Button>
      </div>

      {report.isLoading && <div className="text-sm text-muted-foreground">Running checks…</div>}
      {report.error && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
          Couldn't run the health check: {report.error.message}
        </div>
      )}

      {report.data && (
        <>
          <div className={`flex items-center gap-3 p-4 rounded-lg border ${STATUS_META[overall].bg}`}>
            <OverallIcon className={`w-7 h-7 ${STATUS_META[overall].color}`} />
            <div>
              <div className={`font-semibold ${STATUS_META[overall].color}`}>{STATUS_META[overall].label}</div>
              <div className="text-sm text-muted-foreground">
                {report.data.counts.ok} OK · {report.data.counts.warn} attention · {report.data.counts.fail} problem
                {" · "}checked {new Date(report.data.ts).toLocaleTimeString()}
              </div>
            </div>
          </div>

          {grouped.map(([category, checks]) => (
            <div key={category} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{category}</h2>
              <div className="rounded-lg border divide-y">
                {checks.map((c) => {
                  const meta = STATUS_META[c.status as Status];
                  const Icon = meta.icon;
                  return (
                    <div key={c.id} className="flex items-start gap-3 p-3">
                      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${meta.color}`} />
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{c.label}</div>
                        <div className="text-sm text-muted-foreground">{c.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Agent scorecard — how often each agent's proposals get accepted. */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Agent Scorecard</h2>
        <p className="text-xs text-muted-foreground -mt-1">
          How often each agent's proposals are accepted vs. rejected on review — your measurable "are they getting smarter" signal.
        </p>
        {scorecard.isLoading && <div className="text-sm text-muted-foreground">Scoring…</div>}
        {scorecard.data && scorecard.data.agents.length === 0 && (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            No reviewed agent work yet — scores appear once agents post proposals and you approve/dismiss them in Triage.
          </div>
        )}
        {scorecard.data && scorecard.data.agents.length > 0 && (
          <div className="rounded-lg border divide-y">
            {scorecard.data.agents.map((a) => {
              const gradeColor =
                a.grade === "excellent" ? "text-emerald-600" :
                a.grade === "good" ? "text-lime-600" :
                a.grade === "watch" ? "text-amber-600" : "text-slate-400";
              const trendIcon = a.trend === "up" ? "↑" : a.trend === "down" ? "↓" : a.trend === "flat" ? "→" : "";
              return (
                <div key={a.agent} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{a.agent}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.reviewed} reviewed · {a.approved} accepted · {a.dismissed} rejected{a.pending ? ` · ${a.pending} pending` : ""}
                      {a.avgConfidence != null ? ` · avg conf ${a.avgConfidence}%` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-lg font-bold ${gradeColor}`}>
                      {a.acceptanceRate != null ? `${a.acceptanceRate}%` : "—"} <span className="text-sm font-normal text-slate-400">{trendIcon}</span>
                    </div>
                    <div className={`text-xs capitalize ${gradeColor}`}>{a.grade === "n/a" ? "needs data" : a.grade}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
