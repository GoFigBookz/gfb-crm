import { useNavigate, Link } from "react-router";
import {
  Users, CheckSquare, AlertCircle, CalendarDays, FileText, Clock, Flame, Plus,
  Shield, ChevronRight, Building2, DollarSign, Target, ListChecks, Receipt,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { splitClientName } from "@/lib/clientName";

const TRAFFIC = { red: "bg-red-500", yellow: "bg-amber-400", green: "bg-lime-500" } as const;

/** Tiny inline SVG sparkline (no chart dep). */
function Spark({ points, stroke }: { points: number[]; stroke: string }) {
  if (points.length < 2) return null;
  const w = 100, h = 30, max = Math.max(...points), min = Math.min(...points), rng = (max - min) || 1;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / rng) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One trend tile: current value + sparkline, with a graceful pre-data state. */
function TrendCard({ label, value, points, stroke, delta }: { label: string; value: string; points: number[]; stroke: string; delta?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-slate-700">{label}</span>
          <span className="text-lg font-bold text-slate-900">{value}</span>
        </div>
        {points.length >= 2 ? (
          <>
            <Spark points={points} stroke={stroke} />
            {delta && <p className="text-[11px] text-slate-400 mt-1">{delta}</p>}
          </>
        ) : (
          <p className="text-[11px] text-slate-400 mt-3">📈 Trend builds over the next few days</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: clientStats } = trpc.crmClient.stats.useQuery();
  const { data: pipeline } = trpc.crmClient.pipelineStats.useQuery();
  const { data: upcomingTasks } = trpc.task.upcoming.useQuery({ days: 7 });
  const { data: overdueTasks } = trpc.task.overdue.useQuery();
  const { data: invoiceStats } = trpc.invoice.stats.useQuery();
  const { data: expiringDocs } = trpc.expiration.getExpiringSoon.useQuery({ days: 30 });
  const { data: dailyBrief } = trpc.dailyBrief.get.useQuery();
  const { data: portfolio } = trpc.monthEnd.getPortfolio.useQuery({});
  const { data: rawFindings } = trpc.agentWebhook.listFindings.useQuery({ status: "new" });
  const { data: trends } = trpc.dashboard.trends.useQuery({ days: 30 });

  const sum = portfolio?.summary;
  const behind = (sum?.red ?? 0) + (sum?.yellow ?? 0);
  const findings = rawFindings ?? [];

  // "Who's behind" — relevant-this-period clients, worst-first (already sorted by the API).
  const board = (portfolio?.clients ?? []).filter((c: any) => c.relevantThisPeriod);

  // Today agenda — overdue first, then due-today, then calendar (from the daily brief).
  const agenda: { id: string; tone: string; icon: any; text: string; right?: string; go: () => void }[] = [];
  for (const t of (dailyBrief?.overdue ?? []).slice(0, 4)) agenda.push({ id: `o${t.id}`, tone: "text-red-600", icon: Flame, text: t.title, right: "overdue", go: () => navigate("/tasks?tab=overdue") });
  for (const t of (dailyBrief?.today ?? []).slice(0, 4)) agenda.push({ id: `t${t.id}`, tone: "text-amber-600", icon: Clock, text: t.title, right: "today", go: () => navigate("/tasks?tab=today") });
  for (const e of (dailyBrief?.calendar ?? []).slice(0, 3)) agenda.push({ id: `c${e.id}`, tone: "text-blue-600", icon: CalendarDays, text: e.title, right: e.startDate ? format(new Date(e.startDate), "h:mm a") : "", go: () => navigate("/calendar") });

  // Deadlines — unfiled HST due soon (from the close board) + expiring documents.
  const hstDue = board
    .filter((c: any) => c.hst?.applicable && c.hst?.daysToDue != null && !c.hst?.filed && c.hst.daysToDue <= 45)
    .map((c: any) => ({ key: `hst${c.clientId}`, name: splitClientName(c.clientName, c.company).primary, label: c.hst.periodLabel ? `HST ${c.hst.periodLabel}` : "HST", days: c.hst.daysToDue, go: () => navigate(`/client/${c.clientId}`) }))
    .sort((a: any, b: any) => a.days - b.days);
  const docDue = (expiringDocs?.items ?? []).map((d: any) => ({ key: `doc${d.type}${d.id}`, name: d.clientName, label: d.title, days: d.daysRemaining, go: () => navigate("/signatures") }));
  const deadlines = [...hstDue, ...docDue].sort((a, b) => a.days - b.days).slice(0, 6);

  const money = (n: number) => `$${(n ?? 0).toLocaleString()}`;
  const kpis = [
    { label: "Clients", value: clientStats?.active ?? 0, sub: `${clientStats?.total ?? 0} total`, icon: Users, tone: "text-slate-900", go: () => navigate("/clients?status=active") },
    { label: "Behind", value: behind, sub: `${sum?.red ?? 0} red · ${sum?.yellow ?? 0} yellow`, icon: AlertCircle, tone: behind > 0 ? "text-red-600" : "text-slate-900", go: () => navigate("/month-end-close") },
    { label: "To post", value: sum?.toReviewTotal ?? 0, sub: "needs review", icon: Shield, tone: (sum?.toReviewTotal ?? 0) > 0 ? "text-purple-600" : "text-slate-900", go: () => navigate("/triage") },
    { label: "Overdue", value: overdueTasks?.length ?? 0, sub: "tasks", icon: Flame, tone: (overdueTasks?.length ?? 0) > 0 ? "text-red-600" : "text-slate-900", go: () => navigate("/tasks?tab=overdue") },
    { label: "This week", value: upcomingTasks?.length ?? 0, sub: "due ≤7d", icon: CheckSquare, tone: "text-slate-900", go: () => navigate("/tasks?tab=upcoming") },
    { label: "Outstanding", value: money(invoiceStats?.outstanding ?? 0), sub: `${invoiceStats?.overdue ?? 0} overdue inv`, icon: Receipt, tone: "text-slate-900", go: () => navigate("/invoices") },
    { label: "Pipeline", value: money(pipeline?.totalPipelineValue ?? 0), sub: `${pipeline?.totalLeads ?? 0} leads`, icon: Target, tone: "text-slate-900", go: () => navigate("/clients?status=lead") },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{dailyBrief?.greeting ? `${dailyBrief.greeting}, Markie` : "Dashboard"}</h1>
          <p className="text-slate-500 text-sm">{format(new Date(), "EEEE, MMMM d")} · your practice at a glance</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/calendar")}><CalendarDays className="h-4 w-4 mr-1.5" /> Calendar</Button>
          <Button size="sm" onClick={() => navigate("/quick-add")}><Plus className="h-4 w-4 mr-1.5" /> Quick Add</Button>
        </div>
      </div>

      {/* KPI strip — dense, one row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2">
        {kpis.map((k) => (
          <button key={k.label} onClick={k.go} className="text-left rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:shadow-sm hover:border-slate-300 transition">
            <div className="flex items-center gap-1.5 text-slate-500"><k.icon className="h-3.5 w-3.5" /><span className="text-[11px] font-medium uppercase tracking-wide truncate">{k.label}</span></div>
            <div className={cn("text-xl font-bold mt-0.5 leading-tight truncate", k.tone)}>{k.value}</div>
            <div className="text-[11px] text-slate-400 truncate">{k.sub}</div>
          </button>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Who's behind — month-end close board */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-5 w-5 text-lime-600" /> Month-end — who's behind</CardTitle>
              <div className="flex items-center gap-2">
                <span className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />{sum?.red ?? 0}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{sum?.yellow ?? 0}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-lime-500" />{sum?.green ?? 0}</span>
                </span>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => navigate("/month-end-close")}>Full board <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {board.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No clients on the board this period 🎉</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[28rem] overflow-auto -mx-2">
                {board.slice(0, 12).map((c: any) => {
                  const nm = splitClientName(c.clientName, c.company);
                  const hst = c.hst;
                  return (
                    <Link key={c.clientId} to={`/client/${c.clientId}`} className="flex items-center gap-2.5 px-2 py-2 hover:bg-slate-50 rounded-md">
                      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", TRAFFIC[c.status as keyof typeof TRAFFIC])} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-slate-800 truncate">{nm.primary}</span>
                          {c.clientType && c.clientType !== "monthly" && <span className="text-[10px] text-slate-400 capitalize hidden sm:inline">{c.clientType}</span>}
                        </div>
                        {c.reasons?.[0] && <p className="text-xs text-slate-400 truncate">{c.reasons[0]}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.toReview > 0 && <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">{c.toReview} to post</Badge>}
                        {hst?.applicable && hst?.daysToDue != null && !hst?.filed && (
                          <Badge variant="outline" className={cn("text-[10px]", hst.daysToDue <= 7 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200")}>
                            HST {hst.daysToDue < 0 ? `${-hst.daysToDue}d late` : `${hst.daysToDue}d`}
                          </Badge>
                        )}
                        {(c.missing ?? []).slice(0, 1).map((m: string) => <Badge key={m} variant="outline" className="bg-red-50 text-red-600 border-red-200 text-[10px]">{m}</Badge>)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column — Figs review + Today + Deadlines */}
        <div className="space-y-4">
          {/* Figs review queue */}
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Shield className="h-5 w-5 text-purple-500" /> Figs — needs review</CardTitle>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => navigate("/triage")}>{findings.length} <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              {findings.length === 0 ? (
                <p className="text-sm text-slate-400 py-3 text-center">Nothing needs review 🎉</p>
              ) : (
                <div className="space-y-1.5">
                  {findings.slice(0, 4).map((f: any) => (
                    <button key={f.id} onClick={() => navigate("/triage")} className="w-full flex items-start gap-2 text-left rounded-md px-2 py-1.5 hover:bg-slate-50">
                      <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", f.severity === "critical" ? "bg-red-500" : f.severity === "warning" ? "bg-amber-400" : "bg-blue-400")} />
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700 truncate">{f.title}</p>
                        <p className="text-xs text-slate-400 truncate">{f.agentName || "Figs"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today agenda */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" /> Today</CardTitle></CardHeader>
            <CardContent>
              {agenda.length === 0 ? (
                <p className="text-sm text-slate-400 py-3 text-center">Nothing urgent today 🎉</p>
              ) : (
                <div className="space-y-1">
                  {agenda.slice(0, 7).map((a) => (
                    <button key={a.id} onClick={a.go} className="w-full flex items-center gap-2 text-left rounded-md px-2 py-1.5 hover:bg-slate-50">
                      <a.icon className={cn("h-3.5 w-3.5 shrink-0", a.tone)} />
                      <span className="flex-1 text-sm text-slate-700 truncate">{a.text}</span>
                      {a.right && <span className={cn("text-[11px] whitespace-nowrap", a.tone)}>{a.right}</span>}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deadlines */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-500" /> Deadlines</CardTitle></CardHeader>
            <CardContent>
              {deadlines.length === 0 ? (
                <p className="text-sm text-slate-400 py-3 text-center">No deadlines in the next 45 days</p>
              ) : (
                <div className="space-y-1">
                  {deadlines.map((d) => (
                    <button key={d.key} onClick={d.go} className="w-full flex items-center gap-2 text-left rounded-md px-2 py-1.5 hover:bg-slate-50">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700 truncate">{d.label}</p>
                        <p className="text-xs text-slate-400 truncate">{d.name}</p>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px]", d.days <= 7 ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-50 text-slate-600")}>{d.days < 0 ? `${-d.days}d late` : `${d.days}d`}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Trends — real over-time lines from the nightly snapshot */}
      {(() => {
        const t = trends ?? [];
        const onTrackPct = t.map((s: any) => { const tot = (s.closeRed + s.closeYellow + s.closeGreen) || 0; return tot ? Math.round((s.closeGreen / tot) * 100) : 0; });
        const overdueSeries = t.map((s: any) => s.tasksOverdue ?? 0);
        const outstandingSeries = t.map((s: any) => s.invoiceOutstanding ?? 0);
        const reviewSeries = t.map((s: any) => s.toReviewTotal ?? 0);
        const days = t.length;
        const span = days >= 2 ? `last ${days} days` : undefined;
        return (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <TrendCard label="On-track %" value={`${onTrackPct[onTrackPct.length - 1] ?? (sum && sum.relevant ? Math.round(((sum.green) / sum.relevant) * 100) : 0)}%`} points={onTrackPct} stroke="#65a30d" delta={span} />
            <TrendCard label="Overdue tasks" value={String(overdueSeries[overdueSeries.length - 1] ?? overdueTasks?.length ?? 0)} points={overdueSeries} stroke="#dc2626" delta={span} />
            <TrendCard label="Outstanding $" value={money(outstandingSeries[outstandingSeries.length - 1] ?? invoiceStats?.outstanding ?? 0)} points={outstandingSeries} stroke="#0891b2" delta={span} />
            <TrendCard label="To-post queue" value={String(reviewSeries[reviewSeries.length - 1] ?? sum?.toReviewTotal ?? 0)} points={reviewSeries} stroke="#7c3aed" delta={span} />
          </div>
        );
      })()}
    </div>
  );
}
