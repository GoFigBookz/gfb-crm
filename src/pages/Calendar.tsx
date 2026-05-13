import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, addMonths, subMonths,
} from "date-fns";
import { cn } from "@/lib/utils";

export default function CalendarPage() {
  const utils = trpc.useUtils();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [_selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const { data: events } = trpc.calendar.list.useQuery({
    startDate: calendarStart,
    endDate: calendarEnd,
  });

  const createEvent = trpc.calendar.create.useMutation({ onSuccess: () => { utils.calendar.list.invalidate(); setIsAddOpen(false); } });

  const [newEvent, setNewEvent] = useState({ title: "", startDate: "", endDate: "", description: "" });

  const days: Date[] = [];
  let day = calendarStart;
  while (day <= calendarEnd) { days.push(day); day = addDays(day, 1); }

  const getEventsForDate = (date: Date) => (events || []).filter(e => {
    const start = e.startDate ? new Date(e.startDate) : null;
    return start && isSameDay(start, date);
  });

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-xl font-semibold min-w-[200px] text-center">{format(currentDate, "MMMM yyyy")}</h2>
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Event</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Event</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Title *</Label><Input value={newEvent.title} onChange={(e) => setNewEvent({...newEvent, title: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Start</Label><Input type="datetime-local" value={newEvent.startDate} onChange={(e) => setNewEvent({...newEvent, startDate: e.target.value})} /></div>
                  <div className="space-y-2"><Label>End</Label><Input type="datetime-local" value={newEvent.endDate} onChange={(e) => setNewEvent({...newEvent, endDate: e.target.value})} /></div>
                </div>
                <div className="space-y-2"><Label>Description</Label><Input value={newEvent.description} onChange={(e) => setNewEvent({...newEvent, description: e.target.value})} /></div>
                <Button className="w-full" onClick={() => newEvent.title && newEvent.startDate && newEvent.endDate && createEvent.mutate({...newEvent, startDate: new Date(newEvent.startDate), endDate: new Date(newEvent.endDate)})}>Create Event</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card><CardContent className="p-6">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map(d => <div key={d} className="text-center font-semibold text-slate-500 py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((date, i) => {
            const dayEvents = getEventsForDate(date);
            const isCurrentMonth = isSameMonth(date, currentDate);
            const isToday = isSameDay(date, new Date());
            return (
              <div key={i} onClick={() => { setSelectedDate(date); }} className={cn("min-h-[100px] p-2 border rounded-lg cursor-pointer transition-colors", !isCurrentMonth && "bg-slate-50 text-slate-400", isCurrentMonth && "hover:bg-slate-50", isToday && "ring-2 ring-lime-500 ring-inset")}>
                <div className="flex items-center justify-between mb-1">
                  <span className={cn("text-sm font-medium", isToday && "text-lime-600")}>{format(date, "d")}</span>
                  {dayEvents.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-lime-500 text-white">{dayEvents.length}</span>}
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map(e => <div key={e.id} className="text-xs truncate px-1.5 py-0.5 rounded bg-lime-100 text-lime-700">{e.title}</div>)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent></Card>
    </div>
  );
}
