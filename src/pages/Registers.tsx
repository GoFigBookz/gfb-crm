import { useState } from "react";
import { BookMarked, Plus, Trash2, Check, RotateCcw, Lightbulb, Gavel, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * FIRM REGISTERS — the three knowledge registers the Figgy Operating System
 * requires: Decision Register, Improvement Register, and Prompt Library.
 * Backed by firm_registers (kind-distinguished). Improvements toggle open↔done.
 */
type Kind = "decision" | "improvement" | "prompt";

const TABS: { kind: Kind; label: string; icon: any; blurb: string; titlePh: string; bodyPh: string; tagPh: string }[] = [
  { kind: "decision", label: "Decisions", icon: Gavel, blurb: "Important decisions + the why, so they're never re-litigated.", titlePh: "The decision (e.g. 'Clark OS and CW stay separate books')", bodyPh: "Rationale / context…", tagPh: "Area (e.g. policy, pricing)" },
  { kind: "improvement", label: "Improvements", icon: Lightbulb, blurb: "Process-improvement ideas — open until done.", titlePh: "The improvement (e.g. 'Auto-schedule HST dates per client')", bodyPh: "What & why it helps…", tagPh: "Area (e.g. workflow, automation)" },
  { kind: "prompt", label: "Prompt Library", icon: Sparkles, blurb: "Reusable prompts the agents can pull from.", titlePh: "Prompt name (e.g. 'Month-end review checklist')", bodyPh: "The prompt text…", tagPh: "Agent / tag (e.g. Sage, review)" },
];

export default function Registers() {
  const [kind, setKind] = useState<Kind>("decision");
  const tab = TABS.find((t) => t.kind === kind)!;
  const list = trpc.registers.list.useQuery({ kind });
  const counts = trpc.registers.counts.useQuery();
  const upsert = trpc.registers.upsert.useMutation({ onSuccess: () => { list.refetch(); counts.refetch(); reset(); } });
  const setStatus = trpc.registers.setStatus.useMutation({ onSuccess: () => { list.refetch(); counts.refetch(); } });
  const remove = trpc.registers.remove.useMutation({ onSuccess: () => { list.refetch(); counts.refetch(); } });

  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [tags, setTags] = useState("");
  const reset = () => { setShowAdd(false); setTitle(""); setBody(""); setTags(""); };

  const rows = list.data?.rows || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookMarked className="h-6 w-6 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Registers</h1>
          <p className="text-sm text-slate-500">The FOS knowledge registers — decisions, improvements, and reusable prompts.</p>
        </div>
        <Button className="ml-auto" size="sm" onClick={() => setShowAdd((v) => !v)}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      <div className="flex gap-1.5">
        {TABS.map((t) => {
          const c = counts.data?.[t.kind];
          const Icon = t.icon;
          return (
            <button key={t.kind} onClick={() => { setKind(t.kind); reset(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border ${kind === t.kind ? "bg-lime-50 border-lime-300 text-lime-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <Icon className="h-4 w-4" /> {t.label}
              {c && c.total > 0 && <span className="text-xs text-slate-400">{t.kind === "improvement" ? `${c.open} open` : c.total}</span>}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">{tab.blurb}</p>

      {showAdd && (
        <Card><CardContent className="p-3 grid gap-2">
          <Input placeholder={tab.titlePh} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="border rounded px-2 py-2 text-sm min-h-[72px]" placeholder={tab.bodyPh} value={body} onChange={(e) => setBody(e.target.value)} />
          <Input placeholder={tab.tagPh} value={tags} onChange={(e) => setTags(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={upsert.isPending || !title.trim()} onClick={() => upsert.mutate({ kind, title: title.trim(), body: body.trim() || undefined, tags: tags.trim() || undefined })}>Save</Button>
            <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {rows.length === 0 && <Card><CardContent className="p-4 text-xs text-slate-400">Nothing logged yet. Add the first {tab.label.toLowerCase().replace(/s$/, "")} above — the agents can log here too as they work.</CardContent></Card>}
        {rows.map((r: any) => (
          <Card key={r.id} className={r.kind === "improvement" && r.status === "done" ? "opacity-60" : ""}>
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-slate-800 ${r.status === "done" ? "line-through" : ""}`}>{r.title}</div>
                  {r.body && <div className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{r.body}</div>}
                  <div className="text-xs text-slate-400 mt-1">
                    {r.author || "Markie"}{r.tags ? ` · ${r.tags}` : ""}{r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.kind === "improvement" && (
                    r.status === "done"
                      ? <button title="Reopen" className="p-1 rounded hover:bg-slate-100" onClick={() => setStatus.mutate({ id: r.id, status: "open" })}><RotateCcw className="h-4 w-4 text-slate-400" /></button>
                      : <button title="Mark done" className="p-1 rounded hover:bg-lime-50" onClick={() => setStatus.mutate({ id: r.id, status: "done" })}><Check className="h-4 w-4 text-lime-600" /></button>
                  )}
                  <button title="Remove" className="p-1 rounded hover:bg-slate-100" onClick={() => { if (confirm("Remove this entry?")) remove.mutate({ id: r.id }); }}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
