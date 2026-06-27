import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { Shield, AlertTriangle, XCircle, Info, CheckCircle2, ChevronLeft, Pencil, ExternalLink, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import HelpButton from "@/components/HelpButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";

const severityConfig: Record<string, { icon: any; color: string; border: string; badge: "destructive" | "default" | "secondary"; rank: number }> = {
  critical: { icon: XCircle, color: "text-red-600", border: "border-l-red-500", badge: "destructive", rank: 0 },
  warning: { icon: AlertTriangle, color: "text-amber-600", border: "border-l-amber-500", badge: "default", rank: 1 },
  info: { icon: Info, color: "text-blue-600", border: "border-l-blue-500", badge: "secondary", rank: 2 },
};

// Account Brain triage (traffic-light) — green = strong history (one-click-ready),
// yellow = worth a look, red = no basis (Figs won't guess). Driven by the Brain's
// confidence + triage in sourceData; falls back to the stored confidence column.
const triageConfig: Record<"green" | "yellow" | "red", { dot: string; text: string; label: string }> = {
  green: { dot: "bg-lime-500", text: "text-lime-700", label: "Strong history" },
  yellow: { dot: "bg-amber-500", text: "text-amber-700", label: "Review" },
  red: { dot: "bg-red-500", text: "text-red-700", label: "Needs decision" },
};

function codingTriage(f: any, meta: any): { color: "green" | "yellow" | "red"; confidence: number | null; rationale: string | null } | null {
  const confidence =
    typeof meta.confidence === "number" ? Math.round(meta.confidence)
    : typeof f.confidence === "number" ? Math.round(f.confidence * 100)
    : null;
  let color = (meta.triage === "green" || meta.triage === "yellow" || meta.triage === "red") ? meta.triage : undefined;
  if (!color && confidence != null) color = confidence >= 85 ? "green" : confidence >= 60 ? "yellow" : "red";
  const rationale = typeof meta.rationale === "string" && meta.rationale ? meta.rationale : null;
  if (!color && confidence == null && !rationale) return null;
  return { color: color ?? "yellow", confidence, rationale };
}

const TABS = ["new", "awaiting_client", "approved", "dismissed"] as const;
type Tab = typeof TABS[number];
const tabLabel: Record<Tab, string> = { new: "New", awaiting_client: "Awaiting Client", approved: "Approved", dismissed: "Dismissed" };

function parseMeta(f: any): any {
  try { const m = JSON.parse(f.sourceData || ""); return (m && typeof m === "object") ? m : {}; } catch { return {}; }
}

type EditForm = { title: string; description: string; suggestedAction: string; severity: string };

/** Dictation button (browser speech-to-text — Chrome/Edge/Safari). Appends each
 *  finished phrase via onText. Hidden when the browser doesn't support it. */
function MicButton({ onText }: { onText: (t: string) => void }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const SR = typeof window !== "undefined" ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
  if (!SR) return null;
  const toggle = () => {
    if (listening) { try { recRef.current?.stop(); } catch { /* noop */ } return; }
    const rec = new SR();
    rec.lang = "en-CA";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
      if (t.trim()) onText(t.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };
  return (
    <button type="button" onClick={toggle} title={listening ? "Stop dictating" : "Dictate with your voice"}
      className={cn("h-8 w-8 flex-shrink-0 inline-flex items-center justify-center rounded border text-sm",
        listening ? "border-red-300 bg-red-50 animate-pulse" : "border-slate-200 hover:bg-slate-50")}>
      🎤
    </button>
  );
}

export default function Triage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>("new");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ title: "", description: "", suggestedAction: "", severity: "warning" });
  const [askId, setAskId] = useState<number | null>(null);
  const [askText, setAskText] = useState<string>("");

  const { data: findings, isLoading } = trpc.agentWebhook.listFindings.useQuery({ status: tab });
  const { data: clientList } = trpc.crmClient.list.useQuery();
  const refresh = () => utils.agentWebhook.listFindings.invalidate();
  const review = trpc.agentWebhook.reviewFinding.useMutation({ onSuccess: refresh });
  const update = trpc.agentWebhook.updateFinding.useMutation({ onSuccess: () => { refresh(); setEditId(null); } });
  const askClient = trpc.agentWebhook.askClient.useMutation({ onSuccess: () => { refresh(); setAskId(null); } });
  const del = trpc.agentWebhook.deleteFinding.useMutation({ onSuccess: refresh });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const clearSel = () => setSelected(new Set());
  const bulkReview = trpc.agentWebhook.reviewFindings.useMutation({ onSuccess: () => { refresh(); clearSel(); } });
  const bulkDelete = trpc.agentWebhook.deleteFindings.useMutation({ onSuccess: () => { refresh(); clearSel(); } });
  const toggleSel = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [enrichMsg, setEnrichMsg] = useState<string>("");
  const enrich = trpc.qboBrain.enrichFindings.useMutation({
    onSuccess: (res: any) => {
      refresh();
      const b = res.breakdown || {};
      const why: string[] = [];
      if (b.notConnected) why.push(`${b.notConnected} for companies not connected yet`);
      if (b.noClient) why.push(`${b.noClient} not linked to a company`);
      if (b.noVendor) why.push(`${b.noVendor} missing a vendor name`);
      if (b.already) why.push(`${b.already} already done`);
      if (b.error) why.push(`${b.error} had errors`);
      const parts = [`Figs coded ${res.enriched} of ${res.scanned}`];
      if (why.length) parts.push(`skipped: ${why.join(", ")}`);
      if (res.errors?.length) parts.push(`details: ${res.errors.join("; ")}`);
      setEnrichMsg(parts.join(" · "));
    },
    onError: (e: any) => setEnrichMsg(`Error: ${e?.message || "failed"}`),
  });

  const clientOf = (id: number | null) => (clientList || []).find((c: any) => c.id === id) as any;

  const act = (id: number, action: "approve" | "dismiss") => {
    const note = (notes[id] || "").trim();
    review.mutate({ id, action, notes: note || undefined });
    setNotes((n) => { const next = { ...n }; delete next[id]; return next; });
  };

  const startEdit = (f: any) => {
    setEditId(f.id); setAskId(null);
    setEditForm({ title: f.title || "", description: f.description || "", suggestedAction: f.suggestedAction || "", severity: f.severity || "warning" });
  };

  const startAsk = (f: any, meta: any) => {
    setAskId(f.id); setEditId(null);
    const client = clientOf(f.clientId);
    const who = client?.name || "there";
    const what = meta.vendor || f.title || "a document";
    const why = meta.reason || f.description || "we need a bit more detail to record it";
    setAskText(`Hi ${who},\n\nFigs flagged ${what} that we can't record yet: ${why}\n\nCould you send the invoice/receipt, or confirm the details? Thanks!\n\n— Go Fig Bookz`);
  };

  const sendAsk = (f: any, meta: any) => {
    const client = clientOf(f.clientId);
    const to = client?.email || "";
    const subject = `Quick question re: ${meta.vendor || f.title || "a document"}`;
    const url = `https://mail.google.com/mail/u/0/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(askText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    askClient.mutate({ id: f.id, question: askText });
  };

  const items = [...(findings || [])].sort(
    (a: any, b: any) => (severityConfig[a.severity]?.rank ?? 9) - (severityConfig[b.severity]?.rank ?? 9)
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ChevronLeft className="h-4 w-4 mr-1" />Dashboard
        </Button>
        <Shield className="h-6 w-6 text-purple-500" />
        <h1 className="text-2xl font-bold text-slate-800">Ask Markie</h1>
        <HelpButton id="triage" />
      </div>
      <p className="text-sm text-slate-500 -mt-2">
        Your review queue — everything Figs or Sage isn't sure about lands here for your call (not in the chat). Fix anything wrong, add a note to teach them, then approve, dismiss, or ask the client for what's missing.
      </p>

      <div className="flex gap-2 flex-wrap items-center">
        {TABS.map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => { setTab(t); setEditId(null); setAskId(null); clearSel(); }}>
            {tabLabel[t]}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {enrichMsg && <span className="text-xs text-slate-500 max-w-md truncate" title={enrichMsg}>{enrichMsg}</span>}
          <Button size="sm" className="bg-purple-600 hover:bg-purple-700" disabled={enrich.isPending} onClick={() => { setEnrichMsg(""); enrich.mutate({ status: tab }); }}>
            {enrich.isPending ? "Coding…" : "✨ Get Figs' suggestions"}
          </Button>
        </div>
      </div>

      {/* Batch bar — select many, act once (like QBO bank-feed bulk actions) */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((f: any) => f.id)))}>
            {selected.size === items.length ? "Unselect all" : `Select all (${items.length})`}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs border-lime-300 text-lime-700"
            onClick={() => setSelected(new Set(items.filter((f: any) => codingTriage(f, parseMeta(f))?.color === "green").map((f: any) => f.id)))}>
            Select all 🟢 green
          </Button>
          {selected.size > 0 && (
            <>
              <span className="text-slate-500 font-medium">{selected.size} selected:</span>
              {(tab === "new" || tab === "awaiting_client") && (
                <>
                  <Button size="sm" className="h-7 text-xs bg-lime-500 hover:bg-lime-600" disabled={bulkReview.isPending}
                    onClick={() => bulkReview.mutate({ ids: [...selected], action: "approve" })}>Approve selected</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkReview.isPending}
                    onClick={() => bulkReview.mutate({ ids: [...selected], action: "dismiss" })}>Dismiss selected</Button>
                </>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:bg-red-50" disabled={bulkDelete.isPending}
                onClick={() => { if (window.confirm(`Delete ${selected.size} card(s) permanently? This can't be undone.`)) bulkDelete.mutate({ ids: [...selected] }); }}>
                Delete selected
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSel}>Clear</Button>
            </>
          )}
        </div>
      )}

      {isLoading && <p className="text-slate-500">Loading&hellip;</p>}
      {!isLoading && items.length === 0 && (
        <Card><CardContent className="p-8 text-center text-slate-500">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-lime-500" />Nothing in "{tabLabel[tab]}".
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {items.map((f: any) => {
          const cfg = severityConfig[f.severity] || severityConfig.info;
          const Icon = cfg.icon;
          const editing = editId === f.id;
          const asking = askId === f.id;
          const meta = parseMeta(f);
          const coding = codingTriage(f, meta);
          // Prefer the document itself (Drive file = the receipt image); Gmail is
          // the fallback for email-only items. Old findings stored "drive::<id>"
          // in attachment (and mis-set gmailMsgId="drive"), so parse both.
          const att = String(meta.attachment || "");
          const driveId = meta.driveFileId || (att.startsWith("drive::") ? att.slice(7).trim() : "");
          const receiptUrl = driveId
            ? "https://drive.google.com/file/d/" + driveId + "/view"
            : (meta.gmailMsgId && meta.gmailMsgId !== "drive")
              ? "https://mail.google.com/mail/u/0/#all/" + meta.gmailMsgId
              : null;
          const receiptLabel = driveId ? "View receipt" : "Open email";
          const canResolve = tab === "new" || tab === "awaiting_client";
          return (
            <Card key={f.id} className={cn("border-l-4", cfg.border)}>
              <CardContent className="p-4">
                {editing ? (
                  <div className="space-y-2">
                    <input className="w-full text-sm font-semibold border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Title" />
                    <textarea className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300" rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Details" />
                    <input className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300" value={editForm.suggestedAction} onChange={(e) => setEditForm({ ...editForm, suggestedAction: e.target.value })} placeholder="Suggested action" />
                    <div className="flex items-center gap-2">
                      <select className="text-xs border border-slate-300 rounded px-2 py-1.5" value={editForm.severity} onChange={(e) => setEditForm({ ...editForm, severity: e.target.value })}>
                        <option value="critical">critical</option><option value="warning">warning</option><option value="info">info</option>
                      </select>
                      <Button size="sm" className="h-7 text-xs bg-lime-500 hover:bg-lime-600" disabled={update.isPending} onClick={() => update.mutate({ id: f.id, title: editForm.title, description: editForm.description, suggestedAction: editForm.suggestedAction, severity: editForm.severity as "critical" | "warning" | "info" })}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" className="mt-1 h-4 w-4 flex-shrink-0 accent-purple-600 cursor-pointer"
                        checked={selected.has(f.id)} onChange={() => toggleSel(f.id)} />
                      <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", cfg.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm">{f.title}</span>
                          <Badge variant={cfg.badge} className="text-xs">{f.severity}</Badge>
                          {f.agentName && <Badge variant="outline" className="text-xs">{f.agentName}</Badge>}
                          {coding ? (
                            <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold rounded-full border px-2 py-0.5", triageConfig[coding.color].text)} title="Figs' confidence (from this vendor's QuickBooks history)">
                              <span className={cn("h-3 w-3 rounded-full", triageConfig[coding.color].dot)} />
                              {coding.confidence != null ? `${coding.confidence}% · ` : ""}{triageConfig[coding.color].label}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs rounded-full border px-2 py-0.5 text-slate-400" title="Tap ✨ Get Figs' suggestions to code this">
                              <span className="h-3 w-3 rounded-full bg-slate-300" />
                              not coded yet
                            </span>
                          )}
                        </div>
                        {(meta.vendor || meta.amount || meta.date || meta.category || meta.hst) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 mb-1">
                            {meta.vendor && <span><span className="text-slate-400">Vendor:</span> {meta.vendor}</span>}
                            {meta.amount && <span><span className="text-slate-400">Amount:</span> {meta.amount}{meta.currency ? " " + meta.currency : ""}</span>}
                            {meta.date && <span><span className="text-slate-400">Date:</span> {meta.date}</span>}
                            {meta.hst && <span><span className="text-slate-400">HST:</span> {meta.hst}</span>}
                          </div>
                        )}
                        {/* Figs' REAL account (from the locked QBO chart, based on history) —
                            never the intake AI's free-text guess. */}
                        {meta.suggestedAccount ? (
                          <p className="text-sm font-medium text-purple-700 mb-0.5">
                            Figs suggests: {meta.suggestedAccount}
                            {meta.suggestedTaxCode ? <span className="text-purple-400 font-normal"> · tax code {meta.suggestedTaxCode}</span> : null}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400 italic mb-0.5">
                            No account suggested yet — tap ✨ Get Figs&apos; suggestions
                            {meta.category ? <span> · (intake&apos;s rough guess was &ldquo;{meta.category}&rdquo; — not a QBO account)</span> : null}
                          </p>
                        )}
                        {coding?.rationale && (
                          <p className="text-xs text-slate-500 break-words mb-1">
                            <span className="text-slate-400">Why:</span> {coding.rationale}
                          </p>
                        )}
                        {f.description && <p className="text-sm text-slate-600 break-words">{f.description}</p>}
                        {f.suggestedAction && <p className="text-xs text-slate-400 mt-1">Suggested: {f.suggestedAction}</p>}
                        {f.reviewedNotes && <p className="text-xs text-purple-600 mt-1">{f.reviewedNotes}</p>}
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {receiptUrl && (
                          <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-7 px-2 text-xs rounded border border-blue-200 text-blue-700 hover:bg-blue-50">
                            <ExternalLink className="h-3 w-3 mr-1" />{receiptLabel}
                          </a>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => startEdit(f)}>
                          <Pencil className="h-3 w-3 mr-1" />Edit
                        </Button>
                        {tab === "new" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50" onClick={() => startAsk(f, meta)}>
                            <Send className="h-3 w-3 mr-1" />Ask client
                          </Button>
                        )}
                        {canResolve && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs border-lime-300 text-lime-700 hover:bg-lime-50" disabled={review.isPending} onClick={() => act(f.id, "approve")}>Approve</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" disabled={review.isPending} onClick={() => act(f.id, "dismiss")}>Dismiss</Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:bg-red-50" disabled={del.isPending}
                          onClick={() => { if (window.confirm("Delete this card permanently? This can't be undone.")) del.mutate({ id: f.id }); }}>
                          Delete
                        </Button>
                      </div>
                    </div>

                    {asking && (
                      <div className="mt-3 border-t pt-3 space-y-2">
                        <p className="text-xs text-slate-500">
                          To: {clientOf(f.clientId)?.email || <span className="text-amber-600">no client email on file — you can fill it in Gmail</span>}
                        </p>
                        <div className="flex items-start gap-1.5">
                          <textarea className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300" rows={5} value={askText} onChange={(e) => setAskText(e.target.value)} />
                          <MicButton onText={(t) => setAskText((prev) => (prev + " " + t).trim())} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" disabled={askClient.isPending} onClick={() => sendAsk(f, meta)}>
                            <Send className="h-3 w-3 mr-1" />Open Gmail &amp; mark asked
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAskId(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}

                    {tab === "new" && !asking && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <input type="text" className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300" placeholder="Add a note for Figs (optional) — type or tap 🎤 to dictate — saved when you Approve/Dismiss" value={notes[f.id] || ""} onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))} />
                        <MicButton onText={(t) => setNotes((n) => ({ ...n, [f.id]: ((n[f.id] || "") + " " + t).trim() }))} />
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
