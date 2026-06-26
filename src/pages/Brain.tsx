import { useState } from "react";
import { Sparkles, BookOpen, HelpCircle, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * ASK FIGGY BRAIN — Liv's voice over the shared knowledge layer.
 * Phase 1: retrieval only. Ask → answered from approved truth (with sources +
 * confidence), or the brain files a question for Markie. No posting, no actions.
 */
type ScopeKind = "firm" | "client" | "personal";

export default function Brain() {
  const [scopeKind, setScopeKind] = useState<ScopeKind>("firm");
  const [clientId, setClientId] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<any>(null);

  const clients = trpc.clients.list.useQuery(undefined, { staleTime: 60000 });
  const stats = trpc.brain.stats.useQuery();
  const questions = trpc.brain.questions.useQuery();
  const ask = trpc.brain.ask.useMutation({ onSuccess: (r) => { setAnswer(r); stats.refetch(); questions.refetch(); } });
  const addTruth = trpc.brain.addTruth.useMutation({ onSuccess: () => { stats.refetch(); resetTeach(); } });
  const answerQ = trpc.brain.answer.useMutation({ onSuccess: () => { questions.refetch(); stats.refetch(); } });

  const scope = { scopeKind, clientId: scopeKind === "client" ? clientId : null };
  const onAsk = () => { if (question.trim()) ask.mutate({ ...scope, question: question.trim() }); };

  // teach-the-brain form
  const [showTeach, setShowTeach] = useState(false);
  const [tLabel, setTLabel] = useState(""); const [tStatement, setTStatement] = useState(""); const [tCategory, setTCategory] = useState("");
  const resetTeach = () => { setShowTeach(false); setTLabel(""); setTStatement(""); setTCategory(""); };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ask Figgy Brain</h1>
          <p className="text-sm text-slate-500">Liv answers from the firm's shared knowledge — with sources. If it's not in the brain, she asks you instead of guessing.</p>
        </div>
        {stats.data && <div className="ml-auto text-xs text-slate-500 text-right">{stats.data.truth} facts · {stats.data.openQuestions} open questions</div>}
      </div>

      {/* Ask */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select className="border rounded px-2 py-2 text-sm bg-white" value={scopeKind} onChange={(e) => setScopeKind(e.target.value as ScopeKind)}>
              <option value="firm">Firm-wide</option>
              <option value="client">A client</option>
              <option value="personal">Personal</option>
            </select>
            {scopeKind === "client" && (
              <select className="border rounded px-2 py-2 text-sm bg-white min-w-[200px]" value={clientId ?? ""} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Pick a client…</option>
                {(clients.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What's the reconcile process? Where do TD statements file?" onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }} />
            <Button onClick={onAsk} disabled={ask.isPending || !question.trim() || (scopeKind === "client" && !clientId)}>Ask</Button>
          </div>

          {answer && (
            <div className={`rounded border p-3 text-sm ${answer.answered ? "border-lime-300 bg-lime-50" : "border-amber-300 bg-amber-50"}`}>
              {answer.answered ? (
                <>
                  <div className="text-slate-800">{answer.text}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    Source: {answer.citations.map((c: any) => c.label).join(" + ") || "—"} · confidence {answer.confidence}%
                  </div>
                </>
              ) : (
                <div className="text-amber-900">
                  <div className="font-medium">Not in the brain yet — so I didn't guess.</div>
                  <div className="text-xs mt-1">I filed a question for you: "{answer.missingInfo?.question}". Answer it below and it becomes a fact I'll use next time.</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Missing-info queue */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><HelpCircle className="h-4 w-4 text-amber-500" /> Questions for you ({(questions.data?.questions || []).length})</div>
          {(questions.data?.questions || []).length === 0 && <p className="text-xs text-slate-400">Nothing waiting — the brain knows what it's been asked so far.</p>}
          {(questions.data?.questions || []).map((q: any) => <QuestionRow key={q.id} q={q} onAnswer={(answer: string) => answerQ.mutate({ id: q.id, answer })} pending={answerQ.isPending} />)}
        </CardContent>
      </Card>

      {/* Teach the brain */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><BookOpen className="h-4 w-4 text-lime-600" /> Teach the brain a fact</div>
            <Button size="sm" variant="outline" onClick={() => setShowTeach((v) => !v)}><Plus className="h-3.5 w-3.5 mr-1" /> Add fact</Button>
          </div>
          {showTeach && (
            <div className="grid gap-2 sm:grid-cols-2 border-t pt-2">
              <Input placeholder="Label (e.g. HST process)" value={tLabel} onChange={(e) => setTLabel(e.target.value)} />
              <Input placeholder="Category (e.g. hst, coding, filing)" value={tCategory} onChange={(e) => setTCategory(e.target.value)} />
              <Input className="sm:col-span-2" placeholder="The fact, in plain words" value={tStatement} onChange={(e) => setTStatement(e.target.value)} />
              <div className="sm:col-span-2 flex gap-2">
                <Button size="sm" disabled={addTruth.isPending || !tLabel || !tStatement || (scopeKind === "client" && !clientId)} onClick={() => addTruth.mutate({ ...scope, label: tLabel, statement: tStatement, category: tCategory || undefined })}>
                  Save as {scopeKind === "client" ? "client" : scopeKind} fact
                </Button>
                <span className="text-xs text-slate-400 self-center">Saved to the {scopeKind === "client" ? "selected client" : scopeKind} scope shown above.</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuestionRow({ q, onAnswer, pending }: { q: any; onAnswer: (a: string) => void; pending: boolean }) {
  const [a, setA] = useState("");
  return (
    <div className="border rounded px-2 py-2 text-sm">
      <div className="text-slate-700">{q.question}</div>
      <div className="flex items-center gap-2 mt-1">
        <Input value={a} onChange={(e) => setA(e.target.value)} placeholder="Your answer → becomes a fact" onKeyDown={(e) => { if (e.key === "Enter" && a.trim()) onAnswer(a.trim()); }} />
        <Button size="sm" disabled={pending || !a.trim()} onClick={() => onAnswer(a.trim())}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Save</Button>
      </div>
    </div>
  );
}
