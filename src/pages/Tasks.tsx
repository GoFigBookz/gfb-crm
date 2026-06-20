import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router";
import { Plus, Search, Check, Repeat, Sparkles, LayoutGrid, List as ListIcon, Calendar as CalendarIcon, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import { format, isToday, isTomorrow, parseISO, isPast, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";

export default function Tasks() {
  const utils = trpc.useUtils();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "board" | "workflow" | "calendar">("list");
  const [fClient, setFClient] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [fCategory, setFCategory] = useState("all");
  const [fStatus, setFStatus] = useState("open");
  const [groupByClient, setGroupByClient] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isRecurringOpen, setIsRecurringOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [openTask, setOpenTask] = useState<any | null>(null);

  // Handle ?tab=overdue|today|upcoming from dashboard drill-down
  const tabParam = searchParams.get("tab");
  useEffect(() => {
    if (tabParam === "overdue" || tabParam === "today" || tabParam === "upcoming") {
      setView("board");
    }
  }, [tabParam]);

  const { data: allTasks } = trpc.task.list.useQuery();
  const { data: recurringTasks } = trpc.task.listRecurring.useQuery();
  const completeTask = trpc.task.complete.useMutation({
    onSuccess: () => utils.task.list.invalidate()
  });
  const setStage = trpc.task.setStage.useMutation({
    onSuccess: () => utils.task.list.invalidate()
  });
  const createTask = trpc.task.create.useMutation({
    onSuccess: () => { utils.task.list.invalidate(); setIsAddOpen(false); }
  });
  const createRecurring = trpc.task.createRecurring.useMutation({
    onSuccess: () => { utils.task.listRecurring.invalidate(); setIsRecurringOpen(false); }
  });

  const { data: clientList } = trpc.crmClient.list.useQuery({ status: "active" });
  const clientName = (cid: number | null | undefined) =>
    (clientList || []).find((c: any) => c.id === cid)?.name ?? null;
  const TASK_CATEGORIES = ["Bookkeeping", "HST", "Payroll", "Year-End", "Reconciliation", "Sales", "Setup", "Client", "Admin", "Other"];
  const ASSIGNEES = ["Markie", "Rachelle"];

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: "medium" as const,
    category: "",
    clientId: "" as string,
    assignedTo: "" as string,
    isRecurring: false,
    frequency: "monthly" as string,
  });
  const [newRecurring, setNewRecurring] = useState({
    title: "",
    description: "",
    frequency: "monthly" as const,
    startDate: "",
    priority: "medium" as const
  });

  const filteredTasks = (allTasks || []).filter((task) => {
    if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (fClient !== "all" && String(task.clientId ?? "none") !== fClient) return false;
    if (fAssignee !== "all" && (task.assignedTo ?? "unassigned") !== fAssignee) return false;
    if (fCategory !== "all" && (task.category ?? "") !== fCategory) return false;
    if (fStatus === "open" && task.completed) return false;
    if (fStatus === "done" && !task.completed) return false;
    if (fStatus === "overdue" && !(task.dueDate && !task.completed && isPast(parseISO(task.dueDate.toISOString())) && !isToday(parseISO(task.dueDate.toISOString())))) return false;
    return true;
  });

  const overdueTasks = filteredTasks.filter(t => t.dueDate && !t.completed && isPast(parseISO(t.dueDate.toISOString())) && !isToday(parseISO(t.dueDate.toISOString())));
  const todayTasks = filteredTasks.filter(t => t.dueDate && !t.completed && isToday(parseISO(t.dueDate.toISOString())));
  const upcomingTasks = filteredTasks.filter(t => t.dueDate && !t.completed && !isPast(parseISO(t.dueDate.toISOString())) && !isToday(parseISO(t.dueDate.toISOString())));
  const completedTasks = filteredTasks.filter(t => t.completed);

  const getUrgency = (dueDate: Date | null, completed: boolean) => {
    if (completed) return { label: "Done", color: "bg-lime-100 text-lime-700" };
    if (!dueDate) return { label: "No date", color: "bg-slate-100 text-slate-700" };
    const d = parseISO(dueDate.toISOString());
    if (isToday(d)) return { label: "Today", color: "bg-red-100 text-red-700" };
    if (isTomorrow(d)) return { label: "Tomorrow", color: "bg-amber-100 text-amber-700" };
    if (isPast(d)) return { label: "Overdue", color: "bg-red-100 text-red-700" };
    return { label: format(d, "MMM d"), color: "bg-slate-100 text-slate-700" };
  };

  const TaskCard = ({ task }: { task: typeof filteredTasks[0] }) => {
    const urgency = getUrgency(task.dueDate, task.completed);
    return (
      <Card className={cn("hover:shadow-md transition-shadow cursor-pointer", task.completed && "opacity-60")} onClick={() => setOpenTask(task)}>
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); completeTask.mutate({ id: task.id }); }}
              className={cn(
                "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                task.completed ? "bg-lime-500 border-lime-500 text-white" : "border-slate-300 hover:border-lime-500"
              )}
            >
              {task.completed && <Check className="h-3 w-3" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className={cn("font-medium text-sm", task.completed && "line-through text-slate-500")}>
                  {task.title}
                </h4>
                {task.isRecurring && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                    <Sparkles className="h-3 w-3 mr-1" />Auto
                  </Badge>
                )}
              </div>
              {task.description && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className={cn("text-xs", urgency.color)}>{urgency.label}</Badge>
                <div className={cn("w-2 h-2 rounded-full",
                  task.priority === "high" ? "bg-red-500" : task.priority === "medium" ? "bg-amber-500" : "bg-lime-500"
                )} />
                {task.category && <Badge variant="secondary" className="text-xs">{task.category}</Badge>}
                {task.clientId && clientName(task.clientId) && (
                  <Link
                    to={`/client/${task.clientId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-lime-700 hover:underline inline-flex items-center gap-1"
                  >
                    <Building2 className="h-3 w-3" />{clientName(task.clientId)}
                  </Link>
                )}
                {task.assignedTo && <span className="text-xs text-slate-500">@{task.assignedTo}</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const BoardColumn = ({ title, tasks, color }: { title: string; tasks: typeof filteredTasks; color: string }) => (
    <div className="flex flex-col gap-3 min-w-[280px] flex-1">
      <div className={cn("flex items-center justify-between p-3 rounded-lg", color)}>
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant="outline" className="bg-white/50">{tasks.length}</Badge>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map(task => <TaskCard key={task.id} task={task} />)}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg">
            No tasks
          </div>
        )}
      </div>
    </div>
  );

  const monthStart = startOfMonth(calendarDate);
  const monthEnd = endOfMonth(calendarDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-slate-500">Manage tasks and recurring workflows</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={isRecurringOpen} onOpenChange={setIsRecurringOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Repeat className="h-4 w-4 mr-2" /> Recurring</Button>
            </DialogTrigger>
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
                <div className="space-y-2"><Label>Title *</Label><Input placeholder="What needs doing?" value={newTask.title} onChange={(e) => setNewTask({...newTask, title: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Client</Label>
                    <Select value={newTask.clientId} onValueChange={(v) => setNewTask({...newTask, clientId: v})}>
                      <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value="none">No client (internal)</SelectItem>
                        {(clientList || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Assignee</Label>
                    <Select value={newTask.assignedTo} onValueChange={(v) => setNewTask({...newTask, assignedTo: v})}>
                      <SelectTrigger><SelectValue placeholder="Assign to" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Category</Label>
                    <Select value={newTask.category} onValueChange={(v) => setNewTask({...newTask, category: v})}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {TASK_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Priority</Label>
                    <Select value={newTask.priority} onValueChange={(v) => setNewTask({...newTask, priority: v as typeof newTask.priority})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})} /></div>
                <div className="space-y-2"><Label>Description</Label><Input placeholder="Optional details" value={newTask.description} onChange={(e) => setNewTask({...newTask, description: e.target.value})} /></div>

                {/* NEW: Make recurring from the same dialog */}
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <input
                    type="checkbox"
                    id="isRecurring"
                    checked={newTask.isRecurring || false}
                    onChange={(e) => setNewTask({...newTask, isRecurring: e.target.checked})}
                    className="w-4 h-4 accent-lime-500"
                  />
                  <div className="flex-1">
                    <Label htmlFor="isRecurring" className="cursor-pointer flex items-center gap-2">
                      <Repeat className="h-4 w-4 text-lime-500" />
                      <span className="font-medium">Make this a recurring task</span>
                    </Label>
                    <p className="text-xs text-slate-500 mt-0.5">Auto-generate future instances based on frequency</p>
                  </div>
                </div>

                {newTask.isRecurring && (
                  <div className="space-y-2">
                    <Label>Frequency *</Label>
                    <Select value={newTask.frequency || "monthly"} onValueChange={(v) => setNewTask({...newTask, frequency: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button
                  onClick={() => {
                    if (!newTask.title) return;
                    const cid = newTask.clientId && newTask.clientId !== "none" ? Number(newTask.clientId) : undefined;
                    const assignedTo = newTask.assignedTo && newTask.assignedTo !== "unassigned" ? newTask.assignedTo : undefined;
                    const category = newTask.category || undefined;
                    if (newTask.isRecurring && newTask.frequency) {
                      createRecurring.mutate({
                        title: newTask.title,
                        description: newTask.description,
                        frequency: newTask.frequency as any,
                        startDate: newTask.dueDate ? new Date(newTask.dueDate) : new Date(),
                        priority: newTask.priority,
                        clientId: cid, assignedTo, category,
                      });
                    } else {
                      createTask.mutate({
                        title: newTask.title,
                        description: newTask.description,
                        priority: newTask.priority,
                        dueDate: newTask.dueDate ? new Date(newTask.dueDate) : undefined,
                        clientId: cid, assignedTo, category,
                      });
                    }
                  }}
                  className="w-full"
                >
                  {newTask.isRecurring ? "Create Recurring Task" : "Create Task"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card><CardContent className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search tasks..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={fClient} onValueChange={setFClient}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent className="max-h-64"><SelectItem value="all">All clients</SelectItem><SelectItem value="none">No client</SelectItem>
              {(clientList || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fAssignee} onValueChange={setFAssignee}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Anyone</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>
              {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fCategory} onValueChange={setFCategory}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All categories</SelectItem>
              {TASK_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="done">Done</SelectItem><SelectItem value="all">All</SelectItem></SelectContent>
          </Select>
          <Button variant={groupByClient ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setGroupByClient(v => !v)}>
            Group by client
          </Button>
          {(fClient !== "all" || fAssignee !== "all" || fCategory !== "all" || fStatus !== "open" || search) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFClient("all"); setFAssignee("all"); setFCategory("all"); setFStatus("open"); setSearch(""); }}>Clear</Button>
          )}
        </div>
      </CardContent></Card>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant={view === "list" ? "default" : "outline"} size="sm" onClick={() => setView("list")}>
            <ListIcon className="h-4 w-4 mr-1" /> List
          </Button>
          <Button variant={view === "board" ? "default" : "outline"} size="sm" onClick={() => setView("board")}>
            <LayoutGrid className="h-4 w-4 mr-1" /> Board
          </Button>
          <Button variant={view === "workflow" ? "default" : "outline"} size="sm" onClick={() => setView("workflow")}>
            <LayoutGrid className="h-4 w-4 mr-1" /> Workflow
          </Button>
          <Button variant={view === "calendar" ? "default" : "outline"} size="sm" onClick={() => setView("calendar")}>
            <CalendarIcon className="h-4 w-4 mr-1" /> Calendar
          </Button>
        </div>
        <div className="text-sm text-slate-500">
          {filteredTasks.filter(t => !t.completed).length} open · {completedTasks.length} done
        </div>
      </div>

      {/* LIST VIEW */}
      {view === "list" && (() => {
        const listRow = (task: typeof filteredTasks[0], showClient: boolean) => {
          const urgency = getUrgency(task.dueDate, task.completed);
          return (
            <Card key={task.id} className={cn("cursor-pointer hover:shadow-md transition-shadow", task.completed && "opacity-60")} onClick={() => setOpenTask(task)}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <button onClick={(e) => { e.stopPropagation(); completeTask.mutate({ id: task.id }); }} className={cn("mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0", task.completed ? "bg-lime-500 border-lime-500 text-white" : "border-slate-300 hover:border-lime-500")}>{task.completed && <Check className="h-4 w-4" />}</button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className={cn("font-medium truncate", task.completed && "line-through text-slate-500")}>{task.title}</h4>
                        {task.isRecurring && <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200 shrink-0"><Sparkles className="h-3 w-3 mr-1" />Auto</Badge>}
                      </div>
                      <Badge variant="outline" className={cn("shrink-0", urgency.color)}>{urgency.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <div className={cn("w-2 h-2 rounded-full", task.priority === "high" ? "bg-red-500" : task.priority === "medium" ? "bg-amber-500" : "bg-lime-500")} />
                      {task.category && <Badge variant="secondary" className="text-xs">{task.category}</Badge>}
                      {showClient && task.clientId && clientName(task.clientId) && (
                        <Link to={`/client/${task.clientId}`} onClick={(e) => e.stopPropagation()} className="text-xs text-lime-700 hover:underline inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{clientName(task.clientId)}</Link>
                      )}
                      {task.assignedTo && <span className="text-xs text-slate-500">@{task.assignedTo}</span>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        };
        if (!groupByClient) return <div className="space-y-2">{filteredTasks.map((t) => listRow(t, true))}</div>;
        // group by client (clients with overdue float up, then by name)
        const groups = new Map<string, { id: number | null; name: string; tasks: typeof filteredTasks }>();
        for (const t of filteredTasks) {
          const key = String(t.clientId ?? "none");
          if (!groups.has(key)) groups.set(key, { id: t.clientId ?? null, name: clientName(t.clientId) || "Internal / no client", tasks: [] as any });
          groups.get(key)!.tasks.push(t);
        }
        const ordered = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
        if (ordered.length === 0) return <p className="text-center text-slate-400 py-10">No tasks match these filters.</p>;
        return (
          <div className="space-y-4">
            {ordered.map((g) => (
              <div key={String(g.id)}>
                <div className="flex items-center gap-2 mb-1.5">
                  {g.id ? <Link to={`/client/${g.id}`} className="font-semibold text-slate-800 hover:text-lime-700 inline-flex items-center gap-1"><Building2 className="h-4 w-4" />{g.name}</Link>
                        : <span className="font-semibold text-slate-500 inline-flex items-center gap-1"><Building2 className="h-4 w-4" />{g.name}</span>}
                  <span className="text-xs text-slate-400">({g.tasks.length})</span>
                </div>
                <div className="space-y-2">{g.tasks.map((t) => listRow(t, false))}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* BOARD VIEW */}
      {view === "board" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          <BoardColumn title="Overdue" tasks={overdueTasks} color="bg-red-50" />
          <BoardColumn title="Today" tasks={todayTasks} color="bg-amber-50" />
          <BoardColumn title="Upcoming" tasks={upcomingTasks} color="bg-blue-50" />
          <BoardColumn title="Done" tasks={completedTasks} color="bg-lime-50" />
        </div>
      )}

      {/* WORKFLOW BOARD (Financial Cents-style stages) */}
      {view === "workflow" && (() => {
        const STAGES: [string, string, string][] = [
          ["todo", "To Do", "bg-slate-100"],
          ["in_progress", "In Progress", "bg-amber-50"],
          ["review", "Review", "bg-blue-50"],
          ["done", "Done", "bg-lime-50"],
        ];
        const order = ["todo", "in_progress", "review", "done"];
        const stageOf = (t: any) => t.stage || (t.completed ? "done" : "todo");
        return (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.map(([stage, label, color]) => {
              const col = filteredTasks.filter((t) => stageOf(t) === stage);
              const idx = order.indexOf(stage);
              return (
                <div key={stage} className="flex flex-col gap-2 min-w-[250px] flex-1">
                  <div className={cn("flex items-center justify-between p-2.5 rounded-lg", color)}>
                    <h3 className="font-semibold text-sm">{label}</h3>
                    <Badge variant="outline" className="bg-white/60">{col.length}</Badge>
                  </div>
                  <div className="flex flex-col gap-2">
                    {col.map((task) => (
                      <Card key={task.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-2.5">
                          <div className="cursor-pointer" onClick={() => setOpenTask(task)}>
                            <p className={cn("text-sm font-medium", task.completed && "line-through text-slate-500")}>{task.title}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {task.category && <Badge variant="secondary" className="text-[10px]">{task.category}</Badge>}
                              {task.clientId && clientName(task.clientId) && (
                                <Link to={`/client/${task.clientId}`} onClick={(e) => e.stopPropagation()} className="text-[11px] text-lime-700 hover:underline inline-flex items-center gap-0.5"><Building2 className="h-3 w-3" />{clientName(task.clientId)}</Link>
                              )}
                              {task.assignedTo && <span className="text-[11px] text-slate-500">@{task.assignedTo}</span>}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <button disabled={idx === 0} onClick={() => setStage.mutate({ id: task.id, stage: order[idx - 1] as any })}
                              className={cn("text-xs px-2 py-0.5 rounded", idx === 0 ? "text-slate-300" : "text-slate-600 hover:bg-slate-100")}>← Back</button>
                            <button disabled={idx === order.length - 1} onClick={() => setStage.mutate({ id: task.id, stage: order[idx + 1] as any })}
                              className={cn("text-xs px-2 py-0.5 rounded", idx === order.length - 1 ? "text-slate-300" : "text-lime-700 hover:bg-lime-50")}>Next →</button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {col.length === 0 && <div className="text-center py-6 text-slate-300 text-xs border-2 border-dashed border-slate-200 rounded-lg">—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* CALENDAR VIEW */}
      {view === "calendar" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setCalendarDate(subMonths(calendarDate, 1))}>← Prev</Button>
            <h2 className="text-lg font-semibold">{format(calendarDate, "MMMM yyyy")}</h2>
            <Button variant="outline" size="sm" onClick={() => setCalendarDate(addMonths(calendarDate, 1))}>Next →</Button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
            ))}
            {days.map(day => {
              const dayTasks = filteredTasks.filter(t => t.dueDate && isSameDay(parseISO(t.dueDate.toISOString()), day));
              const isTodayFlag = isToday(day);
              return (
                <div key={day.toISOString()} className={cn(
                  "min-h-[100px] p-2 border rounded-lg",
                  isTodayFlag ? "border-lime-400 bg-lime-50/30" : "border-slate-200"
                )}>
                  <div className={cn("text-sm font-medium mb-1", isTodayFlag ? "text-lime-700" : "text-slate-700")}>
                    {format(day, "d")}
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayTasks.slice(0, 3).map(t => (
                      <div key={t.id} onClick={() => setOpenTask(t)} className={cn(
                        "text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80",
                        t.completed ? "bg-slate-100 text-slate-500 line-through" :
                        t.priority === "high" ? "bg-red-100 text-red-700" :
                        t.priority === "medium" ? "bg-amber-100 text-amber-700" :
                        "bg-lime-100 text-lime-700"
                      )}>
                        {t.title}
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-xs text-slate-400">+{dayTasks.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {openTask && <TaskDetailDialog task={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}
