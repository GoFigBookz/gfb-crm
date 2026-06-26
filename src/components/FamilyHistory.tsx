import { useState } from "react";
import { Users, Plus, Trash2, Pencil, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/** FAMILY HISTORY / genealogy — private Phoenix Rising section. Owner-only. */
const BLANK = { name: "", relation: "", side: "" as "" | "maternal" | "paternal" | "self" | "spouse", birthDate: "", deathDate: "", living: true, birthplace: "", notes: "", medicalNotes: "" };

export default function FamilyHistory() {
  const q = trpc.phoenix.familyList.useQuery();
  const up = trpc.phoenix.familyUpsert.useMutation({ onSuccess: () => { q.refetch(); reset(); } });
  const rm = trpc.phoenix.familyRemove.useMutation({ onSuccess: () => q.refetch() });
  const [form, setForm] = useState<any>(BLANK);
  const [open, setOpen] = useState(false);
  const reset = () => { setForm(BLANK); setOpen(false); };
  const edit = (r: any) => { setForm({ ...BLANK, ...r, living: !!r.living, side: r.side || "" }); setOpen(true); };
  const rows = q.data?.rows || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-amber-600" />
        <h3 className="font-semibold text-slate-800">Family history</h3>
        <span className="text-xs text-slate-400">lineage + family medical history</span>
        <Button size="sm" className="ml-auto" onClick={() => (open ? reset() : setOpen(true))}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      {open && (
        <Card><CardContent className="p-3 grid sm:grid-cols-2 gap-2">
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Relation (father, grandmother…)" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
          <select className="border rounded px-2 py-2 text-sm bg-white" value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}>
            <option value="">Side…</option><option value="maternal">Maternal</option><option value="paternal">Paternal</option><option value="self">Self</option><option value="spouse">Spouse</option>
          </select>
          <Input placeholder="Birthplace" value={form.birthplace} onChange={(e) => setForm({ ...form, birthplace: e.target.value })} />
          <Input placeholder="Born (year or date)" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
          <Input placeholder="Died (blank if living)" value={form.deathDate} onChange={(e) => setForm({ ...form, deathDate: e.target.value, living: e.target.value ? false : form.living })} />
          <Input className="sm:col-span-2" placeholder="Notes — stories, origins, occupation" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Input className="sm:col-span-2" placeholder="Family medical history (conditions that run in the family)" value={form.medicalNotes} onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={!form.name || up.isPending} onClick={() => up.mutate({ ...form, side: form.side || undefined })}>{form.id ? "Save" : "Add"}</Button>
            <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      <div className="grid sm:grid-cols-2 gap-2">
        {rows.map((r: any) => (
          <Card key={r.id} className="group">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800">{r.name} {!r.living && <span className="text-xs text-slate-400">†</span>}</div>
                  <div className="text-xs text-slate-500">
                    {[r.relation, r.side, [r.birthDate, r.deathDate].filter(Boolean).join("–")].filter(Boolean).join(" · ")}
                    {r.birthplace ? ` · ${r.birthplace}` : ""}
                  </div>
                  {r.notes && <div className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{r.notes}</div>}
                  {r.medicalNotes && <div className="text-xs text-rose-600 mt-1 flex items-start gap-1"><HeartPulse className="h-3 w-3 mt-0.5 shrink-0" /> {r.medicalNotes}</div>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                  <button onClick={() => edit(r)}><Pencil className="h-3.5 w-3.5 text-slate-400" /></button>
                  <button onClick={() => { if (confirm("Remove?")) rm.mutate({ id: r.id }); }}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-xs text-slate-400">No family recorded yet — add your first relative above.</p>}
      </div>
    </div>
  );
}
