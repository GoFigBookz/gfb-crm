import { useState } from "react";
import { Rocket, Plus, Pin, Archive, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * LAUNCHPAD — Markie's new + launched business opportunities pipeline.
 * His own ventures (separate from client work), owner-scoped. Stages flow
 * idea → exploring → building → launched → parked.
 */
const STAGES = [
  { key: "idea", label: "💡 Ideas", color: "border-slate-200" },
  { key: "exploring", label: "🔎 Exploring", color: "border-sky-200" },
  { key: "building", label: "🛠️ Building", color: "border-amber-200" },
  { key: "launched", label: "🚀 Launched", color: "border-lime-300" },
  { key: "parked", label: "🅿️ Parked", color: "border-slate-200" },
] as const;

export default function Launchpad() {
  const list = trpc.launchpad.list.useQuery();
  const add = trpc.launchpad.add.useMutation({ onSuccess: () => { list.refetch(); setName(""); setCategory(""); setShowAdd(false); } });
  const update = trpc.launchpad.update.useMutation({ onSuccess: () => list.refetch() });
  const remove = trpc.launchpad.remove.useMutation({ onSuccess: () => list.refetch() });

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState(""); const [category, setCategory] = useState(""); const [value, setValue] = useState("");

  const items = list.data || [];
  const byStage = (s: string) => items.filter((i: any) => i.stage === s);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Rocket className="h-6 w-6 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Launchpad</h1>
          <p className="text-sm text-slate-500">Your new + launched business opportunities — separate from client work. Move them along as they grow.</p>
        </div>
        <Button className="ml-auto" size="sm" onClick={() => setShowAdd((v) => !v)}><Plus className="h-4 w-4 mr-1" /> New opportunity</Button>
      </div>

      {showAdd && (
        <Card><CardContent className="p-3 grid gap-2 sm:grid-cols-3">
          <Input placeholder="Opportunity name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
          <Input placeholder="Potential value (optional)" value={value} onChange={(e) => setValue(e.target.value)} />
          <div className="sm:col-span-3 flex gap-2">
            <Button size="sm" disabled={add.isPending || !name.trim()} onClick={() => add.mutate({ name: name.trim(), category: category || undefined, potentialValue: value || undefined })}>Add</Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {STAGES.map((st) => (
          <div key={st.key} className="space-y-2">
            <div className="text-sm font-semibold text-slate-700 px-1">{st.label} <span className="text-slate-400 font-normal">({byStage(st.key).length})</span></div>
            {byStage(st.key).length === 0 && <div className="text-xs text-slate-300 px-1">—</div>}
            {byStage(st.key).map((o: any) => (
              <Card key={o.id} className={`${st.color}`}>
                <CardContent className="p-2.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-slate-800 text-sm">{o.name}</div>
                    <button onClick={() => update.mutate({ id: o.id, pinned: !o.pinned })} title="Pin"><Pin className={`h-3.5 w-3.5 ${o.pinned ? "text-lime-600 fill-lime-600" : "text-slate-300"}`} /></button>
                  </div>
                  {o.category && <div className="text-xs text-slate-500">{o.category}</div>}
                  {o.potentialValue && <div className="text-xs text-lime-700 font-medium">{o.potentialValue}</div>}
                  {o.notes && <div className="text-xs text-slate-500 whitespace-pre-wrap">{o.notes}</div>}
                  {o.nextStep && <div className="text-xs text-slate-600">Next: {o.nextStep}</div>}
                  {o.link && <a href={o.link} target="_blank" rel="noreferrer" className="text-xs text-sky-600 inline-flex items-center gap-1">link <ExternalLink className="h-3 w-3" /></a>}
                  <div className="flex items-center gap-1 pt-1">
                    <select className="text-xs border rounded px-1 py-0.5 bg-white flex-1" value={o.stage} onChange={(e) => update.mutate({ id: o.id, stage: e.target.value as any })}>
                      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label.replace(/^\S+\s/, "")}</option>)}
                    </select>
                    <button className="p-1 rounded hover:bg-slate-100" title="Archive" onClick={() => update.mutate({ id: o.id, archived: true })}><Archive className="h-3.5 w-3.5 text-slate-400" /></button>
                    <button className="p-1 rounded hover:bg-slate-100" title="Delete" onClick={() => { if (confirm("Delete this opportunity?")) remove.mutate({ id: o.id }); }}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
