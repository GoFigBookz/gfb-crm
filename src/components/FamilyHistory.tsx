import { useState } from "react";
import { Users, Plus, Trash2, Pencil, HeartPulse, Sparkles, Share2, Search, Check, X, ExternalLink, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * FAMILY HISTORY / genealogy — private Phoenix Rising section, owner-only.
 * A confidence-rated, auto-growing, shareable family tree (the legacy project for
 * Markie's daughter). Each person carries an honest proof level + % so nothing is
 * presented as more certain than it is. Liv scans the web monthly (28th) for new,
 * well-sourced relatives → they land in a review inbox here (never auto-merged).
 */
const PROOF_COLORS: Record<string, { pill: string; dot: string; label: string }> = {
  proven: { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Verified" },
  likely: { pill: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", label: "Likely" },
  clue:   { pill: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500", label: "Tree clue" },
  wall:   { pill: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500", label: "Brick wall" },
};
function proofOf(m: any): { key: string; conf: number | null } {
  const conf = m.confidence ?? null;
  let key = m.proofLevel as string | null;
  if (!key && conf != null) key = conf >= 95 ? "proven" : conf >= 70 ? "likely" : conf >= 40 ? "clue" : "wall";
  return { key: key || "clue", conf };
}

const BLANK: any = { name: "", relation: "", side: "", birthDate: "", deathDate: "", living: true, birthplace: "", notes: "", medicalNotes: "", proofLevel: "", confidence: "", occupation: "", maidenName: "", photoUrl: "" };

export default function FamilyHistory() {
  const tree = trpc.genealogy.tree.useQuery();
  const up = trpc.genealogy.memberUpsert.useMutation({ onSuccess: () => { tree.refetch(); reset(); } });
  const rm = trpc.genealogy.memberRemove.useMutation({ onSuccess: () => tree.refetch() });
  const [form, setForm] = useState<any>(BLANK);
  const [open, setOpen] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showDisc, setShowDisc] = useState(false);
  const reset = () => { setForm(BLANK); setOpen(false); };
  const edit = (r: any) => { setForm({ ...BLANK, ...r, living: !!r.living, side: r.side || "", proofLevel: r.proofLevel || "", confidence: r.confidence ?? "" }); setOpen(true); };

  const data = tree.data;
  const groups = data?.groups || [];
  const accuracy = data?.accuracy ?? 0;
  const pending = data?.pendingFindings ?? 0;

  const save = () => {
    const f = form;
    up.mutate({
      ...(f.id ? { id: f.id } : {}),
      name: f.name, relation: f.relation || undefined, side: f.side || undefined,
      birthDate: f.birthDate || undefined, deathDate: f.deathDate || undefined, living: !!f.living,
      birthplace: f.birthplace || undefined, occupation: f.occupation || undefined, maidenName: f.maidenName || undefined,
      notes: f.notes || undefined, medicalNotes: f.medicalNotes || undefined, photoUrl: f.photoUrl || undefined,
      proofLevel: f.proofLevel || undefined, confidence: f.confidence === "" ? undefined : Number(f.confidence),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Users className="h-5 w-5 text-amber-600" />
        <h3 className="font-semibold text-slate-800">Family tree</h3>
        {data && data.count > 0 && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600" title="Confidence-weighted across people with dates">
            ~{accuracy}% verified · {data.count} people
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setShowDisc((v) => !v)} className="relative">
            <Search className="h-4 w-4 mr-1" /> Discoveries
            {pending > 0 && <span className="ml-1 text-[10px] bg-rose-500 text-white rounded-full px-1.5 py-0.5">{pending}</span>}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowShare((v) => !v)}><Share2 className="h-4 w-4 mr-1" /> Share</Button>
          <Button size="sm" onClick={() => (open ? reset() : (setForm(BLANK), setOpen(true)))}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </div>

      <ScanBar />

      {showDisc && <Discoveries members={groups.flatMap((g: any) => g.members)} onChange={() => tree.refetch()} />}
      {showShare && <SharePanel />}

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
          <select className="border rounded px-2 py-2 text-sm bg-white" value={form.proofLevel} onChange={(e) => setForm({ ...form, proofLevel: e.target.value })}>
            <option value="">How sure?…</option>
            <option value="proven">✅ Verified by record</option>
            <option value="likely">🟡 Likely (strong but incomplete)</option>
            <option value="clue">🔍 Tree clue (needs proof)</option>
            <option value="wall">🧱 Brick wall (unproven)</option>
          </select>
          <Input type="number" min={0} max={100} placeholder="Confidence % (optional)" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })} />
          <Input placeholder="Occupation (optional)" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
          <Input placeholder="Maiden name (optional)" value={form.maidenName} onChange={(e) => setForm({ ...form, maidenName: e.target.value })} />
          <Input className="sm:col-span-2" placeholder="Photo URL (optional)" value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} />
          <Input className="sm:col-span-2" placeholder="Notes — stories, origins, sources" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Input className="sm:col-span-2" placeholder="Family medical history (conditions that run in the family)" value={form.medicalNotes} onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={!form.name || up.isPending} onClick={save}>{form.id ? "Save" : "Add"}</Button>
            <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      {groups.map((g: any) => (
        <div key={g.gen} className="space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">{g.label}</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {g.members.map((r: any) => {
              const { key, conf } = proofOf(r);
              const pc = PROOF_COLORS[key] || PROOF_COLORS.clue;
              return (
                <Card key={r.id} className="group">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      {r.photoUrl
                        ? <img src={r.photoUrl} alt={r.name} className="h-10 w-10 rounded-full object-cover shrink-0 border" />
                        : <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-400 text-xs font-semibold">{(r.name || "?").slice(0, 1)}</div>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-slate-800">{r.name}</span>
                          {!r.living && <span className="text-xs text-slate-400">†</span>}
                          {(r.birthDate || r.deathDate || conf != null) && (
                            <span className={`text-[10px] inline-flex items-center gap-1 border rounded-full px-1.5 py-0.5 ${pc.pill}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${pc.dot}`} /> {pc.label}{conf != null ? ` ${conf}%` : ""}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {[r.relation, r.side, [r.birthDate, r.deathDate].filter(Boolean).join("–")].filter(Boolean).join(" · ")}
                          {r.birthplace ? ` · ${r.birthplace}` : ""}{r.occupation ? ` · ${r.occupation}` : ""}
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
              );
            })}
          </div>
        </div>
      ))}
      {groups.length === 0 && <p className="text-xs text-slate-400">No family recorded yet — add your first relative above.</p>}
    </div>
  );
}

/** Scan status + manual "scan now" trigger. */
function ScanBar() {
  const status = trpc.genealogy.scanStatus.useQuery();
  const tree = trpc.genealogy.tree.useQuery();
  const scan = trpc.genealogy.scanNow.useMutation({ onSuccess: () => { status.refetch(); tree.refetch(); } });
  const last = status.data?.runs?.[0];
  const enabled = status.data?.enabled;
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border rounded-lg px-3 py-2 flex-wrap">
      <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />
      <span>Liv scans the web for new relatives <b>monthly on the 28th</b>.</span>
      {last && <span className="text-slate-400">Last: {last.summary ? last.summary : last.status}{last.finishedAt ? ` · ${new Date(last.finishedAt).toLocaleDateString()}` : ""}</span>}
      {!enabled && <span className="text-amber-600">(scan paused — needs the AI key set)</span>}
      <Button size="sm" variant="outline" className="ml-auto h-7" disabled={scan.isPending || !enabled} onClick={() => scan.mutate()}>
        {scan.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Search className="h-3.5 w-3.5 mr-1" />} Scan now
      </Button>
    </div>
  );
}

/** Review inbox for monthly-scan discoveries. */
function Discoveries({ members, onChange }: { members: any[]; onChange: () => void }) {
  const q = trpc.genealogy.findingsList.useQuery({ status: "new" });
  const accept = trpc.genealogy.findingAccept.useMutation({ onSuccess: () => { q.refetch(); onChange(); } });
  const dismiss = trpc.genealogy.findingDismiss.useMutation({ onSuccess: () => { q.refetch(); onChange(); } });
  const rows = q.data?.rows || [];
  return (
    <Card className="border-fuchsia-200"><CardContent className="p-3 space-y-2">
      <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Search className="h-4 w-4 text-fuchsia-500" /> Discoveries to review</div>
      {rows.length === 0 && <p className="text-xs text-slate-400">Nothing waiting. New, well-sourced finds from the monthly scan show up here for you to accept or skip — nothing is added to the tree without your say-so.</p>}
      {rows.map((f: any) => {
        const pc = PROOF_COLORS[f.proofLevel || "clue"] || PROOF_COLORS.clue;
        return (
          <div key={f.id} className="border rounded-lg p-2.5 text-sm">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-slate-800">{f.subjectName}</span>
              <span className={`text-[10px] inline-flex items-center gap-1 border rounded-full px-1.5 py-0.5 ${pc.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${pc.dot}`} /> {pc.label} {f.confidence ?? "?"}%</span>
              {f.relatedTo && <span className="text-xs text-slate-400">↳ {f.relatedTo}</span>}
            </div>
            <div className="text-slate-600 mt-0.5">{f.claim}</div>
            {f.sourceUrl && <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-600 inline-flex items-center gap-1 mt-0.5">{f.sourceType || "Source"} <ExternalLink className="h-3 w-3" /></a>}
            <div className="flex items-center gap-2 mt-1.5">
              <Button size="sm" className="h-7" disabled={accept.isPending} onClick={() => accept.mutate({ id: f.id })}><Check className="h-3.5 w-3.5 mr-1" /> Add to tree</Button>
              {members.length > 0 && (
                <select className="border rounded px-2 h-7 text-xs bg-white" defaultValue="" onChange={(e) => { if (e.target.value) accept.mutate({ id: f.id, attachToMemberId: Number(e.target.value) }); }}>
                  <option value="">…or attach to</option>
                  {members.filter((m) => m.name).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-slate-400" disabled={dismiss.isPending} onClick={() => dismiss.mutate({ id: f.id })}><X className="h-3.5 w-3.5 mr-1" /> Skip</Button>
            </div>
          </div>
        );
      })}
    </CardContent></Card>
  );
}

/** Create/manage read-only family share links. */
function SharePanel() {
  const q = trpc.genealogy.shareList.useQuery();
  const create = trpc.genealogy.shareCreate.useMutation({ onSuccess: () => q.refetch() });
  const revoke = trpc.genealogy.shareRevoke.useMutation({ onSuccess: () => q.refetch() });
  const [label, setLabel] = useState("");
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const rows = q.data?.rows || [];
  return (
    <Card className="border-sky-200"><CardContent className="p-3 space-y-2">
      <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Share2 className="h-4 w-4 text-sky-500" /> Share with family (read-only)</div>
      <div className="flex gap-2">
        <Input placeholder="Label (e.g. 'For the cousins')" value={label} onChange={(e) => setLabel(e.target.value)} className="h-8" />
        <Button size="sm" className="h-8" disabled={create.isPending} onClick={() => { create.mutate({ label: label || undefined, includePhotos: true }); setLabel(""); }}>Create link</Button>
      </div>
      {rows.filter((r: any) => r.active).map((r: any) => {
        const url = `${base}/share/family/${r.token}`;
        return (
          <div key={r.id} className="flex items-center gap-2 text-xs border rounded px-2 py-1.5">
            <span className="text-slate-600 truncate flex-1">{r.label || "Family tree"} · {r.viewCount || 0} views</span>
            <button title="Copy link" onClick={() => navigator.clipboard?.writeText(url)} className="text-sky-600"><Copy className="h-3.5 w-3.5" /></button>
            <a href={url} target="_blank" rel="noreferrer" className="text-sky-600"><ExternalLink className="h-3.5 w-3.5" /></a>
            <button title="Revoke" onClick={() => { if (confirm("Revoke this link?")) revoke.mutate({ id: r.id }); }} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        );
      })}
      {rows.filter((r: any) => r.active).length === 0 && <p className="text-xs text-slate-400">No active links. Create one to share a beautiful, read-only version of the tree — relatives can view but not edit.</p>}
    </CardContent></Card>
  );
}
