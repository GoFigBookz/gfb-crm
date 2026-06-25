import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, Building2, CheckSquare, RefreshCw, Play } from "lucide-react";
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
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { TimezoneBanner } from "@/components/TimezoneBanner";
import { awayInfo, eventTimeLabel, placementDate } from "@/lib/timezone";

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

  // Pull Google Calendar + Tasks into the CRM so they show here. Detection uses the
  // FIRM-WIDE account accessor (proven), not the per-session list — so it works
  // regardless of which user row the OAuth landed on. Auto-runs once on load.
  const { data: firmAcct } = trpc.googleSync.firmAccount.useQuery();
  const googleAcct = firmAcct?.connected ? firmAcct : null;
  const syncCal = trpc.googleSync.syncCalendar.useMutation({ onSuccess: () => utils.calendar.list.invalidate() });
  const syncGTasks = trpc.googleSync.syncTasks.useMutation({ onSuccess: () => { utils.task.list.invalidate(); utils.task.upcoming.invalidate(); } });
  const syncGoogle = () => { if (googleAcct?.id) { syncCal.mutate({ accountId: googleAcct.id }); syncGTasks.mutate({ accountId: googleAcct.id }); } };
  const [autoSynced, setAutoSynced] = useState(false);
  useEffect(() => {
    if (googleAcct && !autoSynced) { setAutoSynced(true); syncGoogle(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAcct, autoSynced]);
  const syncing = syncCal.isPending || syncGTasks.isPending;

  const createEvent = trpc.calendar.create.useMutation({ onSuccess: () => { utils.calendar.list.invalidate(); setIsAddOpen(false); resetNewEvent(); } });
  const blankEvent = { title: "", allDay: false, startDate: "", endDate: "", location: "", guests: "", clientId: "", color: "lime", meetingLink: "", description: "" };
  const [newEvent, setNewEvent] = useState({ ...blankEvent });
  const resetNewEvent = () => setNewEvent({ ...blankEvent });
  const submitNewEvent = () => {
    if (!newEvent.title || !newEvent.startDate) return;
    // All-day → parse the date at LOCAL noon so it never drifts a day.
    const toDate = (s: string) => {
      if (newEvent.allDay) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0); }
      return new Date(s);
    };
    const start = toDate(newEvent.startDate);
    const end = newEvent.endDate ? toDate(newEvent.endDate) : start;
    createEvent.mutate({
      title: newEvent.title,
      description: newEvent.description || undefined,
      startDate: start,
      endDate: end < start ? start : end,
      isAllDay: newEvent.allDay,
      location: newEvent.location || undefined,
      clientId: newEvent.clientId ? Number(newEvent.clientId) : undefined,
      color: newEvent.color || undefined,
      meetingLink: newEvent.meetingLink || undefined,
      attendees: newEvent.guests
        ? newEvent.guests.split(",").map((e) => ({ email: e.trim(), name: "", responseStatus: "needsAction" })).filter((a) => a.email)
        : undefined,
    } as any);
  };

  // Task interactions on the calendar: click to edit, drag to reschedule.
  const [openTask, setOpenTask] = useState<any | null>(null);
  const [openEvent, setOpenEvent] = useState<any | null>(null);   // event drill-down dialog
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [draggingEvent, setDraggingEvent] = useState<any | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const rescheduleTask = trpc.task.update.useMutation({
    onSuccess: () => { utils.task.list.invalidate(); utils.task.upcoming.invalidate(); utils.task.overdue.invalidate(); },
    onError: (e) => alert(`Could not reschedule: ${e.message}`),
  });
  const moveEvent = trpc.calendar.update.useMutation({
    onSuccess: () => utils.calendar.list.invalidate(),   // also pushes the new date to Google
    onError: (e) => alert(`Could not move event: ${e.message}`),
  });
  const dropOnDay = (date: Date) => {
    if (draggingTaskId != null) {
      const due = new Date(date); due.setHours(9, 0, 0, 0);
      rescheduleTask.mutate({ id: draggingTaskId, dueDate: due });
    } else if (draggingEvent) {
      // Move the event to the dropped day, preserving time-of-day and duration.
      const oldStart = new Date(draggingEvent.date);
      const oldEnd = new Date(draggingEvent.end || draggingEvent.date);
      const durationMs = Math.max(0, oldEnd.getTime() - oldStart.getTime());
      const newStart = new Date(date);
      newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
      moveEvent.mutate({ id: draggingEvent.raw.id, startDate: newStart, endDate: new Date(newStart.getTime() + durationMs) });
    }
    setDraggingTaskId(null);
    setDraggingEvent(null);
    setDragOverKey(null);
  };

  // Unified items: calendar events + tasks-with-due-dates.
  // OVERDUE behaviour (matches Todoist/Things/Google Tasks): an incomplete task
  // whose due date is in the past is SURFACED on today (so today reflects the
  // real workload and the calendar isn't blank) — but its stored due date is
  // left untouched, so we still know how late it is. Reschedule = drag it.
  type Item = { id: string; title: string; date: Date; end: Date; kind: "event" | "task"; clientId: any; color: string; overdue: boolean; daysLate: number; dueDate?: Date; start?: boolean; raw: any };
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const items: Item[] = [
    ...((events || []).map((e: any) => ({
      id: `e${e.id}`, title: e.title, date: placementDate(e.startDate, e.isAllDay), end: placementDate(e.endDate ?? e.startDate, e.isAllDay),
      kind: "event" as const, clientId: e.clientId, color: e.color === "purple" ? "purple" : "lime", overdue: false, daysLate: 0, raw: e,
    }))),
    ...((allTasks || []).filter((t: any) => t.dueDate && !t.completed).map((t: any) => {
      const d = placementDate(t.dueDate);
      const isOverdue = d < startToday;
      const placement = isOverdue ? new Date() : d;   // overdue rolls onto today (display only)
      const daysLate = isOverdue ? differenceInCalendarDays(startToday, d) : 0;
      return { id: `t${t.id}`, title: t.title, date: placement, end: placement, kind: "task" as const, clientId: t.clientId,
        color: "amber", overdue: isOverdue, daysLate, dueDate: d, raw: t };
    })),
    // "Begin work" markers: a task with a start date also appears (lighter, ▶) on
    // its start day, so the calendar shows when to START as well as when it's due.
    ...((allTasks || []).filter((t: any) => t.startDate && t.dueDate && !t.completed).map((t: any) => {
      const s = placementDate(t.startDate);
      return { id: `ts${t.id}`, title: t.title, date: s, end: s, kind: "task" as const, clientId: t.clientId,
        color: "blue", overdue: false, daysLate: 0, dueDate: placementDate(t.dueDate), start: true, raw: t };
    })),
  ];
  const overdueCount = items.filter((it) => it.kind === "task" && it.overdue).length;
  const itemsForDay = (date: Date) => items.filter((it) => isSameDay(it.date, date)).sort((a, b) => a.date.getTime() - b.date.getTime());

  // Open tasks with NO due date — they can't sit on a calendar grid, so show
  // them in a tray you can drag onto any day to schedule.
  const unscheduled = (allTasks || []).filter((t: any) => !t.dueDate && !t.completed);

  const title = view === "year" ? format(currentDate, "yyyy")
    : view === "day" ? format(currentDate, "EEEE, MMMM d, yyyy")
    : view === "week" ? `${format(startOfWeek(currentDate), "MMM d")} – ${format(endOfWeek(currentDate), "MMM d, yyyy")}`
    : format(currentDate, "MMMM yyyy");

  const step = (dir: 1 | -1) => {
    const f = { day: [addDays, subDays], week: [addWeeks, subWeeks], month: [addMonths, subMonths], year: [addYears, subYears], list: [addMonths, subMonths], gantt: [addMonths, subMonths] }[view];
    setCurrentDate((dir === 1 ? f[0] : f[1])(currentDate, 1));
  };

  // Timezone context: Ontario is canonical; flag + translate only when away.
  const tz = awayInfo();

  const ItemPill = ({ it }: { it: Item }) => (
    <div
      draggable
      onDragStart={(e) => { if (it.kind === "task") setDraggingTaskId(it.raw.id); else setDraggingEvent(it); e.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={() => { setDraggingTaskId(null); setDraggingEvent(null); setDragOverKey(null); }}
      className={cn("text-xs truncate px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 flex items-center gap-1 cursor-grab active:cursor-grabbing",
        (draggingTaskId === it.raw.id || draggingEvent?.id === it.id) && "opacity-40",
        it.start ? "bg-sky-100 text-sky-700"
          : it.kind === "task" ? (it.overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")
          : it.color === "purple" ? "bg-purple-100 text-purple-700" : "bg-lime-100 text-lime-700")}
      onClick={(ev) => {
        ev.stopPropagation();
        if (it.kind === "task") setOpenTask(it.raw);
        else if (it.raw.title?.includes("Discovery Call") && it.raw.clientId) navigate(`/discovery?clientId=${it.raw.clientId}`);
        else setOpenEvent(it.raw);
      }}
      title={it.start ? `Start: ${it.title}` : it.title}
    >
      {it.start ? <Play className="h-3 w-3 shrink-0" /> : it.kind === "task" ? <CheckSquare className="h-3 w-3 shrink-0" /> : <CalIcon className="h-3 w-3 shrink-0" />}
      <span className="truncate">{it.title}</span>
      {it.overdue && <span className="ml-auto shrink-0 text-[10px] font-semibold">{it.daysLate}d late</span>}
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
          {googleAcct && (
            <Button variant="outline" onClick={syncGoogle} disabled={syncing} title="Pull your Google Calendar & Tasks into the CRM">
              <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} /> {syncing ? "Syncing…" : "Sync Google"}
            </Button>
          )}
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Event</Button></DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Event</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1"><Label>Title *</Label><Input placeholder="Add title" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} /></div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={newEvent.allDay} onChange={(e) => setNewEvent({ ...newEvent, allDay: e.target.checked })} /> All day
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Start</Label><Input type={newEvent.allDay ? "date" : "datetime-local"} value={newEvent.startDate} onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })} /></div>
                  <div className="space-y-1"><Label>End</Label><Input type={newEvent.allDay ? "date" : "datetime-local"} value={newEvent.endDate} onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label>Location</Label><Input placeholder="Address or place" value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} /></div>
                <div className="space-y-1"><Label>Video / meeting link</Label><Input placeholder="https://meet.google.com/…" value={newEvent.meetingLink} onChange={(e) => setNewEvent({ ...newEvent, meetingLink: e.target.value })} /></div>
                <div className="space-y-1"><Label>Guests (emails, comma-separated)</Label><Input placeholder="a@x.com, b@y.com" value={newEvent.guests} onChange={(e) => setNewEvent({ ...newEvent, guests: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Client</Label>
                    <select className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm" value={newEvent.clientId} onChange={(e) => setNewEvent({ ...newEvent, clientId: e.target.value })}>
                      <option value="">— none —</option>
                      {(clientList || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label>Color</Label>
                    <select className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm" value={newEvent.color} onChange={(e) => setNewEvent({ ...newEvent, color: e.target.value })}>
                      <option value="lime">Green</option><option value="purple">Purple</option><option value="blue">Blue</option><option value="amber">Amber</option><option value="red">Red</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1"><Label>Description</Label><Input placeholder="Notes" value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} /></div>
                <Button className="w-full" disabled={!newEvent.title || !newEvent.startDate || createEvent.isPending} onClick={submitNewEvent}>{createEvent.isPending ? "Saving…" : "Create Event"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <TimezoneBanner />

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-lime-200 inline-block" /> Event</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 inline-block" /> Task due</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block" /> Overdue</span>
        {overdueCount > 0 && (
          <span className="text-red-600">· {overdueCount} overdue task{overdueCount === 1 ? "" : "s"} shown on today — drag onto a day to reschedule</span>
        )}
      </div>

      {/* Unscheduled tasks tray — drag any of these onto a day to schedule it */}
      {unscheduled.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckSquare className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-slate-700">Unscheduled tasks ({unscheduled.length})</span>
              <span className="text-xs text-slate-500">— drag onto a day to schedule, or click to edit</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {unscheduled.map((t: any) => (
                <div key={t.id} draggable
                  onDragStart={(e) => { setDraggingTaskId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDraggingTaskId(null); setDragOverKey(null); }}
                  onClick={() => setOpenTask(t)}
                  className={cn("text-xs px-2 py-1 rounded border bg-white cursor-grab active:cursor-grabbing hover:shadow-sm flex items-center gap-1 max-w-[240px]",
                    draggingTaskId === t.id && "opacity-40")}
                  title={t.title}>
                  <CheckSquare className="h-3 w-3 shrink-0 text-amber-500" />
                  <span className="truncate">{t.title}</span>
                  {t.clientId && clientName(t.clientId) && <span className="text-[10px] text-slate-400 shrink-0">· {clientName(t.clientId)}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                  const key = format(date, "yyyy-MM-dd");
                  return (
                    <div key={i} onClick={() => { setCurrentDate(date); setView("day"); }}
                      onDragOver={(e) => { if (draggingTaskId != null || draggingEvent) { e.preventDefault(); setDragOverKey(key); } }}
                      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverKey(null); }}
                      onDrop={(e) => { e.stopPropagation(); dropOnDay(date); }}
                      className={cn("min-h-[110px] p-2 border rounded-lg cursor-pointer transition-colors", !isCur && "bg-slate-50 text-slate-400", isCur && "hover:bg-slate-50", isToday && "ring-2 ring-lime-500 ring-inset", dragOverKey === key && "bg-lime-50 ring-2 ring-lime-400 ring-inset")}>
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
              const key = format(date, "yyyy-MM-dd");
              return (
                <div key={i}
                  onDragOver={(e) => { if (draggingTaskId != null || draggingEvent) { e.preventDefault(); setDragOverKey(key); } }}
                  onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverKey(null); }}
                  onDrop={() => dropOnDay(date)}
                  className={cn("min-h-[300px] p-2 border rounded-lg transition-colors", isToday && "ring-2 ring-lime-500 ring-inset", dragOverKey === key && "bg-lime-50 ring-2 ring-lime-400 ring-inset")}>
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
                <div key={it.id} onClick={() => { if (it.kind === "task") setOpenTask(it.raw); else setOpenEvent(it.raw); }} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", it.kind === "task" ? (it.overdue ? "bg-red-500" : "bg-amber-500") : "bg-lime-500")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.title}</p>
                    <p className="text-xs text-slate-500">{it.kind === "event" ? eventTimeLabel(it.date, tz) : it.overdue ? `Due ${format(it.dueDate!, "MMM d")} · ${it.daysLate}d late` : "Task due"}{it.clientId && clientName(it.clientId) ? ` · ${clientName(it.clientId)}` : ""}</p>
                  </div>
                  {it.clientId && <Link to={`/client/${it.clientId}`} onClick={(e) => e.stopPropagation()} className="text-xs text-lime-700 hover:underline shrink-0"><Building2 className="h-3.5 w-3.5" /></Link>}
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
                      <div key={it.id} onClick={() => { if (it.kind === "task") setOpenTask(it.raw); else setOpenEvent(it.raw); }} className="flex items-center gap-3 p-2 border rounded-lg cursor-pointer hover:bg-slate-50">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", it.kind === "task" ? (it.overdue ? "bg-red-500" : "bg-amber-500") : "bg-lime-500")} />
                        <span className="flex-1 text-sm truncate">{it.title}</span>
                        {it.clientId && clientName(it.clientId) && <Link to={`/client/${it.clientId}`} onClick={(e) => e.stopPropagation()} className="text-xs text-lime-700 hover:underline shrink-0">{clientName(it.clientId)}</Link>}
                        <span className={cn("text-xs shrink-0", it.overdue ? "text-red-600 font-medium" : "text-slate-400")}>{it.kind === "task" ? (it.overdue ? `${it.daysLate}d late` : "due") : eventTimeLabel(it.date, tz)}</span>
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

      {openTask && <TaskDetailDialog task={openTask} onClose={() => setOpenTask(null)} />}
      {openEvent && (
        <EventDetailDialog
          event={openEvent}
          clientName={openEvent.clientId ? clientName(openEvent.clientId) : null}
          onClose={() => setOpenEvent(null)}
          onDeleted={() => { setOpenEvent(null); utils.calendar.list.invalidate(); }}
        />
      )}
    </div>
  );
}

/** Read-only-ish drill-down for a calendar EVENT (clicking one used to do nothing).
 *  Shows when/where/who + description + meeting link, with Delete. */
function EventDetailDialog({ event, clientName, onClose, onDeleted }: {
  event: any; clientName: string | null; onClose: () => void; onDeleted: () => void;
}) {
  const allDay = !!event.isAllDay;
  const start = placementDate(event.startDate, allDay);
  const end = event.endDate ? placementDate(event.endDate, allDay) : start;
  const when = allDay
    ? format(start, "EEEE, MMMM d, yyyy") + " · all day"
    : `${format(start, "EEEE, MMMM d, yyyy")} · ${format(start, "h:mm a")}${end > start ? `–${format(end, "h:mm a")}` : ""}`;
  const del = trpc.calendar.delete.useMutation({ onSuccess: onDeleted, onError: (e) => alert(`Could not delete: ${e.message}`) });
  let attendees: any[] = [];
  try { attendees = Array.isArray(event.attendees) ? event.attendees : JSON.parse(event.attendees || "[]"); } catch { attendees = []; }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalIcon className="h-4 w-4 text-lime-600" /> {event.title || "Event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="text-slate-700">{when}</p>
          {event.location && <p className="text-slate-600">📍 {event.location}</p>}
          {clientName && <p className="text-slate-600 flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {clientName}</p>}
          {event.meetingLink && <a href={event.meetingLink} target="_blank" rel="noreferrer" className="text-lime-700 hover:underline inline-block">Join meeting link →</a>}
          {attendees.length > 0 && <p className="text-slate-500 text-xs">Guests: {attendees.map((a: any) => a.email || a.name).filter(Boolean).join(", ")}</p>}
          {event.description && <p className="text-slate-600 whitespace-pre-wrap border-t pt-2">{event.description}</p>}
          <div className="flex justify-between items-center pt-3 border-t">
            <Button variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => { if (confirm(`Delete "${event.title}"?`)) del.mutate({ id: event.id }); }}>Delete</Button>
            {event.clientId && <Link to={`/client/${event.clientId}`} onClick={onClose} className="text-sm text-lime-700 hover:underline">Open client →</Link>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
