import { useState, useMemo } from "react";
import { Link } from "react-router";
import { Sparkles, Loader2, Trash2, CheckCircle2, AlertTriangle, CalendarOff, Copy, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * TASKS CLEANUP (Markie 2026-06-27, backlog #49: "review every client, kill
 * duplicates, make tasks make sense"). The boot dedupe already collapses exact
 * duplicates; this surfaces what it can't decide for you — near-duplicate titles,
 * undated tasks (invisible on the calendar), and long-stale overdue tasks — and
 * applies only what you tick. Read-only until you act.
 */
const fmtDate = (ms: number | null) => ms == null ? "no date" : new Date(ms).toLocaleDateString("en-CA");

export default function TasksCleanup() {
  const utils = trpc.useUtils();
  const scan = trpc.tasksCleanup.scan.useQuery({});
  const del = trpc.tasksCleanup.bulkDelete.useMutation({ onSuccess: () => { utils.tasksCleanup.scan.invalidate(); setPicked(new Set()); } });
  const done = trpc.tasksCleanup.bulkComplete.useMutation({ onSuccess: () => { utils.tasksCleanup.scan.invalidate(); setPicked(new Set()); } });

  // For duplicate groups, every NON-keep task is pre-selected for deletion.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const r = scan.data;
  const dupExtras = useMemo(() => {
    const ids = new Set<number>();
    r?.nearDuplicates.forEach((g) => g.tasks.forEach((t) => { if (t.id !== g.keepId) ids.add(t.id); }));
    return ids;
  }, [r]);

  const selectAllDupExtras = () => setPicked(new Set(dupExtras));
  const pickedDup = [...picked].filter((id) => dupExtras.has(id));
  const staleIds = useMemo(() => new Set(r?.staleOverdue.map((t) => t.id) ?? []), [r]);
  const pickedStale = [...picked].filter((id) => staleIds.has(id));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-lime-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tasks cleanup</h1>
            <p className="text-sm text-slate-500">Kill duplicates, schedule the undated, clear long-stale tasks. Nothing changes until you act.</p>
          </div>
        </div>
        <Link to="/tasks" className="text-sm text-slate-400 hover:text-slate-600 hover:underline">← Tasks</Link>
      </div>

      {scan.isLoading ? (
        <div className="flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Scanning every client's tasks…</div>
      ) : !r ? (
        <p className="text-slate-400">Couldn't scan.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Open tasks" value={r.totalOpen} tone="slate" />
            <Tile label="Duplicate groups" value={r.summary.nearDuplicateGroups} sub={`${r.summary.nearDuplicateExtra} extra to remove`} tone={r.summary.nearDuplicateGroups ? "amber" : "emerald"} />
            <Tile label="Undated" value={r.summary.undated} sub="invisible on the calendar" tone={r.summary.undated ? "amber" : "emerald"} />
            <Tile label="Stale overdue" value={r.summary.staleOverdue} sub="due 4+ months ago" tone={r.summary.staleOverdue ? "amber" : "emerald"} />
          </div>

          {/* DUPLICATES */}
          <Card><CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-slate-700">Near-duplicate tasks ({r.summary.nearDuplicateGroups})</span>
              {dupExtras.size > 0 && (
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="ghost" onClick={selectAllDupExtras}>Select all extras</Button>
                  <Button size="sm" variant="destructive" disabled={!pickedDup.length || del.isPending}
                    onClick={() => del.mutate({ ids: pickedDup })}>
                    {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    <span className="ml-1">Delete {pickedDup.length || ""}</span>
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">Similar titles for the same client on different days. The earliest is kept (✓); tick the rest to delete.</p>
            {r.nearDuplicates.length === 0 ? <p className="text-xs text-emerald-600">None — no near-duplicates.</p> : (
              <div className="space-y-3">
                {r.nearDuplicates.map((g, gi) => (
                  <div key={gi} className="rounded border border-slate-100 p-2">
                    <div className="text-xs font-medium text-slate-500 mb-1">{g.clientName || (g.clientId ? `Client ${g.clientId}` : "No client")}</div>
                    {g.tasks.map((t) => {
                      const keep = t.id === g.keepId;
                      return (
                        <label key={t.id} className={`flex items-center gap-2 py-0.5 text-sm ${keep ? "text-emerald-700" : "text-slate-700"}`}>
                          {keep ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            : <input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} />}
                          <span className="flex-1 min-w-0 truncate">{t.title}</span>
                          <span className="text-xs text-slate-400">{fmtDate(t.dueDate)}</span>
                          {keep && <span className="text-[10px] text-emerald-600">keep</span>}
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>

          {/* STALE OVERDUE */}
          <Card><CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-slate-700">Stale overdue ({r.summary.staleOverdue})</span>
              {r.staleOverdue.length > 0 && (
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setPicked((s) => new Set([...s, ...staleIds]))}>Select all</Button>
                  <Button size="sm" variant="outline" disabled={!pickedStale.length || done.isPending}
                    onClick={() => done.mutate({ ids: pickedStale })}>
                    {done.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    <span className="ml-1">Mark done {pickedStale.length || ""}</span>
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">Due 4+ months ago and still open. Mark done (keeps history) or open the client to re-date.</p>
            {r.staleOverdue.length === 0 ? <p className="text-xs text-emerald-600">None — nothing rotting.</p> : (
              <div className="divide-y text-sm">
                {r.staleOverdue.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} />
                    <span className="flex-1 min-w-0 truncate text-slate-700">{t.title}</span>
                    <span className="text-xs text-slate-400">{t.clientName || ""}</span>
                    <span className="text-xs text-red-500 w-20 text-right">{t.ageDays}d overdue</span>
                  </label>
                ))}
              </div>
            )}
          </CardContent></Card>

          {/* UNDATED */}
          <Card><CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-slate-700">Undated ({r.summary.undated})</span>
            </div>
            <p className="text-xs text-slate-400">No start or due date, so they never appear on the calendar. Open the client to schedule them.</p>
            {r.undated.length === 0 ? <p className="text-xs text-emerald-600">None — everything is scheduled.</p> : (
              <div className="divide-y text-sm">
                {r.undated.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 py-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-slate-700">{t.title}</span>
                    {t.clientId
                      ? <Link to={`/client/${t.clientId}`} className="text-xs text-lime-700 hover:underline">{t.clientName || `Client ${t.clientId}`} →</Link>
                      : <span className="text-xs text-slate-400">No client</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone: "emerald" | "amber" | "slate" }) {
  const cls = { emerald: "bg-emerald-50 border-emerald-200 text-emerald-700", amber: "bg-amber-50 border-amber-200 text-amber-700", slate: "bg-slate-50 border-slate-200 text-slate-700" }[tone];
  return (
    <Card className={cls}><CardContent className="p-3">
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {sub && <div className="text-[11px] opacity-70">{sub}</div>}
    </CardContent></Card>
  );
}
