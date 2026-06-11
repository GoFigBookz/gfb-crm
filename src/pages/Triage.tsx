import { useState } from "react";
import { useNavigate } from "react-router";
import { Shield, AlertTriangle, XCircle, Info, CheckCircle2, ChevronLeft, Pencil, ExternalLink, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
// yellow = worth a look, red = no basis (Figgy won't guess). Driven by the Brain's
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
  const [enrichMsg, setEnrichMsg] = useState<string>("");
  const enrich = trpc.qboBrain.enrichFindings.useMutation({
    onSuccess: (res: any) => {
      refresh();
      const parts = [`Figgy coded ${res.enriched} of ${res.scanned}`];
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      if (res.errors?.length) parts.push(`issues: ${res.errors.join("; ")}`);
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
    setAskText(`Hi ${who},\n\nFiggy flagged ${what} that we can't record yet: ${why}\n\nCould you send the invoice/receipt, or confirm the details? Thanks!\n\n— Go Fig Bookz`);
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
        <h1 className="text-2xl font-bold text-slate-800">Figgy Jr</h1>
      </div>
      <p className="text-sm text-slate-500 -mt-2">
        Receipts &amp; documents Figgy Jr processed. Edit anything wrong, add a note to teach Figgy, then approve, dismiss, or ask the client for missing info.
      </p>

      <div className="flex gap-2 flex-wrap items-center">
        {TABS.map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => { setTab(t); setEditId(null); setAskId(null); }}>
            {tabLabel[t]}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {enrichMsg && <span className="text-xs text-slate-500 max-w-md truncate" title={enrichMsg}>{enrichMsg}</span>}
          <Button size="sm" className="bg-purple-600 hover:bg-purple-700" disabled={enrich.isPending} onClick={() => { setEnrichMsg(""); enrich.mutate({ status: tab }); }}>
            {enrich.isPending ? "Coding…" : "✨ Get Figgy's suggestions"}
          </Button>
        </div>
      </div>

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
          const receiptUrl = meta.gmailMsgId ? "https://mail.google.com/mail/u/0/#all/" + meta.gmailMsgId : null;
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
                      <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", cfg.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm">{f.title}</span>
                          <Badge variant={cfg.badge} className="text-xs">{f.severity}</Badge>
                          {f.agentName && <Badge variant="outline" className="text-xs">{f.agentName}</Badge>}
                          {coding && (
                            <span className={cn("inline-flex items-center gap-1 text-xs font-medium", triageConfig[coding.color].text)} title="Account Brain confidence">
                              <span className={cn("h-2 w-2 rounded-full", triageConfig[coding.color].dot)} />
                              {coding.confidence != null ? `${coding.confidence}% · ` : ""}{triageConfig[coding.color].label}
                            </span>
                          )}
                        </div>
                        {(meta.vendor || meta.amount || meta.date || meta.category || meta.hst) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 mb-1">
                            {meta.vendor && <span><span className="text-slate-400">Vendor:</span> {meta.vendor}</span>}
                            {meta.amount && <span><span className="text-slate-400">Amount:</span> {meta.amount}{meta.currency ? " " + meta.currency : ""}</span>}
                            {meta.date && <span><span className="text-slate-400">Date:</span> {meta.date}</span>}
                            {meta.category && <span><span className="text-slate-400">Category:</span> {meta.category}</span>}
                            {meta.hst && <span><span className="text-slate-400">HST:</span> {meta.hst}</span>}
                          </div>
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
                            <ExternalLink className="h-3 w-3 mr-1" />Receipt
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
                      </div>
                    </div>

                    {asking && (
                      <div className="mt-3 border-t pt-3 space-y-2">
                        <p className="text-xs text-slate-500">
                          To: {clientOf(f.clientId)?.email || <span className="text-amber-600">no client email on file — you can fill it in Gmail</span>}
                        </p>
                        <textarea className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300" rows={5} value={askText} onChange={(e) => setAskText(e.target.value)} />
                        <div className="flex items-center gap-2">
                          <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" disabled={askClient.isPending} onClick={() => sendAsk(f, meta)}>
                            <Send className="h-3 w-3 mr-1" />Open Gmail &amp; mark asked
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAskId(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}

                    {tab === "new" && !asking && (
                      <input type="text" className="mt-2 w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300" placeholder="Add a note for Figgy (optional) — e.g. 'this vendor is always Job Materials' — helps it learn" value={notes[f.id] || ""} onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))} />
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
