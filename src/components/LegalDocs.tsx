import { useState, useEffect } from "react";
import { Scale, FileText, Plus, Trash2, Printer, Loader2, ArrowLeft, ShieldAlert, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import HelpButton from "@/components/HelpButton";

/**
 * LEGAL & ESTATE DOCUMENTS (Phoenix Rising, owner-only). Guided Q&A → a generated
 * DRAFT (will, POAs, business succession, account directive). Deterministic template
 * fill — you edit, then take it to a lawyer to review + execute. NOT legal advice.
 */
const printDoc = (title: string, body: string) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<html><head><title>${title}</title><style>body{font:13px/1.5 -apple-system,system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;white-space:pre-wrap}</style></head><body>${body.replace(/</g, "&lt;")}</body></html>`);
  w.document.close(); w.focus(); w.print();
};

export default function LegalDocs() {
  const utils = trpc.useUtils();
  const specs = trpc.phoenix.legalSpecs.useQuery();
  const list = trpc.phoenix.legalList.useQuery();
  const save = trpc.phoenix.legalSave.useMutation({ onSuccess: () => { utils.phoenix.legalList.invalidate(); } });
  const setStatus = trpc.phoenix.legalSetStatus.useMutation({ onSuccess: () => utils.phoenix.legalList.invalidate() });
  const del = trpc.phoenix.legalRemove.useMutation({ onSuccess: () => { utils.phoenix.legalList.invalidate(); setView(null); } });

  // view: null = home; {type} = new; {id} = edit existing
  const [view, setView] = useState<{ type?: string; id?: number } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [body, setBody] = useState<string>("");
  const [docId, setDocId] = useState<number | null>(null);

  const openExisting = trpc.phoenix.legalGet.useQuery({ id: view?.id ?? 0 }, { enabled: !!view?.id });
  const activeType = view?.type || openExisting.data?.docType;
  const spec = specs.data?.find((s: any) => s.type === activeType);

  const startNew = (type: string) => { setView({ type }); setAnswers({}); setBody(""); setDocId(null); };
  const startEdit = (d: any) => {
    setView({ id: d.id }); setDocId(d.id);
    try { setAnswers(d.answers ? JSON.parse(d.answers) : {}); } catch { setAnswers({}); }
    setBody("");
  };
  // when an existing doc loads, hydrate answers + body (once)
  useEffect(() => {
    const d = openExisting.data;
    if (view?.id && d && d.id === view.id) {
      try { setAnswers(d.answers ? JSON.parse(d.answers) : {}); } catch { setAnswers({}); }
      setBody(d.body || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openExisting.data, view?.id]);

  const generate = () => {
    if (!activeType) return;
    save.mutate({ id: docId ?? undefined, docType: activeType, answers }, { onSuccess: (r: any) => { if (r?.ok) { setDocId(r.id); setBody(r.body); } } });
  };
  const saveEdits = () => { if (activeType) save.mutate({ id: docId ?? undefined, docType: activeType, answers, bodyOverride: body }); };

  const Disclaimer = () => (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
      <span><b>Not legal advice.</b> These are working DRAFTS generated from your answers. They are not valid until a lawyer reviews them and they're properly signed + witnessed under Ontario law (a will needs you + 2 witnesses together; witnesses can't be beneficiaries). Use them to get organized and to brief your lawyer.</span>
    </div>
  );

  // ── HOME ──
  if (!view) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-indigo-600" />
          <h3 className="font-semibold text-slate-800">Legal & estate documents</h3>
          <HelpButton id="legal-builder" />
        </div>
        <Disclaimer />
        {list.data && list.data.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your documents</div>
            {list.data.map((d: any) => (
              <Card key={d.id} className="group"><CardContent className="p-2.5 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                <button className="flex-1 text-left text-sm text-slate-700 hover:underline" onClick={() => startEdit(d)}>{d.title}</button>
                {d.status === "finalized" && <span className="text-[10px] text-emerald-700 bg-emerald-50 rounded px-1">FINALIZED</span>}
                <button className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500" onClick={() => { if (confirm("Delete this document?")) del.mutate({ id: d.id }); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </CardContent></Card>
            ))}
          </div>
        )}
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Create a document</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {(specs.data || []).map((s: any) => (
            <button key={s.type} onClick={() => startNew(s.type)} className="text-left rounded-lg border border-slate-200 bg-white p-3 hover:border-indigo-300 hover:shadow-sm transition">
              <div className="flex items-center gap-1.5 font-medium text-slate-800 text-sm"><Plus className="h-3.5 w-3.5 text-indigo-500" /> {s.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.blurb}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── FORM / EDIT ──
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => { setView(null); setBody(""); }}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h3 className="font-semibold text-slate-800">{spec?.title || "Document"}</h3>
        <HelpButton id="legal-builder" />
      </div>
      <Disclaimer />

      <Card><CardContent className="p-3 space-y-2.5">
        {(spec?.fields || []).map((f: any) => (
          <div key={f.key}>
            <label className="text-xs font-medium text-slate-600">{f.label}</label>
            {f.help && <div className="text-[11px] text-slate-400 mb-0.5">{f.help}</div>}
            {f.type === "text" ? (
              <Input className="h-9" placeholder={f.placeholder} value={answers[f.key] || ""} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })} />
            ) : (
              <textarea className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" rows={f.type === "lines" ? 4 : 3}
                placeholder={f.placeholder || (f.type === "lines" ? "One per line…" : "")} value={answers[f.key] || ""} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })} />
            )}
          </div>
        ))}
        <Button size="sm" onClick={generate} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />} Generate draft
        </Button>
      </CardContent></Card>

      {body && (
        <Card><CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Draft (edit freely)</span>
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" variant="outline" onClick={saveEdits} disabled={save.isPending}><Check className="h-3.5 w-3.5 mr-1" /> Save edits</Button>
              <Button size="sm" variant="outline" onClick={() => printDoc(spec?.title || "Document", body)}><Printer className="h-3.5 w-3.5 mr-1" /> Print</Button>
              {docId && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: docId, status: "finalized" })}>Mark finalized</Button>}
            </div>
          </div>
          <textarea className="w-full rounded border border-slate-300 px-2 py-2 text-xs font-mono min-h-[320px]" value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="text-[11px] text-amber-700">This draft isn't valid until a lawyer reviews it and it's signed + witnessed properly. Print it, take it to your lawyer.</p>
        </CardContent></Card>
      )}
    </div>
  );
}
