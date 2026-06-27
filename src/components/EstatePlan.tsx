import { useState } from "react";
import { Scale, Plus, Trash2, Pencil, Check, RotateCcw, AlertTriangle, MapPin, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import LegalDocs from "@/components/LegalDocs";

/**
 * ESTATE PLAN — the "if something happens to me" binder for whoever administers
 * Markie's estate (business + personal). Private, owner-only. NOT legal advice.
 */
const CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: "will", label: "Will & legal docs", hint: "will, POA, where the originals are" },
  { key: "executor", label: "Executor & key people", hint: "who's in charge + how to reach them" },
  { key: "business", label: "Business (Go Fig Bookz)", hint: "what happens to the firm, clients, logins, staff" },
  { key: "accounts", label: "Bank & financial accounts", hint: "banks, investments, where to find them" },
  { key: "assets", label: "Assets", hint: "property, vehicles, valuables" },
  { key: "debts", label: "Debts & obligations", hint: "loans, mortgages, recurring bills" },
  { key: "insurance", label: "Insurance", hint: "life, disability, policy numbers" },
  { key: "digital", label: "Digital accounts", hint: "password manager, email, social — where the keys are" },
  { key: "wishes", label: "Final wishes", hint: "funeral, organ donation, messages" },
  { key: "contacts", label: "Important contacts", hint: "lawyer, accountant, advisor" },
  { key: "other", label: "Other", hint: "" },
];
const BLANK = { category: "will", title: "", detail: "", location: "", contact: "", status: "open" as "open" | "done" };

export default function EstatePlan() {
  const q = trpc.phoenix.estateList.useQuery();
  const up = trpc.phoenix.estateUpsert.useMutation({ onSuccess: () => { q.refetch(); reset(); } });
  const st = trpc.phoenix.estateSetStatus.useMutation({ onSuccess: () => q.refetch() });
  const rm = trpc.phoenix.estateRemove.useMutation({ onSuccess: () => q.refetch() });
  const [form, setForm] = useState<any>(BLANK);
  const [open, setOpen] = useState(false);
  const reset = () => { setForm(BLANK); setOpen(false); };
  const add = (cat: string) => { setForm({ ...BLANK, category: cat }); setOpen(true); };
  const edit = (r: any) => { setForm({ ...r }); setOpen(true); };
  const rows = q.data?.rows || [];
  const willNotarized = rows.some((r: any) => r.category === "will" && /notar/i.test(`${r.title} ${r.detail}`) && r.status === "done");

  return (
    <div className="space-y-4">
      {/* Document builder — generate the actual legal drafts (will, POAs, succession). */}
      <LegalDocs />

      <div className="border-t border-slate-200" />

      {/* The "if something happens to me" binder — where everything is, for your executor. */}
      <div className="flex items-center gap-2">
        <Scale className="h-5 w-5 text-indigo-600" />
        <h3 className="font-semibold text-slate-800">Estate plan</h3>
        <span className="text-xs text-slate-400">if something happens to me — business + personal</span>
        <Button size="sm" className="ml-auto" onClick={() => (open ? reset() : setOpen(true))}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>This is your private record to hand to your executor — <b>not legal advice</b>. {willNotarized ? "Will marked notarized ✓." : "Heads up: get your will notarized / reviewed by a lawyer to make sure it's valid."}</span>
      </div>

      {open && (
        <Card><CardContent className="p-3 grid gap-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <select className="border rounded px-2 py-2 text-sm bg-white" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <Input placeholder="Title (e.g. 'Will — original')" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <textarea className="border rounded px-2 py-2 text-sm min-h-[64px]" placeholder="Details / instructions" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
          <div className="grid sm:grid-cols-2 gap-2">
            <Input placeholder="Location (where it is)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <Input placeholder="Contact (person + how to reach)" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={!form.title || up.isPending} onClick={() => up.mutate(form)}>{form.id ? "Save" : "Add"}</Button>
            <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const items = rows.filter((r: any) => r.category === cat.key);
          if (items.length === 0) return null;
          return (
            <div key={cat.key}>
              <div className="text-xs font-semibold uppercase text-slate-500 mb-1">{cat.label}</div>
              <div className="space-y-1.5">
                {items.map((r: any) => (
                  <Card key={r.id} className={`group ${r.status === "done" ? "opacity-70" : ""}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-slate-800 ${r.status === "done" ? "line-through" : ""}`}>{r.title}</div>
                          {r.detail && <div className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{r.detail}</div>}
                          <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-3">
                            {r.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {r.location}</span>}
                            {r.contact && <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" /> {r.contact}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {r.status === "done"
                            ? <button title="Reopen" onClick={() => st.mutate({ id: r.id, status: "open" })}><RotateCcw className="h-4 w-4 text-slate-400" /></button>
                            : <button title="Mark handled" onClick={() => st.mutate({ id: r.id, status: "done" })}><Check className="h-4 w-4 text-emerald-600" /></button>}
                          <button className="opacity-0 group-hover:opacity-100" onClick={() => edit(r)}><Pencil className="h-3.5 w-3.5 text-slate-400" /></button>
                          <button className="opacity-0 group-hover:opacity-100" onClick={() => { if (confirm("Remove?")) rm.mutate({ id: r.id }); }}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-slate-400 w-full mb-1">Start a section:</span>
            {CATEGORIES.map((c) => <button key={c.key} onClick={() => add(c.key)} className="text-xs border rounded px-2 py-1 hover:bg-slate-50" title={c.hint}>+ {c.label}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}
