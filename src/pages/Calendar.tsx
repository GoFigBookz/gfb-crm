import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, Building2, CheckSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear,
  addDays, addWeeks, addMonths, addYears, subDays, subWeeks, subMonths, subYears,
  isSameMonth, isSameDay, eachDayOfInterval, eachMonthOfInterval, isWithinInterval, differenceInCalendarDays,
} from "date-fns";
import { cn } from "@/lib/utils";

type ViewType = "day" | "week" | "month" | "year" | "list" | "gantt";
const VIEWS: ViewType[] = ["day", "week", "month", "year", "list", "gantt"];

export default function CalendarPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("month");
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Visible range per view (year/list pull wider so we fetch enough).
  const range = (() => {
    switch (view) {
      case "day": return { start: currentDate, end: currentDate };
      case "week": return { start: startOfWeek(currentDate), end: endOfWeek(currentDate) };
      case "year": return { start: startOfYear(currentDate), end: endOfYear(currentDate) };
      case "list": return { start: startOfMonth(currentDate), end: addMonths(endOfMonth(currentDate), 2) };
      case "gantt": return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
      default: return { start: startOfWeek(startOfMonth(currentDate)), end: endOfWeek(endOfMonth(currentDate)) };
    }
  })();

  const { data: events } = trpc.calendar.list.useQuery({ startDate: range.start, endDate: range.end });
  const { data: allTasks } = trpc.task.list.useQuery();
  const { data: clientList } = trpc.crmClient.list.useQuery();
  const clientName = (cid: any) => (clientList || []).find((c: any) => c.id === cid)?.name ?? null;

  const createEvent = trpc.calendar.create.useMutation({ onSuccess: () => { utils.calendar.list.invalidate(); setIsAddOpen(false); } });
  const [newEvent, setNewEvent] = useState({ title: "", startDate: "", endDate: "", description: "" });

  // Unified items: calendar events + tasks-with-due-dates.
  type Item = { id: string; title: string; date: Date; end: Date; kind: "event" | "task"; clientId: any; color: string; overdue: boolean; raw: any };
  const items: Item[] = [
    ...((events || []).map((e: any) => ({
      id: `e${e.id}`, title: e.title, date: new Date(e.startDate), end: e.endDate ? new Date(e.endDate) : new Date(e.startDate),
      kind: "event" as const, clientId: e.clientId, color: e.color === "purple" ? "purple" : "lime", overdue: false, raw: e,
    }))),
    ...((allTasks || []).filter((t: any) => t.dueDate && !t.completed).map((t: any) => {
      const d = new Date(t.dueDate);
      return { id: `t${t.id}`, title: t.title, date: d, end: d, kind: "task" as const, clientId: t.clientId,
        color: "amber", overdue: d < new Date() && !isSameDay(d, new Date()), raw: t };
    })),
  ];
  const itemsForDay = (date: Date) => items.filter((it) => isSameDay(it.date, date)).sort((a, b) => a.date.getTime() - b.date.getTime());

  const title = view === "year" ? format(currentDate, "yyyy")
    : view === "day" ? format(currentDate, "EEEE, MMMM d, yyyy")
    : view === "week" ? `${format(startOfWeek(currentDate), "MMM d")} – ${format(endOfWeek(currentDate), "MMM d, yyyy")}`
    : format(currentDate, "MMMM yyyy");

  const step = (dir: 1 | -1) => {
    const f = { day: [addDays, subDays], week: [addWeeks, subWeeks], month: [addMonths, subMonths], year: [addYears, subYears], list: [addMonths, subMonths], gantt: [addMonths, subMonths] }[view];
    setCurrentDate((dir === 1 ? f[0] : f[1])(currentDate, 1));
  };

  const ItemPill = ({ it }: { it: Item }) => (
    <div
      className={cn("text-xs truncate px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 flex items-center gap-1",
        it.kind === "task" ? (it.overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")
          : it.color === "purple" ? "bg-purple-100 text-purple-700" : "bg-lime-100 text-lime-700")}
      onClick={(ev) => {
        ev.stopPropagation();
        if (it.kind === "task" && it.clientId) navigate(`/client/${it.clientId}`);
        else if (it.raw.title?.includes("Discovery Call") && it.raw.clientId) navigate(`/discovery?clientId=${it.raw.clientId}`);
      }}
      title={it.title}
    >
      {it.kind === "task" ? <CheckSquare className="h-3 w-3 shrink-0" /> : <CalIcon className="h-3 w-3 shrink-0" />}
      <span className="truncate">{it.title}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
        <div className="flex flex-wrap items-center gap-3">
          {/* View switcher */}
          <div className="flex rounded-lg border bg-white p-0.5">
            {VIEWS.map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors",
                  view === v ? "bg-lime-500 text-white" : "text-slate-600 hover:bg-slate-100")}>
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-sm font-semibold min-w-[190px] text-center">{title}</h2>
            <Button variant="outline" size="icon" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Event</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Event</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Title *</Label><Input value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Start</Label><Input type="datetime-local" value={newEvent.startDate} onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })} /></div>
                  <div className="space-y-2"><Label>End</Label><Input type="datetime-local" value={newEvent.endDate} onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Description</Label><Input value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} /></div>
                <Button className="w-full" onClick={() => newEvent.title && newEvent.startDate && newEvent.endDate && createEvent.mutate({ ...newEvent, startDate: new Date(newEvent.startDate), endDate: new Date(newEvent.endDate) })}>Create Event</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-lime-200 inline-block" /> Event</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 inline-block" /> Task due</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block" /> Overdue</span>
      </div>

      <Card><CardContent className="p-4 md:p-6">
        {/* ── MONTH ── */}
        {view === "month" && (() => {
          const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate)), end: endOfWeek(endOfMonth(currentDate)) });
          return (
            <>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="text-center font-semibold text-slate-500 py-2 text-sm">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((date, i) => {
                  const dayItems = itemsForDay(date);
                  const isCur = isSameMonth(date, currentDate);
                  const isToday = isSameDay(date, new Date());
                  return (
                    <div key={i} onClick={() => { setCurrentDate(date); setView("day"); }} className={cn("min-h-[110px] p-2 border rounded-lg cursor-pointer transition-colors", !isCur && "bg-slate-50 text-slate-400", isCur && "hover:bg-slate-50", isToday && "ring-2 ring-lime-500 ring-inset")}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn("text-sm font-medium", isToday && "text-lime-600")}>{format(date, "d")}</span>
                        {dayItems.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">{dayItems.length}</span>}
                      </div>
                      <div className="space-y-1">
                        {dayItems.slice(0, 3).map(it => <ItemPill key={it.id} it={it} />)}
                        {dayItems.length > 3 && <span className="text-xs text-slate-400">+{dayItems.length - 3} more</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* ── WEEK ── */}
        {view === "week" && (
          <div className="grid grid-cols-7 gap-1">
            {eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) }).map((date, i) => {
              const dayItems = itemsForDay(date);
              const isToday = isSameDay(date, new Date());
              return (
                <div key={i} className={cn("min-h-[300px] p-2 border rounded-lg", isToday && "ring-2 ring-lime-500 ring-inset")}>
                  <div className="text-center mb-2">
                    <div className="text-xs text-slate-500">{format(date, "EEE")}</div>
                    <div className={cn("text-lg font-semibold", isToday && "text-lime-600")}>{format(date, "d")}</div>
                  </div>
                  <div className="space-y-1">{dayItems.map(it => <ItemPill key={it.id} it={it} />)}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── DAY ── */}
        {view === "day" && (
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-700">{format(currentDate, "EEEE, MMMM d")}</h3>
            {itemsForDay(currentDate).length === 0
              ? <p className="text-slate-400 py-8 text-center">Nothing scheduled or due this day.</p>
              : itemsForDay(currentDate).map(it => (
                <div key={it.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", it.kind === "task" ? (it.overdue ? "bg-red-500" : "bg-amber-500") : "bg-lime-500")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.title}</p>
                    <p className="text-xs text-slate-500">{it.kind === "event" ? format(it.date, "h:mm a") : "Task due"}{it.clientId && clientName(it.clientId) ? ` · ${clientName(it.clientId)}` : ""}</p>
                  </div>
                  {it.clientId && <Link to={`/client/${it.clientId}`} className="text-xs text-lime-700 hover:underline shrink-0"><Building2 className="h-3.5 w-3.5" /></Link>}
                </div>
              ))}
          </div>
        )}

        {/* ── YEAR ── */}
        {view === "year" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {eachMonthOfInterval({ start: startOfYear(currentDate), end: endOfYear(currentDate) }).map((m, i) => {
              const monthDays = eachDayOfInterval({ start: startOfWeek(startOfMonth(m)), end: endOfWeek(endOfMonth(m)) });
              const count = items.filter(it => isSameMonth(it.date, m)).length;
              return (
                <button key={i} onClick={() => { setCurrentDate(m); setView("month"); }} className="text-left border rounded-lg p-2 hover:bg-slate-50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">{format(m, "MMMM")}</span>
                    {count > 0 && <span className="text-[10px] px-1.5 rounded-full bg-lime-500 text-white">{count}</span>}
                  </div>
                  <div className="grid grid-cols-7 gap-px text-[9px] text-center text-slate-400">
                    {monthDays.slice(0, 35).map((d, j) => {
                      const has = items.some(it => isSameDay(it.date, d));
                      return <span key={j} className={cn("aspect-square flex items-center justify-center rounded", !isSameMonth(d, m) && "opacity-30", has && "bg-lime-200 text-lime-800 font-semibold")}>{format(d, "d")}</span>;
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── LIST / AGENDA ── */}
        {view === "list" && (() => {
          const upcoming = items.filter(it => it.date >= subDays(new Date(), 1)).sort((a, b) => a.date.getTime() - b.date.getTime());
          const groups = new Map<string, Item[]>();
          for (const it of upcoming) { const k = format(it.date, "yyyy-MM-dd"); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(it); }
          return upcoming.length === 0 ? <p className="text-slate-400 py-8 text-center">Nothing upcoming.</p> : (
            <div className="space-y-4">
              {[...groups.entries()].map(([k, its]) => (
                <div key={k}>
                  <div className="text-xs font-semibold text-slate-500 mb-1">{format(new Date(k), "EEEE, MMM d")}</div>
                  <div className="space-y-1">
                    {its.map(it => (
                      <div key={it.id} className="flex items-center gap-3 p-2 border rounded-lg">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", it.kind === "task" ? (it.overdue ? "bg-red-500" : "bg-amber-500") : "bg-lime-500")} />
                        <span className="flex-1 text-sm truncate">{it.title}</span>
                        {it.clientId && clientName(it.clientId) && <Link to={`/client/${it.clientId}`} className="text-xs text-lime-700 hover:underline shrink-0">{clientName(it.clientId)}</Link>}
                        <span className="text-xs text-slate-400 shrink-0">{it.kind === "task" ? "due" : format(it.date, "h:mm a")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── GANTT (current month timeline) ── */}
        {view === "gantt" && (() => {
          const monthDays = eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) });
          const n = monthDays.length;
          const rows = items.filter(it => isWithinInterval(it.date, { start: startOfMonth(currentDate), end: endOfMonth(currentDate) }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());
          return rows.length === 0 ? <p className="text-slate-400 py-8 text-center">Nothing in {format(currentDate, "MMMM")}.</p> : (
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="flex text-[10px] text-slate-400 border-b pb-1 mb-1">
                  <div className="w-48 shrink-0" />
                  {monthDays.map((d, i) => <div key={i} className="flex-1 text-center">{format(d, "d")}</div>)}
                </div>
                {rows.map((it) => {
                  const startIdx = Math.max(0, differenceInCalendarDays(it.date, startOfMonth(currentDate)));
                  const endIdx = Math.min(n - 1, Math.max(startIdx, differenceInCalendarDays(it.end, startOfMonth(currentDate))));
                  const span = endIdx - startIdx + 1;
                  return (
                    <div key={it.id} className="flex items-center h-7">
                      <div className="w-48 shrink-0 truncate text-xs pr-2 flex items-center gap-1">
                        {it.kind === "task" ? <CheckSquare className="h-3 w-3 text-amber-500" /> : <CalIcon className="h-3 w-3 text-lime-500" />}
                        <span className="truncate">{it.title}</span>
                      </div>
                      <div className="flex-1 relative h-full flex items-center">
                        <div className="absolute h-4 rounded"
                          style={{ left: `${(startIdx / n) * 100}%`, width: `${(span / n) * 100}%` }}>
                          <div className={cn("h-full rounded", it.kind === "task" ? (it.overdue ? "bg-red-400" : "bg-amber-400") : "bg-lime-400")} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </CardContent></Card>
    </div>
  );
}
