import { useState } from "react";
import {
  Heart, Wallet, Plane, Activity, Sprout, Plus, Lock, Pin, Trash2, CalendarDays, Users, Sparkles,
  ChevronDown, ChevronRight, Stethoscope, ExternalLink, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";

const money = (n: number) => (n || 0).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const SECTION_ICON: Record<string, any> = { finance: Wallet, social: Users, milestones: Sparkles, travel: Plane, health: Activity, growth: Sprout };
const fmtDate = (d: any) => new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

/** Traffic-light tone from a status/notes string, so labs & deadlines read at a glance. */
function toneOf(...parts: (string | null | undefined)[]): "green" | "amber" | "red" | null {
  const t = parts.filter(Boolean).join(" ").toLowerCase();
  if (/\bhigh\b|⚠|abnormal|elevated|overdue|urgent/.test(t)) return "amber";
  if (/\blow\b|critical|❌|failed/.test(t)) return "red";
  if (/normal|✓|good|excellent|on track|complete|settled/.test(t)) return "green";
  return null;
}
const TONE_PILL: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
};

/** Split a "·"-separated notes string into readable bullet lines. */
function noteLines(notes?: string | null): string[] {
  if (!notes) return [];
  return notes.split(/\s+·\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

export default function MyLife() {
  const { data: overview } = trpc.life.overview.useQuery();
  const [section, setSection] = useState("health");
  const sections = overview?.sections || [];
  const current = sections.find((s: any) => s.key === section);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <img src="/phoenix-rising.png" alt="Phoenix Rising" className="h-20 w-auto shrink-0" />
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

/** A single expandable entry card — full notes are readable (no truncation). */
function EntryCard({ e, money: showMoney, onPin, onDelete }: { e: any; money: boolean; onPin: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const lines = noteLines(e.notes);
  const tone = toneOf(e.status, e.subtitle, e.title);
  const isLink = (s?: string | null) => !!s && /^https?:\/\//.test(s.trim());
  return (
    <div className="rounded-lg border bg-white hover:bg-slate-50/60 group">
      <div className="flex items-start gap-3 p-2.5">
        {lines.length > 0 ? (
          <button onClick={() => setOpen((o) => !o)} className="mt-0.5 text-slate-300 hover:text-slate-500 shrink-0">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : <span className="w-4 shrink-0" />}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => lines.length && setOpen((o) => !o)}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{e.title}</span>
            {e.type && <Badge variant="outline" className="text-[10px] text-slate-500 capitalize">{e.type}</Badge>}
            {tone && <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${TONE_PILL[tone]} inline-flex items-center gap-0.5`}>
              {tone === "green" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {tone === "green" ? "ok" : tone === "amber" ? "watch" : "flag"}
            </span>}
            {e.pinned && <Pin className="h-3 w-3 text-rose-400" />}
          </div>
          <div className="text-xs text-slate-400 flex flex-wrap gap-x-2 mt-0.5">
            {e.subtitle && <span>{e.subtitle}</span>}
            {e.date && <span>· {fmtDate(e.date)}</span>}
            {!open && lines.length > 0 && <span className="text-slate-300">· {lines.length} detail{lines.length === 1 ? "" : "s"}</span>}
          </div>
        </div>
        {showMoney && e.amount != null && (
          <span className={`text-sm font-semibold tabular-nums ${e.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(e.amount)}</span>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button title="Pin" onClick={onPin} className="p-1 text-slate-400 hover:text-rose-500"><Pin className="h-3.5 w-3.5" /></button>
          <button title="Delete" onClick={onDelete} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {open && lines.length > 0 && (
        <div className="px-3 pb-3 pl-9 space-y-1">
          {lines.map((ln, i) => isLink(ln) ? (
            <a key={i} href={ln} target="_blank" rel="noreferrer" className="text-xs text-lime-700 hover:underline inline-flex items-center gap-1 break-all">{ln} <ExternalLink className="h-3 w-3 shrink-0" /></a>
          ) : (
            <p key={i} className="text-xs text-slate-600 leading-relaxed">{ln}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Health-only: a labs/vitals strip from the latest metric entries. */
function HealthVitals({ entries }: { entries: any[] }) {
  const metrics = entries.filter((e: any) => e.type === "metric").slice(0, 6);
  const nextAppt = entries
    .filter((e: any) => e.type === "appointment" && e.date)
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  if (metrics.length === 0 && !nextAppt) return null;
  return (
    <div className="space-y-3 mb-3">
      {nextAppt && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <Stethoscope className="h-4 w-4 shrink-0" />
          <span><b>{nextAppt.title}</b>{nextAppt.subtitle ? ` — ${nextAppt.subtitle}` : ""} · {fmtDate(nextAppt.date)}</span>
        </div>
      )}
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {metrics.map((m: any) => {
            const tone = toneOf(m.subtitle, m.title, m.notes) ?? "green";
            return (
              <div key={m.id} className={`rounded-lg border px-3 py-2 ${TONE_PILL[tone]}`}>
                <div className="text-xs font-semibold truncate">{m.title}</div>
                {m.subtitle && <div className="text-[11px] opacity-80 mt-0.5">{m.subtitle}</div>}
              </div>
            );
          })}
        </div>
      )}
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
              <div className="space-y-1"><Label>Notes</Label><textarea className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm min-h-[72px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Separate details with · or new lines" /></div>
              <Button className="w-full" disabled={!form.title || add.isPending} onClick={submit}>{add.isPending ? "Saving…" : "Save"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {section.key === "health" && entries && entries.length > 0 && <HealthVitals entries={entries} />}
        <div className="space-y-1.5">
          {(entries || []).map((e: any) => (
            <EntryCard key={e.id} e={e} money={section.money}
              onPin={() => update.mutate({ id: e.id, pinned: !e.pinned })}
              onDelete={() => remove.mutate({ id: e.id })} />
          ))}
          {entries && !entries.length && (
            <p className="text-sm text-slate-400 text-center py-8">Nothing here yet — add your first {section.title.toLowerCase()} item.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
