import { useState } from "react";
import { Lock, Plus, Trash2, CheckCircle2, Circle, StickyNote, Bell, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";

type Kind = "task" | "reminder" | "note";

const KIND_META: Record<Kind, { icon: typeof ListTodo; label: string }> = {
  task: { icon: ListTodo, label: "Task" },
  reminder: { icon: Bell, label: "Reminder" },
  note: { icon: StickyNote, label: "Note" },
};

export default function Personal() {
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("task");
  const [due, setDue] = useState("");

  const utils = trpc.useUtils();
  const list = trpc.personal.list.useQuery({ includeDone: showDone });
  const add = trpc.personal.add.useMutation({ onSuccess: () => { utils.personal.list.invalidate(); setTitle(""); setDue(""); } });
  const toggle = trpc.personal.toggle.useMutation({ onSuccess: () => utils.personal.list.invalidate() });
  const remove = trpc.personal.remove.useMutation({ onSuccess: () => utils.personal.list.invalidate() });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    add.mutate({ kind, title: title.trim(), priority: "medium", dueDate: due ? new Date(due + "T12:00:00") : null });
  };

  const items = list.data ?? [];

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-violet-100"><Lock className="w-6 h-6 text-violet-700" /></div>
        <div>
          <h1 className="text-xl font-semibold">Personal</h1>
          <p className="text-sm text-muted-foreground">Your private space — managed by Liv. Never mixed with client work.</p>
        </div>
      </div>

      <form onSubmit={submit} className="rounded-lg border p-3 space-y-2 bg-white">
        <div className="flex gap-1.5">
          {(Object.keys(KIND_META) as Kind[]).map((k) => {
            const M = KIND_META[k];
            return (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${kind === k ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 hover:bg-violet-50"}`}>
                <M.icon className="w-3.5 h-3.5" /> {M.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Add a ${KIND_META[kind].label.toLowerCase()}…`} className="flex-1" />
          {kind !== "note" && (
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-40" title="Due date" />
          )}
          <Button type="submit" disabled={!title.trim() || add.isPending} className="bg-violet-600"><Plus className="w-4 h-4" /></Button>
        </div>
      </form>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
        <label className="text-sm flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show done
        </label>
      </div>

      <div className="rounded-lg border divide-y bg-white">
        {list.isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
        {!list.isLoading && items.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">Nothing here yet. Add a task, reminder, or note above.</div>
        )}
        {items.map((it: any) => {
          const M = KIND_META[(it.kind as Kind)] ?? KIND_META.task;
          return (
            <div key={it.id} className="flex items-start gap-3 p-3">
              {it.kind === "note" ? (
                <M.icon className="w-5 h-5 mt-0.5 text-slate-400 shrink-0" />
              ) : (
                <button onClick={() => toggle.mutate({ id: it.id, done: !it.done })} className="mt-0.5 shrink-0">
                  {it.done ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5 text-slate-300" />}
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${it.done ? "line-through text-slate-400" : ""}`}>{it.title}</div>
                {it.body && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{it.body}</div>}
                {it.dueDate && (
                  <div className="text-xs text-muted-foreground mt-0.5">Due {new Date(it.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                )}
              </div>
              <button onClick={() => remove.mutate({ id: it.id })} className="text-slate-300 hover:text-red-500 shrink-0" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
