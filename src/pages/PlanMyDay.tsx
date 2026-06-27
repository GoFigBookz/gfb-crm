import HelpButton from "@/components/HelpButton";
import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router";
import { Sun, Moon, Check, Clock, GripVertical, Building2, Lock, CalendarClock, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";

/**
 * PLAN MY DAY (Markie 2026-06-27 overnight: "best personal OS… all the bells and
 * whistles"). The morning ritual the leaders' personal-OS apps (Sunsama, Akiflow,
 * Motion) are built on — but fused with the firm's work, which no bookkeeping tool
 * does. Pull today's real work (overdue + due-today tasks, calendar, personal
 * items) into one focus list, give each a quick time estimate, and watch a workload
 * meter turn yellow→red when you over-commit. Tick things done as you go; an evening
 * shutdown shows what rolls over to tomorrow.
 *
 * v1 keeps the plan + estimates in localStorage (per day) so it ships with zero
 * schema risk and reuses the existing task endpoints. A later pass can persist the
 * plan server-side + feed the Morning Figgy voice briefing.
 */
const MIN_KEY = "figgy-plan-estimates";       // { [taskId]: minutes }
const PICK_KEY = (d: string) => `figgy-plan-pick:${d}`;   // string[] of "t:<id>" / "p:<id>"
const THRESH_KEY = "figgy-plan-threshold-min"; // daily capacity in minutes

const todayISO = () => new Date().toISOString().slice(0, 10);
const hm = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}`;

function useLocal<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : init; } catch { return init; }
  });
  const set = (nv: T) => { setV(nv); try { localStorage.setItem(key, JSON.stringify(nv)); } catch { /* ignore */ } };
  return [v, set];
}

export default function PlanMyDay() {
  const utils = trpc.useUtils();
  const overdue = trpc.task.overdue.useQuery();
  const upcoming = trpc.task.upcoming.useQuery({ days: 1 });
  const personal = trpc.personal.list.useQuery(undefined, { retry: false });
  const complete = trpc.task.complete.useMutation({
    onSuccess: () => { utils.task.overdue.invalidate(); utils.task.upcoming.invalidate(); },
  });

  const day = todayISO();
  const [estimates, setEstimates] = useLocal<Record<string, number>>(MIN_KEY, {});
  const [picks, setPicks] = useLocal<string[]>(PICK_KEY(day), []);
  const [thresholdMin, setThresholdMin] = useLocal<number>(THRESH_KEY, 480);
  const [evening, setEvening] = useState(false);

  // Candidate work for today: overdue + due-today tasks, plus open personal items.
  const taskItems = useMemo(() => {
    const seen = new Set<number>();
    const out: { key: string; id: number; kind: "task"; title: string; client?: string | null; overdue: boolean }[] = [];
    for (const t of (overdue.data || []) as any[]) { if (!seen.has(t.id)) { seen.add(t.id); out.push({ key: `t:${t.id}`, id: t.id, kind: "task", title: t.title, client: t.clientName, overdue: true }); } }
    for (const t of (upcoming.data || []) as any[]) { if (!seen.has(t.id)) { seen.add(t.id); out.push({ key: `t:${t.id}`, id: t.id, kind: "task", title: t.title, client: t.clientName, overdue: false }); } }
    return out;
  }, [overdue.data, upcoming.data]);

  const personalItems = useMemo(() =>
    ((personal.data as any[]) || []).filter((p) => !p.done && !p.completed)
      .map((p) => ({ key: `p:${p.id}`, id: p.id, kind: "personal" as const, title: p.title || p.text || "Personal item" })),
  [personal.data]);

  const allItems = [...taskItems, ...personalItems];
  const picked = allItems.filter((i) => picks.includes(i.key));
  const unpicked = allItems.filter((i) => !picks.includes(i.key));

  const plannedMin = picked.reduce((s, i) => s + (estimates[i.key] ?? 30), 0);
  const pct = Math.min(100, Math.round((plannedMin / thresholdMin) * 100));
  const tone = plannedMin > thresholdMin ? "red" : plannedMin > thresholdMin * 0.85 ? "amber" : "emerald";
  const barColor = { red: "bg-red-500", amber: "bg-amber-400", emerald: "bg-emerald-500" }[tone];

  const toggle = (key: string) => setPicks(picks.includes(key) ? picks.filter((k) => k !== key) : [...picks, key]);
  const setEst = (key: string, min: number) => setEstimates({ ...estimates, [key]: min });

  // Auto-suggest the morning plan once: pick all overdue + due-today tasks.
  useEffect(() => {
    if (picks.length === 0 && taskItems.length > 0) setPicks(taskItems.map((t) => t.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskItems.length]);

  const loading = overdue.isLoading || upcoming.isLoading;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {evening ? <Moon className="h-6 w-6 text-indigo-500" /> : <Sun className="h-6 w-6 text-amber-500" />}
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-1.5">{evening ? "Shut down the day" : "Plan my day"} <HelpButton id="plan-my-day" /></h1>
            <p className="text-sm text-slate-500">{new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEvening(!evening)}>
          {evening ? <><Sun className="h-4 w-4 mr-1" /> Back to planning</> : <><Moon className="h-4 w-4 mr-1" /> Shutdown</>}
        </Button>
      </div>

      {/* Workload meter */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700">Today's load</span>
            <span className={tone === "red" ? "text-red-600 font-semibold" : "text-slate-600"}>
              {hm(plannedMin)} planned · capacity {hm(thresholdMin)}
              {tone === "red" && ` · over by ${hm(plannedMin - thresholdMin)}`}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          {tone === "red" && <p className="text-xs text-red-600">You're over capacity — defer something to tomorrow or trim an estimate.</p>}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Clock className="h-3 w-3" /> Daily capacity
            <input type="number" min={60} step={30} value={thresholdMin} onChange={(e) => setThresholdMin(Math.max(60, Number(e.target.value)))}
              className="w-16 rounded border border-slate-200 px-1 py-0.5 text-slate-600" /> min
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Pulling today's work…</div>
      ) : evening ? (
        /* ── EVENING SHUTDOWN ── */
        <Card><CardContent className="p-3 space-y-2">
          <p className="text-sm text-slate-600">{picked.length === 0 ? "Nothing was planned today." : `You planned ${picked.length}; these are still open and roll to tomorrow:`}</p>
          {picked.length > 0 && (
            <div className="divide-y">
              {picked.map((i) => (
                <div key={i.key} className="flex items-center gap-2 py-1.5 text-sm">
                  <CalendarClock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-slate-700">{i.title}</span>
                  {i.kind === "task" && <Button size="sm" variant="ghost" className="h-7" onClick={() => complete.mutate({ id: i.id })}>Mark done</Button>}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 pt-1">Unfinished tasks stay on the board and reappear in tomorrow's plan. Rest up. 🌙</p>
        </CardContent></Card>
      ) : (
        <>
          {/* ── TODAY (picked) ── */}
          <Card><CardContent className="p-3 space-y-1">
            <div className="text-sm font-semibold text-slate-700 mb-1">Today — {picked.length} item{picked.length === 1 ? "" : "s"}</div>
            {picked.length === 0 ? <p className="text-xs text-slate-400">Nothing planned yet. Pick from below.</p> : picked.map((i) => (
              <div key={i.key} className="flex items-center gap-2 rounded border border-slate-100 bg-white px-2 py-1.5 text-sm">
                <GripVertical className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                <button onClick={() => i.kind === "task" && complete.mutate({ id: i.id })} className="shrink-0" title={i.kind === "task" ? "Mark done" : ""}>
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${i.kind === "task" ? "border-slate-300 hover:border-emerald-500 hover:bg-emerald-50" : "border-slate-200"}`}>
                    {complete.isPending && complete.variables?.id === (i as any).id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-transparent" />}
                  </span>
                </button>
                <span className="flex-1 min-w-0 truncate text-slate-700">{i.title}</span>
                {"client" in i && i.client && <span className="hidden sm:inline text-[11px] text-slate-400 flex items-center gap-0.5"><Building2 className="h-3 w-3" />{i.client}</span>}
                {i.kind === "personal" && <Lock className="h-3 w-3 text-slate-300" />}
                {"overdue" in i && i.overdue && <span className="text-[10px] text-red-500 font-medium">overdue</span>}
                <select value={estimates[i.key] ?? 30} onChange={(e) => setEst(i.key, Number(e.target.value))}
                  className="rounded border border-slate-200 text-xs px-1 py-0.5 text-slate-500">
                  {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{hm(m)}</option>)}
                </select>
                <button onClick={() => toggle(i.key)} className="text-xs text-slate-400 hover:text-slate-600">defer</button>
              </div>
            ))}
          </CardContent></Card>

          {/* ── BACKLOG (unpicked) ── */}
          {unpicked.length > 0 && (
            <Card><CardContent className="p-3 space-y-1">
              <div className="text-sm font-semibold text-slate-500 mb-1">Available — tap to add to today</div>
              {unpicked.map((i) => (
                <div key={i.key} className="flex items-center gap-2 px-2 py-1 text-sm">
                  <button onClick={() => toggle(i.key)} className="text-lime-600 hover:text-lime-700 text-xs font-medium shrink-0">+ add</button>
                  <span className="flex-1 min-w-0 truncate text-slate-600">{i.title}</span>
                  {"client" in i && i.client && <span className="text-[11px] text-slate-400">{i.client}</span>}
                  {i.kind === "personal" && <Lock className="h-3 w-3 text-slate-300" />}
                  {"overdue" in i && i.overdue && <span className="text-[10px] text-red-500">overdue</span>}
                </div>
              ))}
            </CardContent></Card>
          )}

          <p className="text-xs text-slate-400 text-center">
            Pulls your overdue + due-today tasks and open <Link to="/personal" className="underline">personal</Link> items. Estimates + today's picks are saved on this device.
          </p>
        </>
      )}
    </div>
  );
}
