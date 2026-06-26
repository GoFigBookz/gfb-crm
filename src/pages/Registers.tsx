import { useState } from "react";
import { BookMarked, Plus, Trash2, Check, RotateCcw, Lightbulb, Gavel, Sparkles, FlaskConical, Workflow, Users, Wand2, GraduationCap, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * REGISTERS / KNOWLEDGE-ASSET LIBRARY — "everything becomes a numbered asset."
 * Each entry gets a typed code (DEC-0001, RES-0042, SYS-0015, GF-0124, IDE-0021,
 * LL-0008…). The Decision Register adds reason / alternatives / outcome, and each
 * decision is mirrored into the Brain so Liv can recall "why did we decide X?".
 */
type Kind = "decision" | "research" | "system" | "client_process" | "idea" | "lesson" | "improvement" | "prompt";

const TABS: { kind: Kind; label: string; icon: any; blurb: string; titlePh: string; bodyPh: string; tagPh: string }[] = [
  { kind: "decision", label: "Decisions", icon: Gavel, blurb: "DEC — every significant decision + the why, so it's never re-litigated or forgotten.", titlePh: "The decision (e.g. 'Phoenix Living Labs stays under the numbered company')", bodyPh: "Context / details…", tagPh: "Area (e.g. structure, pricing)" },
  { kind: "research", label: "Research", icon: FlaskConical, blurb: "RES — a researched topic or conversation, captured as a reusable reference.", titlePh: "Topic (e.g. 'Multi-agent orchestration patterns')", bodyPh: "Findings / summary…", tagPh: "Area" },
  { kind: "system", label: "Systems", icon: Workflow, blurb: "SYS — a workflow / system / SOP.", titlePh: "System name (e.g. 'Month-end close SOP')", bodyPh: "How it works…", tagPh: "Area" },
  { kind: "client_process", label: "Client Processes", icon: Users, blurb: "GF — a documented client process.", titlePh: "Process (e.g. 'Clark Pools HST workflow')", bodyPh: "The steps…", tagPh: "Client" },
  { kind: "idea", label: "Ideas", icon: Wand2, blurb: "IDE — an idea worth keeping.", titlePh: "The idea", bodyPh: "What & why…", tagPh: "Area" },
  { kind: "lesson", label: "Lessons", icon: GraduationCap, blurb: "LL — a lesson learned, so we don't repeat the mistake.", titlePh: "The lesson (e.g. 'Always commit dist before deploy')", bodyPh: "What happened & the takeaway…", tagPh: "Area" },
  { kind: "improvement", label: "Improvements", icon: Lightbulb, blurb: "IMP — process-improvement ideas, open until done.", titlePh: "The improvement", bodyPh: "What & why it helps…", tagPh: "Area" },
  { kind: "prompt", label: "Prompts", icon: Sparkles, blurb: "PR — reusable prompts the agents can pull from.", titlePh: "Prompt name", bodyPh: "The prompt text…", tagPh: "Agent / tag" },
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
  const [showImport, setShowImport] = useState(false);
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [tags, setTags] = useState("");
  const [reason, setReason] = useState(""); const [alternatives, setAlternatives] = useState(""); const [outcome, setOutcome] = useState("Approved");
  const reset = () => { setShowAdd(false); setTitle(""); setBody(""); setTags(""); setReason(""); setAlternatives(""); setOutcome("Approved"); };
  const afterImport = () => { setShowImport(false); list.refetch(); counts.refetch(); };

  const rows = list.data?.rows || [];
  const isDecision = kind === "decision";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookMarked className="h-6 w-6 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Registers</h1>
          <p className="text-sm text-slate-500">Everything becomes a numbered, reusable asset — decisions, research, systems, client processes, ideas, lessons.</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setShowImport((v) => !v)}><FileUp className="h-4 w-4 mr-1" /> Import session</Button>
          <Button size="sm" onClick={() => setShowAdd((v) => !v)}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </div>

      {showImport && <ImportSession onDone={afterImport} />}

      <div className="flex flex-wrap gap-1.5">
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
          {isDecision ? (
            <>
              <textarea className="border rounded px-2 py-2 text-sm min-h-[56px]" placeholder="Reason / rationale (why this decision)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <textarea className="border rounded px-2 py-2 text-sm min-h-[44px]" placeholder="Alternatives considered (e.g. new corp, non-profit, partnership)" value={alternatives} onChange={(e) => setAlternatives(e.target.value)} />
              <Input placeholder="Outcome (Approved / Rejected / Deferred + note)" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
            </>
          ) : (
            <textarea className="border rounded px-2 py-2 text-sm min-h-[72px]" placeholder={tab.bodyPh} value={body} onChange={(e) => setBody(e.target.value)} />
          )}
          <Input placeholder={tab.tagPh} value={tags} onChange={(e) => setTags(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={upsert.isPending || !title.trim()} onClick={() => upsert.mutate({ kind, title: title.trim(), body: isDecision ? undefined : (body.trim() || undefined), tags: tags.trim() || undefined, reason: isDecision ? (reason.trim() || undefined) : undefined, alternatives: isDecision ? (alternatives.trim() || undefined) : undefined, outcome: isDecision ? (outcome.trim() || undefined) : undefined })}>Save</Button>
            <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {rows.length === 0 && <Card><CardContent className="p-4 text-xs text-slate-400">Nothing logged yet — add the first one above. Agents log here too as they work.</CardContent></Card>}
        {rows.map((r: any) => (
          <Card key={r.id} className={r.kind === "improvement" && r.status === "done" ? "opacity-60" : ""}>
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.code && <span className="text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{r.code}</span>}
                    <span className={`font-medium text-slate-800 ${r.status === "done" ? "line-through" : ""}`}>{r.title}</span>
                  </div>
                  {r.body && <div className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{r.body}</div>}
                  {r.reason && <div className="text-sm text-slate-600 mt-1"><b className="text-slate-500">Reason:</b> {r.reason}</div>}
                  {r.alternatives && <div className="text-xs text-slate-500 mt-0.5"><b>Alternatives:</b> {r.alternatives}</div>}
                  {r.outcome && <div className="text-xs mt-0.5"><b className="text-slate-500">Outcome:</b> <span className={/reject/i.test(r.outcome) ? "text-red-600" : /defer/i.test(r.outcome) ? "text-amber-600" : "text-emerald-600"}>{r.outcome}</span></div>}
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

/** Paste a "Session Close Package" → preview the numbered assets → import them. */
function ImportSession({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [previewOn, setPreviewOn] = useState(false);
  const preview = trpc.registers.importSessionPreview.useQuery({ text }, { enabled: previewOn && text.trim().length > 20 });
  const commit = trpc.registers.importSessionCommit.useMutation({ onSuccess: () => { onDone(); } });
  const p = preview.data;

  return (
    <Card className="border-sky-200"><CardContent className="p-3 space-y-2">
      <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><FileUp className="h-4 w-4 text-sky-500" /> Import a Session Close Package</div>
      <p className="text-xs text-slate-500">Paste a session package (e.g. from a strategy session). Figgy parses it into numbered assets — Decisions (DEC), Research (RES), Systems (SYS), Ideas (IDE) — mirrors decisions to the Brain, and files open questions. Preview first; nothing is created until you import.</p>
      <textarea className="w-full border rounded px-2 py-2 text-sm min-h-[140px] font-mono" placeholder="Paste the full Session Close Package here…" value={text} onChange={(e) => { setText(e.target.value); setPreviewOn(false); }} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={text.trim().length < 20} onClick={() => setPreviewOn(true)}>Preview</Button>
        {p && (
          <Button size="sm" disabled={commit.isPending || p.alreadyImported || (p.items.length === 0)} onClick={() => commit.mutate({ text })}>
            {commit.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Import {p.items.length} asset{p.items.length === 1 ? "" : "s"}
          </Button>
        )}
        {commit.data?.ok && !commit.data.alreadyImported && <span className="text-xs text-emerald-600">✓ Imported {commit.data.created} assets ({(commit.data.codes || []).slice(0, 4).join(", ")}{(commit.data.codes || []).length > 4 ? "…" : ""}).</span>}
      </div>
      {p && (
        <div className="text-xs text-slate-600 space-y-1 border-t pt-2">
          {p.alreadyImported && <div className="text-amber-600">This session ({p.sessionId}) was already imported.</div>}
          <div><b>{p.title}</b>{p.sessionId ? ` · ${p.sessionId}` : ""}</div>
          {Object.keys(p.counts).length > 0 && <div>Will create: {Object.entries(p.counts).map(([k, n]) => `${n} ${k}`).join(" · ")} + 1 session record.</div>}
          {p.items.slice(0, 8).map((it: any, i: number) => (
            <div key={i} className="truncate"><span className="font-mono text-[10px] bg-slate-100 rounded px-1 mr-1">{it.kind}</span>{it.title}</div>
          ))}
          {p.items.length > 8 && <div className="text-slate-400">…and {p.items.length - 8} more.</div>}
          {p.openQuestions.length > 0 && <div className="text-slate-500">+ {p.openQuestions.length} open question(s) filed to the Brain.</div>}
          {p.items.length === 0 && !p.alreadyImported && <div className="text-amber-600">Couldn't find structured items — check the format or add them manually.</div>}
        </div>
      )}
    </CardContent></Card>
  );
}
