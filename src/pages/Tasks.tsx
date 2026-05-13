import { useState } from "react";
import { Plus, Search, Check, Repeat, Sparkles, CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/providers/trpc";
import { format, isToday, isTomorrow, parseISO, isPast } from "date-fns";
import { cn } from "@/lib/utils";

export default function Tasks() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isRecurringOpen, setIsRecurringOpen] = useState(false);

  const { data: allTasks } = trpc.task.list.useQuery();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: _overdueTasks } = trpc.task.overdue.useQuery();
  const { data: recurringTasks } = trpc.task.listRecurring.useQuery();
  const completeTask = trpc.task.complete.useMutation({ 
    onSuccess: (data) => {
      utils.task.list.invalidate();
      if (data.nextTaskId) {
        // Show a subtle notification that next task was created
        utils.task.list.invalidate();
      }
    }
  });
  const createTask = trpc.task.create.useMutation({ onSuccess: () => { utils.task.list.invalidate(); setIsAddOpen(false); } });
  const createRecurring = trpc.task.createRecurring.useMutation({ onSuccess: () => { utils.task.listRecurring.invalidate(); setIsRecurringOpen(false); } });

  const [newTask, setNewTask] = useState({ title: "", description: "", dueDate: "", priority: "medium" as const, category: "" });
  const [newRecurring, setNewRecurring] = useState({ title: "", description: "", frequency: "monthly" as const, startDate: "", priority: "medium" as const });

  const filteredTasks = (allTasks || []).filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    const taskDate = task.dueDate ? parseISO(task.dueDate.toISOString()) : null;
    if (activeTab === "today") return taskDate && isToday(taskDate) && !task.completed;
    if (activeTab === "upcoming") return taskDate && !task.completed && taskDate > new Date() && !isToday(taskDate);
    if (activeTab === "overdue") return taskDate && !task.completed && isPast(taskDate) && !isToday(taskDate);
    if (activeTab === "completed") return task.completed;
    return true;
  });

  const getUrgency = (dueDate: Date | null, completed: boolean) => {
    if (completed) return { label: "Done", color: "bg-lime-100 text-lime-700" };
    if (!dueDate) return { label: "No date", color: "bg-slate-100 text-slate-700" };
    const d = parseISO(dueDate.toISOString());
    if (isToday(d)) return { label: "Today", color: "bg-red-100 text-red-700" };
    if (isTomorrow(d)) return { label: "Tomorrow", color: "bg-amber-100 text-amber-700" };
    if (isPast(d)) return { label: "Overdue", color: "bg-red-100 text-red-700" };
    return { label: format(d, "MMM d"), color: "bg-slate-100 text-slate-700" };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-slate-500">Manage tasks and recurring workflows</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={isRecurringOpen} onOpenChange={setIsRecurringOpen}>
            <DialogTrigger asChild><Button variant="outline"><Repeat className="h-4 w-4 mr-2" /> Recurring</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Recurring Task</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Title *</Label><Input value={newRecurring.title} onChange={(e) => setNewRecurring({...newRecurring, title: e.target.value})} /></div>
                <div className="space-y-2"><Label>Description</Label><Input value={newRecurring.description} onChange={(e) => setNewRecurring({...newRecurring, description: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Frequency</Label>
                    <Select value={newRecurring.frequency} onValueChange={(v) => setNewRecurring({...newRecurring, frequency: v as typeof newRecurring.frequency})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={newRecurring.startDate} onChange={(e) => setNewRecurring({...newRecurring, startDate: e.target.value})} /></div>
                </div>
                <Button onClick={() => newRecurring.title && newRecurring.startDate && createRecurring.mutate({...newRecurring, startDate: new Date(newRecurring.startDate)})} className="w-full">Create Recurring Task</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Task</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Title *</Label><Input value={newTask.title} onChange={(e) => setNewTask({...newTask, title: e.target.value})} /></div>
                <div className="space-y-2"><Label>Description</Label><Input value={newTask.description} onChange={(e) => setNewTask({...newTask, description: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Priority</Label>
                    <Select value={newTask.priority} onValueChange={(v) => setNewTask({...newTask, priority: v as typeof newTask.priority})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={() => newTask.title && createTask.mutate({...newTask, dueDate: newTask.dueDate ? new Date(newTask.dueDate) : undefined})} className="w-full">Create Task</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card><CardContent className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input placeholder="Search tasks..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} /></div></CardContent></Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5"><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="today">Today</TabsTrigger><TabsTrigger value="upcoming">Upcoming</TabsTrigger><TabsTrigger value="overdue">Overdue</TabsTrigger><TabsTrigger value="completed">Done</TabsTrigger></TabsList>
        <TabsContent value={activeTab} className="mt-6">
          <div className="space-y-3">
            {filteredTasks.map((task) => {
              const urgency = getUrgency(task.dueDate, task.completed);
              return (
                <Card key={task.id} className={cn(task.completed && "opacity-60")}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <button onClick={() => completeTask.mutate({ id: task.id })} className={cn("mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors", task.completed ? "bg-lime-500 border-lime-500 text-white" : "border-slate-300 hover:border-lime-500")}>{task.completed && <Check className="h-4 w-4" />}</button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className={cn("font-medium", task.completed && "line-through text-slate-500")}>{task.title}</h4>
                              {task.isRecurring && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  Auto
                                </Badge>
                              )}
                            </div>
                            {task.description && <p className="text-sm text-slate-500">{task.description}</p>}
                          </div>
                          <Badge variant="outline" className={urgency.color}>{urgency.label}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                          <div className={cn("w-2 h-2 rounded-full", task.priority === "high" ? "bg-red-500" : task.priority === "medium" ? "bg-amber-500" : "bg-lime-500")} />
                          <span className="text-xs text-slate-500 capitalize">{task.priority}</span>
                          {task.category && <><span className="text-slate-300">|</span><Badge variant="secondary" className="text-xs">{task.category}</Badge></>}
                          {task.recurrenceCount && task.recurrenceCount > 1 && (
                            <><span className="text-slate-300">|</span>
                            <span className="text-xs text-blue-500">#{task.recurrenceCount}</span></>
                          )}
                          {task.assignedTo && (
                            <><span className="text-slate-300">|</span>
                            <span className="text-xs text-slate-500">@{task.assignedTo}</span></>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {recurringTasks && recurringTasks.length > 0 && (
        <Card className="mt-8">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Repeat className="h-5 w-5 text-lime-500" /> Recurring Tasks</h3>
            <div className="space-y-2">
              {recurringTasks.map((rt) => (
                <div key={rt.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div><p className="font-medium">{rt.title}</p><p className="text-sm text-slate-500">{rt.frequency} - Next: {rt.nextDueDate ? format(new Date(rt.nextDueDate), "MMM d, yyyy") : "N/A"}</p></div>
                  <Badge variant={rt.active ? "default" : "secondary"}>{rt.active ? "Active" : "Paused"}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
