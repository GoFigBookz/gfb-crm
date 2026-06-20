import { useState } from "react";
import { Link } from "react-router";
import { MessageSquare, Send, Building2, AlertCircle, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";

const fmtPhone = (d: string) => d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : d;

export default function Messages() {
  const utils = trpc.useUtils();
  const { data: threads } = trpc.message.threads.useQuery(undefined, { refetchInterval: 20000 });
  const { data: gw } = trpc.message.gatewayStatus.useQuery();
  const [active, setActive] = useState<string | null>(null);
  const { data: thread } = trpc.message.thread.useQuery({ counterparty: active! }, { enabled: !!active, refetchInterval: 15000 });
  const [draft, setDraft] = useState("");

  const markRead = trpc.message.markRead.useMutation({ onSuccess: () => utils.message.threads.invalidate() });
  const send = trpc.message.send.useMutation({
    onSuccess: (r) => { setDraft(""); utils.message.thread.invalidate({ counterparty: active! }); utils.message.threads.invalidate(); if (!r.success) alert(`Not sent: ${r.error}`); },
    onError: (e) => alert(e.message),
  });
  const suggest = trpc.message.suggestReply.useMutation({
    onSuccess: (r) => { if (r.ok) setDraft(r.reply); else alert(r.reason); },
    onError: (e) => alert(e.message),
  });
  const openThread = (cp: string) => { setActive(cp); markRead.mutate({ counterparty: cp }); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><MessageSquare className="h-6 w-6 text-lime-600" /> Messages</h1>
        <p className="text-slate-500">Client texts, all in one place — through your own number.</p>
      </div>

      {gw && !gw.configured && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-3 text-sm text-amber-800 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>Texting isn't connected yet. Incoming texts will appear here once the Android gateway app forwards them; sending turns on once the gateway is configured (one-time setup). Inbound works as soon as the app points at <code>/api/sms/inbound</code>.</div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Threads */}
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-base">Conversations</CardTitle></CardHeader>
          <CardContent className="p-2">
            {!threads ? <p className="text-sm text-slate-400 p-3">Loading…</p>
              : threads.length === 0 ? <p className="text-sm text-slate-400 p-3">No texts yet.</p>
              : (
                <div className="space-y-1">
                  {threads.map((t: any) => (
                    <button key={t.counterparty} onClick={() => openThread(t.counterparty)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${active === t.counterparty ? "bg-lime-50 ring-1 ring-lime-300" : "hover:bg-slate-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{t.clientName || fmtPhone(t.counterparty)}</span>
                        {t.unread > 0 && <span className="text-[10px] bg-lime-500 text-white rounded-full px-1.5 py-0.5 shrink-0">{t.unread}</span>}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{t.last?.direction === "outbound" ? "You: " : ""}{t.last?.body}</p>
                    </button>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>

        {/* Thread */}
        <Card className="flex flex-col min-h-[420px]">
          {!active ? (
            <CardContent className="flex-1 flex items-center justify-center text-slate-400">Pick a conversation.</CardContent>
          ) : (
            <>
              <CardHeader className="pb-2 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  {(() => { const t = threads?.find((x: any) => x.counterparty === active); return (
                    <>
                      {t?.clientName || fmtPhone(active)}
                      {t?.clientId && <Link to={`/client/${t.clientId}`} className="text-xs text-lime-700 hover:underline inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> client</Link>}
                    </>
                  ); })()}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-3 space-y-2">
                {(thread || []).map((m: any) => (
                  <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.direction === "outbound" ? "bg-lime-500 text-white" : "bg-slate-100 text-slate-800"}`}>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className={`text-[10px] mt-0.5 ${m.direction === "outbound" ? "text-lime-50" : "text-slate-400"}`}>
                        {format(new Date(m.createdAt), "MMM d, h:mm a")}{m.status === "failed" ? " · failed" : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
              <div className="border-t p-2 flex gap-2">
                {gw?.aiConfigured && (
                  <Button variant="outline" title="Draft a reply with AI" disabled={suggest.isPending} onClick={() => suggest.mutate({ counterparty: active })}>
                    <Sparkles className="h-4 w-4" />
                  </Button>
                )}
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={suggest.isPending ? "Drafting…" : "Type a reply…"}
                  onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) send.mutate({ counterparty: active, body: draft.trim() }); }} />
                <Button disabled={!draft.trim() || send.isPending} onClick={() => send.mutate({ counterparty: active, body: draft.trim() })}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
