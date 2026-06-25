import { useState } from "react";
import { Heart, Wallet, Plane, Activity, Sprout, Plus, Lock, Pin, Trash2, CalendarDays, Users, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";

const money = (n: number) => (n || 0).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const SECTION_ICON: Record<string, any> = { finance: Wallet, social: Users, milestones: Sparkles, travel: Plane, health: Activity, growth: Sprout };

export default function MyLife() {
  const { data: overview } = trpc.life.overview.useQuery();
  const [section, setSection] = useState("finance");
  const sections = overview?.sections || [];
  const current = sections.find((s: any) => s.key === section);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <img src="/phoenix-rising.svg" alt="Phoenix Rising" className="h-12 w-12 shrink-0" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">Phoenix Rising
            <Badge variant="outline" className="text-[10px] text-slate-500"><Lock className="h-3 w-3 mr-1" /> Private · only you</Badge>
          </h1>
          <p className="text-sm text-slate-500">Your whole life in one place, kept by Liv — walled off from anything work. Finance, your social calendar, milestones, travel, health, growth.</p>
        </div>
      </div>

      {/* Top stats: net worth + what's coming up */}
      <div className="grid md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase font-semibold text-slate-500 mb-1">Net worth</p>
            <p className="text-2xl font-bold text-emerald-700">{overview ? money(overview.finance.netWorth) : "—"}</p>
            {overview && (
              <p className="text-xs text-slate-400 mt-1">assets {money(overview.finance.assets)} · liabilities {money(overview.finance.liabilities)}</p>
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase font-semibold text-slate-500 mb-1.5 flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Coming up</p>
            {overview && overview.upcoming.length ? (
              <div className="flex flex-wrap gap-2">
                {overview.upcoming.map((u: any) => (
                  <Badge key={u.id} variant="outline" className="text-xs font-normal">
                    {new Date(u.date).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} · {u.title}
                  </Badge>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400">Nothing dated in the next 60 days.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2">
        {sections.map((s: any) => {
          const Icon = SECTION_ICON[s.key] || Heart;
          return (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`px-3 py-1.5 rounded-lg text-sm border flex items-center gap-1.5 transition-colors ${section === s.key ? "bg-rose-500 text-white border-rose-500" : "bg-white hover:bg-slate-50 border-slate-200"}`}>
              <Icon className="h-4 w-4" /> {s.title} <span className="opacity-60">({s.count})</span>
            </button>
          );
        })}
      </div>

      {current && <SectionPanel section={current} />}
    </div>
  );
}

function SectionPanel({ section }: { section: any }) {
  const utils = trpc.useUtils();
  const { data: entries } = trpc.life.list.useQuery({ section: section.key });
  const refresh = () => { utils.life.list.invalidate({ section: section.key }); utils.life.overview.invalidate(); };
  const add = trpc.life.add.useMutation({ onSuccess: refresh });
  const update = trpc.life.update.useMutation({ onSuccess: refresh });
  const remove = trpc.life.remove.useMutation({ onSuccess: refresh });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ type: section.types[0], title: "", subtitle: "", amount: "", date: "", notes: "" });
  const submit = () => {
    add.mutate({
      section: section.key,
      type: form.type || undefined,
      title: form.title,
      subtitle: form.subtitle || undefined,
      amount: section.money && form.amount !== "" ? Number(form.amount) : undefined,
      date: form.date ? new Date(form.date) : undefined,
      notes: form.notes || undefined,
    });
    setForm({ type: section.types[0], title: "", subtitle: "", amount: "", date: "", notes: "" });
    setOpen(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base">{section.title} <span className="text-sm font-normal text-slate-400">· {section.blurb}</span></CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add to {section.title}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label>Type</Label>
                <select className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm capitalize" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {section.types.map((t: string) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={section.money ? "e.g. RBC chequing" : "e.g. Passport"} /></div>
              <div className="space-y-1"><Label>Subtitle</Label><Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="optional detail" /></div>
              {section.money && (
                <div className="space-y-1"><Label>Amount (− for what you owe)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
              )}
              <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div className="space-y-1"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" /></div>
              <Button className="w-full" disabled={!form.title || add.isPending} onClick={submit}>{add.isPending ? "Saving…" : "Save"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {(entries || []).map((e: any) => (
            <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-white hover:bg-slate-50 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{e.title}</span>
                  {e.type && <Badge variant="outline" className="text-[10px] text-slate-500 capitalize">{e.type}</Badge>}
                  {e.pinned && <Pin className="h-3 w-3 text-rose-400" />}
                </div>
                <div className="text-xs text-slate-400 flex flex-wrap gap-x-2">
                  {e.subtitle && <span>{e.subtitle}</span>}
                  {e.date && <span>· {new Date(e.date).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}</span>}
                  {e.notes && <span className="truncate">· {e.notes}</span>}
                </div>
              </div>
              {section.money && e.amount != null && (
                <span className={`text-sm font-semibold tabular-nums ${e.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(e.amount)}</span>
              )}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button title="Pin" onClick={() => update.mutate({ id: e.id, pinned: !e.pinned })} className="p-1 text-slate-400 hover:text-rose-500"><Pin className="h-3.5 w-3.5" /></button>
                <button title="Delete" onClick={() => remove.mutate({ id: e.id })} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {entries && !entries.length && (
            <p className="text-sm text-slate-400 text-center py-8">Nothing here yet — add your first {section.title.toLowerCase()} item.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
