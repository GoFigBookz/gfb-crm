import { useState } from "react";
import { HeartPulse, Pill, Leaf, Activity, FlaskConical, Stethoscope, Plus, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * HEALTH HUB — Markie's PRIVATE health page (Phoenix Rising). Owner-only; every
 * query is pinned to his userId server-side. Meds, vitamins/supplements, vitals
 * (weight/glucose/BP), bloodwork, and conditions/symptoms. Record-keeping only —
 * NOT medical advice.
 */
const fdate = (n?: number | null) => (n ? new Date(n).toLocaleDateString() : "");

const VITAL_TYPES = [
  { type: "weight", label: "Weight", unit: "lb" },
  { type: "glucose", label: "Blood sugar", unit: "mmol/L" },
  { type: "bp_systolic", label: "BP systolic", unit: "mmHg" },
  { type: "bp_diastolic", label: "BP diastolic", unit: "mmHg" },
  { type: "heart_rate", label: "Heart rate", unit: "bpm" },
];

function Section({ icon: Icon, title, sub, children }: any) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-5 w-5 text-rose-500" />
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {sub && <span className="text-xs text-slate-400">{sub}</span>}
      </div>
      {children}
    </CardContent></Card>
  );
}

export default function Health() {
  const q = trpc.health.overview.useQuery();
  const data = q.data;
  const refetch = () => q.refetch();

  // mutations
  const medUp = trpc.health.medUpsert.useMutation({ onSuccess: refetch });
  const medRm = trpc.health.medRemove.useMutation({ onSuccess: refetch });
  const supUp = trpc.health.supplementUpsert.useMutation({ onSuccess: refetch });
  const supRm = trpc.health.supplementRemove.useMutation({ onSuccess: refetch });
  const condUp = trpc.health.conditionUpsert.useMutation({ onSuccess: refetch });
  const condRm = trpc.health.conditionRemove.useMutation({ onSuccess: refetch });
  const vitAdd = trpc.health.vitalAdd.useMutation({ onSuccess: refetch });
  const vitRm = trpc.health.vitalRemove.useMutation({ onSuccess: refetch });
  const labAdd = trpc.health.labAdd.useMutation({ onSuccess: refetch });
  const labRm = trpc.health.labRemove.useMutation({ onSuccess: refetch });

  // local form state
  const [med, setMed] = useState({ name: "", dose: "", schedule: "", purpose: "" });
  const [sup, setSup] = useState({ name: "", dose: "", reason: "" });
  const [cond, setCond] = useState({ name: "", kind: "symptom" as "condition" | "symptom" | "allergy" });
  const [vit, setVit] = useState({ type: "weight", value: "", unit: "lb" });
  const [lab, setLab] = useState({ panel: "", marker: "", value: "", unit: "", refLow: "", refHigh: "" });

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <HeartPulse className="h-6 w-6 text-rose-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Health</h1>
          <p className="text-sm text-slate-500 flex items-center gap-1"><Lock className="h-3 w-3" /> Private — only you can see this. Part of Phoenix Rising.</p>
        </div>
      </div>

      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        Record-keeping only — this is <b>not medical advice</b>. Always confirm meds, doses, and supplements with your doctor or pharmacist.
      </div>

      {/* Vitals quick-add + recent */}
      <Section icon={Activity} title="Vitals" sub="weight · blood sugar · blood pressure">
        <div className="flex flex-wrap gap-2 items-end mb-3">
          <select className="border rounded px-2 py-2 text-sm bg-white" value={vit.type}
            onChange={(e) => { const v = VITAL_TYPES.find((x) => x.type === e.target.value)!; setVit({ type: v.type, value: "", unit: v.unit }); }}>
            {VITAL_TYPES.map((v) => <option key={v.type} value={v.type}>{v.label}</option>)}
          </select>
          <Input className="w-28" inputMode="decimal" placeholder="Value" value={vit.value} onChange={(e) => setVit({ ...vit, value: e.target.value })} />
          <Input className="w-24" placeholder="Unit" value={vit.unit} onChange={(e) => setVit({ ...vit, unit: e.target.value })} />
          <Button size="sm" disabled={!vit.value || vitAdd.isPending} onClick={() => { vitAdd.mutate({ type: vit.type, value: +vit.value, unit: vit.unit }); setVit({ ...vit, value: "" }); }}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(data?.vitals || []).slice(0, 24).map((r: any) => (
            <span key={r.id} className="group inline-flex items-center gap-1 text-xs bg-slate-50 border rounded px-2 py-1">
              <b className="text-slate-700">{VITAL_TYPES.find((v) => v.type === r.type)?.label || r.type}:</b> {r.value}{r.unit ? ` ${r.unit}` : ""}
              <span className="text-slate-400">· {fdate(r.measuredAt)}</span>
              <button className="opacity-0 group-hover:opacity-100" onClick={() => vitRm.mutate({ id: r.id })}><Trash2 className="h-3 w-3 text-slate-400" /></button>
            </span>
          ))}
          {(data?.vitals || []).length === 0 && <span className="text-xs text-slate-400">No readings yet — log one above.</span>}
        </div>
      </Section>

      {/* Medications */}
      <Section icon={Pill} title="Medications" sub="what you're on">
        <div className="grid sm:grid-cols-4 gap-2 mb-3">
          <Input placeholder="Medication" value={med.name} onChange={(e) => setMed({ ...med, name: e.target.value })} />
          <Input placeholder="Dose (500 mg)" value={med.dose} onChange={(e) => setMed({ ...med, dose: e.target.value })} />
          <Input placeholder="Schedule (2×/day)" value={med.schedule} onChange={(e) => setMed({ ...med, schedule: e.target.value })} />
          <div className="flex gap-1">
            <Input placeholder="For (purpose)" value={med.purpose} onChange={(e) => setMed({ ...med, purpose: e.target.value })} />
            <Button size="sm" disabled={!med.name || medUp.isPending} onClick={() => { medUp.mutate(med); setMed({ name: "", dose: "", schedule: "", purpose: "" }); }}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="space-y-1">
          {(data?.meds || []).map((r: any) => (
            <div key={r.id} className="group flex items-center gap-2 text-sm border-b last:border-0 py-1">
              <span className="font-medium text-slate-800">{r.name}</span>
              {r.dose && <span className="text-slate-500">{r.dose}</span>}
              {r.schedule && <span className="text-slate-400">· {r.schedule}</span>}
              {r.purpose && <span className="text-xs text-rose-500">· for {r.purpose}</span>}
              {!r.active && <span className="text-xs text-slate-400">(stopped)</span>}
              <button className="ml-auto opacity-0 group-hover:opacity-100" onClick={() => medRm.mutate({ id: r.id })}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
            </div>
          ))}
          {(data?.meds || []).length === 0 && <span className="text-xs text-slate-400">No medications added.</span>}
        </div>
      </Section>

      {/* Supplements / vitamins */}
      <Section icon={Leaf} title="Vitamins & supplements" sub="what you take + why">
        <div className="grid sm:grid-cols-4 gap-2 mb-3">
          <Input placeholder="Vitamin / supplement" value={sup.name} onChange={(e) => setSup({ ...sup, name: e.target.value })} />
          <Input placeholder="Dose" value={sup.dose} onChange={(e) => setSup({ ...sup, dose: e.target.value })} />
          <div className="sm:col-span-2 flex gap-1">
            <Input placeholder="Reason / symptom it's for" value={sup.reason} onChange={(e) => setSup({ ...sup, reason: e.target.value })} />
            <Button size="sm" disabled={!sup.name || supUp.isPending} onClick={() => { supUp.mutate(sup); setSup({ name: "", dose: "", reason: "" }); }}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="space-y-1">
          {(data?.supplements || []).map((r: any) => (
            <div key={r.id} className="group flex items-center gap-2 text-sm border-b last:border-0 py-1">
              <span className="font-medium text-slate-800">{r.name}</span>
              {r.dose && <span className="text-slate-500">{r.dose}</span>}
              {r.reason && <span className="text-xs text-emerald-600">· {r.reason}</span>}
              {!r.taking && <span className="text-xs text-amber-500">(suggested)</span>}
              <button className="ml-auto opacity-0 group-hover:opacity-100" onClick={() => supRm.mutate({ id: r.id })}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
            </div>
          ))}
          {(data?.supplements || []).length === 0 && <span className="text-xs text-slate-400">No supplements added.</span>}
        </div>
      </Section>

      {/* Conditions / symptoms */}
      <Section icon={Stethoscope} title="Conditions & symptoms" sub="drives what to watch">
        <div className="flex flex-wrap gap-2 items-end mb-3">
          <select className="border rounded px-2 py-2 text-sm bg-white" value={cond.kind} onChange={(e) => setCond({ ...cond, kind: e.target.value as any })}>
            <option value="symptom">Symptom</option>
            <option value="condition">Condition</option>
            <option value="allergy">Allergy</option>
          </select>
          <Input className="flex-1 min-w-[200px]" placeholder="e.g. fatigue, type 2 diabetes, penicillin" value={cond.name} onChange={(e) => setCond({ ...cond, name: e.target.value })} />
          <Button size="sm" disabled={!cond.name || condUp.isPending} onClick={() => { condUp.mutate({ name: cond.name, kind: cond.kind }); setCond({ name: "", kind: cond.kind }); }}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(data?.conditions || []).map((r: any) => (
            <span key={r.id} className="group inline-flex items-center gap-1 text-xs bg-slate-50 border rounded px-2 py-1">
              <span className={`uppercase text-[10px] ${r.kind === "allergy" ? "text-red-500" : r.kind === "condition" ? "text-purple-500" : "text-sky-500"}`}>{r.kind}</span>
              <span className="text-slate-700">{r.name}</span>
              <button className="opacity-0 group-hover:opacity-100" onClick={() => condRm.mutate({ id: r.id })}><Trash2 className="h-3 w-3 text-slate-400" /></button>
            </span>
          ))}
          {(data?.conditions || []).length === 0 && <span className="text-xs text-slate-400">Nothing recorded.</span>}
        </div>
      </Section>

      {/* Bloodwork / labs */}
      <Section icon={FlaskConical} title="Bloodwork" sub="markers + reference range (auto-flags high/low)">
        <div className="grid sm:grid-cols-6 gap-2 mb-3">
          <Input placeholder="Panel" value={lab.panel} onChange={(e) => setLab({ ...lab, panel: e.target.value })} />
          <Input placeholder="Marker (LDL)" value={lab.marker} onChange={(e) => setLab({ ...lab, marker: e.target.value })} />
          <Input inputMode="decimal" placeholder="Value" value={lab.value} onChange={(e) => setLab({ ...lab, value: e.target.value })} />
          <Input placeholder="Unit" value={lab.unit} onChange={(e) => setLab({ ...lab, unit: e.target.value })} />
          <Input inputMode="decimal" placeholder="Ref low" value={lab.refLow} onChange={(e) => setLab({ ...lab, refLow: e.target.value })} />
          <div className="flex gap-1">
            <Input inputMode="decimal" placeholder="Ref high" value={lab.refHigh} onChange={(e) => setLab({ ...lab, refHigh: e.target.value })} />
            <Button size="sm" disabled={!lab.marker || labAdd.isPending} onClick={() => {
              labAdd.mutate({ panel: lab.panel || undefined, marker: lab.marker, value: lab.value ? +lab.value : undefined, unit: lab.unit || undefined, refLow: lab.refLow ? +lab.refLow : undefined, refHigh: lab.refHigh ? +lab.refHigh : undefined });
              setLab({ panel: "", marker: "", value: "", unit: "", refLow: "", refHigh: "" });
            }}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="space-y-1">
          {(data?.labs || []).map((r: any) => (
            <div key={r.id} className="group flex items-center gap-2 text-sm border-b last:border-0 py-1">
              {r.panel && <span className="text-xs text-slate-400">{r.panel}</span>}
              <span className="font-medium text-slate-800">{r.marker}</span>
              <span className="text-slate-600">{r.value ?? r.valueText}{r.unit ? ` ${r.unit}` : ""}</span>
              {r.flag && <span className={`text-[10px] uppercase px-1 rounded ${r.flag === "high" ? "bg-red-100 text-red-600" : r.flag === "low" ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}>{r.flag}</span>}
              {(r.refLow != null || r.refHigh != null) && <span className="text-xs text-slate-400">ref {r.refLow ?? "–"}–{r.refHigh ?? "–"}</span>}
              <span className="text-xs text-slate-400 ml-auto">{fdate(r.measuredAt)}</span>
              <button className="opacity-0 group-hover:opacity-100" onClick={() => labRm.mutate({ id: r.id })}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
            </div>
          ))}
          {(data?.labs || []).length === 0 && <span className="text-xs text-slate-400">No bloodwork recorded.</span>}
        </div>
      </Section>
    </div>
  );
}
