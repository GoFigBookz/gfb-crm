import { useState } from "react";
import { Link } from "react-router";
import { Edit, Trash2, Check, Repeat, Building2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { TASK_CATEGORIES, ASSIGNEES, STANDARD_TASK_TITLES } from "@/lib/task-options";
import { isHstFilingTask, defaultHstRange } from "../../api/hst-period";
import { ClipboardCheck, AlertCircle, AlertTriangle, Info, Loader2 } from "lucide-react";

const STAGES: [string, string][] = [["todo", "To Do"], ["in_progress", "In Progress"], ["review", "Review"], ["done", "Done"]];

/** "yyyy-MM-dd" → Date at LOCAL noon (not UTC midnight, which drifts a day back
 *  in Ontario and lands the task on the calendar a day early). */
function ymdToLocalNoon(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * One reusable, fully-editable task drill-down. Click any task anywhere
 * (Tasks page list/board/workflow, client card) → this opens with every
 * field editable, plus complete / delete. Self-contained: runs its own
 * tRPC mutations and invalidates the relevant caches on save.
 */
export function TaskDetailDialog({ task, onClose, onChanged }: {
  task: any;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: clientList } = trpc.crmClient.list.useQuery({ status: "active" });

  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(task.description || "");
  const [category, setCategory] = useState(task.category || "");
  const [priority, setPriority] = useState(task.priority || "medium");
  const [stage, setStage] = useState(task.stage || (task.completed ? "done" : "todo"));
  const [assignedTo, setAssignedTo] = useState(task.assignedTo || "unassigned");
  const [clientId, setClientId] = useState(task.clientId ? String(task.clientId) : "none");
  const [startDate, setStartDate] = useState(task.startDate ? format(new Date(task.startDate), "yyyy-MM-dd") : "");
  const [dueDate, setDueDate] = useState(task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "");

  const invalidate = () => {
    utils.task.list.invalidate();
    utils.task.upcoming.invalidate();
    utils.task.overdue.invalidate();
    if (task.clientId) utils.clientDashboard.getByClient.invalidate({ clientId: task.clientId });
    if (clientId !== "none") utils.clientDashboard.getByClient.invalidate({ clientId: Number(clientId) });
    onChanged?.();
  };

  const update = trpc.task.update.useMutation({
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => alert(`Could not save: ${e.message}`),
  });
  const del = trpc.task.delete.useMutation({
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => alert(`Could not delete: ${e.message}`),
  });
  const complete = trpc.task.complete.useMutation({
    onSuccess: () => { invalidate(); onClose(); },
  });

  const clientName = clientList?.find((c: any) => String(c.id) === clientId)?.name;

  const save = () => {
    if (!title.trim()) return;
    update.mutate({
      id: task.id,
      title: title.trim(),
      description,
      category: category || undefined,
      priority,
      stage: stage as any,
      assignedTo: assignedTo === "unassigned" ? "" : assignedTo,
      clientId: clientId === "none" ? null : Number(clientId),
      // Parse the date-picker value at LOCAL noon, not new Date("yyyy-MM-dd")
      // (which is UTC midnight → lands a day early on the calendar in Ontario).
      startDate: ymdToLocalNoon(startDate),
      dueDate: ymdToLocalNoon(dueDate),
    });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Edit className="h-4 w-4" /> Edit Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              list="task-title-suggestions"
              placeholder="Pick a standard task or type your own…"
              autoFocus
            />
            <datalist id="task-title-suggestions">
              {STANDARD_TASK_TITLES.map((t) => <option key={t} value={t} />)}
            </datalist>
            <p className="text-[11px] text-slate-400 mt-1">Choose from the list or type anything.</p>
          </div>

          <div>
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="none">No client (internal)</SelectItem>
                {(clientList || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Assignee</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Assign to" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {TASK_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          {isHstFilingTask(title) && clientId !== "none" && (
            <TaskHstReview clientId={Number(clientId)} dueDate={task.dueDate} />
          )}

          {task.isRecurring && (
            <p className="text-xs text-blue-600 flex items-center gap-1">
              <Repeat className="h-3.5 w-3.5" /> Recurring task — editing changes this occurrence; the next one is generated when you mark it done.
            </p>
          )}

          {clientId !== "none" && clientName && (
            <Link to={`/client/${clientId}`} onClick={onClose} className="text-xs text-lime-700 hover:underline inline-flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" /> Open {clientName} <ExternalLink className="h-3 w-3" />
            </Link>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => { if (confirm(`Delete task "${task.title}"?`)) del.mutate({ id: task.id }); }}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
            <div className="flex gap-2">
              {!task.completed && (
                <Button variant="outline" onClick={() => complete.mutate({ id: task.id })}>
                  <Check className="h-4 w-4 mr-1" /> Mark done
                </Button>
              )}
              <Button onClick={save} disabled={!title.trim() || update.isPending}>
                {update.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Embedded read-only Pre-HST review for an HST filing task: the current data
 *  issues for this client+period, right inside the task. Runs on demand (no costly
 *  fan-out); QBO does the reconcile + the return — this only checks the inputs. */
function TaskHstReview({ clientId, dueDate }: { clientId: number; dueDate?: any }) {
  const def = defaultHstRange(dueDate ? new Date(dueDate) : new Date(), "quarterly");
  const [start, setStart] = useState(def.start);
  const [end, setEnd] = useState(def.end);
  const run = trpc.hstReview.run.useMutation();
  const r = run.data;
  const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
  const sevIcon = (s: string) => s === "high" ? <AlertCircle className="h-3.5 w-3.5 text-red-600" /> : s === "medium" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> : <Info className="h-3.5 w-3.5 text-sky-600" />;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <ClipboardCheck className="h-4 w-4 text-indigo-600" /> Pre-HST review (read-only)
      </div>
      <p className="text-xs text-slate-500">Reconcile in QuickBooks first, then run this to catch coding issues before you file. It checks what's in the books — it can't see transactions that were never entered. Dates default to the quarter; adjust if your period differs.</p>
      <div className="flex items-end gap-2 flex-wrap">
        <div><label className="text-[10px] text-slate-500">From</label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8" /></div>
        <div><label className="text-[10px] text-slate-500">To</label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8" /></div>
        <Button size="sm" className="h-8" disabled={run.isPending} onClick={() => run.mutate({ clientId, startDate: start, endDate: end })}>
          {run.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null} Run review
        </Button>
      </div>
      {run.isError && <div className="text-xs text-red-600">{(run.error as any)?.message || "Failed to run."}</div>}
      {r && !r.ok && <div className="text-xs text-amber-600">No usable QBO connection for this client ({r.error}).</div>}
      {r && r.ok && (
        <div className="space-y-1.5">
          <div className="text-xs text-slate-600">
            Implied net HST <b>{money(r.report.tie.net)}</b> (collected {money(r.report.tie.collected)} − ITC {money(r.report.tie.itc)}) · {r.pulled.transactions} txns.
            <span className="text-slate-400"> Compare to QBO's Sales Tax report.</span>
          </div>
          {r.errors.length > 0 && <div className="text-[11px] text-amber-600">Pull warnings: {r.errors.join("; ")}</div>}
          {r.report.findings.length === 0
            ? <div className="text-xs text-emerald-600">No coding issues flagged for this period.</div>
            : <div className="space-y-1">
                <div className="text-xs font-medium text-slate-600">{r.report.findings.length} issue(s) — {r.report.bySeverity.high} high, {r.report.bySeverity.medium} medium:</div>
                {r.report.findings.slice(0, 12).map((f: any, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    {sevIcon(f.severity)}
                    <span className="text-slate-700"><b>{f.message}</b> {f.amount != null && <span className="text-slate-400">· {money(f.amount)}</span>} <span className="text-slate-400">— {f.ref}</span></span>
                  </div>
                ))}
                {r.report.findings.length > 12 && <div className="text-[11px] text-slate-400">…and {r.report.findings.length - 12} more — open the full Pre-HST Review page for all.</div>}
              </div>}
        </div>
      )}
    </div>
  );
}
